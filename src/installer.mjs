import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  GUIDANCE_ENV_DEFAULTS,
  GUIDANCE_HOOKS_DEFAULTS,
  GUIDANCE_PACKAGE_DEPS,
  GUIDANCE_PACKAGE_SCRIPTS,
} from './default-settings.mjs';

const GUIDANCE_CODEX_CONFIG_BLOCK = [
  '# =============================================================================',
  '# Guidance Codex Bridge',
  '# =============================================================================',
  '',
  '[guidance_codex]',
  'enabled = true',
  'script = "scripts/guidance-codex-bridge.js"',
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
  '- `scripts/guidance-codex-bridge.js` -> dispatches lifecycle events to:',
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

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function readJson(path, fallback = {}) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return fallback;
  }
}

function writeJson(path, value) {
  ensureDir(dirname(path));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(path, value) {
  ensureDir(dirname(path));
  writeFileSync(path, value);
}

function sameMatcher(a, b) {
  return String(a ?? '') === String(b ?? '');
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
      const exists = currentHooks.some(
        (hook) => hook.type === incomingHook.type && hook.command === incomingHook.command
      );
      if (!exists) currentHooks.push(incomingHook);
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

function run(cmd, args, cwd) {
  return spawnSync(cmd, args, {
    cwd,
    encoding: 'utf-8',
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

export function installIntoRepo({ toolkitRoot, targetRepo, force = false, installDeps = false }) {
  const target = resolve(targetRepo);
  const scaffold = resolve(toolkitRoot, 'scaffold');

  if (!existsSync(target)) {
    throw new Error(`Target repo does not exist: ${target}`);
  }

  if (!existsSync(scaffold)) {
    throw new Error(`Toolkit scaffold not found: ${scaffold}`);
  }

  // Copy scaffold files into target.
  cpSync(scaffold, target, {
    recursive: true,
    force,
    errorOnExist: false,
  });

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
    if (!(name in packageJson.scripts)) {
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

  // Merge .claude/settings.json hooks and env.
  const settingsPath = resolve(target, '.claude/settings.json');
  const settings = readJson(settingsPath, {});
  settings.env = settings.env || {};
  for (const [key, value] of Object.entries(GUIDANCE_ENV_DEFAULTS)) {
    if (!(key in settings.env)) settings.env[key] = value;
  }

  settings.hooks = settings.hooks || {};
  for (const [event, blocks] of Object.entries(GUIDANCE_HOOKS_DEFAULTS)) {
    settings.hooks[event] = mergeHookBlocks(settings.hooks[event], blocks);
  }

  writeJson(settingsPath, settings);

  const agentsConfigPath = resolve(target, '.agents/config.toml');
  const codexConfigAdded = appendBlockIfMissing(
    agentsConfigPath,
    '[guidance_codex]',
    GUIDANCE_CODEX_CONFIG_BLOCK
  );

  const agentsDocPath = resolve(target, 'AGENTS.md');
  const codexAgentsDocAdded = appendBlockIfMissing(
    agentsDocPath,
    '## Guidance Lifecycle Wiring (Codex)',
    GUIDANCE_CODEX_AGENTS_BLOCK,
    '# Project\n\n'
  );

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
    copiedFrom: relative(target, scaffold),
    filesInstalled: [
      '.claude/helpers/hook-handler.cjs',
      'scripts/guidance-integrations.js',
      'scripts/guidance-runtime.js',
      'scripts/guidance-codex-bridge.js',
      'scripts/guidance-autopilot.js',
      'scripts/guidance-ab-benchmark.js',
      'scripts/scaffold-guidance.js',
      'scripts/analyze-guidance.js',
      'src/guidance/phase1-runtime.js',
      'src/guidance/advanced-runtime.js',
      'src/guidance/content-aware-executor.js',
      'docs/guidance-control-plane.md',
      'docs/guidance-implementation-guide.md',
    ],
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

export function verifyRepo({ targetRepo }) {
  const target = resolve(targetRepo);
  const requiredFiles = [
    '.claude/helpers/hook-handler.cjs',
    'scripts/guidance-integrations.js',
    'scripts/guidance-runtime.js',
    'scripts/guidance-codex-bridge.js',
    'src/guidance/phase1-runtime.js',
    '.claude/settings.json',
    'package.json',
  ];

  const checks = [];
  for (const relPath of requiredFiles) {
    const full = resolve(target, relPath);
    checks.push({ path: relPath, exists: existsSync(full) });
  }

  const syntaxChecks = [];
  const checkFiles = [
    '.claude/helpers/hook-handler.cjs',
    'scripts/guidance-integrations.js',
    'scripts/guidance-runtime.js',
    'scripts/guidance-codex-bridge.js',
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
  const smoke = run(
    'bash',
    [
      '-lc',
      `printf '%s' '${smokeInput}' | node .claude/helpers/hook-handler.cjs pre-bash`,
    ],
    target
  );

  const smokeCodex = run(
    'node',
    ['scripts/guidance-codex-bridge.js', 'status', '--skip-cf-hooks'],
    target
  );

  const passed =
    checks.every((check) => check.exists) &&
    syntaxChecks.every((check) => check.ok) &&
    smoke.status === 0 &&
    smokeCodex.status === 0;

  return {
    target,
    passed,
    files: checks,
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

export function initRepo({
  toolkitRoot,
  targetRepo,
  force = false,
  installDeps = false,
  dual = true,
  skipCfInit = false,
  verify = true,
}) {
  const target = resolve(targetRepo);
  if (!existsSync(target)) {
    throw new Error(`Target repo does not exist: ${target}`);
  }

  let claudeFlowInit = {
    skipped: true,
    reason: '--skip-cf-init',
  };

  if (!skipCfInit) {
    const initArgs = ['@claude-flow/cli@latest', 'init'];
    if (dual) initArgs.push('--dual');

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

  const install = installIntoRepo({
    toolkitRoot,
    targetRepo: target,
    force,
    installDeps,
  });

  let verifyReport = null;
  if (verify) {
    verifyReport = verifyRepo({ targetRepo: target });
    if (!verifyReport.passed) {
      throw new Error(
        `Guidance wiring verification failed in ${target}. Run cf-guidance-impl verify --target ${target} for details.`
      );
    }
  }

  return {
    target,
    claudeFlowInit,
    install,
    verify: verifyReport,
  };
}
