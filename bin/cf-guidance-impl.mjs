#!/usr/bin/env node
import { initRepo, installIntoRepo, verifyRepo } from '../src/installer.mjs';

function usage() {
  console.log(`Usage:
  cf-guidance-impl init --target <repoPath> [--target-mode both|claude|codex] [--preset minimal|standard|full] [--components trust,proof,...] [--exclude adversarial,codex,...] [--force] [--install-deps] [--no-dual] [--skip-cf-init] [--no-verify]
  cf-guidance-impl install --target <repoPath> [--target-mode both|claude|codex] [--preset minimal|standard|full] [--components trust,proof,...] [--exclude adversarial,codex,...] [--force] [--install-deps]
  cf-guidance-impl verify --target <repoPath> [--target-mode both|claude|codex]
`);
}

function getFlagValue(args, flag, fallback = null) {
  const index = args.indexOf(flag);
  if (index < 0 || index + 1 >= args.length) return fallback;
  return args[index + 1];
}

function hasFlag(args, flag) {
  return args.includes(flag);
}

async function main() {
  const [, , command, ...args] = process.argv;

  if (!command || command === '--help' || command === '-h') {
    usage();
    process.exit(command ? 0 : 1);
  }

  const target = getFlagValue(args, '--target', process.cwd());
  const targetMode = getFlagValue(args, '--target-mode', 'both');
  const force = hasFlag(args, '--force');
  const installDeps = hasFlag(args, '--install-deps');
  const preset = getFlagValue(args, '--preset', undefined);
  const componentsRaw = getFlagValue(args, '--components', undefined);
  const excludeRaw = getFlagValue(args, '--exclude', undefined);
  const components = componentsRaw ? componentsRaw.split(',').map(s => s.trim()).filter(Boolean) : undefined;
  const exclude = excludeRaw ? excludeRaw.split(',').map(s => s.trim()).filter(Boolean) : undefined;

  if (command === 'init') {
    // CLI default: 'standard' preset for fresh installs when no flags given
    const effectivePreset = (!preset && !components && !exclude) ? 'standard' : preset;
    const result = initRepo({
      targetRepo: target,
      targetMode,
      force,
      installDeps,
      dual: !hasFlag(args, '--no-dual'),
      skipCfInit: hasFlag(args, '--skip-cf-init'),
      verify: !hasFlag(args, '--no-verify'),
      components,
      preset: effectivePreset,
      exclude,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'install') {
    // CLI default: 'standard' preset for fresh installs when no flags given
    const effectivePreset = (!preset && !components && !exclude) ? 'standard' : preset;
    const result = installIntoRepo({
      targetRepo: target,
      targetMode,
      force,
      installDeps,
      components,
      preset: effectivePreset,
      exclude,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'verify') {
    const report = verifyRepo({ targetRepo: target, targetMode });
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.passed ? 0 : 2);
  }

  usage();
  process.exit(1);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
