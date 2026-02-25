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
import { createCoherenceScheduler, createEconomicGovernor } from '@claude-flow/guidance/coherence';
import { createContinueGate } from '@claude-flow/guidance/continue-gate';
import { createAuthorityGate, createIrreversibilityClassifier } from '@claude-flow/guidance/authority';
import { createMetaGovernor } from '@claude-flow/guidance/meta-governance';
import { createOptimizer } from '@claude-flow/guidance/optimizer';
import { createTruthAnchorStore, createTruthResolver } from '@claude-flow/guidance/truth-anchors';
import { createUncertaintyLedger, createUncertaintyAggregator } from '@claude-flow/guidance/uncertainty';
import { createTemporalStore, createTemporalReasoner } from '@claude-flow/guidance/temporal';
import { createCapabilityAlgebra } from '@claude-flow/guidance/capabilities';
import { createArtifactLedger } from '@claude-flow/guidance/artifacts';
import { createManifestValidator } from '@claude-flow/guidance/manifest-validator';

import { createGuidancePhase1Runtime } from './phase1-runtime.js';
import { buildRunEvent, createIntegrationRunners, runAllIntegrations } from './integration-runners.js';
import { ensureDir, readJson, writeJson, nowIso } from '../utils.mjs';
import {
  createNullToolGateway,
  createNullAuthorityGate,
  createNullIrreversibilityClassifier,
  createNullContinueGate,
  createNullMetaGovernor,
} from './enforcement-layer.js';
import { createNullArtifactLedger } from './observation-layer.js';
import {
  createNullCoherenceScheduler,
  createNullEconomicGovernor,
  createNullOptimizer,
} from './validation-layer.js';
import {
  createNullTruthAnchorStore,
  createNullTruthResolver,
  createNullUncertaintyLedger,
  createNullUncertaintyAggregator,
  createNullTemporalStore,
  createNullTemporalReasoner,
} from './knowledge-layer.js';
import {
  createNullCapabilityAlgebra,
  createNullManifestValidator,
} from './infrastructure-layer.js';

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
  collusionRingMinLength: 3,
  collusionFrequencyThreshold: 5,
  memoryQuorumThreshold: 0.67,
  // Coherence
  coherenceWindowSize: 50,
  coherenceCheckIntervalMs: 30000,
  tokenLimit: 500000,
  toolCallLimit: 1000,
  timeLimitMs: 3600000,
  // Continue gate
  maxConsecutiveSteps: 100,
  maxBudgetSlopePerStep: 0.02,
  minCoherenceForContinue: 0.4,
  maxReworkRatio: 0.3,
  continueGateCooldownMs: 5000,
  // Meta-governance
  supermajorityThreshold: 0.75,
  maxAmendmentsPerWindow: 3,
  amendmentWindowMs: 86400000,
  // Optimizer
  topViolationsPerCycle: 5,
  minEventsForOptimization: 50,
  optimizerImprovementThreshold: 0.1,
  promotionWins: 2,
  // Truth anchors
  maxAnchors: 50000,
  // Uncertainty
  defaultConfidence: 0.7,
  decayRatePerHour: 0.02,
  minConfidenceForAction: 0.3,
  // Temporal
  maxAssertions: 100000,
  autoExpireCheckIntervalMs: 60000,
  // Artifacts
  maxArtifacts: 50000,
};

// Null-object factories for disabled components.
// Each returns an object with the same method signatures as the real subsystem
// but with no-op implementations that return safe defaults.

function createNullTrustSystem() {
  return {
    recordOutcome() {},
    getAllSnapshots() { return []; },
    accumulator: {
      setScore() {},
      getScore() { return 0.5; },
    },
    ledger: {
      importRecords() {},
      exportRecords() { return []; },
    },
  };
}

function createNullThreatDetector() {
  return {
    analyze() { return { threat: false, severity: 0, signals: [] }; },
    getThreatHistory() { return []; },
  };
}

function createNullCollusionDetector() {
  return {
    analyze() { return { detected: false, rings: [] }; },
    getHistory() { return []; },
  };
}

function createNullMemoryQuorum() {
  return {
    propose() { return { accepted: true, votes: [] }; },
    getHistory() { return []; },
  };
}

function createNullProofChain() {
  return {
    append() { return { envelopeId: 'null-envelope' }; },
    export() { return { envelopes: [] }; },
    import() {},
    verify() { return { valid: true }; },
  };
}

function createNullConformanceRunner() {
  return {
    run() { return { passed: true, results: [] }; },
    replay() { return { valid: true }; },
  };
}

function createNullEvolutionPipeline() {
  return {
    propose() { return { proposalId: 'null-proposal' }; },
    simulate() { return { passed: true }; },
    stage() {},
    advance() {},
    getProposals() { return []; },
  };
}

export class GuidanceAdvancedRuntime {
  constructor(options = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };

    this.rootDir = resolve(this.options.rootDir);
    this.dataDir = resolve(this.rootDir, this.options.dataDir);
    this.statePath = resolve(this.dataDir, 'advanced-state.json');
    this.proofPath = resolve(this.dataDir, 'proof-chain.json');

    this.phase1 = createGuidancePhase1Runtime({ rootDir: this.rootDir });

    this._enabledComponents = this._loadEnabledComponents();

    this.trustSystem = this._enabledComponents.has('trust')
      ? createTrustSystem()
      : createNullTrustSystem();

    this.threatDetector = this._enabledComponents.has('adversarial')
      ? createThreatDetector()
      : createNullThreatDetector();

    this.collusionDetector = this._enabledComponents.has('adversarial')
      ? createCollusionDetector({
          ringMinLength: this.options.collusionRingMinLength,
          frequencyThreshold: this.options.collusionFrequencyThreshold,
        })
      : createNullCollusionDetector();

    this.memoryQuorum = this._enabledComponents.has('adversarial')
      ? createMemoryQuorum({ threshold: this.options.memoryQuorumThreshold })
      : createNullMemoryQuorum();

    this.proofChain = this._enabledComponents.has('proof')
      ? createProofChain({ signingKey: this.options.signingKey })
      : createNullProofChain();

    this.evolutionPipeline = this._enabledComponents.has('evolution')
      ? createEvolutionPipeline({ signingKey: this.options.signingKey })
      : createNullEvolutionPipeline();

    this.conformanceRunner = this._enabledComponents.has('conformance')
      ? createConformanceRunner(this.options.authority, this.options.signingKey)
      : createNullConformanceRunner();

    // --- Phase A: Production Hardening ---

    this.coherenceScheduler = this._enabledComponents.has('coherence')
      ? createCoherenceScheduler({
          windowSize: this.options.coherenceWindowSize,
          checkIntervalMs: this.options.coherenceCheckIntervalMs,
        })
      : createNullCoherenceScheduler();

    this.economicGovernor = this._enabledComponents.has('coherence')
      ? createEconomicGovernor({
          tokenLimit: this.options.tokenLimit,
          toolCallLimit: this.options.toolCallLimit,
          timeLimit: this.options.timeLimitMs,
        })
      : createNullEconomicGovernor();

    this.continueGate = this._enabledComponents.has('continue-gate')
      ? createContinueGate({
          maxConsecutiveSteps: this.options.maxConsecutiveSteps,
          maxBudgetSlopePerStep: this.options.maxBudgetSlopePerStep,
          minCoherenceForContinue: this.options.minCoherenceForContinue,
          maxReworkRatio: this.options.maxReworkRatio,
          cooldownMs: this.options.continueGateCooldownMs,
        })
      : createNullContinueGate();

    this.irreversibilityClassifier = this._enabledComponents.has('authority')
      ? createIrreversibilityClassifier()
      : createNullIrreversibilityClassifier();

    this.authorityGate = this._enabledComponents.has('authority')
      ? createAuthorityGate({ signatureSecret: this.options.signingKey })
      : createNullAuthorityGate();

    this.metaGovernor = this._enabledComponents.has('meta-governance')
      ? createMetaGovernor({
          supermajorityThreshold: this.options.supermajorityThreshold,
          maxAmendmentsPerWindow: this.options.maxAmendmentsPerWindow,
          amendmentWindowMs: this.options.amendmentWindowMs,
          signingKey: this.options.signingKey,
        })
      : createNullMetaGovernor();

    this.optimizer = this._enabledComponents.has('optimizer')
      ? createOptimizer({
          topViolationsPerCycle: this.options.topViolationsPerCycle,
          minEventsForOptimization: this.options.minEventsForOptimization,
          improvementThreshold: this.options.optimizerImprovementThreshold,
          promotionWins: this.options.promotionWins,
          adrPath: resolve(this.rootDir, 'docs/adr'),
        })
      : createNullOptimizer();

    // --- Phase B: Long-Horizon Autonomy ---

    this.truthAnchorStore = this._enabledComponents.has('truth-anchors')
      ? createTruthAnchorStore({
          signingKey: this.options.signingKey,
          maxAnchors: this.options.maxAnchors,
        })
      : createNullTruthAnchorStore();

    this.truthResolver = this._enabledComponents.has('truth-anchors')
      ? createTruthResolver(this.truthAnchorStore)
      : createNullTruthResolver();

    this.uncertaintyLedger = this._enabledComponents.has('uncertainty')
      ? createUncertaintyLedger({
          defaultConfidence: this.options.defaultConfidence,
          decayRatePerHour: this.options.decayRatePerHour,
          minConfidenceForAction: this.options.minConfidenceForAction,
        })
      : createNullUncertaintyLedger();

    this.uncertaintyAggregator = this._enabledComponents.has('uncertainty')
      ? createUncertaintyAggregator(this.uncertaintyLedger)
      : createNullUncertaintyAggregator();

    this.temporalStore = this._enabledComponents.has('temporal')
      ? createTemporalStore({
          maxAssertions: this.options.maxAssertions,
          autoExpireCheckIntervalMs: this.options.autoExpireCheckIntervalMs,
        })
      : createNullTemporalStore();

    this.temporalReasoner = this._enabledComponents.has('temporal')
      ? createTemporalReasoner(this.temporalStore)
      : createNullTemporalReasoner();

    this.capabilities = this._enabledComponents.has('capabilities')
      ? createCapabilityAlgebra()
      : createNullCapabilityAlgebra();

    // --- Phase C: Polish ---

    this.artifactLedger = this._enabledComponents.has('artifacts')
      ? createArtifactLedger({
          signingKey: this.options.signingKey,
          maxArtifacts: this.options.maxArtifacts,
        })
      : createNullArtifactLedger();

    this.manifestValidator = this._enabledComponents.has('manifest-validator')
      ? createManifestValidator()
      : createNullManifestValidator();

    this.stepCounter = 0;

    this.initialized = false;

    // Bind integration runner methods from the extracted module
    const runners = createIntegrationRunners(this);
    this.runHooksIntegration = runners.runHooksIntegration;
    this.runTrustIntegration = runners.runTrustIntegration;
    this.runAdversarialIntegration = runners.runAdversarialIntegration;
    this.runProofIntegration = runners.runProofIntegration;
    this.runConformanceIntegration = runners.runConformanceIntegration;
    this.runEvolutionIntegration = runners.runEvolutionIntegration;
    this.runCoherenceIntegration = runners.runCoherenceIntegration;
    this.runContinueGateIntegration = runners.runContinueGateIntegration;
    this.runAuthorityIntegration = runners.runAuthorityIntegration;
    this.runMetaGovernanceIntegration = runners.runMetaGovernanceIntegration;
    this.runOptimizerIntegration = runners.runOptimizerIntegration;
    this.runKnowledgeIntegration = runners.runKnowledgeIntegration;
    this.runCapabilitiesIntegration = runners.runCapabilitiesIntegration;
    this.runAllIntegrations = () => runAllIntegrations(this);
  }

  _loadEnabledComponents() {
    const componentsJsonPath = resolve(this.rootDir, '.claude-flow/guidance/components.json');
    const saved = readJson(componentsJsonPath, null);
    if (saved && Array.isArray(saved.components)) {
      return new Set(saved.components);
    }
    // No components.json → all enabled (backwards compat)
    return new Set([
      // Existing (Phase 0)
      'trust', 'adversarial', 'proof', 'conformance', 'evolution',
      'autopilot', 'analysis', 'codex',
      // Phase A: Production Hardening
      'persistence', 'coherence', 'continue-gate', 'gateway',
      'authority', 'meta-governance', 'optimizer',
      // Phase B: Long-Horizon Autonomy
      'truth-anchors', 'uncertainty', 'temporal',
      'capabilities', 'headless',
      // Phase C: Polish
      'wasm-kernel', 'generators', 'artifacts', 'manifest-validator',
    ]);
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

    // Register constitutional invariants for meta-governance
    if (this._enabledComponents.has('meta-governance')) {
      this.metaGovernor.addInvariant({
        id: 'no-weaken-security',
        description: 'Security rules cannot be weakened by automated evolution',
        check: (state) => state?.securityRulesIntact !== false,
      });
      this.metaGovernor.addInvariant({
        id: 'no-remove-gates',
        description: 'Enforcement gates cannot be removed',
        check: (state) => state?.gatesActive !== false,
      });
      this.metaGovernor.addInvariant({
        id: 'no-disable-proof',
        description: 'Proof chain cannot be disabled by evolution',
        check: (state) => state?.proofChainActive !== false,
      });
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
      coherenceHistory: this.coherenceScheduler.getScoreHistory(),
      economicUsage: this.economicGovernor.getUsageSummary(),
      continueGateStats: this.continueGate.getStats(),
      authorityInterventions: this.authorityGate.getInterventions(),
      metaGovernanceInvariants: this.metaGovernor.getInvariants().map(i => i.id),
      optimizerLastRun: this.optimizer.lastRun,
      stepCounter: this.stepCounter,
      ...extra,
    });

    writeJson(this.proofPath, this.proofChain.export());
  }

  getGuidanceHash() {
    return this.phase1.getBundle()?.constitution?.hash ?? 'unknown-guidance-hash';
  }

  isComponentEnabled(name) {
    return this._enabledComponents.has(name);
  }

  getEnabledComponents() {
    return [...this._enabledComponents].sort();
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

    // Wrap new module calls in try-catch — real upstream modules may throw if
    // internal state hasn't been populated by prior operations yet.
    let coherenceScore = 1.0;
    let coherenceHealthy = true;
    try {
      const raw = this.coherenceScheduler.computeCoherence({ violationRate: 0, reworkLines: 0 }, []);
      coherenceScore = typeof raw === 'number' ? raw : (raw?.overall ?? 1.0);
    } catch {}
    try { coherenceHealthy = this.coherenceScheduler.isHealthy(); } catch {}

    return {
      initialized: this.initialized,
      guidanceHash: this.getGuidanceHash(),
      enabledComponents: this.getEnabledComponents(),
      trustAgents: this.trustSystem.getAllSnapshots().length,
      threatSignals: this.threatDetector.getThreatHistory().length,
      proofChainLength: proofExport.envelopes.length,
      evolutionProposals: this.evolutionPipeline.getProposals().length,
      coherenceScore,
      coherenceHealthy,
      economicBudget: this.economicGovernor.checkBudget(),
      continueGateStats: this.continueGate.getStats(),
      authorityInterventions: this.authorityGate.getInterventions().length,
      metaGovernanceInvariants: this.metaGovernor.getInvariants().length,
      optimizerLastRun: this.optimizer.lastRun,
      truthAnchorsActive: this.truthAnchorStore.getActive?.()?.length ?? 0,
      uncertaintyContested: this.uncertaintyLedger.getContested?.()?.length ?? 0,
      capabilitiesGranted: this.capabilities.getCapabilities?.('*')?.length ?? 0,
      artifactsRecorded: this.artifactLedger.getStats?.()?.totalArtifacts ?? 0,
      statePath: this.statePath,
      proofPath: this.proofPath,
    };
  }
}

export function createGuidanceAdvancedRuntime(options = {}) {
  return new GuidanceAdvancedRuntime(options);
}
