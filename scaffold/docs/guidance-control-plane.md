# Guidance Control Plane: How It Works in This Repo

## Purpose
This document explains the `@claude-flow/guidance` setup in this repository, including:
- What upstream `claude-flow guidance` provides
- What custom repo scripts add on top
- How hook/background automation is wired
- Which commands to run for analysis, optimization, and A/B checks
- Where outputs/logs are written

It also clarifies command-name differences between promo snippets and the current CLI.

## Version and Command Compatibility
The currently installed CLI reports:
- `claude-flow v3.1.0-alpha.41`

Promo snippets often show:
- `npx claude-flow analyze CLAUDE.md`
- `npx claude-flow optimize CLAUDE.md`
- `npx claude-flow ab-benchmark`

In this CLI version, the guidance commands are namespaced:
- `npx @claude-flow/cli@latest guidance optimize`
- `npx @claude-flow/cli@latest guidance ab-test`

`claude-flow analyze` exists, but it is code/diff analysis, not guidance scoring.

## High-Level Architecture
Guidance is implemented as a control plane around `CLAUDE.md` + `CLAUDE.local.md`:

1. Compile:
- Parse root and local guidance into a typed policy bundle
- Split into constitution rules plus task-scoped shards

2. Retrieve:
- Detect task intent
- Retrieve relevant shards + constitution into policy text

3. Enforce:
- Evaluate gates (destructive commands, secrets, tool checks, etc.)
- Allow, require confirmation, warn, or block

4. Record and evolve:
- Ledger/proof outputs from guidance pipeline
- Optimization and A/B evaluation
- Optional local-rule promotion to root guidance (repo custom autopilot)

## Upstream CLI Commands
Primary command:
- `npx @claude-flow/cli@latest guidance <subcommand> ...`

Available subcommands:
- `compile`
- `retrieve`
- `gates`
- `status`
- `optimize`
- `ab-test`

Aliases:
- `guide`
- `policy`

### `guidance compile`
Compiles `CLAUDE.md` into constitution + shards + manifest.

Flags:
- `--root, -r <path>` root guidance file (default `./CLAUDE.md`)
- `--local, -l <path>` local overlay file
- `--output, -o <dir>` output directory (declared by CLI)
- `--json` machine-readable output

Examples:
```bash
npx @claude-flow/cli@latest guidance compile
npx @claude-flow/cli@latest guidance compile -r ./CLAUDE.md -l ./CLAUDE.local.md
npx @claude-flow/cli@latest guidance compile --json
```

### `guidance retrieve`
Retrieves task-relevant shards by intent.

Flags:
- `--task, -t <text>` required task description
- `--root, -r <path>` root guidance file
- `--local, -l <path>` local overlay
- `--max-shards, -n <number>` max shard count (default `5`)
- `--intent, -i <intent>` override detected intent
- `--json` machine-readable output

Examples:
```bash
npx @claude-flow/cli@latest guidance retrieve --task "Fix auth bug"
npx @claude-flow/cli@latest guidance retrieve -t "Add tests" -n 3
npx @claude-flow/cli@latest guidance retrieve -t "Refactor API" --intent refactor
```

### `guidance gates`
Runs enforcement gates against command/content/tool inputs.

Flags:
- `--command, -c <cmd>` evaluate command risk
- `--content <text>` evaluate content (secret scans)
- `--tool, -t <name>` tool allowlist check
- `--json` machine-readable output

Examples:
```bash
npx @claude-flow/cli@latest guidance gates -c "git push --force origin main"
npx @claude-flow/cli@latest guidance gates --content "api_key=sk-test..."
npx @claude-flow/cli@latest guidance gates -t Bash
```

### `guidance status`
Reports guidance files and compiled bundle stats.

Flags:
- `--json`

Example:
```bash
npx @claude-flow/cli@latest guidance status
```

### `guidance optimize`
Analyzes and optimizes guidance content.

Flags:
- `--root, -r <path>` root guidance file
- `--local, -l <path>` local overlay
- `--apply, -a` write optimized output back to root file
- `--context-size, -s <compact|standard|full>` optimization target size
- `--target-score <0-100>` composite score target (default `90`)
- `--max-iterations <n>` optimization iterations (default `5`)
- `--json` machine-readable output

Examples:
```bash
npx @claude-flow/cli@latest guidance optimize
npx @claude-flow/cli@latest guidance optimize --apply
npx @claude-flow/cli@latest guidance optimize -s compact --target-score 95 --apply
```

### `guidance ab-test`
Runs baseline vs candidate behavioral comparison.

Flags:
- `--config-a, -a <path>` baseline guidance path (optional; default baseline mode)
- `--config-b, -b <path>` candidate guidance path (default `./CLAUDE.md`)
- `--tasks, -t <json-file>` custom AB tasks
- `--work-dir, -w <path>` working directory
- `--json` machine-readable output

Examples:
```bash
npx @claude-flow/cli@latest guidance ab-test
npx @claude-flow/cli@latest guidance ab-test -a old.md -b CLAUDE.md
npx @claude-flow/cli@latest guidance ab-test --tasks custom-ab-tasks.json
```

## Repo-Level Command Wrappers
This repo adds npm scripts that wrap guidance workflows:

From `package.json`:
- `npm run guidance:analyze`
- `npm run guidance:optimize`
- `npm run guidance:autopilot:once`
- `npm run guidance:autopilot:daemon`
- `npm run guidance:ab-benchmark`
- `npm run guidance:all`
- `npm run guidance:status`
- `npm run guidance:hooks`
- `npm run guidance:trust`
- `npm run guidance:adversarial`
- `npm run guidance:proof`
- `npm run guidance:conformance`
- `npm run guidance:evolution`
- `npm run guidance:scaffold`
- `npm run guidance:runtime`
- `npm run guidance:codex:status`
- `npm run guidance:codex:pre-command -- --command "git status"`
- `npm run guidance:codex:pre-edit -- --file src/example.ts`
- `npm run guidance:codex:pre-task -- --description "Implement feature X"`
- `npm run guidance:codex:post-edit -- --file src/example.ts`
- `npm run guidance:codex:post-task -- --task-id task-123 --status completed`
- `npm run guidance:codex:session-start`
- `npm run guidance:codex:session-end`

### What each wrapper does

`guidance:analyze`
- Runs `scripts/analyze-guidance.js`
- Uses `@claude-flow/guidance/analyzer` score reporting
- Initializes guidance control plane
- Performs shard retrieval smoke checks
- Performs phase-1 hook runtime smoke checks
- Writes bundle summary to `.claude-flow/guidance/bundle-summary.json`

`guidance:optimize`
- Runs `scripts/guidance-autopilot.js --once --apply --source manual`
- Executes repo custom promotion loop (see next section)

`guidance:autopilot:once`
- Runs one dry-ish autopilot cycle (`--once`, no `--apply`)

`guidance:autopilot:daemon`
- Runs recurring autopilot cycles in foreground process (`--daemon --apply`)

`guidance:ab-benchmark`
- Runs `scripts/guidance-ab-benchmark.js`
- Uses `abBenchmark()` with a local synthetic executor
- Writes `.claude-flow/guidance/ab-benchmark-report.json`

`guidance:all` and the module-specific `guidance:*` wrappers
- Runs `scripts/guidance-integrations.js` (backed by `src/guidance/advanced-runtime.js`)
- Implements executable versions of README integration modules:
  - hook wiring flow
  - trust accumulation
  - adversarial detection + quorum
  - proof chain generation/verification
  - conformance test + replay
  - evolution propose/simulate/stage/promote
- Writes advanced runtime state and proof chain to `.claude-flow/guidance/advanced/`

`guidance:runtime`
- Runs `scripts/guidance-runtime.js demo`
- Demonstrates pre-task / pre-command / post-task flow

`guidance:scaffold`
- Runs `scripts/scaffold-guidance.js`
- Scaffolds guidance templates into `.claude-flow/guidance/scaffold/`

`guidance:codex:*`
- Runs `scripts/guidance-codex-bridge.js` lifecycle events
- Reuses `.claude/helpers/hook-handler.cjs` enforcement path
- Optionally executes best-effort `npx @claude-flow/cli@latest hooks ...` telemetry

## Repo Custom Autopilot (Promotion + ADR)
This repo includes a custom autopilot that is not a built-in CLI command.

File:
- `scripts/guidance-autopilot.js`

Behavior:
1. Read `CLAUDE.md` and optional `CLAUDE.local.md`
2. Compile both and detect promotable local rules (`source === local` + new/changed vs root)
3. Build candidate root content with an auto-promotion section:
- `## Guidance Auto-Promotions`
- `<!-- guidance-autopilot:start --> ... <!-- guidance-autopilot:end -->`
4. Score before/after via `analyze()` and `benchmark()`
5. Optional A/B gate via `abBenchmark()`
6. If thresholds pass and `--apply` is set:
- Backup current `CLAUDE.md`
- Write updated `CLAUDE.md`
- Generate ADR in `docs/adr/`
7. Otherwise write proposal file only

CLI flags (custom script):
- `--once`
- `--daemon`
- `--apply`
- `--ab`
- `--no-ab`
- `--min-delta <number>`
- `--max-promotions <number>`
- `--interval-ms <number>`
- `--min-ab-gain <number>`
- `--source <text>`

Generated files:
- `.claude-flow/guidance/autopilot-report.json`
- `.claude-flow/guidance/autopilot-state.json`
- `.claude-flow/guidance/autopilot.log`
- `.claude-flow/guidance/autopilot.lock`
- `.claude-flow/guidance/proposals/*.md`
- `.claude-flow/guidance/backups/CLAUDE.md.*.bak`
- `docs/adr/ADR-XXX-guidance-local-rule-promotion.md`

### Important practical point
Current repo autopilot promotes only rules already present in `CLAUDE.local.md` as local guidance rules. It does not yet auto-invent new rules from scratch. You can treat `CLAUDE.local.md` as the experimental staging area.

## Hook Integration and Background Automation
Hook launcher file:
- `.claude/helpers/hook-handler.cjs`
- `scripts/guidance-codex-bridge.js` (Codex lifecycle dispatcher)

Claude hook configuration file:
- `.claude/settings.json`
- `.agents/config.toml` (Codex command map metadata)

Key integration:
- On `SessionEnd`, `hook-handler.cjs` launches autopilot as a detached background process.
- This is non-blocking (`detached: true`, `stdio: ignore`, `child.unref()`).
- Hook handler now dispatches guidance event wiring through `scripts/guidance-integrations.js event ...`:
  - sync blocking checks for `pre-command`, `pre-edit`, `pre-task`
  - async governance updates for `post-edit`, `post-task`, `session-end`

Hook paths currently wired in settings:
- `SessionStart`: `session-restore`
- `SessionEnd`: `session-end`
- `PreToolUse Bash`: `pre-bash`
- `PreToolUse Write/Edit/MultiEdit`: `pre-edit`
- `PreToolUse Task`: `pre-task`
- `PostToolUse Task`: `post-task`
- `PostToolUse Write/Edit`: `post-edit`
- plus related `entire hooks ...` commands

Codex lifecycle wiring in this repo:
- `guidance:codex:session-start` -> `session-restore`
- `guidance:codex:pre-command` -> `pre-bash`
- `guidance:codex:pre-edit` -> `pre-edit`
- `guidance:codex:pre-task` -> `pre-task`
- `guidance:codex:post-edit` -> `post-edit`
- `guidance:codex:post-task` -> `post-task`
- `guidance:codex:session-end` -> `session-end`

Each bridge call sends normalized payload to `hook-handler.cjs` and may also run best-effort `npx @claude-flow/cli@latest hooks ...` telemetry unless disabled with `--skip-cf-hooks` or `GUIDANCE_CODEX_SKIP_CF_HOOKS=1`.

### Autopilot environment toggles
Recognized by `hook-handler.cjs`:
- `GUIDANCE_AUTOPILOT_ENABLED=0` disable session-end autopilot
- `GUIDANCE_AUTOPILOT_MIN_DELTA=<float>` override promotion threshold (default `0.5`)
- `GUIDANCE_AUTOPILOT_AB=1` enable A/B gate during hook-triggered autopilot
- `GUIDANCE_AUTOPILOT_MIN_AB_GAIN=<float>` minimum A/B gain when AB gate is enabled (default `0.05`)
- `GUIDANCE_EVENT_WIRING_ENABLED=0` disable guidance event wiring in hook-handler
- `GUIDANCE_EVENT_SYNC_TIMEOUT_MS=<ms>` timeout for sync pre-event checks
- `GUIDANCE_EVENT_FAIL_CLOSED=1` block when sync guidance check errors

Recognized by benchmark script:
- `GUIDANCE_PROOF_KEY=<string>` optional proof key for A/B benchmark report generation

## Daemon and Runtime Modes
There are two separate concepts:

1. Claude Flow CLI daemon:
- `npx @claude-flow/cli@latest daemon start`
- Supports broader orchestration/runtime internals
- Optional start during init (`--start-daemon`, `--start-all`)

2. Repo autopilot daemon loop:
- `npm run guidance:autopilot:daemon`
- Runs recurring local promotion checks from `scripts/guidance-autopilot.js`
- Independent of whether CLI daemon is running

## Recommended Operational Flows

### Baseline (upstream only)
```bash
npx @claude-flow/cli@latest init
npx @claude-flow/cli@latest guidance status
npx @claude-flow/cli@latest guidance optimize
npx @claude-flow/cli@latest guidance ab-test
```

### Repo workflow (with wrappers)
```bash
npm run guidance:analyze
npm run guidance:ab-benchmark
npm run guidance:optimize
npm run guidance:all
```

### Codex lifecycle workflow (bridge)
```bash
# start/restore lifecycle context
npm run guidance:codex:session-start

# gate task and operations
npm run guidance:codex:pre-task -- --task-id task-123 --description "Implement feature X"
npm run guidance:codex:pre-command -- --task-id task-123 --command "git status"
npm run guidance:codex:pre-edit -- --task-id task-123 --file src/example.ts --operation modify

# finalize learning/ledger
npm run guidance:codex:post-edit -- --task-id task-123 --file src/example.ts
npm run guidance:codex:post-task -- --task-id task-123 --status completed --description "Implement feature X"
npm run guidance:codex:session-end -- --task-id task-123
```

Quick verification:
```bash
npm run guidance:codex:status
npm run guidance:codex:pre-task -- --task-id smoke-1 --description "smoke" --skip-cf-hooks
```
Expected result: JSON output with `handler.ok: true`; when not skipping, expect `claudeFlowHook.ok: true`.

### Continuous repo workflow
```bash
npm run guidance:autopilot:daemon
```

### Enable stricter session-end promotion gate
```bash
export GUIDANCE_AUTOPILOT_AB=1
export GUIDANCE_AUTOPILOT_MIN_AB_GAIN=0.05
```

## Troubleshooting

`Unknown command: optimize` or `Unknown command: ab-benchmark`:
- Use namespaced commands:
- `guidance optimize`
- `guidance ab-test`

`guidance retrieve` says missing `--task`:
- Provide `--task "..."` or `-t "..."`.

Autopilot reports `no-promotable-local-rules`:
- Expected when `CLAUDE.local.md` has no local rule candidates.
- Add explicit experimental rules in `CLAUDE.local.md`.

No background autopilot activity on session end:
- Confirm hook wiring in `.claude/settings.json`
- Confirm script exists at `scripts/guidance-autopilot.js`
- Ensure `GUIDANCE_AUTOPILOT_ENABLED` is not set to `0`

A/B benchmark hangs in environments without `claude -p`:
- Use repo wrapper `npm run guidance:ab-benchmark` (synthetic local executor).

Need to validate full README integration implementations:
- Run `npm run guidance:all` for full suite.
- Run `npm run guidance:status` to inspect advanced runtime state.

## Source Files in This Repo
Core docs and implementation:
- `CLAUDE.md`
- `CLAUDE.local.md`
- `.claude/settings.json`
- `.claude/helpers/hook-handler.cjs`
- `scripts/analyze-guidance.js`
- `scripts/guidance-autopilot.js`
- `scripts/guidance-ab-benchmark.js`
- `scripts/guidance-integrations.js`
- `scripts/guidance-runtime.js`
- `scripts/scaffold-guidance.js`
- `src/guidance/phase1-runtime.js`
- `src/guidance/advanced-runtime.js`
- `src/guidance/content-aware-executor.js`

Upstream package references:
- `node_modules/@claude-flow/guidance/README.md`
- `@claude-flow/cli` guidance command implementation (`dist/src/commands/guidance.js`)
