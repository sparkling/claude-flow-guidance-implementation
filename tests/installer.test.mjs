import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
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

  it('settings.json contains Compact hook entries', async () => {
    const dir = makeTempRepo();
    await installIntoRepo({
      targetRepo: dir,
      targetMode: 'claude',
      preset: 'minimal',
    });
    const settings = readSettings(dir);
    expect(settings.hooks).toHaveProperty('Compact');
    expect(settings.hooks.Compact).toHaveLength(2);
    expect(settings.hooks.Compact[0].matcher).toBe('manual');
    expect(settings.hooks.Compact[1].matcher).toBe('');
  });
});
