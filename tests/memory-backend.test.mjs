/**
 * Memory backend tests
 * Tests: config.json reading, YAML fallback, backend selection, fail-loud, installer config.json generation
 */

import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { installIntoRepo } from '../src/installer.mjs';
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

function writeConfigYaml(yaml) {
  writeFileSync(join(tmpDir, '.claude-flow', 'config.yaml'), yaml, 'utf-8');
}

function runHook(cmd) {
  return spawnSync('node', [AUTO_HOOK, cmd], {
    cwd: tmpDir, encoding: 'utf-8', timeout: 10000,
    env: { ...process.env, AUTO_MEMORY_PROJECT_ROOT: tmpDir },
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

// ---------------------------------------------------------------------------
// readConfig: YAML fallback
// ---------------------------------------------------------------------------
describe('readConfig falls back to config.yaml', () => {
  it('status does not crash with only config.yaml', () => {
    writeConfigYaml('backend: json\nlearningBridge:\n  enabled: false\n');

    const result = runHook('status');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Auto Memory Bridge Status');
  });
});

// ---------------------------------------------------------------------------
// readConfig: config.json takes precedence over config.yaml
// ---------------------------------------------------------------------------
describe('readConfig precedence', () => {
  it('config.json wins when both exist', () => {
    // config.json says learningBridge disabled
    writeConfigJson({
      memory: { learningBridge: { enabled: false } },
    });
    // config.yaml says learningBridge enabled
    writeConfigYaml('learningBridge:\n  enabled: true\n');

    const result = runHook('status');
    expect(result.status).toBe(0);
    // Presence of "Disabled" in output confirms config.json was used
    expect(result.stdout).toContain('Disabled');
  });
});

// ---------------------------------------------------------------------------
// installer generates config.json
// ---------------------------------------------------------------------------
describe('installer config.json generation', () => {
  function makeTempRepo() {
    const dir = mkdtempSync(join(tmpdir(), 'guidance-backend-'));
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'test-repo', version: '1.0.0', type: 'module', scripts: {}, dependencies: {} }, null, 2),
    );
    return dir;
  }

  it('generates config.json with default hybrid backend', async () => {
    const dir = makeTempRepo();
    await installIntoRepo({
      targetRepo: dir,
      targetMode: 'claude',
      preset: 'minimal',
    });
    const configPath = join(dir, '.claude-flow', 'config.json');
    expect(existsSync(configPath)).toBe(true);
    const cfg = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(cfg.memory.backend).toBe('hybrid');
    rmSync(dir, { recursive: true, force: true });
  });

  it('generates config.json with --backend json', async () => {
    const dir = makeTempRepo();
    await installIntoRepo({
      targetRepo: dir,
      targetMode: 'claude',
      preset: 'minimal',
      backend: 'json',
    });
    const configPath = join(dir, '.claude-flow', 'config.json');
    const cfg = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(cfg.memory.backend).toBe('json');
    rmSync(dir, { recursive: true, force: true });
  });

  it('preserves existing config.json without --force', async () => {
    const dir = makeTempRepo();
    const cfDir = join(dir, '.claude-flow');
    mkdirSync(cfDir, { recursive: true });
    const configPath = join(cfDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({ memory: { backend: 'sqlite' }, custom: true }, null, 2));

    await installIntoRepo({
      targetRepo: dir,
      targetMode: 'claude',
      preset: 'minimal',
    });

    const cfg = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(cfg.custom).toBe(true);
    expect(cfg.memory.backend).toBe('sqlite');
    rmSync(dir, { recursive: true, force: true });
  });

  it('overwrites config.json with --force', async () => {
    const dir = makeTempRepo();
    const cfDir = join(dir, '.claude-flow');
    mkdirSync(cfDir, { recursive: true });
    const configPath = join(cfDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({ memory: { backend: 'sqlite' }, custom: true }, null, 2));

    await installIntoRepo({
      targetRepo: dir,
      targetMode: 'claude',
      preset: 'minimal',
      force: true,
    });

    const cfg = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(cfg.memory.backend).toBe('hybrid');
    expect(cfg.custom).toBeUndefined();
    rmSync(dir, { recursive: true, force: true });
  });

  it('--backend flag overwrites existing config.json', async () => {
    const dir = makeTempRepo();
    const cfDir = join(dir, '.claude-flow');
    mkdirSync(cfDir, { recursive: true });
    const configPath = join(cfDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({ memory: { backend: 'sqlite' }, custom: true }, null, 2));

    await installIntoRepo({
      targetRepo: dir,
      targetMode: 'claude',
      preset: 'minimal',
      backend: 'agentdb',
    });

    const cfg = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(cfg.memory.backend).toBe('agentdb');
    rmSync(dir, { recursive: true, force: true });
  });

  it('dry-run includes config.json in wouldWrite', async () => {
    const dir = makeTempRepo();
    const result = await installIntoRepo({
      targetRepo: dir,
      targetMode: 'claude',
      preset: 'minimal',
      dryRun: true,
    });
    expect(result.wouldWrite).toContain('.claude-flow/config.json');
    rmSync(dir, { recursive: true, force: true });
  });
});
