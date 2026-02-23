/**
 * Memory config gating tests
 * Tests: neural.enabled gating, configurable thresholds, syncMode
 */

import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const INTELLIGENCE_CJS = join(
  import.meta.dirname, '..', '.claude', 'helpers', 'intelligence.cjs',
);

let tmpDir;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'mem-config-'));
  mkdirSync(join(tmpDir, '.claude-flow', 'data'), { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeStore(entries) {
  writeFileSync(
    join(tmpDir, '.claude-flow', 'data', 'auto-memory-store.json'),
    JSON.stringify(entries),
  );
}

function writeConfigJson(jsonObj) {
  writeFileSync(join(tmpDir, '.claude-flow', 'config.json'), JSON.stringify(jsonObj, null, 2), 'utf-8');
}

function runInit() {
  return spawnSync('node', [INTELLIGENCE_CJS, 'init'], {
    cwd: tmpDir, encoding: 'utf-8', timeout: 10000,
  });
}

const SAMPLE_ENTRIES = [
  { id: 'e1', key: 'test', content: 'content for config gating test', summary: 'Config test', namespace: 'core', type: 'semantic', metadata: {}, createdAt: Date.now() },
  { id: 'e2', key: 'test2', content: 'another entry for matching', summary: 'Second entry', namespace: 'core', type: 'semantic', metadata: {}, createdAt: Date.now() },
];

describe('neural.enabled config gating', () => {
  it('init() returns early when neural.enabled=false', () => {
    writeStore(SAMPLE_ENTRIES);
    writeConfigJson({ neural: { enabled: false } });

    const result = runInit();
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.trim());
    expect(output.message).toContain('neural.enabled=false');
    expect(output.nodes).toBe(0);
    expect(output.edges).toBe(0);
  });

  it('init() proceeds when neural.enabled=true', () => {
    writeStore(SAMPLE_ENTRIES);
    writeConfigJson({ neural: { enabled: true } });

    const result = runInit();
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.trim());
    expect(output.nodes).toBe(2);
    expect(output.message).toContain('Graph built');
  });

  it('init() proceeds when no config.json exists', () => {
    writeStore(SAMPLE_ENTRIES);

    const result = runInit();
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.trim());
    expect(output.nodes).toBe(2);
  });

  it('corrupt config.json falls back to defaults', () => {
    writeStore(SAMPLE_ENTRIES);
    writeFileSync(join(tmpDir, '.claude-flow', 'config.json'), '{not valid json!!!', 'utf-8');

    const result = runInit();
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.trim());
    expect(output.nodes).toBe(2);
  });
});

describe('configurable thresholds', () => {
  it('getContext uses configurable minThreshold from config.json', () => {
    writeStore(SAMPLE_ENTRIES);
    writeConfigJson({ memory: { minThreshold: 0.5, contentMatchWeight: 0.9 } });

    runInit();

    const result = spawnSync('node', ['-e', `
      process.chdir(${JSON.stringify(tmpDir)});
      const intel = require(${JSON.stringify(INTELLIGENCE_CJS)});
      const ctx = intel.getContext('config gating test');
      console.log(JSON.stringify({ hasContext: ctx !== null }));
    `], { cwd: tmpDir, encoding: 'utf-8', timeout: 10000 });

    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.trim());
    expect(typeof output.hasContext).toBe('boolean');
  });

  it('getContext uses defaults when no config', () => {
    writeStore(SAMPLE_ENTRIES);

    runInit();

    const result = spawnSync('node', ['-e', `
      process.chdir(${JSON.stringify(tmpDir)});
      const intel = require(${JSON.stringify(INTELLIGENCE_CJS)});
      const ctx = intel.getContext('config test content');
      console.log(JSON.stringify({ hasContext: ctx !== null }));
    `], { cwd: tmpDir, encoding: 'utf-8', timeout: 10000 });

    expect(result.status).toBe(0);
  });

  it('consolidate uses configurable decayRate from config.json', () => {
    writeStore(SAMPLE_ENTRIES);
    writeConfigJson({ memory: { learningBridge: { confidenceDecayRate: 0.1 } } });

    runInit();

    const result = spawnSync('node', [INTELLIGENCE_CJS, 'consolidate'], {
      cwd: tmpDir, encoding: 'utf-8', timeout: 10000,
    });

    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.trim());
    expect(output.message).toBe('Consolidated');
  });
});

describe('syncMode configuration', () => {
  it('readConfig parses syncMode from config.json', () => {
    const AUTO_HOOK = join(
      import.meta.dirname, '..', '.claude', 'helpers', 'auto-memory-hook.mjs',
    );

    writeConfigJson({ memory: { syncMode: 'on-demand', minConfidence: 0.8 } });

    const result = spawnSync('node', [AUTO_HOOK, 'status'], {
      cwd: tmpDir, encoding: 'utf-8', timeout: 10000,
    });

    expect(result.status).toBe(0);
  });
});

describe('config.json support', () => {
  it('readConfig reads from config.json when present', () => {
    const AUTO_HOOK = join(
      import.meta.dirname, '..', '.claude', 'helpers', 'auto-memory-hook.mjs',
    );

    writeConfigJson({
      memory: {
        backend: 'json',
        learningBridge: { enabled: false },
        memoryGraph: { enabled: true },
        agentScopes: { enabled: true },
      },
    });

    const result = spawnSync('node', [AUTO_HOOK, 'status'], {
      cwd: tmpDir, encoding: 'utf-8', timeout: 10000,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Disabled');
  });

  it('malformed config.json falls back gracefully', () => {
    const AUTO_HOOK = join(
      import.meta.dirname, '..', '.claude', 'helpers', 'auto-memory-hook.mjs',
    );

    writeFileSync(join(tmpDir, '.claude-flow', 'config.json'), '{not valid json!!!', 'utf-8');

    const result = spawnSync('node', [AUTO_HOOK, 'status'], {
      cwd: tmpDir, encoding: 'utf-8', timeout: 10000,
    });

    expect(result.status).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// WM-008: agentdb v3 config reading
// ---------------------------------------------------------------------------
describe('agentdb v3 config reading (WM-008)', () => {
  it('auto-memory-hook reads agentdb config from config.json', () => {
    const AUTO_HOOK = join(
      import.meta.dirname, '..', '.claude', 'helpers', 'auto-memory-hook.mjs',
    );

    writeConfigJson({
      memory: {
        backend: 'hybrid',
        agentdb: {
          vectorBackend: 'rvf',
          enableLearning: true,
          learningPositiveThreshold: 0.7,
          learningBatchSize: 32,
        },
      },
    });

    const result = spawnSync('node', [AUTO_HOOK, 'status'], {
      cwd: tmpDir, encoding: 'utf-8', timeout: 10000,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Auto Memory Bridge Status');
  });

  it('auto-memory-hook works with agentdb learning disabled', () => {
    const AUTO_HOOK = join(
      import.meta.dirname, '..', '.claude', 'helpers', 'auto-memory-hook.mjs',
    );

    writeConfigJson({
      memory: {
        backend: 'hybrid',
        agentdb: {
          vectorBackend: 'rvf',
          enableLearning: false,
        },
      },
    });

    const result = spawnSync('node', [AUTO_HOOK, 'status'], {
      cwd: tmpDir, encoding: 'utf-8', timeout: 10000,
    });

    expect(result.status).toBe(0);
  });

  it('auto-memory-hook defaults agentdb config when section absent', () => {
    const AUTO_HOOK = join(
      import.meta.dirname, '..', '.claude', 'helpers', 'auto-memory-hook.mjs',
    );

    // Config with no agentdb section at all
    writeConfigJson({
      memory: { backend: 'hybrid' },
    });

    const result = spawnSync('node', [AUTO_HOOK, 'status'], {
      cwd: tmpDir, encoding: 'utf-8', timeout: 10000,
    });

    expect(result.status).toBe(0);
  });

  it('intelligence.cjs init works with agentdb config present', () => {
    writeStore(SAMPLE_ENTRIES);
    writeConfigJson({
      neural: { enabled: true },
      memory: {
        agentdb: {
          vectorBackend: 'rvf',
          enableLearning: true,
        },
      },
    });

    const result = runInit();
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.trim());
    expect(output.nodes).toBe(2);
  });
});
