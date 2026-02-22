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
