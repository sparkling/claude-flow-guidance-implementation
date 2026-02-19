import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { installIntoRepo, verifyRepo } from '../src/installer.mjs';

const PROJECT_ROOT = resolve('/home/claude/src/claude-flow-guidance-implementation');

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

/**
 * Copy the real hook-handler.cjs into a target's .claude/helpers/ so that
 * `node --check` and smoke tests can succeed (the thin shim requires the
 * npm package, which isn't available in temp dirs).
 */
function writeRealHandler(targetDir) {
  const realHandler = readFileSync(resolve(PROJECT_ROOT, 'src/hook-handler.cjs'), 'utf-8');
  const helpersDir = resolve(targetDir, '.claude/helpers');
  mkdirSync(helpersDir, { recursive: true });
  writeFileSync(resolve(helpersDir, 'hook-handler.cjs'), realHandler);
}

describe('installIntoRepo', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'inst-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates .claude/helpers/hook-handler.cjs shim in target', () => {
    installIntoRepo({ targetRepo: tmpDir });

    const shimPath = resolve(tmpDir, '.claude/helpers/hook-handler.cjs');
    expect(existsSync(shimPath)).toBe(true);

    const content = readFileSync(shimPath, 'utf-8');
    expect(content).toContain('claude-flow-guidance-implementation/hook-handler');
  });

  it('creates package.json with guidance scripts when none exists', () => {
    installIntoRepo({ targetRepo: tmpDir });

    const pkgPath = resolve(tmpDir, 'package.json');
    expect(existsSync(pkgPath)).toBe(true);

    const pkg = readJson(pkgPath);
    expect(pkg.scripts).toBeDefined();
    expect(pkg.scripts['guidance:analyze']).toBe('cf-guidance-analyze');
    expect(pkg.scripts['guidance:status']).toBe('cf-guidance status');
  });

  it('merges scripts into existing package.json without overwriting', () => {
    const pkgPath = resolve(tmpDir, 'package.json');
    writeFileSync(
      pkgPath,
      JSON.stringify({
        name: 'existing-project',
        version: '2.0.0',
        scripts: { 'guidance:analyze': 'my-custom-analyze', start: 'node index.js' },
      })
    );

    installIntoRepo({ targetRepo: tmpDir });

    const pkg = readJson(pkgPath);
    // Existing script must NOT be overwritten (force=false by default)
    expect(pkg.scripts['guidance:analyze']).toBe('my-custom-analyze');
    // Pre-existing script must be preserved
    expect(pkg.scripts.start).toBe('node index.js');
    // New guidance scripts should be added
    expect(pkg.scripts['guidance:status']).toBe('cf-guidance status');
  });

  it('adds claude-flow-guidance-implementation dependency', () => {
    installIntoRepo({ targetRepo: tmpDir });

    const pkg = readJson(resolve(tmpDir, 'package.json'));
    expect(pkg.dependencies).toBeDefined();
    expect(pkg.dependencies['claude-flow-guidance-implementation']).toBe('^0.2.0');
  });

  it('creates .claude/settings.json with hooks and env for claude mode', () => {
    installIntoRepo({ targetRepo: tmpDir, targetMode: 'claude' });

    const settingsPath = resolve(tmpDir, '.claude/settings.json');
    expect(existsSync(settingsPath)).toBe(true);

    const settings = readJson(settingsPath);
    expect(settings.env).toBeDefined();
    expect(settings.env.CLAUDE_FLOW_HOOKS_ENABLED).toBe('true');
    expect(settings.env.GUIDANCE_EVENT_WIRING_ENABLED).toBe('1');

    expect(settings.hooks).toBeDefined();
    expect(settings.hooks.PreToolUse).toBeDefined();
    expect(Array.isArray(settings.hooks.PreToolUse)).toBe(true);
    expect(settings.hooks.PostToolUse).toBeDefined();
    expect(settings.hooks.SessionStart).toBeDefined();
    expect(settings.hooks.SessionEnd).toBeDefined();
  });

  it('creates .agents/config.toml with guidance block for codex mode', () => {
    installIntoRepo({ targetRepo: tmpDir, targetMode: 'codex' });

    const configPath = resolve(tmpDir, '.agents/config.toml');
    expect(existsSync(configPath)).toBe(true);

    const content = readFileSync(configPath, 'utf-8');
    expect(content).toContain('[guidance_codex]');
    expect(content).toContain('enabled = true');
  });

  it('creates CLAUDE.local.md stub if missing', () => {
    installIntoRepo({ targetRepo: tmpDir });

    const localMdPath = resolve(tmpDir, 'CLAUDE.local.md');
    expect(existsSync(localMdPath)).toBe(true);

    const content = readFileSync(localMdPath, 'utf-8');
    expect(content).toContain('Local Guidance Experiments');
  });

  it('adds CLAUDE.local.md to .gitignore', () => {
    installIntoRepo({ targetRepo: tmpDir });

    const gitignorePath = resolve(tmpDir, '.gitignore');
    expect(existsSync(gitignorePath)).toBe(true);

    const content = readFileSync(gitignorePath, 'utf-8');
    expect(content).toContain('CLAUDE.local.md');
  });

  it('throws on non-existent target', async () => {
    const badPath = resolve(tmpDir, 'does-not-exist');
    await expect(installIntoRepo({ targetRepo: badPath })).rejects.toThrow(
      /Target repo does not exist/
    );
  });

  it('targetMode: claude skips codex files', () => {
    installIntoRepo({ targetRepo: tmpDir, targetMode: 'claude' });

    const configToml = resolve(tmpDir, '.agents/config.toml');
    const agentsMd = resolve(tmpDir, 'AGENTS.md');

    expect(existsSync(configToml)).toBe(false);
    expect(existsSync(agentsMd)).toBe(false);

    // But settings.json must exist
    expect(existsSync(resolve(tmpDir, '.claude/settings.json'))).toBe(true);
  });

  it('targetMode: codex skips settings.json', () => {
    installIntoRepo({ targetRepo: tmpDir, targetMode: 'codex' });

    const settingsPath = resolve(tmpDir, '.claude/settings.json');
    expect(existsSync(settingsPath)).toBe(false);

    // But codex files must exist
    expect(existsSync(resolve(tmpDir, '.agents/config.toml'))).toBe(true);
    expect(existsSync(resolve(tmpDir, 'AGENTS.md'))).toBe(true);
  });
});

describe('verifyRepo', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'verify-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns passed: true for properly installed repo (claude mode)', () => {
    // First install to create all the expected files
    installIntoRepo({ targetRepo: tmpDir, targetMode: 'claude' });

    // Replace the thin shim with the real handler so node --check succeeds
    writeRealHandler(tmpDir);

    const result = verifyRepo({ targetRepo: tmpDir, targetMode: 'claude' });

    expect(result.passed).toBe(true);
    expect(result.target).toBe(resolve(tmpDir));
    expect(result.targetMode).toBe('claude');
  });

  it('returns passed: false when hook-handler.cjs missing', () => {
    // Create package.json and settings.json but NOT the hook-handler
    mkdirSync(resolve(tmpDir, '.claude'), { recursive: true });
    writeFileSync(
      resolve(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'test',
        dependencies: { 'claude-flow-guidance-implementation': '^0.2.0' },
      })
    );
    writeFileSync(
      resolve(tmpDir, '.claude/settings.json'),
      JSON.stringify({ env: {}, hooks: {} })
    );

    const result = verifyRepo({ targetRepo: tmpDir, targetMode: 'claude' });

    expect(result.passed).toBe(false);

    // The hook-handler file check should report missing
    const handlerCheck = result.files.find(
      (f) => f.path === '.claude/helpers/hook-handler.cjs'
    );
    expect(handlerCheck).toBeDefined();
    expect(handlerCheck.exists).toBe(false);
  });

  it('includes compatPairs and syntaxChecks in result', () => {
    installIntoRepo({ targetRepo: tmpDir, targetMode: 'claude' });
    writeRealHandler(tmpDir);

    const result = verifyRepo({ targetRepo: tmpDir, targetMode: 'claude' });

    expect(result.compatPairs).toBeDefined();
    expect(Array.isArray(result.compatPairs)).toBe(true);

    expect(result.syntaxChecks).toBeDefined();
    expect(Array.isArray(result.syntaxChecks)).toBe(true);
    // The hook-handler syntax check should pass
    const handlerSyntax = result.syntaxChecks.find(
      (s) => s.path === '.claude/helpers/hook-handler.cjs'
    );
    expect(handlerSyntax).toBeDefined();
    expect(handlerSyntax.ok).toBe(true);
  });

  it('reports smoke test results', () => {
    installIntoRepo({ targetRepo: tmpDir, targetMode: 'claude' });
    writeRealHandler(tmpDir);

    const result = verifyRepo({ targetRepo: tmpDir, targetMode: 'claude' });

    expect(result.smoke).toBeDefined();
    expect(typeof result.smoke.exitCode).toBe('number');
    expect(typeof result.smoke.stdout).toBe('string');
    expect(typeof result.smoke.stderr).toBe('string');
  });
});
