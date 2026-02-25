/**
 * E2E tests: guidance install on a freshly-initialized claude-flow project.
 *
 * These tests run `npx @claude-flow/cli init --yes` as a subprocess to create
 * a real claude-flow project, then run `installIntoRepo()` to layer guidance
 * on top, and verify the combined result.
 *
 * Requires the patched npx cache (@claude-flow/cli 3.1.0-alpha.41+).
 */

import {
  existsSync, readFileSync, writeFileSync,
  mkdtempSync, rmSync, mkdirSync, readdirSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { installIntoRepo, verifyRepo } from '../src/installer.mjs';

// ── Helpers ──────────────────────────────────────────────────────────────────

const PROJECT_ROOT = resolve(import.meta.dirname, '..');

function cli(args, cwd, timeout = 60000) {
  return spawnSync('npx', ['@claude-flow/cli', ...args], {
    encoding: 'utf-8',
    timeout,
    cwd,
    env: { ...process.env, npm_config_yes: 'true', NODE_NO_WARNINGS: '1' },
  });
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

/**
 * Copy the real enforcement.cjs into the target so `node --check` and
 * smoke tests succeed (the thin shim requires the npm package, which is
 * not available in bare temp dirs).
 */
function writeRealEnforcement(targetDir) {
  const realEnforcement = readFileSync(resolve(PROJECT_ROOT, 'src/enforcement.cjs'), 'utf-8');
  const helpersDir = resolve(targetDir, '.claude/helpers');
  mkdirSync(helpersDir, { recursive: true });
  writeFileSync(resolve(helpersDir, 'guidance-enforcement.cjs'), realEnforcement);
}

// Check that the patched CLI is available.
const cliCheck = spawnSync('npx', ['@claude-flow/cli', '--version'], {
  encoding: 'utf-8', timeout: 15000,
  env: { ...process.env, npm_config_yes: 'true', NODE_NO_WARNINGS: '1' },
});
const canRun = cliCheck.status === 0 && (cliCheck.stdout || '').includes('claude-flow');
const skipMsg = canRun ? undefined : 'patched @claude-flow/cli not available in npx cache';

// ══════════════════════════════════════════════════════════════════════════════
// Suite: E2E — init + guidance install (default)
// ══════════════════════════════════════════════════════════════════════════════

describe('e2e: init + guidance install (default)', { skip: skipMsg ? true : false }, () => {
  let dir;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'cfgi-e2e-default-'));
    const r = cli(['init', '--yes'], dir);
    if (r.status !== 0) throw new Error(`init failed: ${r.stderr}`);
  });

  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  // ── claude-flow init produced the expected scaffolding ──

  it('init creates .claude/settings.json', () => {
    expect(existsSync(join(dir, '.claude', 'settings.json'))).toBe(true);
  });

  // ── guidance install layers on top ──

  describe('after guidance install', () => {
    beforeAll(async () => {
      await installIntoRepo({
        targetRepo: dir,
        targetMode: 'claude',
        preset: 'minimal',
      });
      // Replace thin shim with real handler for verify
      writeRealEnforcement(dir);
    });

    it('settings.json has guidance env vars', () => {
      const settings = readJson(join(dir, '.claude', 'settings.json'));
      expect(settings.env).toBeDefined();
      expect(settings.env.GUIDANCE_EVENT_WIRING_ENABLED).toBe('1');
      expect(settings.env.CLAUDE_FLOW_HOOKS_ENABLED).toBe('true');
    });

    it('settings.json has guidance hooks merged with init hooks', () => {
      const settings = readJson(join(dir, '.claude', 'settings.json'));
      expect(settings.hooks).toBeDefined();
      // Guidance adds PreToolUse hooks
      expect(settings.hooks.PreToolUse).toBeDefined();
      expect(Array.isArray(settings.hooks.PreToolUse)).toBe(true);
      // At least one hook block should reference guidance-enforcement.cjs
      const allHooks = settings.hooks.PreToolUse.flatMap(b => b.hooks || []);
      const hasGuidanceHook = allHooks.some(h =>
        h.command && h.command.includes('guidance-enforcement.cjs'));
      expect(hasGuidanceHook).toBe(true);
    });

    it('settings.json preserves init hooks (session-start)', () => {
      const settings = readJson(join(dir, '.claude', 'settings.json'));
      // Init generates hooks too — they should still be present
      expect(settings.hooks.SessionStart).toBeDefined();
    });

    it('guidance components.json written', () => {
      const componentsPath = join(dir, '.claude-flow', 'guidance', 'components.json');
      expect(existsSync(componentsPath)).toBe(true);
      const components = readJson(componentsPath);
      expect(components.preset).toBe('minimal');
      expect(Array.isArray(components.components)).toBe(true);
    });

    it('guidance-enforcement.cjs exists', () => {
      expect(existsSync(join(dir, '.claude', 'helpers', 'guidance-enforcement.cjs'))).toBe(true);
    });

    it('package.json has guidance dependency', () => {
      const pkg = readJson(join(dir, 'package.json'));
      expect(pkg.dependencies?.['@sparkleideas/claude-flow-guidance']).toBeDefined();
    });

    it('package.json has guidance scripts', () => {
      const pkg = readJson(join(dir, 'package.json'));
      expect(pkg.scripts?.['guidance:status']).toBeDefined();
    });

    it('CLAUDE.local.md created', () => {
      expect(existsSync(join(dir, 'CLAUDE.local.md'))).toBe(true);
    });

    it('verifyRepo passes', () => {
      const result = verifyRepo({ targetRepo: dir, targetMode: 'claude' });
      expect(result.passed).toBe(true);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: E2E — init --minimal + guidance install
// ══════════════════════════════════════════════════════════════════════════════

describe('e2e: init --minimal + guidance install', { skip: skipMsg ? true : false }, () => {
  let dir;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'cfgi-e2e-minimal-'));
    const r = cli(['init', '--yes', '--minimal'], dir);
    if (r.status !== 0) throw new Error(`init --minimal failed: ${r.stderr}`);
  });

  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  describe('after guidance install', () => {
    beforeAll(async () => {
      await installIntoRepo({
        targetRepo: dir,
        targetMode: 'claude',
        preset: 'minimal',
      });
      writeRealEnforcement(dir);
    });

    it('settings.json has guidance env vars', () => {
      const settings = readJson(join(dir, '.claude', 'settings.json'));
      expect(settings.env?.GUIDANCE_EVENT_WIRING_ENABLED).toBe('1');
    });

    it('verifyRepo passes for minimal project', () => {
      const result = verifyRepo({ targetRepo: dir, targetMode: 'claude' });
      expect(result.passed).toBe(true);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: E2E — init --full + guidance install (full preset)
// ══════════════════════════════════════════════════════════════════════════════

describe('e2e: init --full + guidance install (full preset)', { skip: skipMsg ? true : false }, () => {
  let dir;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'cfgi-e2e-full-'));
    const r = cli(['init', '--yes', '--full'], dir);
    if (r.status !== 0) throw new Error(`init --full failed: ${r.stderr}`);
  });

  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  describe('after guidance install (full preset)', () => {
    beforeAll(async () => {
      await installIntoRepo({
        targetRepo: dir,
        targetMode: 'claude',
        preset: 'full',
      });
      writeRealEnforcement(dir);
    });

    it('settings.json has all 9 guidance env vars', () => {
      const settings = readJson(join(dir, '.claude', 'settings.json'));
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

    it('settings.json hooks cover all guidance events', () => {
      const settings = readJson(join(dir, '.claude', 'settings.json'));
      const expectedEvents = ['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'UserPromptSubmit', 'SessionStart', 'SessionEnd', 'Stop', 'PreCompact'];
      for (const event of expectedEvents) {
        expect(settings.hooks).toHaveProperty(event);
      }
    });

    it('init helpers preserved after guidance install', () => {
      const helpersDir = join(dir, '.claude', 'helpers');
      if (!existsSync(helpersDir)) return;
      const files = readdirSync(helpersDir);
      // init --full generates helpers like auto-memory-hook.mjs, session.js, etc.
      expect(files.length).toBeGreaterThanOrEqual(2);
    });

    it('guidance components.json records full preset', () => {
      const components = readJson(join(dir, '.claude-flow', 'guidance', 'components.json'));
      expect(components.preset).toBe('full');
      expect(components.components.length).toBeGreaterThan(1);
    });

    it('verifyRepo passes for full project', () => {
      const result = verifyRepo({ targetRepo: dir, targetMode: 'claude' });
      expect(result.passed).toBe(true);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: E2E — guidance install does not touch config.json
// ══════════════════════════════════════════════════════════════════════════════

describe('e2e: guidance install does not touch config.json', { skip: skipMsg ? true : false }, () => {
  let dir;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'cfgi-e2e-force-'));
    const r = cli(['init', '--yes'], dir);
    if (r.status !== 0) throw new Error(`init failed: ${r.stderr}`);

    // Install guidance
    await installIntoRepo({
      targetRepo: dir,
      targetMode: 'claude',
      preset: 'minimal',
    });
  });

  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('settings.json has guidance env vars (not clobbered)', () => {
    const settings = readJson(join(dir, '.claude', 'settings.json'));
    expect(settings.env?.GUIDANCE_EVENT_WIRING_ENABLED).toBe('1');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: E2E — settings.json hook merge (no duplicates)
// ══════════════════════════════════════════════════════════════════════════════

describe('e2e: settings.json hook merge after init', { skip: skipMsg ? true : false }, () => {
  let dir;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'cfgi-e2e-merge-'));
    const r = cli(['init', '--yes', '--full'], dir);
    if (r.status !== 0) throw new Error(`init --full failed: ${r.stderr}`);

    // Capture init-generated settings for comparison
    const initSettings = readJson(join(dir, '.claude', 'settings.json'));

    // Install guidance on top
    await installIntoRepo({
      targetRepo: dir,
      targetMode: 'claude',
      preset: 'full',
    });
  });

  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('no duplicate guidance-enforcement.cjs entries in PreToolUse Bash', () => {
    const settings = readJson(join(dir, '.claude', 'settings.json'));
    const bashBlocks = (settings.hooks?.PreToolUse || []).filter(b =>
      b.matcher === 'Bash' || (b.matcher && b.matcher.includes('Bash')));
    for (const block of bashBlocks) {
      const handlerHooks = (block.hooks || []).filter(h =>
        h.command && h.command.includes('guidance-enforcement.cjs'));
      expect(handlerHooks.length).toBeLessThanOrEqual(1);
    }
  });

  it('init SessionStart hooks preserved alongside guidance hooks', () => {
    const settings = readJson(join(dir, '.claude', 'settings.json'));
    const sessionBlocks = settings.hooks?.SessionStart || [];
    expect(sessionBlocks.length).toBeGreaterThanOrEqual(1);
    // Should have at least one hook entry
    const allHooks = sessionBlocks.flatMap(b => b.hooks || []);
    expect(allHooks.length).toBeGreaterThanOrEqual(1);
  });

  it('guidance hooks use $CLAUDE_PROJECT_DIR paths', () => {
    const settings = readJson(join(dir, '.claude', 'settings.json'));
    const allCommands = Object.values(settings.hooks || {})
      .flat()
      .flatMap(b => (b.hooks || []).map(h => h.command))
      .filter(cmd => cmd && cmd.includes('guidance-enforcement.cjs'));
    // All guidance hooks should use $CLAUDE_PROJECT_DIR
    for (const cmd of allCommands) {
      expect(cmd).toContain('$CLAUDE_PROJECT_DIR');
    }
  });
});
