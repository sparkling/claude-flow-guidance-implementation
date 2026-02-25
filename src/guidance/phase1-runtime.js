import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createCompiler } from '@claude-flow/guidance/compiler';
import { createRetriever } from '@claude-flow/guidance/retriever';
import { createGates } from '@claude-flow/guidance/gates';
import { createLedger } from '@claude-flow/guidance/ledger';
import { createGuidanceHooks } from '@claude-flow/guidance/hooks';
import { createPersistentLedger } from '@claude-flow/guidance/persistence';
import { createToolGateway } from '@claude-flow/guidance/gateway';
import { createNullPersistentLedger } from './observation-layer.js';
import { createNullToolGateway } from './enforcement-layer.js';
import { HookEvent, HookExecutor, HookRegistry } from '@claude-flow/hooks';

const DEFAULT_OPTIONS = {
  rootDir: process.cwd(),
  rootGuidancePath: 'CLAUDE.md',
  localGuidancePath: 'CLAUDE.local.md',
  gateConfig: {},
  enablePersistence: true,
  enableGateway: true,
  persistenceConfig: {
    maxEvents: 10000,
    compactIntervalMs: 3600000,
    enableWAL: true,
  },
  gatewayConfig: {
    idempotencyTtlMs: 300000,
    maxCacheSize: 10000,
    requireEvidence: false,
  },
  budget: null,
};

function resolvePath(rootDir, filePath) {
  if (!filePath) {
    return null;
  }
  return resolve(rootDir, filePath);
}

function readOptionalFile(filePath) {
  if (!filePath || !existsSync(filePath)) {
    return null;
  }
  return readFileSync(filePath, 'utf-8');
}

export class GuidancePhase1Runtime {
  constructor(options = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.compiler = createCompiler();
    this.retriever = createRetriever();
    this.gates = createGates(this.options.gateConfig);

    // Persistent ledger (survives restarts) or in-memory fallback
    this.ledger = this.options.enablePersistence
      ? createPersistentLedger({
          storagePath: resolve(this.options.rootDir, '.claude-flow/guidance'),
          ...this.options.persistenceConfig,
        })
      : createNullPersistentLedger();

    // Gateway wraps gates with idempotency + schema validation + budget metering
    this.gateway = this.options.enableGateway
      ? createToolGateway({
          gateConfig: this.options.gateConfig,
          budget: this.options.budget,
          ...this.options.gatewayConfig,
        })
      : createNullToolGateway();

    this.registry = new HookRegistry();
    this.executor = new HookExecutor(this.registry);

    this.bundle = null;
    this.hookIds = [];
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) {
      return;
    }

    const rootFile = resolvePath(this.options.rootDir, this.options.rootGuidancePath);
    const localFile = resolvePath(this.options.rootDir, this.options.localGuidancePath);
    const rootContent = readOptionalFile(rootFile);
    const localContent = readOptionalFile(localFile);

    if (!rootContent) {
      throw new Error(`Missing required guidance file: ${rootFile}`);
    }

    this.bundle = this.compiler.compile(rootContent, localContent ?? undefined);

    // Initialize persistent ledger (loads existing events from disk)
    if (this.ledger.init) {
      await this.ledger.init();
    }

    await this.retriever.loadBundle(this.bundle);

    const rules = [
      ...this.bundle.constitution.rules,
      ...this.bundle.shards.map((entry) => entry.rule),
    ];
    this.gates.setActiveRules(rules);

    const registration = createGuidanceHooks(
      this.gates,
      this.retriever,
      this.ledger,
      this.registry
    );
    this.hookIds = registration.hookIds;
    this.initialized = true;
  }

  ensureInitialized() {
    if (!this.initialized) {
      throw new Error('GuidancePhase1Runtime is not initialized. Call initialize() first.');
    }
  }

  async preTask({ taskId, taskDescription }) {
    this.ensureInitialized();
    return this.executor.execute(HookEvent.PreTask, {
      task: { id: taskId, description: taskDescription },
    });
  }

  async postTask({ taskId, status = 'completed', toolsUsed = [], filesTouched = [] }) {
    this.ensureInitialized();
    return this.executor.execute(HookEvent.PostTask, {
      task: { id: taskId, status },
      metadata: { toolsUsed, filesTouched },
    });
  }

  async preCommand(command) {
    this.ensureInitialized();

    // Gateway evaluation (idempotency + schema + budget) if available
    if (this.gateway && this.options.enableGateway) {
      const evaluation = this.gateway.evaluate('Bash', { command }, {
        agentId: this.options.agentId ?? 'claude-main',
      });
      if (!evaluation.allowed) {
        return {
          success: false,
          aborted: true,
          reason: evaluation.reason,
          gatewayBlocked: true,
          cached: evaluation.cached ?? false,
        };
      }
    }

    return this.executor.execute(HookEvent.PreCommand, {
      command: { raw: command, workingDirectory: this.options.rootDir },
    });
  }

  async preToolUse(toolName, parameters = {}) {
    this.ensureInitialized();

    // Gateway evaluation if available
    if (this.gateway && this.options.enableGateway) {
      const evaluation = this.gateway.evaluate(toolName, parameters, {
        agentId: this.options.agentId ?? 'claude-main',
      });
      if (!evaluation.allowed) {
        return {
          success: false,
          aborted: true,
          reason: evaluation.reason,
          gatewayBlocked: true,
          cached: evaluation.cached ?? false,
        };
      }
    }

    return this.executor.execute(HookEvent.PreToolUse, {
      tool: { name: toolName, parameters },
    });
  }

  async preEdit({ filePath, operation = 'modify', content = '', diffLines = 0 }) {
    this.ensureInitialized();
    return this.executor.execute(HookEvent.PreEdit, {
      file: { path: filePath, operation },
      metadata: { content, diffLines },
    });
  }

  extractPolicyText(hookExecutionResult) {
    return hookExecutionResult?.finalContext?.metadata?.policyText ?? null;
  }

  isBlocked(hookExecutionResult) {
    return !hookExecutionResult?.success || Boolean(hookExecutionResult?.aborted);
  }

  getBundle() {
    return this.bundle;
  }

  getStatus() {
    return {
      initialized: this.initialized,
      hookCount: this.hookIds.length,
      registryStats: this.registry.getStats(),
      shardCount: this.bundle?.shards.length ?? 0,
      constitutionRuleCount: this.bundle?.constitution.rules.length ?? 0,
      manifestRuleCount: this.bundle?.manifest.totalRules ?? 0,
      activeGateCount: this.gates.getActiveGateCount(),
      ledgerEventCount: this.ledger.eventCount,
      persistenceEnabled: Boolean(this.options.enablePersistence),
      storageStats: this.ledger.getStorageStats ? this.ledger.getStorageStats() : null,
      gatewayEnabled: Boolean(this.options.enableGateway),
      gatewayBudget: this.gateway?.getBudget ? this.gateway.getBudget() : null,
    };
  }

  async destroy() {
    if (this.ledger.save) {
      await this.ledger.save();
    }
    if (this.ledger.destroy) {
      this.ledger.destroy();
    }
  }
}

export function createGuidancePhase1Runtime(options = {}) {
  return new GuidancePhase1Runtime(options);
}
