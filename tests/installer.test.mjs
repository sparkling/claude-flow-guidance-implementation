import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { installIntoRepo } from '../src/installer.mjs';

function makeTempRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'guidance-test-'));
  // Minimal package.json so installer doesn't create one from scratch.
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'test-repo', version: '1.0.0', type: 'module', scripts: {}, dependencies: {} }, null, 2)
  );
  // Minimal CLAUDE.md so runtime can initialise.
  writeFileSync(join(dir, 'CLAUDE.md'), '# Test Policy\n\n- NEVER run rm -rf /\n');
  return dir;
}

function readSettings(dir) {
  return JSON.parse(readFileSync(join(dir, '.claude/settings.json'), 'utf-8'));
}

// ---------------------------------------------------------------------------
// CLI flag overrides via installIntoRepo
// ---------------------------------------------------------------------------
describe('installIntoRepo CLI flag overrides', () => {
  it('--fail-closed sets GUIDANCE_EVENT_FAIL_CLOSED=1', async () => {
    const dir = makeTempRepo();
    await installIntoRepo({
      targetRepo: dir,
      targetMode: 'claude',
      failClosed: true,
      preset: 'minimal',
    });
    const settings = readSettings(dir);
    expect(settings.env.GUIDANCE_EVENT_FAIL_CLOSED).toBe('1');
  });

  it('--hook-timeout changes all hook timeouts', async () => {
    const dir = makeTempRepo();
    await installIntoRepo({
      targetRepo: dir,
      targetMode: 'claude',
      hookTimeout: 3000,
      preset: 'minimal',
    });
    const settings = readSettings(dir);
    for (const [, blocks] of Object.entries(settings.hooks)) {
      for (const block of blocks) {
        for (const hook of block.hooks) {
          expect(hook.timeout).toBe(3000);
        }
      }
    }
  });

  it('--event-timeout sets GUIDANCE_EVENT_SYNC_TIMEOUT_MS', async () => {
    const dir = makeTempRepo();
    await installIntoRepo({
      targetRepo: dir,
      targetMode: 'claude',
      eventTimeout: 5000,
      preset: 'minimal',
    });
    const settings = readSettings(dir);
    expect(settings.env.GUIDANCE_EVENT_SYNC_TIMEOUT_MS).toBe('5000');
  });

  it('--generate-key produces a 64-char hex string in GUIDANCE_PROOF_KEY', async () => {
    const dir = makeTempRepo();
    await installIntoRepo({
      targetRepo: dir,
      targetMode: 'claude',
      generateKey: true,
      preset: 'minimal',
    });
    const settings = readSettings(dir);
    expect(settings.env.GUIDANCE_PROOF_KEY).toMatch(/^[0-9a-f]{64}$/);
  });

  it('--no-autopilot sets GUIDANCE_AUTOPILOT_ENABLED=0', async () => {
    const dir = makeTempRepo();
    await installIntoRepo({
      targetRepo: dir,
      targetMode: 'claude',
      noAutopilot: true,
      preset: 'minimal',
    });
    const settings = readSettings(dir);
    expect(settings.env.GUIDANCE_AUTOPILOT_ENABLED).toBe('0');
  });

  it('--dry-run returns JSON report without writing files', async () => {
    const dir = makeTempRepo();
    const result = await installIntoRepo({
      targetRepo: dir,
      targetMode: 'claude',
      dryRun: true,
      preset: 'minimal',
    });
    expect(result.dryRun).toBe(true);
    expect(Array.isArray(result.wouldWrite)).toBe(true);
    expect(result.wouldWrite).toContain('.claude/settings.json');
    expect(result.envVars).toBeDefined();
    expect(result.hooks).toBeDefined();

    // No settings.json should have been written (target dir has no .claude dir).
    const settingsPath = join(dir, '.claude/settings.json');
    let exists = false;
    try { readFileSync(settingsPath); exists = true; } catch { /* expected */ }
    expect(exists).toBe(false);
  });

  it('settings.json contains all 9 env vars on fresh install', async () => {
    const dir = makeTempRepo();
    await installIntoRepo({
      targetRepo: dir,
      targetMode: 'claude',
      preset: 'minimal',
    });
    const settings = readSettings(dir);
    const expectedKeys = [
      'CLAUDE_FLOW_HOOKS_ENABLED',
      'GUIDANCE_EVENT_WIRING_ENABLED',
      'GUIDANCE_EVENT_SYNC_TIMEOUT_MS',
      'GUIDANCE_EVENT_FAIL_CLOSED',
      'GUIDANCE_AUTOPILOT_ENABLED',
      'GUIDANCE_AUTOPILOT_MIN_DELTA',
      'GUIDANCE_AUTOPILOT_AB',
      'GUIDANCE_AUTOPILOT_MIN_AB_GAIN',
      'GUIDANCE_CODEX_SKIP_CF_HOOKS',
    ];
    for (const key of expectedKeys) {
      expect(settings.env).toHaveProperty(key);
    }
  });

  it('settings.json only contains valid Claude Code hook event keys', async () => {
    const dir = makeTempRepo();
    await installIntoRepo({
      targetRepo: dir,
      targetMode: 'claude',
      preset: 'minimal',
    });
    const settings = readSettings(dir);
    const validEvents = ['Setup', 'PreToolUse', 'PermissionRequest', 'PostToolUse',
      'PostToolUseFailure', 'UserPromptSubmit', 'Stop', 'SubagentStop', 'SubagentStart',
      'SessionStart', 'SessionEnd', 'Notification', 'PreCompact'];
    for (const key of Object.keys(settings.hooks)) {
      expect(validEvents).toContain(key);
    }
    expect(settings.hooks).not.toHaveProperty('Compact');
    expect(settings.hooks).toHaveProperty('PreCompact');
  });
});

// ---------------------------------------------------------------------------
// Fine-grained config.json options via configOptions
// ---------------------------------------------------------------------------

function readConfigJson(dir) {
  return JSON.parse(readFileSync(join(dir, '.claude-flow', 'config.json'), 'utf-8'));
}

describe('installIntoRepo config.json fine-grained options', () => {
  it('default config.json has all expected defaults', async () => {
    const dir = makeTempRepo();
    await installIntoRepo({ targetRepo: dir, targetMode: 'claude', preset: 'minimal' });
    const cfg = readConfigJson(dir);
    expect(cfg.memory.backend).toBe('hybrid');
    expect(cfg.memory.enableHNSW).toBe(true);
    expect(cfg.memory.cacheSize).toBe(100);
    expect(cfg.memory.learningBridge.enabled).toBe(true);
    expect(cfg.memory.memoryGraph.enabled).toBe(true);
    expect(cfg.memory.agentScopes.enabled).toBe(true);
    expect(cfg.neural.enabled).toBe(true);
    expect(cfg.hooks.autoExecute).toBe(true);
  });

  it('--no-hnsw disables HNSW in config.json', async () => {
    const dir = makeTempRepo();
    await installIntoRepo({
      targetRepo: dir, targetMode: 'claude', preset: 'minimal',
      configOptions: { enableHNSW: false },
    });
    const cfg = readConfigJson(dir);
    expect(cfg.memory.enableHNSW).toBe(false);
  });

  it('--cache-size sets memory.cacheSize', async () => {
    const dir = makeTempRepo();
    await installIntoRepo({
      targetRepo: dir, targetMode: 'claude', preset: 'minimal',
      configOptions: { cacheSize: 500 },
    });
    const cfg = readConfigJson(dir);
    expect(cfg.memory.cacheSize).toBe(500);
  });

  it('--no-learning-bridge disables learning bridge', async () => {
    const dir = makeTempRepo();
    await installIntoRepo({
      targetRepo: dir, targetMode: 'claude', preset: 'minimal',
      configOptions: { learningBridge: false },
    });
    const cfg = readConfigJson(dir);
    expect(cfg.memory.learningBridge.enabled).toBe(false);
  });

  it('--sona-mode sets learning bridge sonaMode', async () => {
    const dir = makeTempRepo();
    await installIntoRepo({
      targetRepo: dir, targetMode: 'claude', preset: 'minimal',
      configOptions: { sonaMode: 'aggressive' },
    });
    const cfg = readConfigJson(dir);
    expect(cfg.memory.learningBridge.sonaMode).toBe('aggressive');
  });

  it('--confidence-decay sets confidenceDecayRate', async () => {
    const dir = makeTempRepo();
    await installIntoRepo({
      targetRepo: dir, targetMode: 'claude', preset: 'minimal',
      configOptions: { confidenceDecayRate: 0.01 },
    });
    const cfg = readConfigJson(dir);
    expect(cfg.memory.learningBridge.confidenceDecayRate).toBe(0.01);
  });

  it('--access-boost sets accessBoostAmount', async () => {
    const dir = makeTempRepo();
    await installIntoRepo({
      targetRepo: dir, targetMode: 'claude', preset: 'minimal',
      configOptions: { accessBoostAmount: 0.1 },
    });
    const cfg = readConfigJson(dir);
    expect(cfg.memory.learningBridge.accessBoostAmount).toBe(0.1);
  });

  it('--consolidation-threshold sets consolidationThreshold', async () => {
    const dir = makeTempRepo();
    await installIntoRepo({
      targetRepo: dir, targetMode: 'claude', preset: 'minimal',
      configOptions: { consolidationThreshold: 25 },
    });
    const cfg = readConfigJson(dir);
    expect(cfg.memory.learningBridge.consolidationThreshold).toBe(25);
  });

  it('--no-memory-graph disables memory graph', async () => {
    const dir = makeTempRepo();
    await installIntoRepo({
      targetRepo: dir, targetMode: 'claude', preset: 'minimal',
      configOptions: { memoryGraph: false },
    });
    const cfg = readConfigJson(dir);
    expect(cfg.memory.memoryGraph.enabled).toBe(false);
  });

  it('--pagerank-damping sets damping factor', async () => {
    const dir = makeTempRepo();
    await installIntoRepo({
      targetRepo: dir, targetMode: 'claude', preset: 'minimal',
      configOptions: { pageRankDamping: 0.9 },
    });
    const cfg = readConfigJson(dir);
    expect(cfg.memory.memoryGraph.pageRankDamping).toBe(0.9);
  });

  it('--max-graph-nodes sets max nodes', async () => {
    const dir = makeTempRepo();
    await installIntoRepo({
      targetRepo: dir, targetMode: 'claude', preset: 'minimal',
      configOptions: { maxNodes: 10000 },
    });
    const cfg = readConfigJson(dir);
    expect(cfg.memory.memoryGraph.maxNodes).toBe(10000);
  });

  it('--similarity-threshold sets threshold', async () => {
    const dir = makeTempRepo();
    await installIntoRepo({
      targetRepo: dir, targetMode: 'claude', preset: 'minimal',
      configOptions: { similarityThreshold: 0.95 },
    });
    const cfg = readConfigJson(dir);
    expect(cfg.memory.memoryGraph.similarityThreshold).toBe(0.95);
  });

  it('--no-agent-scopes disables agent scopes', async () => {
    const dir = makeTempRepo();
    await installIntoRepo({
      targetRepo: dir, targetMode: 'claude', preset: 'minimal',
      configOptions: { agentScopes: false },
    });
    const cfg = readConfigJson(dir);
    expect(cfg.memory.agentScopes.enabled).toBe(false);
  });

  it('--default-scope sets agent scope', async () => {
    const dir = makeTempRepo();
    await installIntoRepo({
      targetRepo: dir, targetMode: 'claude', preset: 'minimal',
      configOptions: { defaultScope: 'global' },
    });
    const cfg = readConfigJson(dir);
    expect(cfg.memory.agentScopes.defaultScope).toBe('global');
  });

  it('--no-neural disables neural subsystem', async () => {
    const dir = makeTempRepo();
    await installIntoRepo({
      targetRepo: dir, targetMode: 'claude', preset: 'minimal',
      configOptions: { neuralEnabled: false },
    });
    const cfg = readConfigJson(dir);
    expect(cfg.neural.enabled).toBe(false);
  });

  it('--neural-model-path sets custom path', async () => {
    const dir = makeTempRepo();
    await installIntoRepo({
      targetRepo: dir, targetMode: 'claude', preset: 'minimal',
      configOptions: { neuralModelPath: '/custom/models/neural' },
    });
    const cfg = readConfigJson(dir);
    expect(cfg.neural.modelPath).toBe('/custom/models/neural');
  });

  it('--no-hooks-auto-execute disables auto-execute', async () => {
    const dir = makeTempRepo();
    await installIntoRepo({
      targetRepo: dir, targetMode: 'claude', preset: 'minimal',
      configOptions: { hooksAutoExecute: false },
    });
    const cfg = readConfigJson(dir);
    expect(cfg.hooks.autoExecute).toBe(false);
  });

  it('multiple configOptions combine with --backend', async () => {
    const dir = makeTempRepo();
    await installIntoRepo({
      targetRepo: dir, targetMode: 'claude', preset: 'minimal',
      backend: 'sqlite',
      configOptions: {
        enableHNSW: false,
        cacheSize: 200,
        learningBridge: false,
        neuralEnabled: false,
        defaultScope: 'workspace',
      },
    });
    const cfg = readConfigJson(dir);
    expect(cfg.memory.backend).toBe('sqlite');
    expect(cfg.memory.enableHNSW).toBe(false);
    expect(cfg.memory.cacheSize).toBe(200);
    expect(cfg.memory.learningBridge.enabled).toBe(false);
    expect(cfg.neural.enabled).toBe(false);
    expect(cfg.memory.agentScopes.defaultScope).toBe('workspace');
    // Unchanged defaults preserved
    expect(cfg.memory.memoryGraph.enabled).toBe(true);
    expect(cfg.hooks.autoExecute).toBe(true);
  });

  it('configOptions triggers config.json write even without --backend', async () => {
    const dir = makeTempRepo();
    // Pre-create a config.json with different values
    const cfDir = join(dir, '.claude-flow');
    mkdirSync(cfDir, { recursive: true });
    writeFileSync(join(cfDir, 'config.json'), JSON.stringify({ version: '2.0.0', memory: { backend: 'old' } }));

    await installIntoRepo({
      targetRepo: dir, targetMode: 'claude', preset: 'minimal',
      configOptions: { cacheSize: 999 },
    });
    const cfg = readConfigJson(dir);
    // configOptions should trigger a rewrite with buildConfigJson defaults + overrides
    expect(cfg.version).toBe('3.0.0');
    expect(cfg.memory.cacheSize).toBe(999);
    expect(cfg.memory.backend).toBe('hybrid');
  });

  it('empty configOptions does not overwrite existing config.json', async () => {
    const dir = makeTempRepo();
    const cfDir = join(dir, '.claude-flow');
    mkdirSync(cfDir, { recursive: true });
    writeFileSync(join(cfDir, 'config.json'), JSON.stringify({ version: '2.0.0', custom: true }));

    await installIntoRepo({
      targetRepo: dir, targetMode: 'claude', preset: 'minimal',
      configOptions: {},
    });
    const cfg = readConfigJson(dir);
    // Empty configOptions = no overrides, existing file preserved
    expect(cfg.version).toBe('2.0.0');
    expect(cfg.custom).toBe(true);
  });
});
