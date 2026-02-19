# Quick start: claude-flow-guidance-implementation

This tutorial walks you through installing and using the
`claude-flow-guidance-implementation` package in a fresh Node.js
repository. By the end, you will have a working guidance control plane
that blocks dangerous commands, records decisions in a proof chain, and
scores your project's `CLAUDE.md` policy file.

## Prerequisites

- Node.js 20 or later
- npm 10 or later
- A Git-initialized repository (or you can create one during setup)

Verify your environment:

```bash
node --version   # v20.x or later
npm --version    # 10.x or later
```

## Step 1: Create a fresh repository

If you already have a repository, skip to Step 2.

```bash
mkdir my-project && cd my-project
git init
npm init -y
```

## Step 2: Install the package

Run the installer from within your repository root. The `--install-deps`
flag runs `npm install` automatically after scaffolding.

```bash
npx --yes -p claude-flow-guidance-implementation cf-guidance-impl init --target . --install-deps
```

By default the CLI installs the `standard` preset (trust, proof, and
analysis). To install all subsystems, add `--preset full`. To install
only the Phase 1 core with no optional subsystems, use `--preset
minimal`.

```bash
# Full installation with all 8 optional subsystems
npx --yes -p claude-flow-guidance-implementation cf-guidance-impl init --target . --install-deps --preset full
```

The command performs the following actions:

1. Runs `npx @claude-flow/cli init` to scaffold the base Claude Flow
   configuration.
2. Creates `.claude/helpers/hook-handler.cjs` -- a thin CommonJS shim
   that delegates to the full hook handler in the installed npm package.
3. Merges hook definitions into `.claude/settings.json`.
4. Adds guidance npm scripts to `package.json`.
5. Adds `claude-flow-guidance-implementation` as a dependency and runs
   `npm install`.
6. Runs a verification pass to confirm everything was wired correctly.

The installer prints a JSON summary on success. Look for
`"passed": true` in the `verify` section.

## Step 3: Understand what was created

After installation, your repository contains these new or modified files:

| File | Purpose |
|---|---|
| `.claude/helpers/hook-handler.cjs` | CJS dispatcher that routes Claude Code lifecycle events through the guidance control plane. Uses CJS for fast cold start. |
| `.claude/settings.json` | Claude Code settings with hook entries for `PreToolUse`, `PostToolUse`, `SessionStart`, and `SessionEnd`. |
| `CLAUDE.local.md` | Local-only guidance experiments file (gitignored). |
| `package.json` | Updated with guidance npm scripts and the `claude-flow-guidance-implementation` dependency. |

### Hook wiring in settings.json

The installer merges the following hook configuration into
`.claude/settings.json`:

- **PreToolUse**: Routes `Bash` tool calls through `pre-bash`, routes
  `Write`/`Edit`/`MultiEdit` through `pre-edit`, and routes `Task`
  through `pre-task`.
- **PostToolUse**: Routes `Write`/`Edit`/`MultiEdit` through
  `post-edit`, and routes `Task` through `post-task`.
- **SessionStart**: Triggers `session-restore`.
- **SessionEnd**: Triggers `session-end`.

Each hook calls `node .claude/helpers/hook-handler.cjs <event>` with a
5-second timeout.

## Step 4: Verify the installation

Run the verification command to confirm all files, syntax checks, and
smoke tests pass:

```bash
npx cf-guidance-impl verify --target .
```

The output is a JSON report. A successful verification looks like this:

```json
{
  "passed": true,
  "files": [
    { "path": ".claude/helpers/hook-handler.cjs", "exists": true },
    { "path": "package.json", "exists": true },
    { "path": ".claude/settings.json", "exists": true }
  ],
  "syntaxChecks": [
    { "path": ".claude/helpers/hook-handler.cjs", "ok": true }
  ],
  "smoke": {
    "exitCode": 0,
    "stdout": "[OK] Command validated"
  }
}
```

If `"passed"` is `false`, review the failing checks and fix them before
continuing.

## Step 5: Test a blocked command

The hook handler blocks commands that match dangerous patterns. Pipe a
simulated `git push --force` event into the `pre-bash` handler:

```bash
echo '{"tool_input":{"command":"git push --force origin main"}}' \
  | node .claude/helpers/hook-handler.cjs pre-bash
```

Expected output:

```
[BLOCKED] ...
```

The process exits with code 1. When Claude Code runs, this exit code
tells it to abort the tool call.

You can verify the exit code:

```bash
echo '{"tool_input":{"command":"git push --force origin main"}}' \
  | node .claude/helpers/hook-handler.cjs pre-bash; echo "Exit: $?"
```

Expected:

```
[BLOCKED] ...
Exit: 1
```

## Step 6: Test an allowed command

Now test a safe command:

```bash
echo '{"tool_input":{"command":"git status"}}' \
  | node .claude/helpers/hook-handler.cjs pre-bash
```

Expected output:

```
[OK] Command validated
```

The process exits with code 0, which tells Claude Code the tool call is
permitted.

## Step 7: Run the runtime demo

The runtime demo exercises a sequence of hook events: `pre-task`,
`pre-command` (both safe and destructive), and `post-task`.

```bash
npm run guidance:runtime
```

This runs `cf-guidance-runtime demo`, which initializes the Phase-1
guidance runtime and processes four simulated events in order:

1. **pre-task** -- Registers a new task.
2. **pre-command (destructive)** -- Evaluates `git push origin main
   --force`. Expect `"aborted": true`.
3. **pre-command (safe)** -- Evaluates `git status`. Expect
   `"aborted": false`.
4. **post-task** -- Completes the task and records the outcome.

Each step prints a JSON result with `success`, `aborted`,
`hooksExecuted`, and `messages` fields.

## Step 8: Run the integration test suite

The full integration suite tests status, hooks, trust scoring,
adversarial detection, proof chains, conformance, and rule evolution:

```bash
npm run guidance:all
```

This runs `cf-guidance all`, which executes each subsystem integration in
sequence. You can also run individual suites:

```bash
npm run guidance:status        # System status
npm run guidance:hooks         # Hook pipeline
npm run guidance:trust         # Trust scoring
npm run guidance:adversarial   # Threat detection
npm run guidance:proof         # Proof chain
npm run guidance:conformance   # Conformance tests
npm run guidance:evolution     # Rule evolution
```

## Step 9: Check the proof chain

After running the integration suite, the guidance system records
decisions in a proof chain. Inspect it at:

```
.claude-flow/guidance/advanced/proof-chain.json
```

View the contents:

```bash
cat .claude-flow/guidance/advanced/proof-chain.json | node -e "
  const data = JSON.parse(require('fs').readFileSync(0, 'utf-8'));
  console.log('Envelopes:', data.envelopes?.length ?? 0);
  for (const env of (data.envelopes ?? []).slice(0, 3)) {
    console.log('-', env.payload?.action ?? env.action, '|', env.payload?.timestamp ?? '');
  }
"
```

Each envelope in the chain contains a signed payload with an action,
timestamp, and decision metadata. The chain is append-only and
cryptographically linked, so you can audit the sequence of guidance
decisions after a session.

The trust state is persisted alongside the proof chain at:

```
.claude-flow/guidance/advanced/advanced-state.json
```

This file contains trust scores, trust ledger records, and snapshot
data that persists across sessions.

## Step 10: Run the analyzer

The analyzer compiles your project's `CLAUDE.md` into a policy bundle
and scores it across six dimensions:

```bash
npm run guidance:analyze
```

The output includes:

1. **Analysis results** -- Dimension scores for your CLAUDE.md.
2. **Policy bundle compilation** -- The number of compiled shards, active
   gates, and the constitution hash.
3. **Sample shard retrieval** -- Tests retrieval for four sample tasks,
   showing which policy shards match each task description.
4. **Phase-1 hook runtime smoke check** -- Runs pre-task, pre-command
   (safe and destructive), and post-task through the runtime.

The analyzer also saves a bundle summary to
`.claude-flow/guidance/bundle-summary.json` for inspection.

To auto-optimize your CLAUDE.md, pass the `--optimize` flag:

```bash
npm run guidance:analyze -- --optimize
```

This applies suggested improvements and saves the optimized version to
`.claude-flow/guidance/CLAUDE.optimized.md`.

## Summary of available npm scripts

| Script | Description |
|---|---|
| `npm run guidance:all` | Run all integration suites |
| `npm run guidance:status` | Check system status |
| `npm run guidance:hooks` | Test hook pipeline |
| `npm run guidance:trust` | Test trust scoring |
| `npm run guidance:adversarial` | Test adversarial detection |
| `npm run guidance:proof` | Test proof chain |
| `npm run guidance:conformance` | Test conformance |
| `npm run guidance:evolution` | Test rule evolution |
| `npm run guidance:runtime` | Run runtime demo |
| `npm run guidance:analyze` | Analyze and score CLAUDE.md |
| `npm run guidance:optimize` | One-shot optimization of CLAUDE.md |
| `npm run guidance:ab-benchmark` | A/B benchmark (baseline vs guided) |

## Next steps

- Add project-specific rules to your `CLAUDE.md` and re-run
  `npm run guidance:analyze` to see how scores change.
- Experiment with local rules in `CLAUDE.local.md`. The autopilot can
  promote winning rules into `CLAUDE.md`.
- Run `npm run guidance:autopilot:daemon` to start continuous
  optimization in the background.
- For Codex integration, re-run the installer with
  `--target-mode codex` or `--target-mode both` to scaffold the Codex
  bridge alongside Claude Code hooks.
