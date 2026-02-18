import { resolve } from 'node:path';

import { createTrustSystem } from '@claude-flow/guidance/trust';
import {
  createThreatDetector,
  createCollusionDetector,
  createMemoryQuorum,
} from '@claude-flow/guidance/adversarial';
import { createProofChain } from '@claude-flow/guidance/proof';
import { createConformanceRunner } from '@claude-flow/guidance/conformance-kit';
import { createEvolutionPipeline } from '@claude-flow/guidance/evolution';

import { createGuidancePhase1Runtime } from './phase1-runtime.js';
import { buildRunEvent, createIntegrationRunners, runAllIntegrations } from './integration-runners.js';
import { ensureDir, readJson, writeJson, nowIso } from '../utils.mjs';

const DEFAULT_AUTHORITY = {
  agentId: 'guidance-orchestrator',
  role: 'coordinator',
  namespaces: ['clerk-workspace', 'guidance', 'security', 'tasks'],
  maxWritesPerMinute: 240,
  canDelete: true,
  canOverwrite: true,
  trustLevel: 0.9,
};

const DEFAULT_OPTIONS = {
  rootDir: process.cwd(),
  dataDir: '.claude-flow/guidance/advanced',
  signingKey: process.env.GUIDANCE_PROOF_KEY || 'local-guidance-dev-signing-key',
  authority: DEFAULT_AUTHORITY,
};

export class GuidanceAdvancedRuntime {
  constructor(options = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };

    this.rootDir = resolve(this.options.rootDir);
    this.dataDir = resolve(this.rootDir, this.options.dataDir);
    this.statePath = resolve(this.dataDir, 'advanced-state.json');
    this.proofPath = resolve(this.dataDir, 'proof-chain.json');

    this.phase1 = createGuidancePhase1Runtime({ rootDir: this.rootDir });

    this.trustSystem = createTrustSystem();
    this.threatDetector = createThreatDetector();
    this.collusionDetector = createCollusionDetector({
      ringMinLength: 3,
      frequencyThreshold: 5,
    });
    this.memoryQuorum = createMemoryQuorum({ threshold: 0.67 });

    this.proofChain = createProofChain({ signingKey: this.options.signingKey });
    this.evolutionPipeline = createEvolutionPipeline({ signingKey: this.options.signingKey });
    this.conformanceRunner = createConformanceRunner(
      this.options.authority,
      this.options.signingKey
    );

    this.initialized = false;

    // Bind integration runner methods from the extracted module
    const runners = createIntegrationRunners(this);
    this.runHooksIntegration = runners.runHooksIntegration;
    this.runTrustIntegration = runners.runTrustIntegration;
    this.runAdversarialIntegration = runners.runAdversarialIntegration;
    this.runProofIntegration = runners.runProofIntegration;
    this.runConformanceIntegration = runners.runConformanceIntegration;
    this.runEvolutionIntegration = runners.runEvolutionIntegration;
    this.runAllIntegrations = () => runAllIntegrations(this);
  }

  async initialize() {
    if (this.initialized) return;

    ensureDir(this.dataDir);

    if (!process.env.GUIDANCE_PROOF_KEY) {
      console.warn('[WARN] GUIDANCE_PROOF_KEY not set, using insecure dev signing key');
    }

    await this.phase1.initialize();

    const savedState = readJson(this.statePath, {});
    const trustSnapshots = savedState?.trustSnapshots ?? [];
    for (const snapshot of trustSnapshots) {
      if (snapshot?.agentId && typeof snapshot?.score === 'number') {
        this.trustSystem.accumulator.setScore(snapshot.agentId, snapshot.score);
      }
    }

    const trustRecords = savedState?.trustRecords ?? [];
    if (Array.isArray(trustRecords) && trustRecords.length > 0) {
      this.trustSystem.ledger.importRecords(trustRecords);
    }

    const exportedProof = readJson(this.proofPath, null);
    if (exportedProof?.envelopes) {
      try {
        this.proofChain.import(exportedProof);
      } catch {
        // Ignore corrupted proof file and continue with a fresh chain.
      }
    }

    this.initialized = true;
  }

  async persistState(extra = {}) {
    ensureDir(this.dataDir);

    writeJson(this.statePath, {
      updatedAt: nowIso(),
      trustSnapshots: this.trustSystem.getAllSnapshots(),
      trustRecords: this.trustSystem.ledger.exportRecords(),
      threatHistory: this.threatDetector.getThreatHistory(),
      ...extra,
    });

    writeJson(this.proofPath, this.proofChain.export());
  }

  getGuidanceHash() {
    return this.phase1.getBundle()?.constitution?.hash ?? 'unknown-guidance-hash';
  }

  recordTrust(agentId, outcome, reason) {
    return this.trustSystem.recordOutcome(agentId, outcome, reason);
  }

  appendProof({
    taskId,
    agentId,
    toolsUsed = [],
    violations = [],
    intent = 'general',
    outcomeAccepted = true,
    durationMs = 0,
    memoryOps = [],
    details = {},
  }) {
    const runEvent = buildRunEvent({
      taskId,
      guidanceHash: this.getGuidanceHash(),
      intent,
      toolsUsed,
      filesTouched: details.filesTouched ?? [],
      violations,
      outcomeAccepted,
      durationMs,
      reworkLines: details.reworkLines ?? 0,
      sessionId: details.sessionId,
    });

    const toolCallRecords = toolsUsed.map((toolName, index) => ({
      callId: `${taskId}-${index + 1}`,
      toolName,
      params: details.toolParams?.[toolName] ?? {},
      result: details.toolResults?.[toolName] ?? { status: 'captured' },
      timestamp: Date.now(),
      durationMs: 0,
    }));

    return this.proofChain.append(runEvent, toolCallRecords, memoryOps, {
      agentId,
      sessionId: details.sessionId ?? 'guidance-session',
    });
  }

  getStatus() {
    const proofExport = this.proofChain.export();
    return {
      initialized: this.initialized,
      guidanceHash: this.getGuidanceHash(),
      trustAgents: this.trustSystem.getAllSnapshots().length,
      threatSignals: this.threatDetector.getThreatHistory().length,
      proofChainLength: proofExport.envelopes.length,
      evolutionProposals: this.evolutionPipeline.getProposals().length,
      statePath: this.statePath,
      proofPath: this.proofPath,
    };
  }
}

export function createGuidanceAdvancedRuntime(options = {}) {
  return new GuidanceAdvancedRuntime(options);
}
