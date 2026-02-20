#!/usr/bin/env node

const subcommand = process.argv[2];

if (!subcommand || subcommand === '--help' || subcommand === '-h') {
  console.log(`Usage: cf-guidance <command> [options]

Commands:
  init        Initialize guidance wiring in a target repo
  install     Install guidance into a target repo (no verify)
  verify      Verify guidance wiring in a target repo
  run         Run all integration suites
  runtime     Demo the guidance runtime
  autopilot   One-shot or daemon-mode CLAUDE.md optimization
  benchmark   A/B benchmark (baseline vs guided)
  codex       Codex lifecycle bridge commands
  analyze     Compile and score CLAUDE.md policy bundle
  scaffold    Scaffold guidance files into a new project

Options:
  -h, --help  Show help

Examples:
  npx @sparkleideas/claude-flow-guidance init --target ./my-repo
  npx @sparkleideas/claude-flow-guidance verify --target ./my-repo
  npx @sparkleideas/claude-flow-guidance analyze --target ./my-repo
  npx @sparkleideas/claude-flow-guidance autopilot --once --apply
`);
  process.exit(subcommand ? 0 : 1);
}

// Rewrite argv so the dispatched script sees the subcommand args
// argv[0] = node, argv[1] = this script, argv[2] = subcommand, argv[3..] = args
// After dispatch: argv[0] = node, argv[1] = target script, argv[2..] = args
const args = process.argv.slice(3);

const commands = {
  init:      () => import('./cf-guidance-impl.mjs'),
  install:   () => import('./cf-guidance-impl.mjs'),
  verify:    () => import('./cf-guidance-impl.mjs'),
  run:       () => import('../src/cli/guidance-integrations.js'),
  runtime:   () => import('../src/cli/guidance-runtime.js'),
  autopilot: () => import('../src/cli/guidance-autopilot.js'),
  benchmark: () => import('../src/cli/guidance-ab-benchmark.js'),
  codex:     () => import('../src/cli/guidance-codex-bridge.js'),
  analyze:   () => import('../src/cli/analyze-guidance.js'),
  scaffold:  () => import('../src/cli/scaffold-guidance.js'),
};

if (commands[subcommand]) {
  // For init/install/verify, the cf-guidance-impl.mjs reads argv[2] as the command
  if (['init', 'install', 'verify'].includes(subcommand)) {
    // Rewrite argv so cf-guidance-impl.mjs sees: [node, script, command, ...args]
    process.argv = [process.argv[0], process.argv[1], subcommand, ...args];
  } else {
    // Other scripts read argv[2..] as their own args
    process.argv = [process.argv[0], process.argv[1], ...args];
  }
  commands[subcommand]();
} else {
  console.error(`Unknown command: ${subcommand}\nRun "cf-guidance --help" for usage.`);
  process.exit(1);
}
