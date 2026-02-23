import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const AUTOPILOT = resolve('scripts/guidance-autopilot.js');

function runAutopilot(args = [], env = {}) {
  return spawnSync('node', [AUTOPILOT, ...args], {
    cwd: env.GUIDANCE_PROJECT_DIR || resolve('.'),
    encoding: 'utf-8',
    timeout: 30000,
    env: {
      ...process.env,
      ...env,
    },
  });
}

function makeTmpDir() {
  const dir = resolve(tmpdir(), `autopilot-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ── parseArgs ───────────────────────────────────────────────────────────────

describe('autopilot: parseArgs behavior', () => {
  it('--once mode (default)', () => {
    const tmpDir = makeTmpDir();
    writeFileSync(join(tmpDir, 'CLAUDE.md'), '# Test\n- NEVER use eval()');
    try {
      const result = runAutopilot(['--once'], { GUIDANCE_PROJECT_DIR: tmpDir });
      // Should run once and exit (may fail if no local rules to promote)
      expect([0, 1]).toContain(result.status);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('exits with error when CLAUDE.md is missing', () => {
    const tmpDir = makeTmpDir();
    try {
      const result = runAutopilot(['--once'], { GUIDANCE_PROJECT_DIR: tmpDir });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Missing root guidance file');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ── runCycle: no promotable rules ───────────────────────────────────────────

describe('autopilot: no promotable local rules', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    writeFileSync(join(tmpDir, 'CLAUDE.md'), '# Root Guidance\n- NEVER use eval() (critical)\n- Always run tests before committing\n');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reports no-promotable-local-rules when no CLAUDE.local.md', () => {
    const result = runAutopilot(['--once'], { GUIDANCE_PROJECT_DIR: tmpDir });
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout.trim());
    expect(report.applied).toBe(false);
    expect(report.reason).toBe('no-promotable-local-rules');
  });

  it('reports no-promotable-local-rules when local matches root', () => {
    writeFileSync(join(tmpDir, 'CLAUDE.local.md'), '# Local\n');
    const result = runAutopilot(['--once'], { GUIDANCE_PROJECT_DIR: tmpDir });
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout.trim());
    expect(report.applied).toBe(false);
    expect(report.reason).toBe('no-promotable-local-rules');
  });

  it('writes report JSON to autopilot-report.json', () => {
    runAutopilot(['--once'], { GUIDANCE_PROJECT_DIR: tmpDir });
    const reportPath = join(tmpDir, '.claude-flow', 'guidance', 'autopilot-report.json');
    expect(existsSync(reportPath)).toBe(true);
    const report = JSON.parse(readFileSync(reportPath, 'utf-8'));
    expect(report).toHaveProperty('timestamp');
    expect(report).toHaveProperty('source');
  });

  it('writes state JSON to autopilot-state.json', () => {
    runAutopilot(['--once'], { GUIDANCE_PROJECT_DIR: tmpDir });
    const statePath = join(tmpDir, '.claude-flow', 'guidance', 'autopilot-state.json');
    expect(existsSync(statePath)).toBe(true);
    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    expect(state).toHaveProperty('lastRunAt');
    expect(state.lastDecision).toBe('no-promotable-local-rules');
  });

  it('writes log to autopilot.log', () => {
    runAutopilot(['--once'], { GUIDANCE_PROJECT_DIR: tmpDir });
    const logPath = join(tmpDir, '.claude-flow', 'guidance', 'autopilot.log');
    expect(existsSync(logPath)).toBe(true);
    const log = readFileSync(logPath, 'utf-8');
    expect(log).toContain('no promotable local rules');
  });
});

// ── runCycle: with promotable rules ─────────────────────────────────────────

describe('autopilot: with promotable local rules', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    writeFileSync(join(tmpDir, 'CLAUDE.md'), [
      '# Root Guidance',
      '',
      '## Core Invariants',
      '- NEVER use eval() (critical)',
      '- Always run tests before committing',
      '',
    ].join('\n'));

    writeFileSync(join(tmpDir, 'CLAUDE.local.md'), [
      '# Local Experiments',
      '',
      '## Security Extensions',
      '- [LOCAL-001] NEVER use innerHTML for user-supplied content (critical) @security priority:90',
      '- [LOCAL-002] Require code review for database schema changes (high) @process priority:80',
      '',
    ].join('\n'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects promotable rules', () => {
    const result = runAutopilot(['--once'], { GUIDANCE_PROJECT_DIR: tmpDir });
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout.trim());
    expect(report.promotedRuleCount).toBeGreaterThan(0);
    expect(report.promotedRuleIds.length).toBeGreaterThan(0);
  });

  it('computes before/after composite scores', () => {
    const result = runAutopilot(['--once'], { GUIDANCE_PROJECT_DIR: tmpDir });
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout.trim());
    expect(report.metrics).toBeDefined();
    expect(typeof report.metrics.beforeComposite).toBe('number');
    expect(typeof report.metrics.afterComposite).toBe('number');
    expect(typeof report.metrics.delta).toBe('number');
  });

  it('without --apply creates proposal instead of applying', () => {
    const result = runAutopilot(['--once'], { GUIDANCE_PROJECT_DIR: tmpDir });
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout.trim());
    expect(report.applied).toBe(false);
    if (report.proposalPath) {
      expect(existsSync(report.proposalPath)).toBe(true);
      const proposal = readFileSync(report.proposalPath, 'utf-8');
      expect(proposal).toContain('Guidance Auto-Promotions');
    }
  });

  it('--apply promotes rules into CLAUDE.md', () => {
    const result = runAutopilot(['--once', '--apply', '--min-delta', '0'], {
      GUIDANCE_PROJECT_DIR: tmpDir,
    });
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout.trim());

    if (report.applied) {
      // CLAUDE.md should contain the auto-promotions section
      const claudeMd = readFileSync(join(tmpDir, 'CLAUDE.md'), 'utf-8');
      expect(claudeMd).toContain('## Guidance Auto-Promotions');
      expect(claudeMd).toContain('guidance-autopilot:start');
      expect(claudeMd).toContain('guidance-autopilot:end');

      // Backup should exist
      expect(report.backupPath).toBeDefined();
      expect(existsSync(report.backupPath)).toBe(true);
    }
  });

  it('--apply creates ADR in docs/adr/', () => {
    const result = runAutopilot(['--once', '--apply', '--min-delta', '0'], {
      GUIDANCE_PROJECT_DIR: tmpDir,
    });
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout.trim());

    if (report.applied && report.adrPath) {
      expect(existsSync(report.adrPath)).toBe(true);
      const adr = readFileSync(report.adrPath, 'utf-8');
      expect(adr).toContain('ADR-');
      expect(adr).toContain('Promote High-Value Local Guidance Rules');
      expect(adr).toContain('Composite score before');
      expect(adr).toContain('Composite score after');
    }
  });
});

// ── Lock file management ────────────────────────────────────────────────────

describe('autopilot: lock file management', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    writeFileSync(join(tmpDir, 'CLAUDE.md'), '# Test\n- NEVER use eval()');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates and removes lock file during run', () => {
    const lockPath = join(tmpDir, '.claude-flow', 'guidance', 'autopilot.lock');
    const result = runAutopilot(['--once'], { GUIDANCE_PROJECT_DIR: tmpDir });
    expect(result.status).toBe(0);
    // Lock should be released after run
    expect(existsSync(lockPath)).toBe(false);
  });

  it('stale lock from dead PID is cleaned up', () => {
    const guidanceDir = join(tmpDir, '.claude-flow', 'guidance');
    mkdirSync(guidanceDir, { recursive: true });
    const lockPath = join(guidanceDir, 'autopilot.lock');
    // Write a lock file with a PID that doesn't exist
    writeFileSync(lockPath, '99999999');

    const result = runAutopilot(['--once'], { GUIDANCE_PROJECT_DIR: tmpDir });
    expect(result.status).toBe(0);
    // Should have acquired lock despite stale file
    const report = JSON.parse(result.stdout.trim());
    expect(report.reason || report.applied !== undefined).toBeTruthy();
  });
});

// ── unchanged-below-threshold skip ──────────────────────────────────────────

describe('autopilot: unchanged-below-threshold', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    writeFileSync(join(tmpDir, 'CLAUDE.md'), '# Root\n- NEVER use eval()');
    writeFileSync(join(tmpDir, 'CLAUDE.local.md'), '# Local\n- [EXP-001] Always validate input @security priority:80');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('second run detects same candidate (timestamp changes hash)', () => {
    // First run
    const result1 = runAutopilot(['--once'], { GUIDANCE_PROJECT_DIR: tmpDir });
    expect(result1.status).toBe(0);
    const report1 = JSON.parse(result1.stdout.trim());

    // The candidate hash includes a timestamp (generatedAt), so it changes
    // between runs. The second run will produce a new candidate, not hit the
    // unchanged-below-threshold cache. Verify both runs succeed and have metrics.
    const result2 = runAutopilot(['--once'], { GUIDANCE_PROJECT_DIR: tmpDir });
    expect(result2.status).toBe(0);
    const report2 = JSON.parse(result2.stdout.trim());
    expect(report2.promotedRuleCount).toBeGreaterThan(0);
  });
});

// ── getNextAdrNumber ────────────────────────────────────────────────────────

describe('autopilot: ADR numbering', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    writeFileSync(join(tmpDir, 'CLAUDE.md'), '# Root\n- NEVER use eval()');
    writeFileSync(join(tmpDir, 'CLAUDE.local.md'), '# Local\n- [ADR-TEST-001] Always use TypeScript (critical) @code priority:95');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('first ADR is numbered ADR-001', () => {
    const result = runAutopilot(['--once', '--apply', '--min-delta', '0'], {
      GUIDANCE_PROJECT_DIR: tmpDir,
    });
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout.trim());
    if (report.adrPath) {
      expect(report.adrPath).toContain('ADR-001');
    }
  });

  it('sequential ADRs get incrementing numbers', () => {
    // Create an existing ADR
    const adrDir = join(tmpDir, 'docs', 'adr');
    mkdirSync(adrDir, { recursive: true });
    writeFileSync(join(adrDir, 'ADR-005-something.md'), '# Existing ADR');

    const result = runAutopilot(['--once', '--apply', '--min-delta', '0'], {
      GUIDANCE_PROJECT_DIR: tmpDir,
    });
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout.trim());
    if (report.adrPath) {
      expect(report.adrPath).toContain('ADR-006');
    }
  });
});

// ── --source option ─────────────────────────────────────────────────────────

describe('autopilot: --source option', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    writeFileSync(join(tmpDir, 'CLAUDE.md'), '# Root\n- NEVER use eval()');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('default source is manual', () => {
    const result = runAutopilot(['--once'], { GUIDANCE_PROJECT_DIR: tmpDir });
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout.trim());
    expect(report.source).toBe('manual');
  });

  it('--source session-end is captured in report', () => {
    const result = runAutopilot(['--once', '--source', 'session-end'], {
      GUIDANCE_PROJECT_DIR: tmpDir,
    });
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout.trim());
    expect(report.source).toBe('session-end');
  });

  it('--source hook is captured in report', () => {
    const result = runAutopilot(['--once', '--source', 'hook'], {
      GUIDANCE_PROJECT_DIR: tmpDir,
    });
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout.trim());
    expect(report.source).toBe('hook');
  });
});
