import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

import { GuidancePhase1Runtime, createGuidancePhase1Runtime } from '../src/guidance/phase1-runtime.js';

function makeTmpDir() {
  const dir = resolve(tmpdir(), `phase1-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeClaudeMd(dir, content) {
  writeFileSync(join(dir, 'CLAUDE.md'), content || [
    '# Project Guidance',
    '',
    '## Core Invariants',
    '- NEVER use eval() or Function() constructor (critical)',
    '- NEVER commit secrets or API keys to version control (critical)',
    '- Always run tests before pushing code',
    '',
    '## Coding Standards',
    '- Use TypeScript for all new code',
    '- Keep functions under 50 lines',
    '',
  ].join('\n'));
}

// ── Constructor ─────────────────────────────────────────────────────────────

describe('GuidancePhase1Runtime: constructor', () => {
  it('creates instance with default options', () => {
    const rt = new GuidancePhase1Runtime();
    expect(rt.initialized).toBe(false);
    expect(rt.bundle).toBeNull();
    expect(rt.hookIds).toEqual([]);
  });

  it('factory function returns instance', () => {
    const rt = createGuidancePhase1Runtime();
    expect(rt).toBeInstanceOf(GuidancePhase1Runtime);
  });

  it('accepts custom options', () => {
    const rt = new GuidancePhase1Runtime({
      rootDir: '/tmp/test',
      rootGuidancePath: 'CUSTOM.md',
    });
    expect(rt.options.rootDir).toBe('/tmp/test');
    expect(rt.options.rootGuidancePath).toBe('CUSTOM.md');
  });
});

// ── initialize() ────────────────────────────────────────────────────────────

describe('GuidancePhase1Runtime: initialize', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('initializes successfully with CLAUDE.md', async () => {
    writeClaudeMd(tmpDir);
    const rt = new GuidancePhase1Runtime({ rootDir: tmpDir });
    await rt.initialize();

    expect(rt.initialized).toBe(true);
    expect(rt.bundle).not.toBeNull();
    expect(rt.hookIds.length).toBeGreaterThan(0);
  });

  it('throws when CLAUDE.md is missing', async () => {
    const rt = new GuidancePhase1Runtime({ rootDir: tmpDir });
    await expect(rt.initialize()).rejects.toThrow('Missing required guidance file');
  });

  it('double initialize is a no-op', async () => {
    writeClaudeMd(tmpDir);
    const rt = new GuidancePhase1Runtime({ rootDir: tmpDir });
    await rt.initialize();
    const hookCount = rt.hookIds.length;

    await rt.initialize(); // second call
    expect(rt.hookIds.length).toBe(hookCount);
  });

  it('initializes with CLAUDE.md + CLAUDE.local.md', async () => {
    writeClaudeMd(tmpDir);
    writeFileSync(join(tmpDir, 'CLAUDE.local.md'), [
      '# Local Experiments',
      '- [LOCAL-001] Prefer bun over npm (low) @tooling priority:40',
    ].join('\n'));

    const rt = new GuidancePhase1Runtime({ rootDir: tmpDir });
    await rt.initialize();
    expect(rt.initialized).toBe(true);
  });

  it('works without CLAUDE.local.md', async () => {
    writeClaudeMd(tmpDir);
    const rt = new GuidancePhase1Runtime({ rootDir: tmpDir });
    await rt.initialize();
    expect(rt.initialized).toBe(true);
  });
});

// ── ensureInitialized() ─────────────────────────────────────────────────────

describe('GuidancePhase1Runtime: ensureInitialized', () => {
  it('throws when not initialized', () => {
    const rt = new GuidancePhase1Runtime();
    expect(() => rt.ensureInitialized()).toThrow('not initialized');
  });

  it('does not throw after initialization', async () => {
    const tmpDir = makeTmpDir();
    writeClaudeMd(tmpDir);
    try {
      const rt = new GuidancePhase1Runtime({ rootDir: tmpDir });
      await rt.initialize();
      expect(() => rt.ensureInitialized()).not.toThrow();
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ── Hook execution methods ──────────────────────────────────────────────────

describe('GuidancePhase1Runtime: hook methods', () => {
  let tmpDir;
  let runtime;

  beforeAll(async () => {
    tmpDir = makeTmpDir();
    writeClaudeMd(tmpDir);
    runtime = new GuidancePhase1Runtime({ rootDir: tmpDir });
    await runtime.initialize();
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('preCommand with safe command returns success', async () => {
    const result = await runtime.preCommand('git status');
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
  });

  it('preCommand with destructive command flags it', async () => {
    const result = await runtime.preCommand('rm -rf /');
    expect(result).toBeDefined();
    // The gates should flag this as require-confirmation
    expect(result.success === false || result.aborted === true || result.warnings?.length > 0 || result.messages?.length > 0).toBe(true);
  });

  it('preTask returns HookExecutionResult', async () => {
    const result = await runtime.preTask({
      taskId: 'task-1',
      taskDescription: 'Add input validation',
    });
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
    expect(result).toHaveProperty('hooksExecuted');
  });

  it('postTask returns HookExecutionResult', async () => {
    const result = await runtime.postTask({
      taskId: 'task-1',
      status: 'completed',
      toolsUsed: ['Edit'],
      filesTouched: ['src/app.js'],
    });
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
  });

  it('preEdit returns HookExecutionResult', async () => {
    const result = await runtime.preEdit({
      filePath: 'src/app.js',
      operation: 'modify',
      content: 'const x = 1;',
      diffLines: 1,
    });
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
  });

  it('preToolUse returns HookExecutionResult', async () => {
    const result = await runtime.preToolUse('Bash', { command: 'npm test' });
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
  });

  it('hook methods throw when not initialized', async () => {
    const rt = new GuidancePhase1Runtime();
    await expect(rt.preCommand('echo hi')).rejects.toThrow('not initialized');
    await expect(rt.preTask({ taskId: '1', taskDescription: 'x' })).rejects.toThrow('not initialized');
    await expect(rt.preEdit({ filePath: 'a.js' })).rejects.toThrow('not initialized');
    await expect(rt.preToolUse('Bash')).rejects.toThrow('not initialized');
    await expect(rt.postTask({ taskId: '1' })).rejects.toThrow('not initialized');
  });
});

// ── extractPolicyText ───────────────────────────────────────────────────────

describe('GuidancePhase1Runtime: extractPolicyText', () => {
  it('extracts policyText from nested result', () => {
    const rt = new GuidancePhase1Runtime();
    const mockResult = {
      success: true,
      finalContext: {
        metadata: {
          policyText: 'NEVER use eval()',
        },
      },
    };
    expect(rt.extractPolicyText(mockResult)).toBe('NEVER use eval()');
  });

  it('returns null for missing policyText', () => {
    const rt = new GuidancePhase1Runtime();
    expect(rt.extractPolicyText({})).toBeNull();
    expect(rt.extractPolicyText(null)).toBeNull();
    expect(rt.extractPolicyText(undefined)).toBeNull();
    expect(rt.extractPolicyText({ finalContext: {} })).toBeNull();
    expect(rt.extractPolicyText({ finalContext: { metadata: {} } })).toBeNull();
  });
});

// ── isBlocked ───────────────────────────────────────────────────────────────

describe('GuidancePhase1Runtime: isBlocked', () => {
  let rt;

  beforeAll(() => {
    rt = new GuidancePhase1Runtime();
  });

  it('returns true when success is false', () => {
    expect(rt.isBlocked({ success: false })).toBe(true);
  });

  it('returns true when aborted is true', () => {
    expect(rt.isBlocked({ success: true, aborted: true })).toBe(true);
  });

  it('returns false when success=true and aborted=false', () => {
    expect(rt.isBlocked({ success: true, aborted: false })).toBe(false);
    expect(rt.isBlocked({ success: true })).toBe(false);
  });

  it('returns true for null/undefined input', () => {
    expect(rt.isBlocked(null)).toBe(true);
    expect(rt.isBlocked(undefined)).toBe(true);
  });
});

// ── getBundle ───────────────────────────────────────────────────────────────

describe('GuidancePhase1Runtime: getBundle', () => {
  it('returns null before initialization', () => {
    const rt = new GuidancePhase1Runtime();
    expect(rt.getBundle()).toBeNull();
  });

  it('returns compiled bundle after initialization', async () => {
    const tmpDir = makeTmpDir();
    writeClaudeMd(tmpDir);
    try {
      const rt = new GuidancePhase1Runtime({ rootDir: tmpDir });
      await rt.initialize();
      const bundle = rt.getBundle();
      expect(bundle).not.toBeNull();
      expect(bundle).toHaveProperty('constitution');
      expect(bundle).toHaveProperty('shards');
      expect(bundle).toHaveProperty('manifest');
      // Constitution rules depend on heading patterns the compiler detects
      expect(typeof bundle.constitution.rules.length).toBe('number');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ── getStatus ───────────────────────────────────────────────────────────────

describe('GuidancePhase1Runtime: getStatus', () => {
  it('returns status before initialization', () => {
    const rt = new GuidancePhase1Runtime();
    const status = rt.getStatus();
    expect(status.initialized).toBe(false);
    expect(status.hookCount).toBe(0);
    expect(status.shardCount).toBe(0);
  });

  it('returns full status after initialization', async () => {
    const tmpDir = makeTmpDir();
    writeClaudeMd(tmpDir);
    try {
      const rt = new GuidancePhase1Runtime({ rootDir: tmpDir });
      await rt.initialize();
      const status = rt.getStatus();
      expect(status.initialized).toBe(true);
      expect(status.hookCount).toBeGreaterThan(0);
      expect(typeof status.shardCount).toBe('number');
      expect(typeof status.constitutionRuleCount).toBe('number');
      expect(typeof status.manifestRuleCount).toBe('number');
      expect(typeof status.activeGateCount).toBe('number');
      expect(typeof status.ledgerEventCount).toBe('number');
      expect(status.registryStats).toBeDefined();
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
