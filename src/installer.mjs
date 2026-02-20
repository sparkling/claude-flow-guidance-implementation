import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  GUIDANCE_ENV_DEFAULTS,
  GUIDANCE_HOOKS_DEFAULTS,
  GUIDANCE_PACKAGE_DEPS,
  GUIDANCE_PACKAGE_SCRIPTS,
  GUIDANCE_COMPONENTS,
  GUIDANCE_CORE_SCRIPTS,
  GUIDANCE_PRESETS,
  resolveComponents,
  buildHookDefaults,
} from './default-settings.mjs';
import { readJson, ensureDir, writeJson } from './utils.mjs';

const COMPAT_MODULES = ['router', 'session', 'memory', 'statusline'];

function ensureHelperCompat(helpersDir) {
  const actions = [];
  if (!existsSync(helpersDir)) return actions;
  for (const mod of COMPAT_MODULES) {
    const cjsPath = resolve(helpersDir, `${mod}.cjs`);
    const jsPath = resolve(helpersDir, `${mod}.js`);
    if (existsSync(cjsPath) && !existsSync(jsPath)) {
      copyFileSync(cjsPath, jsPath);
      actions.push({ module: mod, action: 'cjs->js' });
    } else if (existsSync(jsPath) && !existsSync(cjsPath)) {
      copyFileSync(jsPath, cjsPath);
      actions.push({ module: mod, action: 'js->cjs' });
    }
  }
  return actions;
}

function checkHelperCompat(helpersDir) {
  return COMPAT_MODULES.map((mod) => {
    const cjs = existsSync(resolve(helpersDir, `${mod}.cjs`));
    const js = existsSync(resolve(helpersDir, `${mod}.js`));
    return { module: mod, cjs, js, hasBoth: cjs && js, hasEither: cjs || js };
  });
}

const GUIDANCE_CODEX_CONFIG_BLOCK = [
  '# =============================================================================',
  '# Guidance Codex Bridge',
  '# =============================================================================',
  '',
  '[guidance_codex]',
  'enabled = true',
  'script = "src/cli/guidance-codex-bridge.js"',
  'hook_handler = ".claude/helpers/hook-handler.cjs"',
  'run_claude_flow_cli_hooks = true',
  '',
  '[guidance_codex.commands]',
  'status = "npm run guidance:codex:status"',
  'pre_command = "npm run guidance:codex:pre-command -- --command \\"<bash command>\\""',
  'pre_edit = "npm run guidance:codex:pre-edit -- --file <path>"',
  'pre_task = "npm run guidance:codex:pre-task -- --description \\"<task description>\\""',
  'post_edit = "npm run guidance:codex:post-edit -- --file <path>"',
  'post_task = "npm run guidance:codex:post-task -- --task-id <id> --status completed"',
  'session_start = "npm run guidance:codex:session-start"',
  'session_end = "npm run guidance:codex:session-end"',
  '',
].join('\n');

const GUIDANCE_CODEX_AGENTS_BLOCK = [
  '## Guidance Lifecycle Wiring (Codex)',
  '',
  'Codex does not expose Claude Code-style event-command hook maps in `config.toml`.',
  'This project uses an explicit bridge script:',
  '',
  '- `src/cli/guidance-codex-bridge.js` -> dispatches lifecycle events to:',
  '  - `.claude/helpers/hook-handler.cjs` (enforcement path)',
  '  - optional `npx @claude-flow/cli@latest hooks ...` telemetry calls',
  '',
  'Primary commands:',
  '',
  '```bash',
  'npm run guidance:codex:session-start',
  'npm run guidance:codex:pre-task -- --description "Implement feature X"',
  'npm run guidance:codex:pre-command -- --command "git status"',
  'npm run guidance:codex:pre-edit -- --file src/example.ts',
  'npm run guidance:codex:post-edit -- --file src/example.ts',
  'npm run guidance:codex:post-task -- --task-id task-123 --status completed',
  'npm run guidance:codex:session-end',
  '```',
  '',
  'Control flags:',
  '- `--skip-cf-hooks` skips secondary `@claude-flow/cli` hook invocations',
  '- `GUIDANCE_CODEX_SKIP_CF_HOOKS=1` disables secondary invocations globally',
  '',
].join('\n');

function normalizeTargetMode(value = 'both') {
  const mode = String(value || 'both').trim().toLowerCase();
  if (!['both', 'claude', 'codex'].includes(mode)) {
    throw new Error(`Invalid target mode: ${value}. Use one of: both, claude, codex.`);
  }
  return mode;
}

function usesClaudeMode(mode) {
  return mode === 'both' || mode === 'claude';
}

function usesCodexMode(mode) {
  return mode === 'both' || mode === 'codex';
}

function getAllowedScripts(components, targetMode) {
  const allowed = new Set(GUIDANCE_CORE_SCRIPTS);
  const mode = normalizeTargetMode(targetMode);
  for (const name of components) {
    const comp = GUIDANCE_COMPONENTS[name];
    if (!comp) continue;
    for (const script of comp.scripts) {
      // Skip codex scripts if codex component is selected but mode doesn't include codex
      const isCodexScript = script.startsWith('guidance:codex:');
      if (isCodexScript && !usesCodexMode(mode)) continue;
      allowed.add(script);
    }
  }
  return allowed;
}

function writeText(path, value) {
  ensureDir(dirname(path));
  writeFileSync(path, value);
}

function sameMatcher(a, b) {
  return String(a ?? '') === String(b ?? '');
}

/**
 * Normalize a hook-handler command for deduplication.
 * Strips path prefix variations so that both relative and $CLAUDE_PROJECT_DIR
 * forms resolve to the same identity string.
 *
 *   'node .claude/helpers/hook-handler.cjs pre-bash'
 *   'node "$CLAUDE_PROJECT_DIR"/.claude/helpers/hook-handler.cjs pre-bash'
 *
 * Both normalize to: 'node .claude/helpers/hook-handler.cjs pre-bash'
 */
function normalizeHookCommand(cmd) {
  return String(cmd || '').replace(
    /node\s+(?:"[^"]*"\/)?(?:\.\/)?\.claude\/helpers\/hook-handler\.cjs/,
    'node .claude/helpers/hook-handler.cjs'
  );
}

function sameHookCommand(a, b) {
  return a === b || normalizeHookCommand(a) === normalizeHookCommand(b);
}

function mergeHookBlocks(existingBlocks, incomingBlocks) {
  const blocks = Array.isArray(existingBlocks) ? [...existingBlocks] : [];
  for (const incoming of incomingBlocks) {
    const index = blocks.findIndex((block) => sameMatcher(block.matcher, incoming.matcher));
    if (index < 0) {
      blocks.push(incoming);
      continue;
    }

    const current = blocks[index];
    const currentHooks = Array.isArray(current.hooks) ? [...current.hooks] : [];
    for (const incomingHook of incoming.hooks ?? []) {
      const existingIndex = currentHooks.findIndex(
        (hook) => hook.type === incomingHook.type && sameHookCommand(hook.command, incomingHook.command)
      );
      if (existingIndex < 0) {
        currentHooks.push(incomingHook);
      } else {
        // Replace existing hook with incoming (upgrades relative path to $CLAUDE_PROJECT_DIR form)
        currentHooks[existingIndex] = incomingHook;
      }
    }

    blocks[index] = { ...current, hooks: currentHooks };
  }
  return blocks;
}

function ensureGitIgnoreLine(targetRepo, line) {
  const gitignorePath = resolve(targetRepo, '.gitignore');
  const existing = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf-8') : '';
  const lines = existing.split(/\r?\n/).filter(Boolean);
  if (!lines.includes(line)) lines.push(line);
  writeText(gitignorePath, `${lines.join('\n')}\n`);
}

function writeMissingStub(filePath, content) {
  if (!existsSync(filePath)) writeText(filePath, content);
}

function run(cmd, args, cwd, timeout = 30000) {
  return spawnSync(cmd, args, {
    cwd,
    encoding: 'utf-8',
    timeout,
  });
}

function appendBlockIfMissing(path, marker, block, fallback = '') {
  const existing = existsSync(path) ? readFileSync(path, 'utf-8') : fallback;
  if (existing.includes(marker)) return false;
  const trimmed = existing.trimEnd();
  const prefix = trimmed ? `${trimmed}\n\n` : '';
  writeText(path, `${prefix}${block.trim()}\n`);
  return true;
}

const HOOK_HANDLER_SHIM = `#!/usr/bin/env node
// Thin shim — delegates to the full hook-handler in the npm package.
// This file is kept local so Claude Code's hook config can reference it by path.
process.env.__GUIDANCE_HELPERS_DIR = process.env.__GUIDANCE_HELPERS_DIR || __dirname;
require('@sparkleideas/claude-flow-guidance/hook-handler');
`;

export async function installIntoRepo({
  targetRepo,
  force = false,
  installDeps = false,
  targetMode = 'both',
  components,
  preset,
  exclude,
  failClosed = false,
  hookTimeout,
  eventTimeout,
  generateKey = false,
  noAutopilot = false,
  dryRun = false,
}) {
  const target = resolve(targetRepo);
  const mode = normalizeTargetMode(targetMode);

  if (!existsSync(target)) {
    throw new Error(`Target repo does not exist: ${target}`);
  }

  // Resolve enabled components.
  // If components.json exists and no explicit selection given, read it back.
  const componentsJsonPath = resolve(target, '.claude-flow/guidance/components.json');
  let resolvedComponents;
  if (!components && !preset && !exclude) {
    const saved = readJson(componentsJsonPath, null);
    if (saved && Array.isArray(saved.components)) {
      resolvedComponents = saved.components;
    } else {
      // Programmatic default: 'full' for backwards compat
      resolvedComponents = resolveComponents({ preset: 'full' });
    }
  } else {
    resolvedComponents = resolveComponents({ components, exclude, preset });
  }
  const resolvedSet = new Set(resolvedComponents);
  const allowedScripts = getAllowedScripts(resolvedComponents, mode);

  // Build env overrides from CLI flags.
  const envOverrides = {};
  if (failClosed) envOverrides.GUIDANCE_EVENT_FAIL_CLOSED = '1';
  if (eventTimeout) envOverrides.GUIDANCE_EVENT_SYNC_TIMEOUT_MS = String(eventTimeout);
  if (noAutopilot) envOverrides.GUIDANCE_AUTOPILOT_ENABLED = '0';
  if (generateKey) {
    const crypto = await import('node:crypto');
    envOverrides.GUIDANCE_PROOF_KEY = crypto.randomBytes(32).toString('hex');
  }

  // Build hook definitions with optional custom timeout.
  const hookDefaults = hookTimeout ? buildHookDefaults(hookTimeout) : GUIDANCE_HOOKS_DEFAULTS;

  // Compute merged env vars for reporting (and dry-run).
  const mergedEnv = { ...GUIDANCE_ENV_DEFAULTS, ...envOverrides };

  // Dry-run: compute what would be written and return without touching disk.
  if (dryRun) {
    const wouldWrite = [
      '.claude/helpers/hook-handler.cjs',
      'package.json',
    ];
    if (usesClaudeMode(mode)) wouldWrite.push('.claude/settings.json');
    if (usesCodexMode(mode) && resolvedSet.has('codex')) {
      wouldWrite.push('.agents/config.toml', 'AGENTS.md');
    }
    wouldWrite.push('.claude-flow/guidance/components.json', 'CLAUDE.local.md', '.gitignore');

    return {
      dryRun: true,
      target,
      targetMode: mode,
      components: resolvedComponents,
      wouldWrite,
      envVars: mergedEnv,
      hooks: Object.keys(hookDefaults),
      hookTimeout: hookTimeout || 5000,
    };
  }

  // Write thin hook-handler shim (delegates to the npm package).
  const shimPath = resolve(target, '.claude/helpers/hook-handler.cjs');
  if (force || !existsSync(shimPath)) {
    ensureDir(dirname(shimPath));
    writeText(shimPath, HOOK_HANDLER_SHIM);
  }

  // Create .js/.cjs compatibility copies for helper modules.
  // Different hook-handler variants require() with different extensions.
  const compatActions = ensureHelperCompat(resolve(target, '.claude/helpers'));

  // Merge package.json scripts + dependencies.
  const packagePath = resolve(target, 'package.json');
  const packageJson = readJson(packagePath, {
    name: 'project',
    version: '1.0.0',
    private: true,
    type: 'module',
    scripts: {},
    dependencies: {},
  });

  packageJson.type = packageJson.type || 'module';
  packageJson.scripts = packageJson.scripts || {};
  for (const [name, cmd] of Object.entries(GUIDANCE_PACKAGE_SCRIPTS)) {
    if (!allowedScripts.has(name)) continue;
    if (force || !(name in packageJson.scripts)) {
      packageJson.scripts[name] = cmd;
    }
  }

  packageJson.dependencies = packageJson.dependencies || {};
  for (const [dep, version] of Object.entries(GUIDANCE_PACKAGE_DEPS)) {
    if (!(dep in packageJson.dependencies)) {
      packageJson.dependencies[dep] = version;
    }
  }

  writeJson(packagePath, packageJson);

  let settingsPath = null;
  if (usesClaudeMode(mode)) {
    // Merge .claude/settings.json hooks and env.
    settingsPath = resolve(target, '.claude/settings.json');
    const settings = readJson(settingsPath, {});
    settings.env = settings.env || {};

    // Apply base defaults (only adds keys that don't exist).
    for (const [key, value] of Object.entries(GUIDANCE_ENV_DEFAULTS)) {
      if (!(key in settings.env)) settings.env[key] = value;
    }
    // Apply flag-driven overrides (always override).
    for (const [key, value] of Object.entries(envOverrides)) {
      settings.env[key] = value;
    }

    settings.hooks = settings.hooks || {};
    for (const [event, blocks] of Object.entries(hookDefaults)) {
      settings.hooks[event] = mergeHookBlocks(settings.hooks[event], blocks);
    }

    writeJson(settingsPath, settings);
  }

  let agentsConfigPath = null;
  let agentsDocPath = null;
  let codexConfigAdded = false;
  let codexAgentsDocAdded = false;

  if (usesCodexMode(mode) && resolvedSet.has('codex')) {
    agentsConfigPath = resolve(target, '.agents/config.toml');
    codexConfigAdded = appendBlockIfMissing(
      agentsConfigPath,
      '[guidance_codex]',
      GUIDANCE_CODEX_CONFIG_BLOCK
    );

    agentsDocPath = resolve(target, 'AGENTS.md');
    codexAgentsDocAdded = appendBlockIfMissing(
      agentsDocPath,
      '## Guidance Lifecycle Wiring (Codex)',
      GUIDANCE_CODEX_AGENTS_BLOCK,
      '# Project\n\n'
    );
  }

  // Persist component selection for future re-runs and runtime consumption.
  const componentsJson = {
    version: 1,
    preset: preset || (components ? null : 'full'),
    components: resolvedComponents,
    installedAt: new Date().toISOString(),
  };
  const cfGuidanceDir = resolve(target, '.claude-flow/guidance');
  ensureDir(cfGuidanceDir);
  writeJson(componentsJsonPath, componentsJson);

  // Ensure local guidance file and gitignore entries.
  writeMissingStub(
    resolve(target, 'CLAUDE.local.md'),
    [
      '# Local Guidance Experiments',
      '',
      'Add experimental local-only rules here in parseable guidance style.',
      'Autopilot can promote winning local rules into CLAUDE.md with ADRs.',
      '',
      '- [local-example-rule] Prefer safe/validated command patterns (high) #implementation @engineering priority:80',
      '',
    ].join('\n')
  );
  ensureGitIgnoreLine(target, 'CLAUDE.local.md');

  const summary = {
    target,
    targetMode: mode,
    filesInstalled: [
      '.claude/helpers/hook-handler.cjs (shim)',
    ],
    compatActions,
    packageUpdated: packagePath,
    settingsUpdated: settingsPath,
    agentsConfigUpdated: agentsConfigPath,
    agentsDocUpdated: agentsDocPath,
    codexConfigAdded,
    codexAgentsDocAdded,
    installDeps,
  };

  if (installDeps) {
    const npmInstall = run('npm', ['install'], target);
    summary.installExitCode = npmInstall.status;
    summary.installStdout = npmInstall.stdout.split('\n').slice(-8).join('\n');
    summary.installStderr = npmInstall.stderr.split('\n').slice(-8).join('\n');
    if (npmInstall.status !== 0) {
      throw new Error(`npm install failed in ${target}:\n${npmInstall.stderr}`);
    }
  }

  return summary;
}

export function verifyRepo({ targetRepo, targetMode = 'both' }) {
  const target = resolve(targetRepo);
  const mode = normalizeTargetMode(targetMode);
  const requiredFiles = [
    '.claude/helpers/hook-handler.cjs',
    'package.json',
  ];

  if (usesCodexMode(mode)) {
    requiredFiles.push('.agents/config.toml');
    requiredFiles.push('AGENTS.md');
  }
  if (usesClaudeMode(mode)) requiredFiles.push('.claude/settings.json');

  const checks = [];
  for (const relPath of requiredFiles) {
    const full = resolve(target, relPath);
    checks.push({ path: relPath, exists: existsSync(full) });
  }

  // Verify the package dependency is declared (skip when verifying the package itself).
  const packageJson = readJson(resolve(target, 'package.json'), {});
  const isSelf = packageJson.name === '@sparkleideas/claude-flow-guidance';
  if (!isSelf) {
    const deps = packageJson.dependencies || {};
    const hasImplDep = '@sparkleideas/claude-flow-guidance' in deps;
    checks.push({ path: 'dependency:@sparkleideas/claude-flow-guidance', exists: hasImplDep });
  }

  // Check .js/.cjs compat pairs exist for helper modules.
  const compatPairs = checkHelperCompat(resolve(target, '.claude/helpers'));

  const syntaxChecks = [];
  const checkFiles = [
    '.claude/helpers/hook-handler.cjs',
  ];

  for (const relPath of checkFiles) {
    const full = resolve(target, relPath);
    if (!existsSync(full)) {
      syntaxChecks.push({ path: relPath, ok: false, reason: 'missing' });
      continue;
    }
    const result = run('node', ['--check', full], target);
    syntaxChecks.push({
      path: relPath,
      ok: result.status === 0,
      stderr: result.stderr.trim(),
    });
  }

  const smokeInput = '{"tool_input":{"command":"git status"}}';
  let smoke = { status: 0, stdout: '', stderr: '' };
  if (usesClaudeMode(mode)) {
    smoke = spawnSync(
      'node',
      ['.claude/helpers/hook-handler.cjs', 'pre-bash'],
      { cwd: target, encoding: 'utf-8', timeout: 30000, input: smokeInput }
    );
  }

  let smokeCodex = { status: 0, stdout: '', stderr: '' };
  if (usesCodexMode(mode)) {
    smokeCodex = run(
      'node',
      ['-e', 'import("@sparkleideas/claude-flow-guidance/hook-handler")'],
      target
    );
  }

  const compatOk = compatPairs.every((p) => !p.hasEither || p.hasBoth);

  const passed =
    checks.every((check) => check.exists) &&
    syntaxChecks.every((check) => check.ok) &&
    compatOk &&
    (!usesClaudeMode(mode) || smoke.status === 0) &&
    (!usesCodexMode(mode) || smokeCodex.status === 0);

  return {
    target,
    targetMode: mode,
    passed,
    files: checks,
    compatPairs,
    syntaxChecks,
    smoke: {
      exitCode: smoke.status,
      stdout: smoke.stdout.trim(),
      stderr: smoke.stderr.trim(),
    },
    smokeCodex: {
      exitCode: smokeCodex.status,
      stdout: smokeCodex.stdout.trim(),
      stderr: smokeCodex.stderr.trim(),
    },
  };
}

export async function initRepo({
  targetRepo,
  force = false,
  installDeps = false,
  targetMode = 'both',
  dual = true,
  skipCfInit = false,
  verify = true,
  components,
  preset,
  exclude,
  failClosed = false,
  hookTimeout,
  eventTimeout,
  generateKey = false,
  noAutopilot = false,
  dryRun = false,
}) {
  const target = resolve(targetRepo);
  const mode = normalizeTargetMode(targetMode);
  if (!existsSync(target)) {
    throw new Error(`Target repo does not exist: ${target}`);
  }

  let claudeFlowInit = {
    skipped: true,
    reason: '--skip-cf-init',
  };

  if (!skipCfInit) {
    const initArgs = ['@claude-flow/cli@latest', 'init'];
    if (mode === 'both') {
      if (dual) initArgs.push('--dual');
    } else if (mode === 'codex') {
      initArgs.push('--codex');
    }

    const initResult = run('npx', initArgs, target);
    claudeFlowInit = {
      skipped: false,
      command: `npx ${initArgs.join(' ')}`,
      exitCode: initResult.status,
      stdout: initResult.stdout.trim().split('\n').slice(-12).join('\n'),
      stderr: initResult.stderr.trim().split('\n').slice(-12).join('\n'),
    };

    if (initResult.status !== 0) {
      throw new Error(
        `claude-flow init failed in ${target}:\n${claudeFlowInit.stderr || claudeFlowInit.stdout}`
      );
    }
  }

  const install = await installIntoRepo({
    targetRepo: target,
    force,
    installDeps,
    targetMode: mode,
    components,
    preset,
    exclude,
    failClosed,
    hookTimeout,
    eventTimeout,
    generateKey,
    noAutopilot,
    dryRun,
  });

  let verifyReport = null;
  if (verify) {
    verifyReport = verifyRepo({ targetRepo: target, targetMode: mode });
    if (!verifyReport.passed) {
      throw new Error(
        `Guidance wiring verification failed in ${target}. Run cf-guidance verify --target ${target} for details.`
      );
    }
  }

  return {
    target,
    targetMode: mode,
    claudeFlowInit,
    install,
    verify: verifyReport,
  };
}
