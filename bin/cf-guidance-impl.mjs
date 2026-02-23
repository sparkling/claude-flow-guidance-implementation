#!/usr/bin/env node
import { initRepo, installIntoRepo, verifyRepo } from '../src/installer.mjs';

function usage() {
  console.log(`Usage:
  cf-guidance init    --target <repoPath> [options]
  cf-guidance install --target <repoPath> [options]
  cf-guidance verify  --target <repoPath> [--target-mode both|claude|codex]

General options:
  --target <path>              Target repository (default: cwd)
  --target-mode both|claude|codex  Integration mode (default: both)
  --preset minimal|standard|full   Component preset (default: standard)
  --components trust,proof,...     Explicit component list
  --exclude adversarial,codex,...  Exclude components
  --force                      Overwrite existing files
  --install-deps               Run npm install after setup
  --fail-closed                Block on hook errors (GUIDANCE_EVENT_FAIL_CLOSED=1)
  --hook-timeout <ms>          Per-hook timeout (default: 5000)
  --event-timeout <ms>         Event wiring timeout (default: 8000)
  --generate-key               Generate HMAC-SHA256 signing key
  --no-autopilot               Disable autopilot rule optimization
  --no-hooks                   Disable claude-flow hooks (CLAUDE_FLOW_HOOKS_ENABLED=false)
  --no-event-wiring            Disable guidance event dispatch (GUIDANCE_EVENT_WIRING_ENABLED=0)
  --autopilot-min-delta <n>    Min confidence delta for autopilot (default: 0.5)
  --autopilot-ab               Enable A/B testing mode (GUIDANCE_AUTOPILOT_AB=1)
  --autopilot-min-ab-gain <n>  Min gain for A/B winner (default: 0.05)
  --skip-cf-hooks-in-codex     Skip secondary cf-hooks in codex mode
  --dry-run                    Preview without writing files

Init-only options:
  --no-dual                    Disable dual-mode (Claude Code only)
  --skip-cf-init               Skip @claude-flow/cli init step
  --no-verify                  Skip post-install verification
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

  const failClosed = hasFlag(args, '--fail-closed');
  const hookTimeout = (() => {
    const idx = args.indexOf('--hook-timeout');
    return idx !== -1 ? Number(args[idx + 1]) : undefined;
  })();
  const eventTimeout = (() => {
    const idx = args.indexOf('--event-timeout');
    return idx !== -1 ? Number(args[idx + 1]) : undefined;
  })();
  const generateKey = hasFlag(args, '--generate-key');
  const noAutopilot = hasFlag(args, '--no-autopilot');
  const noHooks = hasFlag(args, '--no-hooks');
  const noEventWiring = hasFlag(args, '--no-event-wiring');
  const autopilotMinDelta = getFlagValue(args, '--autopilot-min-delta', undefined);
  const autopilotAb = hasFlag(args, '--autopilot-ab');
  const autopilotMinAbGain = getFlagValue(args, '--autopilot-min-ab-gain', undefined);
  const skipCfHooksInCodex = hasFlag(args, '--skip-cf-hooks-in-codex');
  const dryRun = hasFlag(args, '--dry-run');

  if (command === 'init') {
    // CLI default: 'standard' preset for fresh installs when no flags given
    const effectivePreset = (!preset && !components && !exclude) ? 'standard' : preset;
    const result = await initRepo({
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
      failClosed,
      hookTimeout,
      eventTimeout,
      generateKey,
      noAutopilot,
      noHooks,
      noEventWiring,
      autopilotMinDelta,
      autopilotAb,
      autopilotMinAbGain,
      skipCfHooksInCodex,
      dryRun,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'install') {
    // CLI default: 'standard' preset for fresh installs when no flags given
    const effectivePreset = (!preset && !components && !exclude) ? 'standard' : preset;
    const result = await installIntoRepo({
      targetRepo: target,
      targetMode,
      force,
      installDeps,
      components,
      preset: effectivePreset,
      exclude,
      failClosed,
      hookTimeout,
      eventTimeout,
      generateKey,
      noAutopilot,
      noHooks,
      noEventWiring,
      autopilotMinDelta,
      autopilotAb,
      autopilotMinAbGain,
      skipCfHooksInCodex,
      dryRun,
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
