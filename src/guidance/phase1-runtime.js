import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createCompiler } from '@claude-flow/guidance/compiler';
import { createRetriever } from '@claude-flow/guidance/retriever';
import { createGates } from '@claude-flow/guidance/gates';
import { createLedger } from '@claude-flow/guidance/ledger';
import { createGuidanceHooks } from '@claude-flow/guidance/hooks';
import { HookEvent, HookExecutor, HookRegistry } from '@claude-flow/hooks';

const DEFAULT_OPTIONS = {
  rootDir: process.cwd(),
  rootGuidancePath: 'CLAUDE.md',
  localGuidancePath: 'CLAUDE.local.md',
  gateConfig: {},
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
    this.ledger = createLedger();
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
    return this.executor.execute(HookEvent.PreCommand, {
      command: { raw: command, workingDirectory: this.options.rootDir },
    });
  }

  async preToolUse(toolName, parameters = {}) {
    this.ensureInitialized();
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
    };
  }
}

export function createGuidancePhase1Runtime(options = {}) {
  return new GuidancePhase1Runtime(options);
}
