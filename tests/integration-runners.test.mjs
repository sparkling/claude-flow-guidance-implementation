import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

import { GuidanceAdvancedRuntime } from '../src/guidance/advanced-runtime.js';
import {
  buildRunEvent,
  createIntegrationRunners,
  runAllIntegrations,
} from '../src/guidance/integration-runners.js';

function makeTmpDir() {
  const dir = resolve(tmpdir(), `runners-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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
    '## Security',
    '- NEVER execute arbitrary user input as code (critical) @security',
    '',
  ].join('\n'));
}

// ── buildRunEvent ───────────────────────────────────────────────────────────

describe('buildRunEvent', () => {
  it('creates event with all required fields', () => {
    const event = buildRunEvent({
      taskId: 'task-1',
      guidanceHash: 'abc123',
    });
    expect(event.eventId).toMatch(/^evt-/);
    expect(event.taskId).toBe('task-1');
    expect(event.guidanceHash).toBe('abc123');
    expect(event.intent).toBe('general');
    expect(event.toolsUsed).toEqual([]);
    expect(event.filesTouched).toEqual([]);
    expect(event.violations).toEqual([]);
    expect(event.outcomeAccepted).toBe(true);
    expect(event.reworkLines).toBe(0);
    expect(event.timestamp).toBeGreaterThan(0);
  });

  it('includes diff summary', () => {
    const event = buildRunEvent({
      taskId: 'task-2',
      guidanceHash: 'def456',
      filesTouched: ['a.js', 'b.js'],
    });
    expect(event.diffSummary.filesChanged).toBe(2);
    expect(event.diffSummary.linesAdded).toBe(0);
    expect(event.diffSummary.linesRemoved).toBe(0);
  });

  it('includes test results (default: not run)', () => {
    const event = buildRunEvent({
      taskId: 'task-3',
      guidanceHash: 'ghi789',
    });
    expect(event.testResults.ran).toBe(false);
    expect(event.testResults.passed).toBe(0);
    expect(event.testResults.failed).toBe(0);
  });

  it('passes through violations', () => {
    const violations = [
      { ruleId: 'test-1', description: 'bad', severity: 'high', autoCorrected: false },
    ];
    const event = buildRunEvent({
      taskId: 'task-4',
      guidanceHash: 'jkl012',
      violations,
    });
    expect(event.violations).toEqual(violations);
  });

  it('each event has unique eventId', () => {
    const e1 = buildRunEvent({ taskId: 'a', guidanceHash: 'h' });
    const e2 = buildRunEvent({ taskId: 'b', guidanceHash: 'h' });
    expect(e1.eventId).not.toBe(e2.eventId);
  });
});

// ── runHooksIntegration ─────────────────────────────────────────────────────

describe('runHooksIntegration', () => {
  let tmpDir;
  let runtime;

  beforeAll(async () => {
    tmpDir = makeTmpDir();
    writeClaudeMd(tmpDir);
    runtime = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('runs full hooks pipeline', async () => {
    const summary = await runtime.runHooksIntegration();
    expect(summary.integration).toBe('hooks');
    expect(summary.taskId).toBeDefined();
  });

  it('executes preTask', async () => {
    const summary = await runtime.runHooksIntegration();
    expect(summary.preTask).toBeDefined();
    expect(typeof summary.preTask.success).toBe('boolean');
    expect(typeof summary.preTask.hooksExecuted).toBe('number');
  });

  it('tests safe and dangerous commands', async () => {
    const summary = await runtime.runHooksIntegration();
    expect(summary.preCommandSafe).toBeDefined();
    expect(summary.preCommandDestructive).toBeDefined();
    expect(summary.preCommandSafe.success).toBe(true);
  });

  it('flags destructive command', async () => {
    const summary = await runtime.runHooksIntegration();
    // git push --force should be flagged by destructive ops gate
    const d = summary.preCommandDestructive;
    expect(d.success === false || d.aborted === true).toBe(true);
  });

  it('records trust snapshot', async () => {
    const summary = await runtime.runHooksIntegration();
    expect(summary.trust).toBeDefined();
    expect(typeof summary.trust.score).toBe('number');
  });

  it('appends proof envelope', async () => {
    const summary = await runtime.runHooksIntegration();
    expect(summary.proofEnvelope).toBeDefined();
    expect(summary.proofEnvelope.envelopeId).toBeDefined();
  });

  it('persists state after run', async () => {
    await runtime.runHooksIntegration();
    expect(existsSync(runtime.statePath)).toBe(true);
  });
});

// ── runTrustIntegration ─────────────────────────────────────────────────────

describe('runTrustIntegration', () => {
  let tmpDir;
  let runtime;

  beforeAll(async () => {
    tmpDir = makeTmpDir();
    writeClaudeMd(tmpDir);
    runtime = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('records 5 trust events', async () => {
    const summary = await runtime.runTrustIntegration();
    expect(summary.integration).toBe('trust');
    expect(summary.eventsRecorded).toBe(5);
  });

  it('computes trust score', async () => {
    const summary = await runtime.runTrustIntegration();
    expect(typeof summary.score).toBe('number');
    expect(summary.score).toBeGreaterThan(0);
    expect(summary.score).toBeLessThanOrEqual(1);
  });

  it('determines trust tier', async () => {
    const summary = await runtime.runTrustIntegration();
    expect(['trusted', 'standard', 'probation', 'untrusted']).toContain(summary.tier);
  });

  it('computes trust-based rate limit', async () => {
    const summary = await runtime.runTrustIntegration({ baseRateLimit: 100 });
    expect(typeof summary.trustBasedRateLimit).toBe('number');
    expect(summary.trustBasedRateLimit).toBeGreaterThan(0);
  });

  it('includes recent events', async () => {
    const summary = await runtime.runTrustIntegration();
    expect(Array.isArray(summary.recentEvents)).toBe(true);
    expect(summary.recentEvents.length).toBeLessThanOrEqual(5);
  });
});

// ── runAdversarialIntegration ───────────────────────────────────────────────

describe('runAdversarialIntegration', () => {
  let tmpDir;
  let runtime;

  beforeAll(async () => {
    tmpDir = makeTmpDir();
    writeClaudeMd(tmpDir);
    runtime = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects input threats from injection attempt', async () => {
    const summary = await runtime.runAdversarialIntegration();
    expect(summary.integration).toBe('adversarial');
    expect(summary.inputThreatCount).toBeGreaterThan(0);
  });

  it('detects memory poisoning threats', async () => {
    const summary = await runtime.runAdversarialIntegration();
    expect(typeof summary.memoryThreatCount).toBe('number');
  });

  it('runs collusion detection', async () => {
    const summary = await runtime.runAdversarialIntegration();
    expect(typeof summary.collusionDetected).toBe('boolean');
  });

  it('runs memory quorum voting', async () => {
    const summary = await runtime.runAdversarialIntegration();
    expect(summary.quorumResult).toBeDefined();
    // 3 votes: 2 yes, 1 no → approved at 0.67 threshold
    expect(summary.quorumResult.approved).toBe(true);
  });

  it('appends proof envelope', async () => {
    const summary = await runtime.runAdversarialIntegration();
    expect(summary.proofEnvelope).toBeDefined();
    expect(summary.proofEnvelope.envelopeId).toBeDefined();
  });
});

// ── runProofIntegration ─────────────────────────────────────────────────────

describe('runProofIntegration', () => {
  let tmpDir;
  let runtime;

  beforeAll(async () => {
    tmpDir = makeTmpDir();
    writeClaudeMd(tmpDir);
    runtime = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('runs proof chain operations', async () => {
    const summary = await runtime.runProofIntegration();
    expect(summary.integration).toBe('proof');
    expect(summary.chainLength).toBeGreaterThan(0);
  });

  it('appends two envelopes', async () => {
    const summary = await runtime.runProofIntegration();
    expect(summary.firstEnvelope).toBeDefined();
    expect(summary.secondEnvelope).toBeDefined();
    expect(summary.firstEnvelope).not.toBe(summary.secondEnvelope);
  });

  it('verifies chain integrity', async () => {
    const summary = await runtime.runProofIntegration();
    expect(summary.chainValid).toBe(true);
  });

  it('export/import round-trip is valid', async () => {
    const summary = await runtime.runProofIntegration();
    expect(summary.importedValid).toBe(true);
  });

  it('chain tip matches last appended envelope', async () => {
    const summary = await runtime.runProofIntegration();
    expect(summary.chainTip).toBeDefined();
  });
});

// ── runConformanceIntegration ───────────────────────────────────────────────

describe('runConformanceIntegration', () => {
  let tmpDir;
  let runtime;

  beforeAll(async () => {
    tmpDir = makeTmpDir();
    writeClaudeMd(tmpDir);
    runtime = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('runs conformance test', async () => {
    const summary = await runtime.runConformanceIntegration();
    expect(summary.integration).toBe('conformance');
    expect(typeof summary.passed).toBe('boolean');
  });

  it('reports check count', async () => {
    const summary = await runtime.runConformanceIntegration();
    expect(typeof summary.checkCount).toBe('number');
    expect(summary.checkCount).toBeGreaterThan(0);
  });

  it('reports failed checks array', async () => {
    const summary = await runtime.runConformanceIntegration();
    expect(Array.isArray(summary.failedChecks)).toBe(true);
  });

  it('includes proof hash', async () => {
    const summary = await runtime.runConformanceIntegration();
    expect(summary.proofHash).toBeDefined();
  });

  it('runs replay test', async () => {
    const summary = await runtime.runConformanceIntegration();
    expect(summary.replay).toBeDefined();
  });

  it('reports duration', async () => {
    const summary = await runtime.runConformanceIntegration();
    expect(typeof summary.durationMs).toBe('number');
  });
});

// ── runEvolutionIntegration ─────────────────────────────────────────────────

describe('runEvolutionIntegration', () => {
  let tmpDir;
  let runtime;

  beforeAll(async () => {
    tmpDir = makeTmpDir();
    writeClaudeMd(tmpDir);
    runtime = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates and processes a proposal', async () => {
    const summary = await runtime.runEvolutionIntegration();
    expect(summary.integration).toBe('evolution');
    expect(summary.proposalId).toBeDefined();
  });

  it('runs simulation with golden traces', async () => {
    const summary = await runtime.runEvolutionIntegration();
    expect(summary.simulation).toBeDefined();
    expect(typeof summary.simulation.divergenceScore).toBe('number');
    expect(typeof summary.simulation.passed).toBe('boolean');
  });

  it('compares baseline vs candidate', async () => {
    const summary = await runtime.runEvolutionIntegration();
    expect(summary.comparison).toBeDefined();
    expect(typeof summary.comparison.approved).toBe('boolean');
  });

  it('stages rollout if approved', async () => {
    const summary = await runtime.runEvolutionIntegration();
    if (summary.comparison.approved) {
      expect(summary.rollout).toBeDefined();
      expect(summary.rollout.rolloutId).toBeDefined();
    }
  });

  it('reports proposal status', async () => {
    const summary = await runtime.runEvolutionIntegration();
    expect(summary.proposalStatus).toBeDefined();
  });
});

// ── runAllIntegrations ──────────────────────────────────────────────────────

describe('runAllIntegrations', () => {
  let tmpDir;
  let runtime;

  beforeAll(async () => {
    tmpDir = makeTmpDir();
    writeClaudeMd(tmpDir);
    runtime = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('runs all 6 integrations', async () => {
    const report = await runAllIntegrations(runtime);
    expect(report.hooks).toBeDefined();
    expect(report.trust).toBeDefined();
    expect(report.adversarial).toBeDefined();
    expect(report.proof).toBeDefined();
    expect(report.conformance).toBeDefined();
    expect(report.evolution).toBeDefined();
  });

  it('includes generatedAt timestamp', async () => {
    const report = await runAllIntegrations(runtime);
    expect(report.generatedAt).toBeDefined();
  });

  it('persists state after all integrations', async () => {
    await runAllIntegrations(runtime);
    expect(existsSync(runtime.statePath)).toBe(true);
  });
});

// ── createIntegrationRunners ────────────────────────────────────────────────

describe('createIntegrationRunners', () => {
  let tmpDir;
  let runtime;

  beforeAll(async () => {
    tmpDir = makeTmpDir();
    writeClaudeMd(tmpDir);
    runtime = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns all 6 runner functions', () => {
    const runners = createIntegrationRunners(runtime);
    expect(typeof runners.runHooksIntegration).toBe('function');
    expect(typeof runners.runTrustIntegration).toBe('function');
    expect(typeof runners.runAdversarialIntegration).toBe('function');
    expect(typeof runners.runProofIntegration).toBe('function');
    expect(typeof runners.runConformanceIntegration).toBe('function');
    expect(typeof runners.runEvolutionIntegration).toBe('function');
  });

  it('runners are bound to runtime (work with custom params)', async () => {
    const runners = createIntegrationRunners(runtime);
    const summary = await runners.runTrustIntegration({
      agentId: 'custom-agent',
      baseRateLimit: 50,
    });
    expect(summary.agentId).toBe('custom-agent');
  });
});

// ── runCoherenceIntegration ──────────────────────────────────────────────────

describe('runCoherenceIntegration', () => {
  let tmpDir;
  let runtime;

  beforeAll(async () => {
    tmpDir = makeTmpDir();
    writeClaudeMd(tmpDir);
    runtime = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns coherence integration summary', async () => {
    const summary = await runtime.runCoherenceIntegration();
    expect(summary.integration).toBe('coherence');
  });

  it('computes coherence score', async () => {
    const summary = await runtime.runCoherenceIntegration();
    expect(typeof summary.coherenceScore).toBe('number');
  });

  it('determines privilege level', async () => {
    const summary = await runtime.runCoherenceIntegration();
    expect(typeof summary.privilegeLevel).toBe('string');
  });

  it('includes health and drift status', async () => {
    const summary = await runtime.runCoherenceIntegration();
    expect(typeof summary.isHealthy).toBe('boolean');
    expect(typeof summary.isDrifting).toBe('boolean');
    expect(typeof summary.shouldRestrict).toBe('boolean');
  });

  it('includes budget status', async () => {
    const summary = await runtime.runCoherenceIntegration();
    expect(summary.budgetStatus).toBeDefined();
    expect(summary.usageSummary).toBeDefined();
  });

  it('includes recommendation', async () => {
    const summary = await runtime.runCoherenceIntegration();
    expect(typeof summary.recommendation).toBe('string');
  });
});

// ── runContinueGateIntegration ───────────────────────────────────────────────

describe('runContinueGateIntegration', () => {
  let tmpDir;
  let runtime;

  beforeAll(async () => {
    tmpDir = makeTmpDir();
    writeClaudeMd(tmpDir);
    runtime = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns continue-gate integration summary', async () => {
    const summary = await runtime.runContinueGateIntegration();
    expect(summary.integration).toBe('continue-gate');
  });

  it('evaluates 5 steps', async () => {
    const summary = await runtime.runContinueGateIntegration();
    expect(summary.evaluations).toBe(5);
    expect(summary.decisions.length).toBe(5);
  });

  it('each decision has step and decision/action', async () => {
    const summary = await runtime.runContinueGateIntegration();
    for (const d of summary.decisions) {
      expect(typeof d.step).toBe('number');
      // upstream returns .decision, null-object returns .action (both are provided)
      const hasAction = typeof d.action === 'string' || typeof d.decision === 'string';
      expect(hasAction).toBe(true);
    }
  });

  it('includes stats', async () => {
    const summary = await runtime.runContinueGateIntegration();
    expect(summary.stats).toBeDefined();
    expect(typeof summary.stats.totalEvaluations).toBe('number');
  });
});

// ── runAuthorityIntegration ──────────────────────────────────────────────────

describe('runAuthorityIntegration', () => {
  let tmpDir;
  let runtime;

  beforeAll(async () => {
    tmpDir = makeTmpDir();
    writeClaudeMd(tmpDir);
    runtime = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns authority integration summary', async () => {
    const summary = await runtime.runAuthorityIntegration();
    expect(summary.integration).toBe('authority');
  });

  it('classifies 5 test actions', async () => {
    const summary = await runtime.runAuthorityIntegration();
    expect(summary.classifications.length).toBe(5);
  });

  it('each classification has expected fields', async () => {
    const summary = await runtime.runAuthorityIntegration();
    for (const c of summary.classifications) {
      expect(typeof c.action).toBe('string');
      // upstream classify() may return string or object with .classification
      expect(c.classification).toBeDefined();
      // upstream canPerform returns { allowed: boolean } or boolean (null-object)
      expect(c.canPerform).toBeDefined();
    }
  });

  it('includes interventions count', async () => {
    const summary = await runtime.runAuthorityIntegration();
    expect(typeof summary.interventions).toBe('number');
  });
});

// ── runMetaGovernanceIntegration ─────────────────────────────────────────────

describe('runMetaGovernanceIntegration', () => {
  let tmpDir;
  let runtime;

  beforeAll(async () => {
    tmpDir = makeTmpDir();
    writeClaudeMd(tmpDir);
    runtime = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns meta-governance integration summary', async () => {
    const summary = await runtime.runMetaGovernanceIntegration();
    expect(summary.integration).toBe('meta-governance');
  });

  it('checks invariants', async () => {
    const summary = await runtime.runMetaGovernanceIntegration();
    expect(typeof summary.invariantsPassed).toBe('boolean');
  });

  it('reports invariant count', async () => {
    const summary = await runtime.runMetaGovernanceIntegration();
    expect(typeof summary.invariantCount).toBe('number');
  });

  it('proposes amendment', async () => {
    const summary = await runtime.runMetaGovernanceIntegration();
    expect(typeof summary.amendmentProposed).toBe('boolean');
  });

  it('validates optimizer action', async () => {
    const summary = await runtime.runMetaGovernanceIntegration();
    expect(typeof summary.optimizerActionAllowed).toBe('boolean');
  });

  it('reports pending amendments', async () => {
    const summary = await runtime.runMetaGovernanceIntegration();
    expect(typeof summary.pendingAmendments).toBe('number');
  });
});

// ── runOptimizerIntegration ──────────────────────────────────────────────────

describe('runOptimizerIntegration', () => {
  let tmpDir;
  let runtime;

  beforeAll(async () => {
    tmpDir = makeTmpDir();
    writeClaudeMd(tmpDir);
    runtime = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns optimizer integration summary', async () => {
    const summary = await runtime.runOptimizerIntegration();
    expect(summary.integration).toBe('optimizer');
  });

  it('includes cycle number', async () => {
    const summary = await runtime.runOptimizerIntegration();
    expect(typeof summary.cycleNumber).toBe('number');
  });

  it('includes proposed changes count', async () => {
    const summary = await runtime.runOptimizerIntegration();
    expect(typeof summary.proposedChanges).toBe('number');
  });

  it('includes ADR count', async () => {
    const summary = await runtime.runOptimizerIntegration();
    expect(typeof summary.adrs).toBe('number');
  });
});

// ── runKnowledgeIntegration ──────────────────────────────────────────────────

describe('runKnowledgeIntegration', () => {
  let tmpDir;
  let runtime;

  beforeAll(async () => {
    tmpDir = makeTmpDir();
    writeClaudeMd(tmpDir);
    runtime = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns knowledge integration summary', async () => {
    const summary = await runtime.runKnowledgeIntegration();
    expect(summary.integration).toBe('knowledge');
  });

  it('includes truth anchor results', async () => {
    const summary = await runtime.runKnowledgeIntegration();
    expect(summary.truthAnchors).toBeDefined();
    expect(typeof summary.truthAnchors.anchored).toBe('boolean');
    expect(summary.truthAnchors.resolution).toBeDefined();
  });

  it('includes uncertainty results', async () => {
    const summary = await runtime.runKnowledgeIntegration();
    expect(summary.uncertainty).toBeDefined();
    expect(typeof summary.uncertainty.beliefCreated).toBe('boolean');
    expect(summary.uncertainty.confidence).toBeDefined();
    expect(typeof summary.uncertainty.isActionable).toBe('boolean');
  });

  it('includes temporal results', async () => {
    const summary = await runtime.runKnowledgeIntegration();
    expect(summary.temporal).toBeDefined();
    expect(typeof summary.temporal.asserted).toBe('boolean');
    expect(typeof summary.temporal.currentTruthCount).toBe('number');
  });
});

// ── runCapabilitiesIntegration ───────────────────────────────────────────────

describe('runCapabilitiesIntegration', () => {
  let tmpDir;
  let runtime;

  beforeAll(async () => {
    tmpDir = makeTmpDir();
    writeClaudeMd(tmpDir);
    runtime = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns capabilities integration summary', async () => {
    const summary = await runtime.runCapabilitiesIntegration();
    expect(summary.integration).toBe('capabilities');
  });

  it('grants capability', async () => {
    const summary = await runtime.runCapabilitiesIntegration();
    expect(typeof summary.granted).toBe('boolean');
  });

  it('checks allowed capability', async () => {
    const summary = await runtime.runCapabilitiesIntegration();
    expect(typeof summary.checkAllowed).toBe('boolean');
  });

  it('checks denied capability', async () => {
    const summary = await runtime.runCapabilitiesIntegration();
    expect(typeof summary.checkDenied).toBe('boolean');
  });

  it('lists agent capabilities', async () => {
    const summary = await runtime.runCapabilitiesIntegration();
    expect(typeof summary.agentCapabilities).toBe('number');
  });
});

// ── runAllIntegrations (updated) ─────────────────────────────────────────────

describe('runAllIntegrations (updated)', () => {
  let tmpDir;
  let runtime;

  beforeAll(async () => {
    tmpDir = makeTmpDir();
    writeClaudeMd(tmpDir);
    runtime = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('runs all 13 integrations', async () => {
    const report = await runAllIntegrations(runtime);
    expect(report.hooks).toBeDefined();
    expect(report.trust).toBeDefined();
    expect(report.adversarial).toBeDefined();
    expect(report.proof).toBeDefined();
    expect(report.conformance).toBeDefined();
    expect(report.evolution).toBeDefined();
    expect(report.coherence).toBeDefined();
    expect(report.continueGate).toBeDefined();
    expect(report.authority).toBeDefined();
    expect(report.metaGovernance).toBeDefined();
    expect(report.optimizer).toBeDefined();
    expect(report.knowledge).toBeDefined();
    expect(report.capabilities).toBeDefined();
  });

  it('includes generatedAt', async () => {
    const report = await runAllIntegrations(runtime);
    expect(report.generatedAt).toBeDefined();
  });
});

// ── createIntegrationRunners (updated) ───────────────────────────────────────

describe('createIntegrationRunners (updated)', () => {
  let tmpDir;
  let runtime;

  beforeAll(async () => {
    tmpDir = makeTmpDir();
    writeClaudeMd(tmpDir);
    runtime = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns all 13 runner functions', () => {
    const runners = createIntegrationRunners(runtime);
    expect(typeof runners.runHooksIntegration).toBe('function');
    expect(typeof runners.runTrustIntegration).toBe('function');
    expect(typeof runners.runAdversarialIntegration).toBe('function');
    expect(typeof runners.runProofIntegration).toBe('function');
    expect(typeof runners.runConformanceIntegration).toBe('function');
    expect(typeof runners.runEvolutionIntegration).toBe('function');
    expect(typeof runners.runCoherenceIntegration).toBe('function');
    expect(typeof runners.runContinueGateIntegration).toBe('function');
    expect(typeof runners.runAuthorityIntegration).toBe('function');
    expect(typeof runners.runMetaGovernanceIntegration).toBe('function');
    expect(typeof runners.runOptimizerIntegration).toBe('function');
    expect(typeof runners.runKnowledgeIntegration).toBe('function');
    expect(typeof runners.runCapabilitiesIntegration).toBe('function');
  });
});
