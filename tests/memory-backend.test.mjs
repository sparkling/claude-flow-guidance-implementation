/**
 * Memory backend tests
 * Tests: config.json reading, backend selection, fail-loud
 */

import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildConfigJson } from '../src/default-settings.mjs';

const AUTO_HOOK = join(
  import.meta.dirname, '..', '.claude', 'helpers', 'auto-memory-hook.mjs',
);

let tmpDir;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'mem-backend-'));
  mkdirSync(join(tmpDir, '.claude-flow', 'data'), { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeConfigJson(config) {
  writeFileSync(join(tmpDir, '.claude-flow', 'config.json'), JSON.stringify(config, null, 2), 'utf-8');
}

function runHook(cmd) {
  return spawnSync('node', [AUTO_HOOK, cmd], {
    cwd: tmpDir, encoding: 'utf-8', timeout: 10000,
  });
}

// ---------------------------------------------------------------------------
// buildConfigJson()
// ---------------------------------------------------------------------------
describe('buildConfigJson()', () => {
  it('returns hybrid backend by default', () => {
    const cfg = buildConfigJson();
    expect(cfg.memory.backend).toBe('hybrid');
  });

  it('accepts custom backend', () => {
    const cfg = buildConfigJson('json');
    expect(cfg.memory.backend).toBe('json');
  });

  it('has required structure', () => {
    const cfg = buildConfigJson();
    expect(cfg.version).toBe('3.0.0');
    expect(cfg.memory.learningBridge.enabled).toBe(true);
    expect(cfg.memory.memoryGraph.enabled).toBe(true);
    expect(cfg.memory.agentScopes.enabled).toBe(true);
    expect(cfg.neural.enabled).toBe(true);
    expect(cfg.hooks.enabled).toBe(true);
  });

  it('includes agentdb v3 config', () => {
    const cfg = buildConfigJson();
    expect(cfg.memory.agentdb).toBeDefined();
    expect(cfg.memory.agentdb.vectorBackend).toBe('rvf');
    expect(cfg.memory.agentdb.enableLearning).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// readConfig: config.json primary
// ---------------------------------------------------------------------------
describe('readConfig reads from config.json', () => {
  it('status does not crash with config.json', () => {
    writeConfigJson({
      memory: { backend: 'json', learningBridge: { enabled: false } },
    });

    const result = runHook('status');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Auto Memory Bridge Status');
  });

  it('status does not crash when neither config exists', () => {
    const result = runHook('status');
    expect(result.status).toBe(0);
  });
});


