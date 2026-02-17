import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  GUIDANCE_ENV_DEFAULTS,
  GUIDANCE_HOOKS_DEFAULTS,
  GUIDANCE_PACKAGE_DEPS,
  GUIDANCE_PACKAGE_SCRIPTS,
} from './default-settings.mjs';

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
      'scripts/guidance-autopilot.js',
      'scripts/guidance-ab-benchmark.js',
      'scripts/analyze-guidance.js',
      'src/guidance/phase1-runtime.js',
      'src/guidance/advanced-runtime.js',
      'src/guidance/content-aware-executor.js',
      'docs/guidance-control-plane.md',
      'docs/guidance-implementation-guide.md',
    ],
    packageUpdated: packagePath,
    settingsUpdated: settingsPath,
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

  const passed =
    checks.every((check) => check.exists) &&
    syntaxChecks.every((check) => check.ok) &&
    smoke.status === 0;

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
  };
}
