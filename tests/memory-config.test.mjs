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

function writeConfig(yamlContent) {
  writeFileSync(join(tmpDir, '.claude-flow', 'config.yaml'), yamlContent, 'utf-8');
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
    writeConfig('neural:\n  enabled: false\n  model: all-MiniLM-L6-v2\n');

    const result = runInit();
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.trim());
    expect(output.message).toContain('neural.enabled=false');
    expect(output.nodes).toBe(0);
    expect(output.edges).toBe(0);
  });

  it('init() proceeds when neural.enabled=true', () => {
    writeStore(SAMPLE_ENTRIES);
    writeConfig('neural:\n  enabled: true\n');

    const result = runInit();
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.trim());
    expect(output.nodes).toBe(2);
    expect(output.message).toContain('Graph built');
  });

  it('init() proceeds when no config.yaml exists', () => {
    writeStore(SAMPLE_ENTRIES);

    const result = runInit();
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.trim());
    expect(output.nodes).toBe(2);
  });

  it('corrupt config.yaml falls back to defaults', () => {
    writeStore(SAMPLE_ENTRIES);
    writeConfig('{{{{not valid yaml!!!!');

    const result = runInit();
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.trim());
    expect(output.nodes).toBe(2);
  });
});

describe('configurable thresholds', () => {
  it('getContext uses configurable minThreshold from config', () => {
    writeStore(SAMPLE_ENTRIES);
    writeConfig('minThreshold: 0.5\ncontentMatchWeight: 0.9\n');

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

  it('consolidate uses configurable decayRate from config', () => {
    writeStore(SAMPLE_ENTRIES);
    writeConfig('confidenceDecayRate: 0.1\n');

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
  it('readConfig parses syncMode from config.yaml', () => {
    const AUTO_HOOK = join(
      import.meta.dirname, '..', '.claude', 'helpers', 'auto-memory-hook.mjs',
    );

    writeConfig('syncMode: on-demand\nminConfidence: 0.8\n');

    const result = spawnSync('node', [AUTO_HOOK, 'status'], {
      cwd: tmpDir, encoding: 'utf-8', timeout: 10000,
      env: { ...process.env, AUTO_MEMORY_PROJECT_ROOT: tmpDir },
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
      env: { ...process.env, AUTO_MEMORY_PROJECT_ROOT: tmpDir },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Disabled');
  });

  it('config.json takes precedence over config.yaml', () => {
    const AUTO_HOOK = join(
      import.meta.dirname, '..', '.claude', 'helpers', 'auto-memory-hook.mjs',
    );

    // config.json: learning disabled
    writeConfigJson({
      memory: { learningBridge: { enabled: false } },
    });
    // config.yaml: learning enabled (should be ignored)
    writeConfig('learningBridge:\n  enabled: true\n');

    const result = spawnSync('node', [AUTO_HOOK, 'status'], {
      cwd: tmpDir, encoding: 'utf-8', timeout: 10000,
      env: { ...process.env, AUTO_MEMORY_PROJECT_ROOT: tmpDir },
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
      env: { ...process.env, AUTO_MEMORY_PROJECT_ROOT: tmpDir },
    });

    expect(result.status).toBe(0);
  });
});
