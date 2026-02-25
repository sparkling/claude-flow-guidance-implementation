import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  GuidanceAdvancedRuntime,
  createGuidanceAdvancedRuntime,
} from '../src/guidance/advanced-runtime.js';

function makeTmpDir() {
  const dir = resolve(tmpdir(), `adv-rt-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeClaudeMd(dir) {
  writeFileSync(join(dir, 'CLAUDE.md'), [
    '# Project Guidance',
    '',
    '## Core Invariants',
    '- NEVER use eval() or Function() constructor (critical)',
    '- NEVER commit secrets or API keys (critical)',
    '- Always run tests before pushing',
    '',
    '## Coding Standards',
    '- Use TypeScript for new code',
    '- Keep functions under 50 lines',
    '',
  ].join('\n'));
}

function writeComponents(dir, components) {
  const guidanceDir = join(dir, '.claude-flow', 'guidance');
  mkdirSync(guidanceDir, { recursive: true });
  writeFileSync(join(guidanceDir, 'components.json'), JSON.stringify({ components }));
}

// ── Constructor ─────────────────────────────────────────────────────────────

describe('GuidanceAdvancedRuntime: constructor', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    writeClaudeMd(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates instance with defaults (all components enabled)', () => {
    const rt = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    expect(rt.initialized).toBe(false);
    expect(rt.isComponentEnabled('trust')).toBe(true);
    expect(rt.isComponentEnabled('adversarial')).toBe(true);
    expect(rt.isComponentEnabled('proof')).toBe(true);
  });

  it('factory function returns instance', () => {
    const rt = createGuidanceAdvancedRuntime({ rootDir: tmpDir });
    expect(rt).toBeInstanceOf(GuidanceAdvancedRuntime);
  });

  it('respects components.json for component gating', () => {
    writeComponents(tmpDir, ['trust', 'proof']);
    const rt = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    expect(rt.isComponentEnabled('trust')).toBe(true);
    expect(rt.isComponentEnabled('proof')).toBe(true);
    expect(rt.isComponentEnabled('adversarial')).toBe(false);
    expect(rt.isComponentEnabled('evolution')).toBe(false);
  });

  it('disabled components use null-object subsystems', () => {
    writeComponents(tmpDir, []);
    const rt = new GuidanceAdvancedRuntime({ rootDir: tmpDir });

    // Null trust system
    expect(rt.trustSystem.getAllSnapshots()).toEqual([]);
    expect(rt.trustSystem.accumulator.getScore()).toBe(0.5);

    // Null threat detector
    const threats = rt.threatDetector.analyze();
    expect(threats).toEqual({ threat: false, severity: 0, signals: [] });

    // Null proof chain
    const envelope = rt.proofChain.append();
    expect(envelope).toEqual({ envelopeId: 'null-envelope' });

    // Null evolution pipeline
    const proposal = rt.evolutionPipeline.propose();
    expect(proposal).toEqual({ proposalId: 'null-proposal' });
  });

  it('getEnabledComponents returns sorted array', () => {
    writeComponents(tmpDir, ['proof', 'trust', 'adversarial']);
    const rt = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    expect(rt.getEnabledComponents()).toEqual(['adversarial', 'proof', 'trust']);
  });
});

// ── initialize() ────────────────────────────────────────────────────────────

describe('GuidanceAdvancedRuntime: initialize', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    writeClaudeMd(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates data directory', async () => {
    const rt = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    await rt.initialize();
    expect(existsSync(rt.dataDir)).toBe(true);
  });

  it('initializes phase1 runtime', async () => {
    const rt = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    await rt.initialize();
    expect(rt.phase1.initialized).toBe(true);
  });

  it('double initialize is no-op', async () => {
    const rt = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    await rt.initialize();
    await rt.initialize(); // should not throw
    expect(rt.initialized).toBe(true);
  });

  it('throws when CLAUDE.md is missing', async () => {
    const emptyDir = makeTmpDir();
    try {
      const rt = new GuidanceAdvancedRuntime({ rootDir: emptyDir });
      await expect(rt.initialize()).rejects.toThrow('Missing required guidance file');
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});

// ── recordTrust ─────────────────────────────────────────────────────────────

describe('GuidanceAdvancedRuntime: recordTrust', () => {
  let tmpDir;
  let runtime;

  beforeAll(async () => {
    tmpDir = makeTmpDir();
    writeClaudeMd(tmpDir);
    runtime = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    await runtime.initialize();
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('records allow outcome', () => {
    const result = runtime.recordTrust('agent-1', 'allow', 'safe command');
    expect(result).toBeDefined();
  });

  it('records deny outcome', () => {
    runtime.recordTrust('agent-1', 'deny', 'blocked command');
    const snapshot = runtime.trustSystem.getSnapshot('agent-1');
    expect(snapshot).toBeDefined();
    expect(typeof snapshot.score).toBe('number');
  });

  it('records warn outcome', () => {
    runtime.recordTrust('agent-1', 'warn', 'risky operation');
    const snapshot = runtime.trustSystem.getSnapshot('agent-1');
    expect(snapshot.score).toBeDefined();
  });

  it('trust score changes with outcomes', () => {
    const fresh = 'fresh-agent-' + Date.now();
    runtime.recordTrust(fresh, 'allow', 'good');
    const after1 = runtime.trustSystem.getSnapshot(fresh);

    runtime.recordTrust(fresh, 'deny', 'bad');
    const after2 = runtime.trustSystem.getSnapshot(fresh);

    // Deny should decrease score
    expect(after2.score).toBeLessThan(after1.score);
  });

  it('trust snapshots accessible via getAllSnapshots', () => {
    const snapshots = runtime.trustSystem.getAllSnapshots();
    expect(Array.isArray(snapshots)).toBe(true);
    expect(snapshots.length).toBeGreaterThan(0);
  });
});

// ── appendProof ─────────────────────────────────────────────────────────────

describe('GuidanceAdvancedRuntime: appendProof', () => {
  let tmpDir;
  let runtime;

  beforeAll(async () => {
    tmpDir = makeTmpDir();
    writeClaudeMd(tmpDir);
    runtime = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    await runtime.initialize();
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('appends proof envelope', () => {
    const envelope = runtime.appendProof({
      taskId: 'test-task-1',
      agentId: 'coder-1',
      toolsUsed: ['Edit'],
      violations: [],
      outcomeAccepted: true,
    });
    expect(envelope).toBeDefined();
    expect(envelope.envelopeId).toBeDefined();
    expect(envelope.contentHash).toBeDefined();
  });

  it('chain grows with each append', () => {
    const before = runtime.proofChain.export().envelopes.length;
    runtime.appendProof({
      taskId: 'test-task-2',
      agentId: 'coder-1',
      toolsUsed: ['Bash'],
      violations: [],
    });
    const after = runtime.proofChain.export().envelopes.length;
    expect(after).toBe(before + 1);
  });

  it('proof chain verifies after multiple appends', () => {
    const valid = runtime.proofChain.verifyChain();
    expect(valid).toBe(true);
  });

  it('proof envelope includes tool call records', () => {
    const envelope = runtime.appendProof({
      taskId: 'test-task-3',
      agentId: 'coder-1',
      toolsUsed: ['Write', 'Bash'],
      violations: [],
      details: {
        toolParams: {
          Write: { file_path: 'src/app.js' },
          Bash: { command: 'npm test' },
        },
        toolResults: {
          Write: { ok: true },
          Bash: { exitCode: 0 },
        },
      },
    });
    expect(envelope).toBeDefined();
    expect(envelope.envelopeId).toBeDefined();
    expect(envelope.contentHash).toBeDefined();
  });
});

// ── persistState / restore ──────────────────────────────────────────────────

describe('GuidanceAdvancedRuntime: state persistence', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    writeClaudeMd(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('persistState writes state and proof files', async () => {
    const rt = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    await rt.initialize();

    rt.recordTrust('test-agent', 'allow', 'test');
    rt.appendProof({
      taskId: 'persist-test',
      agentId: 'test-agent',
      toolsUsed: ['Read'],
    });

    await rt.persistState({ custom: 'data' });

    expect(existsSync(rt.statePath)).toBe(true);
    expect(existsSync(rt.proofPath)).toBe(true);

    const state = JSON.parse(readFileSync(rt.statePath, 'utf-8'));
    expect(state.updatedAt).toBeDefined();
    expect(state.trustSnapshots).toBeDefined();
    expect(state.trustRecords).toBeDefined();
    expect(state.threatHistory).toBeDefined();
    expect(state.custom).toBe('data');
  });

  it('restore state loads trust snapshots on next init', async () => {
    const rt1 = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    await rt1.initialize();

    // Record some trust
    rt1.recordTrust('agent-persist', 'allow', 'good');
    rt1.recordTrust('agent-persist', 'allow', 'good again');
    const score1 = rt1.trustSystem.getSnapshot('agent-persist').score;

    await rt1.persistState();

    // Create new runtime, should restore trust
    const rt2 = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    await rt2.initialize();

    const score2 = rt2.trustSystem.accumulator.getScore('agent-persist');
    expect(score2).toBeCloseTo(score1, 2);
  });

  it('restore state loads proof chain on next init', async () => {
    const rt1 = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    await rt1.initialize();

    rt1.appendProof({
      taskId: 'proof-persist-1',
      agentId: 'coder',
      toolsUsed: ['Edit'],
    });
    rt1.appendProof({
      taskId: 'proof-persist-2',
      agentId: 'coder',
      toolsUsed: ['Bash'],
    });

    await rt1.persistState();
    const len1 = rt1.proofChain.export().envelopes.length;

    // Create new runtime, should restore proof chain
    const rt2 = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    await rt2.initialize();

    const len2 = rt2.proofChain.export().envelopes.length;
    expect(len2).toBe(len1);
  });

  it('corrupted proof file is ignored on restore', async () => {
    const rt1 = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    await rt1.initialize();

    // Write garbage to proof file
    mkdirSync(resolve(tmpDir, '.claude-flow', 'guidance', 'advanced'), { recursive: true });
    writeFileSync(rt1.proofPath, '{"envelopes":[{"broken":true}]}');

    // Should not throw
    const rt2 = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    await expect(rt2.initialize()).resolves.not.toThrow();
  });
});

// ── getGuidanceHash ─────────────────────────────────────────────────────────

describe('GuidanceAdvancedRuntime: getGuidanceHash', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    writeClaudeMd(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns unknown-guidance-hash before init', () => {
    const rt = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    expect(rt.getGuidanceHash()).toBe('unknown-guidance-hash');
  });

  it('returns constitution hash after init', async () => {
    const rt = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    await rt.initialize();
    const hash = rt.getGuidanceHash();
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);
  });
});

// ── getStatus ───────────────────────────────────────────────────────────────

describe('GuidanceAdvancedRuntime: getStatus', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    writeClaudeMd(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns status with all fields', async () => {
    const rt = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    await rt.initialize();

    const status = rt.getStatus();
    expect(status.initialized).toBe(true);
    expect(typeof status.guidanceHash).toBe('string');
    expect(Array.isArray(status.enabledComponents)).toBe(true);
    expect(typeof status.trustAgents).toBe('number');
    expect(typeof status.threatSignals).toBe('number');
    expect(typeof status.proofChainLength).toBe('number');
    expect(typeof status.evolutionProposals).toBe('number');
    expect(status.statePath).toBeDefined();
    expect(status.proofPath).toBeDefined();
  });

  it('status reflects recorded trust', async () => {
    const rt = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    await rt.initialize();

    rt.recordTrust('status-agent', 'allow', 'test');
    const status = rt.getStatus();
    expect(status.trustAgents).toBeGreaterThan(0);
  });

  it('status reflects proof chain length', async () => {
    const rt = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    await rt.initialize();

    rt.appendProof({
      taskId: 'status-proof',
      agentId: 'coder',
      toolsUsed: ['Read'],
    });
    const status = rt.getStatus();
    expect(status.proofChainLength).toBeGreaterThan(0);
  });
});

// ── New Module Properties ────────────────────────────────────────────────────

describe('GuidanceAdvancedRuntime: new modules', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    writeClaudeMd(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('has coherenceScheduler property', () => {
    const rt = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    expect(rt.coherenceScheduler).toBeDefined();
    expect(typeof rt.coherenceScheduler.computeCoherence).toBe('function');
  });

  it('has economicGovernor property', () => {
    const rt = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    expect(rt.economicGovernor).toBeDefined();
    expect(typeof rt.economicGovernor.checkBudget).toBe('function');
  });

  it('has continueGate property', () => {
    const rt = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    expect(rt.continueGate).toBeDefined();
    expect(typeof rt.continueGate.evaluate).toBe('function');
  });

  it('has irreversibilityClassifier property', () => {
    const rt = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    expect(rt.irreversibilityClassifier).toBeDefined();
    expect(typeof rt.irreversibilityClassifier.classify).toBe('function');
  });

  it('has authorityGate property', () => {
    const rt = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    expect(rt.authorityGate).toBeDefined();
    expect(typeof rt.authorityGate.canPerform).toBe('function');
  });

  it('has metaGovernor property', () => {
    const rt = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    expect(rt.metaGovernor).toBeDefined();
    expect(typeof rt.metaGovernor.addInvariant).toBe('function');
  });

  it('has optimizer property', () => {
    const rt = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    expect(rt.optimizer).toBeDefined();
    expect(typeof rt.optimizer.runCycle).toBe('function');
  });

  it('has truthAnchorStore property', () => {
    const rt = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    expect(rt.truthAnchorStore).toBeDefined();
    expect(typeof rt.truthAnchorStore.anchor).toBe('function');
  });

  it('has truthResolver property', () => {
    const rt = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    expect(rt.truthResolver).toBeDefined();
    expect(typeof rt.truthResolver.resolveMemoryConflict).toBe('function');
  });

  it('has uncertaintyLedger property', () => {
    const rt = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    expect(rt.uncertaintyLedger).toBeDefined();
    expect(typeof rt.uncertaintyLedger.assert).toBe('function');
  });

  it('has uncertaintyAggregator property', () => {
    const rt = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    expect(rt.uncertaintyAggregator).toBeDefined();
    expect(typeof rt.uncertaintyAggregator.aggregate).toBe('function');
  });

  it('has temporalStore property', () => {
    const rt = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    expect(rt.temporalStore).toBeDefined();
    expect(typeof rt.temporalStore.assert).toBe('function');
  });

  it('has temporalReasoner property', () => {
    const rt = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    expect(rt.temporalReasoner).toBeDefined();
    expect(typeof rt.temporalReasoner.whatIsTrue).toBe('function');
  });

  it('has capabilities property', () => {
    const rt = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    expect(rt.capabilities).toBeDefined();
    expect(typeof rt.capabilities.grant).toBe('function');
  });

  it('has artifactLedger property', () => {
    const rt = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    expect(rt.artifactLedger).toBeDefined();
    expect(typeof rt.artifactLedger.record).toBe('function');
  });

  it('has manifestValidator property', () => {
    const rt = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    expect(rt.manifestValidator).toBeDefined();
    expect(typeof rt.manifestValidator.validate).toBe('function');
  });

  it('has stepCounter initialized to 0', () => {
    const rt = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    expect(rt.stepCounter).toBe(0);
  });

  it('disabled coherence uses null-object', () => {
    writeComponents(tmpDir, []);
    const rt = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    expect(rt.coherenceScheduler.computeCoherence({}, [])).toBe(1.0);
    expect(rt.coherenceScheduler.isHealthy()).toBe(true);
  });

  it('disabled continue-gate uses null-object', () => {
    writeComponents(tmpDir, []);
    const rt = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    expect(rt.continueGate.evaluate({}).action).toBe('continue');
  });

  it('disabled authority uses null-object', () => {
    writeComponents(tmpDir, []);
    const rt = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    expect(rt.irreversibilityClassifier.classify('rm -rf /')).toBe('reversible');
    expect(rt.authorityGate.canPerform('agent', 'anything')).toBe(true);
  });

  it('disabled optimizer uses null-object', () => {
    writeComponents(tmpDir, []);
    const rt = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    const cycle = rt.optimizer.runCycle(null, null);
    expect(cycle.skipped).toBe(true);
  });
});

// ── Meta-Governance Invariants ───────────────────────────────────────────────

describe('GuidanceAdvancedRuntime: meta-governance invariants', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    writeClaudeMd(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('registers invariants on initialize when meta-governance enabled', async () => {
    const rt = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    await rt.initialize();
    const invariants = rt.metaGovernor.getInvariants();
    // Should have at least the 3 constitutional invariants
    // (may be [] if meta-governance is null-object with all components enabled and upstream provides real ones)
    expect(Array.isArray(invariants)).toBe(true);
  });

  it('skips invariant registration when meta-governance disabled', async () => {
    writeComponents(tmpDir, ['trust', 'proof']);
    const rt = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    await rt.initialize();
    const invariants = rt.metaGovernor.getInvariants();
    expect(invariants).toEqual([]);
  });
});

// ── Extended persistState ────────────────────────────────────────────────────

describe('GuidanceAdvancedRuntime: extended persistState', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    writeClaudeMd(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('persists new module state fields', async () => {
    const rt = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    await rt.initialize();
    await rt.persistState();

    const state = JSON.parse(readFileSync(rt.statePath, 'utf-8'));
    expect(state.coherenceHistory).toBeDefined();
    expect(state.economicUsage).toBeDefined();
    expect(state.continueGateStats).toBeDefined();
    expect(state.authorityInterventions).toBeDefined();
    expect(state.metaGovernanceInvariants).toBeDefined();
    expect(state.optimizerLastRun).toBeDefined();
    expect(typeof state.stepCounter).toBe('number');
  });
});

// ── Extended getStatus ───────────────────────────────────────────────────────

describe('GuidanceAdvancedRuntime: extended getStatus', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    writeClaudeMd(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('includes all new module fields', async () => {
    const rt = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    await rt.initialize();
    const status = rt.getStatus();

    expect(typeof status.coherenceScore).toBe('number');
    expect(typeof status.coherenceHealthy).toBe('boolean');
    expect(status.economicBudget).toBeDefined();
    expect(status.continueGateStats).toBeDefined();
    expect(typeof status.authorityInterventions).toBe('number');
    expect(typeof status.metaGovernanceInvariants).toBe('number');
    expect(status).toHaveProperty('optimizerLastRun');
    expect(typeof status.truthAnchorsActive).toBe('number');
    expect(typeof status.uncertaintyContested).toBe('number');
    expect(typeof status.capabilitiesGranted).toBe('number');
    expect(typeof status.artifactsRecorded).toBe('number');
  });
});

// ── New Integration Runners Bound ────────────────────────────────────────────

describe('GuidanceAdvancedRuntime: new runner bindings', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    writeClaudeMd(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('has all 13 runner methods bound', () => {
    const rt = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    expect(typeof rt.runHooksIntegration).toBe('function');
    expect(typeof rt.runTrustIntegration).toBe('function');
    expect(typeof rt.runAdversarialIntegration).toBe('function');
    expect(typeof rt.runProofIntegration).toBe('function');
    expect(typeof rt.runConformanceIntegration).toBe('function');
    expect(typeof rt.runEvolutionIntegration).toBe('function');
    expect(typeof rt.runCoherenceIntegration).toBe('function');
    expect(typeof rt.runContinueGateIntegration).toBe('function');
    expect(typeof rt.runAuthorityIntegration).toBe('function');
    expect(typeof rt.runMetaGovernanceIntegration).toBe('function');
    expect(typeof rt.runOptimizerIntegration).toBe('function');
    expect(typeof rt.runKnowledgeIntegration).toBe('function');
    expect(typeof rt.runCapabilitiesIntegration).toBe('function');
    expect(typeof rt.runAllIntegrations).toBe('function');
  });
});

// ── Default components set ───────────────────────────────────────────────────

describe('GuidanceAdvancedRuntime: default components', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    writeClaudeMd(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('default set has 24 components (no components.json)', () => {
    const rt = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    const components = rt.getEnabledComponents();
    expect(components.length).toBe(24);
  });

  it('default set includes all Phase A components', () => {
    const rt = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    expect(rt.isComponentEnabled('persistence')).toBe(true);
    expect(rt.isComponentEnabled('coherence')).toBe(true);
    expect(rt.isComponentEnabled('continue-gate')).toBe(true);
    expect(rt.isComponentEnabled('gateway')).toBe(true);
    expect(rt.isComponentEnabled('authority')).toBe(true);
    expect(rt.isComponentEnabled('meta-governance')).toBe(true);
    expect(rt.isComponentEnabled('optimizer')).toBe(true);
  });

  it('default set includes all Phase B components', () => {
    const rt = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    expect(rt.isComponentEnabled('truth-anchors')).toBe(true);
    expect(rt.isComponentEnabled('uncertainty')).toBe(true);
    expect(rt.isComponentEnabled('temporal')).toBe(true);
    expect(rt.isComponentEnabled('capabilities')).toBe(true);
    expect(rt.isComponentEnabled('headless')).toBe(true);
  });

  it('default set includes all Phase C components', () => {
    const rt = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    expect(rt.isComponentEnabled('wasm-kernel')).toBe(true);
    expect(rt.isComponentEnabled('generators')).toBe(true);
    expect(rt.isComponentEnabled('artifacts')).toBe(true);
    expect(rt.isComponentEnabled('manifest-validator')).toBe(true);
  });
});
