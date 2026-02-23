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
  --backend hybrid|json|sqlite|agentdb  Memory backend (default: hybrid)
  --force                      Overwrite existing files
  --install-deps               Run npm install after setup
  --fail-closed                Block on hook errors (GUIDANCE_EVENT_FAIL_CLOSED=1)
  --hook-timeout <ms>          Per-hook timeout (default: 5000)
  --event-timeout <ms>         Event wiring timeout (default: 8000)
  --generate-key               Generate HMAC-SHA256 signing key
  --no-autopilot               Disable autopilot rule optimization
  --dry-run                    Preview without writing files

Init-only options:
  --no-dual                    Disable dual-mode (Claude Code only)
  --skip-cf-init               Skip @claude-flow/cli init step
  --no-verify                  Skip post-install verification

Memory config options:
  --no-hnsw                    Disable HNSW vector indexing
  --cache-size <n>             Memory cache size (default: 100)

Learning bridge options:
  --no-learning-bridge         Disable SONA learning bridge
  --sona-mode <mode>           balanced|aggressive|conservative (default: balanced)
  --confidence-decay <rate>    Confidence decay rate (default: 0.005)
  --access-boost <amount>      Access boost amount (default: 0.03)
  --consolidation-threshold <n>  Consolidation threshold (default: 10)

Memory graph options:
  --no-memory-graph            Disable memory graph
  --pagerank-damping <n>       PageRank damping factor (default: 0.85)
  --max-graph-nodes <n>        Maximum graph nodes (default: 5000)
  --similarity-threshold <n>   Similarity threshold (default: 0.8)

Agent scope options:
  --no-agent-scopes            Disable agent scopes
  --default-scope <scope>      Default agent scope (default: project)

Neural options:
  --no-neural                  Disable neural subsystem
  --neural-model-path <path>   Neural model path (default: .claude-flow/neural)

Hook config options:
  --no-hooks-auto-execute      Disable hooks auto-execute

AgentDB v3 options:
  --agentdb-backend <type>       AgentDB vector backend (default: rvf)
  --enable-agentdb-learning      Enable AgentDB self-learning (default: true)
  --no-agentdb-learning          Disable AgentDB self-learning
  --learning-batch-size <n>      Self-learning batch size (default: 32)
  --learning-tick-interval <ms>  Self-learning tick interval (default: 30000)
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
  const dryRun = hasFlag(args, '--dry-run');
  const backend = getFlagValue(args, '--backend', undefined);

  // Fine-grained config.json options
  const configOptions = {};
  if (hasFlag(args, '--no-hnsw')) configOptions.enableHNSW = false;
  if (getFlagValue(args, '--cache-size')) configOptions.cacheSize = Number(getFlagValue(args, '--cache-size'));
  if (hasFlag(args, '--no-learning-bridge')) configOptions.learningBridge = false;
  if (getFlagValue(args, '--sona-mode')) configOptions.sonaMode = getFlagValue(args, '--sona-mode');
  if (getFlagValue(args, '--confidence-decay')) configOptions.confidenceDecayRate = Number(getFlagValue(args, '--confidence-decay'));
  if (getFlagValue(args, '--access-boost')) configOptions.accessBoostAmount = Number(getFlagValue(args, '--access-boost'));
  if (getFlagValue(args, '--consolidation-threshold')) configOptions.consolidationThreshold = Number(getFlagValue(args, '--consolidation-threshold'));
  if (hasFlag(args, '--no-memory-graph')) configOptions.memoryGraph = false;
  if (getFlagValue(args, '--pagerank-damping')) configOptions.pageRankDamping = Number(getFlagValue(args, '--pagerank-damping'));
  if (getFlagValue(args, '--max-graph-nodes')) configOptions.maxNodes = Number(getFlagValue(args, '--max-graph-nodes'));
  if (getFlagValue(args, '--similarity-threshold')) configOptions.similarityThreshold = Number(getFlagValue(args, '--similarity-threshold'));
  if (hasFlag(args, '--no-agent-scopes')) configOptions.agentScopes = false;
  if (getFlagValue(args, '--default-scope')) configOptions.defaultScope = getFlagValue(args, '--default-scope');
  if (hasFlag(args, '--no-neural')) configOptions.neuralEnabled = false;
  if (getFlagValue(args, '--neural-model-path')) configOptions.neuralModelPath = getFlagValue(args, '--neural-model-path');
  if (hasFlag(args, '--no-hooks-auto-execute')) configOptions.hooksAutoExecute = false;
  if (getFlagValue(args, '--agentdb-backend')) configOptions.agentdbVectorBackend = getFlagValue(args, '--agentdb-backend');
  if (hasFlag(args, '--no-agentdb-learning')) configOptions.agentdbEnableLearning = false;
  if (getFlagValue(args, '--learning-batch-size')) configOptions.agentdbBatchSize = Number(getFlagValue(args, '--learning-batch-size'));
  if (getFlagValue(args, '--learning-tick-interval')) configOptions.agentdbTickInterval = Number(getFlagValue(args, '--learning-tick-interval'));

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
      dryRun,
      backend,
      configOptions,
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
      dryRun,
      backend,
      configOptions,
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
