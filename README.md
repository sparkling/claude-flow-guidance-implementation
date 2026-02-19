# claude-flow-guidance-implementation

*Runtime governance for AI coding agents.*

---

## 1. What This Package Does

AI coding agents degrade over long sessions. They forget rules, repeat
mistakes, leak secrets, and run destructive commands. This package solves
that problem by wiring the `@claude-flow/guidance` control plane into any
repository that uses Claude Code or OpenAI Codex as its coding agent.

After installation the package does three things automatically:

1. **Compiles** your `CLAUDE.md` file into an enforceable policy bundle
   with typed rules, intent-tagged shards, and a machine-readable
   constitution.
2. **Intercepts** every agent action (shell commands, file edits, task
   starts, task completions, session lifecycle) through hooks, evaluates
   each action against the compiled policy, and blocks violations before
   they reach your codebase.
3. **Records** every decision in a cryptographic proof chain so you can
   replay, audit, and demonstrate compliance after the fact.

The package ships as an npm module with a CLI installer. You point it at
a target repository, it scaffolds the wiring, and from that point on
every Claude Code or Codex session in that repository runs under
governance.

### What Problems It Addresses

| Problem | How the Package Solves It |
|---|---|
| Agent runs destructive commands (`rm -rf /`, `git push --force`) | Blocking `pre-bash` hook evaluates commands against enforcement gates before execution |
| Agent edits files it should not touch | Blocking `pre-edit` hook checks file paths and diff sizes against policy |
| Agent leaks secrets in code | Secrets gate scans content for API keys, passwords, and credential patterns |
| Agent enters runaway loops | ContinueGate monitors step count, rework ratio, and coherence |
| Memory corruption across sessions | Trust system scores agents; untrusted agents get reduced throughput |
| No audit trail | HMAC-SHA256 proof chain records every decision with hash-linked envelopes |
| Rules drift over time | Evolution pipeline proposes, simulates, and stages rule changes with auto-rollback |
| Prompt injection attacks | Threat detector analyses command and memory-write inputs for injection patterns |
| Agent collusion in multi-agent setups | Collusion detector identifies suspicious ring-topology interaction patterns |

---

## Guides

| Document | Description |
|---|---|
| [Quick Start](docs/guide/quick-start.md) | Hands-on tutorial: install, trigger a blocked command, inspect the proof chain |
| [Authoring CLAUDE.md](docs/guide/authoring-claude-md.md) | How to write rules that compile well into the guidance control plane |
| [Trust System](docs/guide/trust-system.md) | Trust tiers, scoring, rate limiting, persistence, and inspection |
| [Gate Configuration](docs/guide/gate-configuration.md) | The four enforcement gates, ContinueGate, threat detection, and tuning |
| [Evolution Workflow](docs/guide/evolution-workflow.md) | Rule evolution lifecycle: propose, simulate, stage, rollout, autopilot, A/B benchmark |
| [Deployment](docs/guide/deployment.md) | Production setup, CI/CD integration, signing keys, monitoring, security hardening |
| [Migration](docs/guide/migration.md) | Adding guidance to existing repos with or without prior hook wiring |
| [API Reference](docs/guide/api-reference.md) | Full API surface: exports, method signatures, types, CLI binaries, changelog |

---

## 2. Prerequisites

- **Node.js** 20 or later
- **npm** 10 or later
- A target repository with a `CLAUDE.md` file (or one will be
  scaffolded for you)

The package has two runtime dependencies:

| Package | Purpose |
|---|---|
| `@claude-flow/guidance` ^3.0.0-alpha.1 | The guidance control plane (compiler, gates, trust, proof, adversarial, evolution) |
| `@claude-flow/hooks` ^3.0.0-alpha.7 | Hook registry and executor for lifecycle event dispatch |

Both are installed automatically when you run `npm install` in the
target repository after the installer adds them to `package.json`.

---

## 3. Component Selection

The package includes 8 optional subsystems. Only the Phase 1 core
(policy compilation, gates, and ledger) is always installed. You choose
which additional subsystems to include during installation.

### Available Components

| Component | What It Adds |
|---|---|
| `trust` | Per-agent trust scoring with privilege tiers |
| `adversarial` | Prompt injection detection, collusion detection, and memory quorum |
| `proof` | HMAC-SHA256 hash-chained cryptographic proof chain |
| `conformance` | Memory Clerk acceptance testing with replay verification |
| `evolution` | Propose, simulate, stage, and rollout rule changes |
| `autopilot` | One-shot and daemon-mode CLAUDE.md rule optimization with A/B benchmarking |
| `analysis` | Policy analysis scoring and project scaffolding |
| `codex` | OpenAI Codex lifecycle bridge for equivalent guidance enforcement |

### Presets

| Preset | Components Included |
|---|---|
| `minimal` | None (Phase 1 gates only) |
| `standard` | trust, proof, analysis |
| `full` | All 8 components |

The CLI defaults to `standard` for new installations. The programmatic
API defaults to `full` for backwards compatibility.

### CLI Flags

```bash
# Use a named preset
cf-guidance-impl init --target . --preset standard

# Explicit component list (overrides preset)
cf-guidance-impl init --target . --components trust,proof,adversarial

# Start from full and exclude specific components
cf-guidance-impl init --target . --preset full --exclude autopilot,codex
```

### Checking Enabled Components

After installation, the selected components are persisted to
`.claude-flow/guidance/components.json`. Subsequent `install` runs
without flags read this file and preserve your selection.

Disabled subsystems use safe no-op stubs at runtime, so no code changes
are needed in consumers. Methods like `trustSystem.getAllSnapshots()`
return empty arrays and `proofChain.export()` returns
`{ envelopes: [] }` when the corresponding component is disabled.

---

## 4. Installation

### Option A: One-Command Install (Recommended)

Run directly from npm without a global install:

```bash
npx --yes -p claude-flow-guidance-implementation \
  cf-guidance-impl init \
  --target ~/source/my-project \
  --install-deps
```

This single command:

1. Runs `npx @claude-flow/cli@latest init` in your target repo (sets up
   base claude-flow configuration).
2. Writes a thin hook-handler shim to
   `.claude/helpers/hook-handler.cjs`.
3. Merges guidance hooks and environment variables into
   `.claude/settings.json`.
4. Adds guidance npm scripts and dependencies to `package.json`.
5. Creates `CLAUDE.local.md` (for local experiments) and adds it to
   `.gitignore`.
6. Runs verification to confirm everything is wired correctly.

### Option B: Install as a Dev Dependency

```bash
cd ~/source/my-project
npm install --save-dev claude-flow-guidance-implementation
npx cf-guidance-impl init --target . --install-deps
```

### Verify the Installation

```bash
npx cf-guidance-impl verify --target ~/source/my-project
```

The verify command checks:

- All required files exist (`.claude/helpers/hook-handler.cjs`,
  `.claude/settings.json`, `package.json`)
- Helper module compatibility pairs (`.cjs` and `.js` variants)
- Syntax validation of the hook handler via `node --check`
- A smoke test that pipes a simulated `pre-bash` event through the hook
  handler

A passing verification prints `"passed": true` in the JSON output.

---

## 5. Integration Modes

The installer supports three target modes that control which agent
platform receives hook wiring.

| Mode | Flag | What Gets Wired |
|---|---|---|
| `both` (default) | `--target-mode both` | Claude Code hooks via `.claude/settings.json` + Codex bridge via `.agents/config.toml` |
| `claude` | `--target-mode claude` | Claude Code hooks only |
| `codex` | `--target-mode codex` | Codex bridge only |

```bash
# Claude Code only
npx cf-guidance-impl init --target . --target-mode claude

# Codex only
npx cf-guidance-impl init --target . --target-mode codex

# Both platforms (default)
npx cf-guidance-impl init --target .
```

### Claude Code Integration

When running in `claude` or `both` mode, the installer merges hook
definitions into `.claude/settings.json`. Claude Code reads this file
and automatically invokes the hook handler at each lifecycle event. The
hooks are:

| Claude Code Event | Hook Handler Command | Behaviour |
|---|---|---|
| `PreToolUse` (Write, Edit, MultiEdit) | `hook-handler.cjs pre-edit` | **Blocking.** Evaluates file path, diff size, and content against gates. Returns exit code 1 to block. |
| `PreToolUse` (Bash) | `hook-handler.cjs pre-bash` | **Blocking.** Evaluates shell commands against destructive-ops gate and threat detector. Returns exit code 1 to block. |
| `PreToolUse` (Task) | `hook-handler.cjs pre-task` | **Blocking.** Retrieves task-relevant policy shards and evaluates task description. Returns exit code 1 to block. |
| `PostToolUse` (Write, Edit, MultiEdit) | `hook-handler.cjs post-edit` | **Async.** Records the edit in the proof chain and intelligence system. Non-blocking. |
| `PostToolUse` (Task) | `hook-handler.cjs post-task` | **Async.** Records task completion and triggers learning. Non-blocking. |
| `SessionStart` | `hook-handler.cjs session-restore` | **Async.** Restores session state and loads intelligence patterns. |
| `SessionEnd` | `hook-handler.cjs session-end` | **Async.** Consolidates intelligence, persists session, launches autopilot. |

**Blocking** hooks run synchronously (`spawnSync`). If the guidance
control plane blocks the action, the hook handler exits with code 1 and
Claude Code aborts the operation. **Async** hooks spawn detached child
processes and return immediately so they do not slow down the agent.

### Codex Integration

Codex does not have a native hook system like Claude Code's
`settings.json` event map. Instead, this package provides a bridge
script (`src/cli/guidance-codex-bridge.js`) that maps Codex lifecycle
events to the same hook handler.

The installer adds npm scripts to `package.json` so Codex can call them
at each lifecycle point:

```bash
npm run guidance:codex:session-start
npm run guidance:codex:pre-task -- --description "Implement feature X"
npm run guidance:codex:pre-command -- --command "git status"
npm run guidance:codex:pre-edit -- --file src/example.ts
npm run guidance:codex:post-edit -- --file src/example.ts
npm run guidance:codex:post-task -- --task-id task-123 --status completed
npm run guidance:codex:session-end
```

The bridge dispatches to the same `.claude/helpers/hook-handler.cjs`
and, when enabled, also calls `npx @claude-flow/cli@latest hooks ...`
for telemetry. Disable the secondary call with `--skip-cf-hooks` or
`GUIDANCE_CODEX_SKIP_CF_HOOKS=1`.

---

## 6. Component Reference

### 6.1 Installer (`src/installer.mjs`)

The installer provides three functions:

| Function | Purpose |
|---|---|
| `initRepo(options)` | Full initialisation: runs `@claude-flow/cli init`, scaffolds files, merges settings, verifies |
| `installIntoRepo(options)` | Scaffolds files and merges settings without running `@claude-flow/cli init` |
| `verifyRepo(options)` | Validates that all required files, dependencies, syntax checks, and smoke tests pass |

**Options for `initRepo`:**

| Option | Type | Default | Description |
|---|---|---|---|
| `targetRepo` | string | (required) | Absolute path to the target repository |
| `targetMode` | `'both'` \| `'claude'` \| `'codex'` | `'both'` | Which platform to wire |
| `force` | boolean | `false` | Overwrite existing files |
| `installDeps` | boolean | `false` | Run `npm install` after merging dependencies |
| `dual` | boolean | `true` | Pass `--dual` to `@claude-flow/cli init` (for `both` mode) |
| `skipCfInit` | boolean | `false` | Skip the `@claude-flow/cli init` step |
| `verify` | boolean | `true` | Run verification after install |

### 6.2 Hook Handler (`src/hook-handler.cjs`)

The central dispatcher. This is a CommonJS file (`.cjs`) because Claude
Code's hook system spawns it via `node`, and CommonJS provides the
fastest cold-start time (no ESM module resolution overhead).

**Commands:**

| Command | When Invoked | Blocking | What It Does |
|---|---|---|---|
| `pre-bash` | Before a shell command | Yes | Runs guidance gates on the command. Checks for dangerous patterns (`rm -rf /`, fork bombs). Runs adversarial threat detection. Exits 1 to block. |
| `pre-edit` | Before a file write/edit | Yes | Runs guidance gates on the file path, diff size, and content. Exits 1 to block. |
| `pre-task` | Before a task starts | Yes | Retrieves task-relevant policy shards. Routes to recommended agent. Remembers task context for the matching `post-task`. Exits 1 to block. |
| `post-edit` | After a file write/edit | No | Records the edit in the intelligence system and launches async guidance event. |
| `post-task` | After a task completes | No | Records task completion. Triggers intelligence feedback. Launches async guidance event. |
| `session-restore` | At session start | No | Restores session state, loads intelligence patterns. |
| `session-end` | At session end | No | Consolidates intelligence, persists session, launches autopilot. |
| `route` | On demand | No | Routes a prompt to the recommended agent type with confidence score. |
| `compact-manual` | Before manual context compaction | No | Prints guidance reminders for the compaction operation. |
| `compact-auto` | Before automatic context compaction | No | Prints guidance context for auto-compaction. |
| `status` | On demand | No | Health check. |
| `stats` | On demand | No | Prints intelligence system statistics. |

**Stdin protocol:** Claude Code passes a JSON object on stdin with the
shape `{ tool_input: { command, file_path, ... }, tool_name, ... }`.
The hook handler parses this to extract the command text, file path,
task description, and other parameters.

**Exit codes:** Exit 0 means the action is allowed. Exit 1 means the
action is blocked. Async hooks always exit 0 because they do not gate
the action.

### 6.3 Phase 1 Runtime (`src/guidance/phase1-runtime.js`)

Wraps the four core guidance modules into a single class.

```
CLAUDE.md -> GuidanceCompiler -> Bundle -> ShardRetriever -> EnforcementGates -> PersistentLedger
```

**Constructor options:**

| Option | Default | Description |
|---|---|---|
| `rootDir` | `process.cwd()` | Project root directory |
| `rootGuidancePath` | `'CLAUDE.md'` | Path to the shared guidance file |
| `localGuidancePath` | `'CLAUDE.local.md'` | Path to the local guidance file |
| `gateConfig` | `{}` | Custom gate configuration overrides |

**Methods:**

| Method | Returns | Description |
|---|---|---|
| `initialize()` | Promise\<void\> | Compiles CLAUDE.md, loads shards, sets active rules on gates, registers hooks |
| `preTask({ taskId, taskDescription })` | Promise\<HookResult\> | Evaluates a task against policy before execution |
| `postTask({ taskId, status, toolsUsed, filesTouched })` | Promise\<HookResult\> | Records task completion in the ledger |
| `preCommand(command)` | Promise\<HookResult\> | Evaluates a shell command against gates |
| `preToolUse(toolName, parameters)` | Promise\<HookResult\> | Evaluates a tool invocation against gates |
| `preEdit({ filePath, operation, content, diffLines })` | Promise\<HookResult\> | Evaluates a file edit against gates |
| `isBlocked(result)` | boolean | Returns true if the hook result indicates the action was blocked |
| `extractPolicyText(result)` | string \| null | Extracts the policy text injected by the retriever for context |
| `getBundle()` | Bundle | Returns the compiled policy bundle |
| `getStatus()` | object | Returns runtime metrics (hook count, shard count, gate count, ledger events) |

### 6.4 Advanced Runtime (`src/guidance/advanced-runtime.js`)

Extends the Phase 1 runtime with trust scoring, adversarial defence,
cryptographic proof chains, conformance testing, and rule evolution.

**Architecture:**

```
Phase 1 Runtime
  +-- TrustSystem        -> Per-agent scoring with privilege tiers
  +-- ThreatDetector     -> Prompt injection detection
  +-- CollusionDetector  -> Ring-topology interaction analysis
  +-- MemoryQuorum       -> Voting-based writes for critical data
  +-- ProofChain         -> HMAC-SHA256 hash-chained decision envelopes
  +-- ConformanceRunner  -> Memory Clerk acceptance testing with replay
  +-- EvolutionPipeline  -> Propose -> Simulate -> Stage -> Rollout
```

**Key methods:**

| Method | Description |
|---|---|
| `initialize()` | Initialises Phase 1, restores persisted trust scores and proof chain from disk |
| `recordTrust(agentId, outcome, reason)` | Records a trust event (allow/warn/deny) for the given agent |
| `appendProof({ taskId, agentId, toolsUsed, violations, ... })` | Appends a decision envelope to the proof chain |
| `persistState(extra)` | Writes trust snapshots, threat history, and proof chain to disk |
| `getStatus()` | Returns metrics including trust agents, threat signals, proof chain length, evolution proposals |

**Integration runners** (available via the runtime instance):

| Method | Description |
|---|---|
| `runHooksIntegration()` | End-to-end test of the hook pipeline with safe and destructive commands |
| `runTrustIntegration()` | Records a sequence of outcomes and reports the trust tier |
| `runAdversarialIntegration()` | Tests injection detection, collusion detection, and memory quorum |
| `runProofIntegration()` | Appends proof envelopes and verifies chain integrity |
| `runConformanceIntegration()` | Runs Memory Clerk acceptance tests with replay verification |
| `runEvolutionIntegration()` | Full evolution pipeline: propose, simulate, compare, stage, advance |
| `runAllIntegrations()` | Runs all six integration runners and returns a combined report |

### 6.5 Event Handlers (`src/cli/event-handlers.js`)

Implements the full event processing pipeline for guidance events
dispatched from the hook handler. Each event type follows the same
pattern:

1. Evaluate the action through Phase 1 gates.
2. Run adversarial threat detection (for `pre-command`).
3. Record the trust outcome.
4. Append a proof envelope.
5. Persist state.
6. Return a structured summary with the block/allow decision.

Supported events: `pre-command`, `pre-edit`, `pre-task`, `post-task`,
`post-edit`, `session-end`.

### 6.6 Codex Bridge (`src/cli/guidance-codex-bridge.js`)

Adapts Codex lifecycle events to the hook handler protocol. Accepts
command-line arguments, constructs the stdin JSON that the hook handler
expects, spawns `hook-handler.cjs` via `spawnSync`, and optionally
forwards to `@claude-flow/cli` hooks for telemetry.

### 6.7 Autopilot (`src/cli/guidance-autopilot.js`)

Continuously or one-shot optimises `CLAUDE.md` rules by:

1. Analysing the current CLAUDE.md with the guidance analyzer.
2. Identifying local rules in `CLAUDE.local.md` that score higher.
3. Promoting winning local rules into `CLAUDE.md`.
4. Optionally running A/B benchmarks to validate the promotion.

**Modes:**

| Flag | Behaviour |
|---|---|
| `--once` | Run one optimisation cycle and exit |
| `--daemon` | Run on a timer (default: 30 minutes) |
| `--apply` | Apply promotions to CLAUDE.md (without this flag, dry-run only) |
| `--ab` | Run A/B benchmark before promoting |

**Environment variables:**

| Variable | Default | Description |
|---|---|---|
| `GUIDANCE_AUTOPILOT_ENABLED` | `1` | Set to `0` to disable autopilot globally |
| `GUIDANCE_AUTOPILOT_MIN_DELTA` | `0.5` | Minimum score improvement to trigger promotion |
| `GUIDANCE_AUTOPILOT_AB` | `0` | Set to `1` to enable A/B benchmarking before promotion |
| `GUIDANCE_AUTOPILOT_MIN_AB_GAIN` | `0.05` | Minimum A/B composite gain to proceed |

### 6.8 Analyzer (`src/cli/analyze-guidance.js`)

Compiles `CLAUDE.md` into a policy bundle and scores it across six
dimensions:

| Dimension | What It Measures |
|---|---|
| Structure | Heading hierarchy, section organisation |
| Coverage | Breadth of topics covered (security, testing, deployment, etc.) |
| Enforceability | Ratio of rules with clear MUST/NEVER/ALWAYS enforcement language |
| Compilability | Successful compilation into typed policy bundles |
| Clarity | Readability and conciseness of rule text |
| Completeness | Presence of all recommended sections |

Run with `--optimize` to auto-improve the CLAUDE.md score.

### 6.9 A/B Benchmark (`src/cli/guidance-ab-benchmark.js`)

Runs controlled comparisons using a synthetic content-aware executor:

1. **Config A (Baseline):** Executes 20 tasks with no guidance context.
2. **Config B (Guided):** Executes the same 20 tasks with the compiled
   CLAUDE.md injected as context.
3. Measures success rate, violations, interventions, and cost.
4. Reports a composite score delta and category shift.

The synthetic executor does not call an LLM. It simulates agent
behaviour based on the enforcement strength of the CLAUDE.md content
(counting MUST/NEVER/ALWAYS terms) to produce deterministic,
reproducible benchmarks.

### 6.10 Scaffold (`src/cli/scaffold-guidance.js`)

Generates a recommended `CLAUDE.md` from your project's `package.json`.
Detects frameworks, build commands, test commands, and produces a
structured guidance file with best-practice rules.

```bash
npx cf-guidance-scaffold --output ./scaffolded
```

### 6.11 Default Settings (`src/default-settings.mjs`)

Exports the default hook definitions, environment variables, npm
scripts, and dependency declarations that the installer merges into the
target repository. These values are the source of truth for what the
installer writes.

### 6.12 Content-Aware Executor (`src/guidance/content-aware-executor.js`)

A lightweight synthetic executor used by the A/B benchmark. It does not
call any LLM. Instead, it counts enforcement terms in the CLAUDE.md to
determine guidance strength and produces prompt-sensitive output
snippets that simulate guided vs. unguided agent behaviour.

---

## 7. How the Hook Integration Works

### 7.1 The Request Path

When Claude Code is about to execute a tool (shell command, file edit,
or task), the following sequence runs:

```
Claude Code
  |
  +- PreToolUse event fires
  |
  +- Claude Code reads .claude/settings.json
  |  +- Finds hook: node .claude/helpers/hook-handler.cjs pre-bash
  |
  +- Spawns hook-handler.cjs synchronously (spawnSync)
  |  +- Receives { tool_input: { command: "..." } } on stdin
  |  |
  |  +- hook-handler.cjs dispatches to handlePreBash()
  |  |  +- Calls guidance-integrations.js event pre-command synchronously
  |  |  |  +- Initialises GuidanceAdvancedRuntime
  |  |  |  +- Compiles CLAUDE.md -> policy bundle
  |  |  |  +- Evaluates command through 4 enforcement gates
  |  |  |  +- Runs adversarial threat detection
  |  |  |  +- Records trust outcome
  |  |  |  +- Appends proof envelope
  |  |  |  +- Returns { blocked: true/false }
  |  |  |
  |  |  +- Checks local dangerous-pattern regex list
  |  |  +- If blocked -> stderr "[BLOCKED]", exit(1)
  |  |
  |  +- exit(0) if allowed
  |
  +- Claude Code proceeds with (or aborts) the tool use
```

### 7.2 Blocking vs. Async Hooks

**Blocking hooks** (`pre-bash`, `pre-edit`, `pre-task`) use `spawnSync`
to call the guidance event handler. The hook handler waits for the
result and returns exit code 1 to block or 0 to allow. Claude Code
honours the exit code and aborts the tool use if it is non-zero.

**Async hooks** (`post-edit`, `post-task`, `session-end`) use `spawn`
with `detached: true` and `stdio: 'ignore'`. The child process runs in
the background and the hook handler returns immediately with exit code
0. This ensures post-action recording does not slow down the agent.

### 7.3 The Hook Handler Dispatch Table

The hook handler uses a flat dispatch table:

```javascript
const handlers = {
  'route':           handleRoute,
  'pre-bash':        handlePreBash,
  'pre-edit':        handlePreEdit,
  'post-edit':       handlePostEdit,
  'session-restore': handleSessionRestore,
  'session-end':     handleSessionEnd,
  'pre-task':        handlePreTask,
  'post-task':       handlePostTask,
  'compact-manual':  handleCompactManual,
  'compact-auto':    handleCompactAuto,
  'status':          handleStatus,
  'stats':           handleStats,
};
```

Each handler function is self-contained and accesses shared utilities
(stdin parsing, guidance event dispatch, task cache) through module-level
functions.

### 7.4 Task Context Persistence

The hook handler maintains a task cache at
`.claude-flow/guidance/hook-task-cache.json`. When `pre-task` fires, it
writes the task ID and description. When `post-task` fires (often
without the original description), it reads back the cached context to
correlate the completion with the original task. This is necessary
because Claude Code does not pass the task description in the
`PostToolUse` event.

---

## 8. Environment Variables

| Variable | Default | Description |
|---|---|---|
| `GUIDANCE_EVENT_WIRING_ENABLED` | `1` | Set to `0` to disable all guidance event wiring |
| `GUIDANCE_EVENT_SYNC_TIMEOUT_MS` | `8000` | Timeout for blocking guidance calls (milliseconds) |
| `GUIDANCE_EVENT_FAIL_CLOSED` | `0` | Set to `1` to block actions when guidance calls fail (fail-closed mode) |
| `GUIDANCE_PROOF_KEY` | *(dev key)* | HMAC signing key for proof chain envelopes. Set in production. |
| `GUIDANCE_AUTOPILOT_ENABLED` | `1` | Set to `0` to disable autopilot at session end |
| `GUIDANCE_AUTOPILOT_MIN_DELTA` | `0.5` | Minimum score improvement to trigger rule promotion |
| `GUIDANCE_AUTOPILOT_AB` | `0` | Set to `1` to enable A/B benchmarking before promotion |
| `GUIDANCE_AUTOPILOT_MIN_AB_GAIN` | `0.05` | Minimum A/B composite gain to proceed with promotion |
| `GUIDANCE_CODEX_SKIP_CF_HOOKS` | `0` | Set to `1` to skip secondary `@claude-flow/cli` hook calls in Codex bridge |
| `GUIDANCE_PROJECT_DIR` | *(cwd)* | Override the project root directory for CLI scripts |
| `CLAUDE_PROJECT_DIR` | *(cwd)* | Fallback project root directory (set by Claude Code) |
| `CLAUDE_SESSION_ID` | *(auto)* | Session identifier |
| `CLAUDE_AGENT_ID` | `claude-main` | Agent identifier for trust scoring |

---

## 9. CLI Reference

### Installer CLI (`cf-guidance-impl`)

```bash
# Full initialisation (recommended)
cf-guidance-impl init \
  --target <path> \
  [--target-mode both|claude|codex] \
  [--force] \
  [--install-deps] \
  [--no-dual] \
  [--skip-cf-init] \
  [--no-verify] \
  [--fail-closed] \
  [--hook-timeout <ms>] \
  [--event-timeout <ms>] \
  [--generate-key] \
  [--no-autopilot] \
  [--dry-run]

# Install without running @claude-flow/cli init
cf-guidance-impl install \
  --target <path> \
  [--target-mode both|claude|codex] \
  [--force] \
  [--install-deps] \
  [--fail-closed] \
  [--hook-timeout <ms>] \
  [--event-timeout <ms>] \
  [--generate-key] \
  [--no-autopilot] \
  [--dry-run]

# Verify installation
cf-guidance-impl verify \
  --target <path> \
  [--target-mode both|claude|codex]
```

**Additional flags for `init` and `install`:**

| Flag | Description |
|---|---|
| `--fail-closed` | Set `GUIDANCE_EVENT_FAIL_CLOSED=1` in settings (block on hook failure). |
| `--hook-timeout <ms>` | Override the timeout on every hook definition (default: 5000 ms). |
| `--event-timeout <ms>` | Set `GUIDANCE_EVENT_SYNC_TIMEOUT_MS` in settings. |
| `--generate-key` | Generate a cryptographic signing key and set `GUIDANCE_PROOF_KEY`. |
| `--no-autopilot` | Set `GUIDANCE_AUTOPILOT_ENABLED=0` (disable autopilot). |
| `--dry-run` | Print a JSON report of what would be written, then exit without changes. |

### Guidance Runtime CLIs

| Command | Description |
|---|---|
| `cf-guidance status` | Print runtime status (initialised, hook count, shard count, gate count) |
| `cf-guidance hooks [taskDescription]` | Run hooks integration test |
| `cf-guidance trust` | Run trust integration test |
| `cf-guidance adversarial` | Run adversarial integration test |
| `cf-guidance proof` | Run proof chain integration test |
| `cf-guidance conformance` | Run conformance integration test |
| `cf-guidance evolution` | Run evolution pipeline integration test |
| `cf-guidance all` | Run all integration tests |
| `cf-guidance event <name> [json]` | Dispatch a single guidance event |
| `cf-guidance-runtime demo` | Run a demo sequence (pre-task, pre-command safe/destructive, post-task) |
| `cf-guidance-runtime status` | Print Phase 1 runtime status |
| `cf-guidance-runtime task "<desc>" [id]` | Evaluate a task through the runtime |
| `cf-guidance-runtime command "<cmd>"` | Evaluate a shell command through gates |
| `cf-guidance-runtime tool "<name>" [json]` | Evaluate a tool use through gates |
| `cf-guidance-runtime edit "<path>" [lines]` | Evaluate a file edit through gates |
| `cf-guidance-analyze` | Analyse and score CLAUDE.md |
| `cf-guidance-analyze --optimize` | Analyse, then auto-optimise CLAUDE.md |
| `cf-guidance-autopilot --once --apply` | One-shot rule promotion |
| `cf-guidance-autopilot --daemon --apply` | Daemon-mode rule promotion |
| `cf-guidance-benchmark` | Run A/B benchmark |
| `cf-guidance-scaffold` | Generate CLAUDE.md from package.json |
| `cf-guidance-codex <event> [options]` | Codex bridge (see Section 5) |

---

## 10. npm Scripts (Installed in Target Repo)

After running `cf-guidance-impl init`, the following scripts are
available in the target repository:

| Script | What It Runs |
|---|---|
| `npm run guidance:analyze` | Score CLAUDE.md across 6 dimensions |
| `npm run guidance:optimize` | One-shot rule optimisation with apply |
| `npm run guidance:autopilot:once` | One-shot autopilot (dry-run) |
| `npm run guidance:autopilot:daemon` | Daemon-mode autopilot |
| `npm run guidance:ab-benchmark` | A/B benchmark |
| `npm run guidance:scaffold` | Scaffold CLAUDE.md |
| `npm run guidance:status` | Runtime status |
| `npm run guidance:all` | Run all integration tests |
| `npm run guidance:hooks` | Hooks integration test |
| `npm run guidance:trust` | Trust integration test |
| `npm run guidance:adversarial` | Adversarial integration test |
| `npm run guidance:proof` | Proof chain integration test |
| `npm run guidance:conformance` | Conformance integration test |
| `npm run guidance:evolution` | Evolution pipeline integration test |
| `npm run guidance:runtime` | Runtime demo |
| `npm run guidance:codex:status` | Codex bridge status |
| `npm run guidance:codex:session-start` | Codex session start |
| `npm run guidance:codex:pre-command` | Codex pre-command |
| `npm run guidance:codex:pre-edit` | Codex pre-edit |
| `npm run guidance:codex:pre-task` | Codex pre-task |
| `npm run guidance:codex:post-edit` | Codex post-edit |
| `npm run guidance:codex:post-task` | Codex post-task |
| `npm run guidance:codex:session-end` | Codex session end |

---

## 11. Programmatic API

The package exports several entry points for use in your own code:

```javascript
// Full installer API
import { initRepo, installIntoRepo, verifyRepo } from 'claude-flow-guidance-implementation/installer';

// Default settings (hooks, env, scripts, deps)
import {
  GUIDANCE_ENV_DEFAULTS,
  GUIDANCE_HOOKS_DEFAULTS,
  GUIDANCE_PACKAGE_SCRIPTS,
  GUIDANCE_PACKAGE_DEPS,
} from 'claude-flow-guidance-implementation/settings';

// Phase 1 runtime (compile -> retrieve -> gates -> ledger)
import { createGuidancePhase1Runtime } from 'claude-flow-guidance-implementation/phase1';

// Advanced runtime (trust + adversarial + proof + conformance + evolution)
import { createGuidanceAdvancedRuntime } from 'claude-flow-guidance-implementation/runtime';

// Synthetic executor for benchmarks
import { createSyntheticContentAwareExecutor } from 'claude-flow-guidance-implementation/executor';
```

### Example: Evaluating a Command Programmatically

```javascript
import { createGuidancePhase1Runtime } from 'claude-flow-guidance-implementation/phase1';

const runtime = createGuidancePhase1Runtime({
  rootDir: '/path/to/project',
});
await runtime.initialize();

const result = await runtime.preCommand('git push --force origin main');
if (runtime.isBlocked(result)) {
  console.log('Command blocked by guidance policy');
} else {
  console.log('Command allowed');
}
```

### Example: Running the Full Integration Suite

```javascript
import { createGuidanceAdvancedRuntime } from 'claude-flow-guidance-implementation/runtime';

const runtime = createGuidanceAdvancedRuntime({
  rootDir: '/path/to/project',
  signingKey: process.env.GUIDANCE_PROOF_KEY,
});

const report = await runtime.runAllIntegrations();
console.log(JSON.stringify(report, null, 2));
```

---

## 12. File Layout

After installation, your target repository contains:

```
my-project/
+-- .claude/
|   +-- helpers/
|   |   +-- hook-handler.cjs        <- Thin shim (delegates to npm package)
|   +-- settings.json               <- Hook definitions + env vars
+-- .agents/
|   +-- config.toml                 <- Codex bridge configuration (if Codex mode)
+-- .claude-flow/
|   +-- guidance/
|       +-- advanced/
|       |   +-- advanced-state.json  <- Persisted trust + threat state
|       |   +-- proof-chain.json     <- Proof chain envelopes
|       +-- hook-task-cache.json     <- Task context correlation cache
+-- CLAUDE.md                        <- Shared team guidance (committed)
+-- CLAUDE.local.md                  <- Local experiments (gitignored)
+-- AGENTS.md                        <- Codex agent documentation (if Codex mode)
+-- package.json                     <- Guidance scripts + dependencies merged
```

---

## 13. Troubleshooting

### Hook handler exits with "Missing required guidance file"

Your project does not have a `CLAUDE.md` file. Create one manually or
run `npx cf-guidance-scaffold` to generate one from your `package.json`.

### Verification fails on "dependency:claude-flow-guidance-implementation"

Run `npm install` in your target repository. The installer adds the
dependency to `package.json` but only runs `npm install` when you pass
`--install-deps`.

### Blocking hooks are too slow

The default sync timeout is 8000 ms. Lower it with:

```bash
export GUIDANCE_EVENT_SYNC_TIMEOUT_MS=3000
```

Or set it in `.claude/settings.json` under `env`.

### Hook blocks a command that should be allowed

1. Check which gate blocked it:
   ```bash
   npx cf-guidance-runtime command "your command here"
   ```
2. Review your CLAUDE.md rules for overly broad patterns.
3. Temporarily disable guidance wiring:
   ```bash
   export GUIDANCE_EVENT_WIRING_ENABLED=0
   ```

### Proof chain file is corrupted

Delete `.claude-flow/guidance/advanced/proof-chain.json`. The runtime
starts a fresh chain on the next initialisation.

### "GUIDANCE_PROOF_KEY not set" warning

Set a production signing key:

```bash
export GUIDANCE_PROOF_KEY=$(openssl rand -hex 32)
```

Without this, the runtime uses an insecure development key. Proof chains
signed with the dev key should not be used for compliance purposes.

---

## 14. Security Considerations

- **Fail-open by default.** If the guidance control plane fails (crash,
  timeout, missing dependency), actions are allowed to proceed. Set
  `GUIDANCE_EVENT_FAIL_CLOSED=1` for fail-closed mode in production.
- **Proof chain signing.** Always set `GUIDANCE_PROOF_KEY` in
  production. Without it, anyone can forge proof envelopes.
- **CLAUDE.local.md is gitignored.** Local experiments are not shared
  with the team. The autopilot can promote winning local rules into the
  shared CLAUDE.md.
- **Credential scanning.** The secrets gate scans file content for API
  key, password, and credential patterns. It does not replace a
  dedicated secrets scanner like `gitleaks` or `trufflehog`.
- **Threat detection is heuristic.** The threat detector uses pattern
  matching, not ML. Sophisticated prompt injections may not be caught.
  Layer this with other security controls.

---

## Links

- Homepage: https://sparklingideas.co.uk/guidance/claude-flow
- Package: https://www.npmjs.com/package/claude-flow-guidance-implementation
- GitHub: https://github.com/sparkling/claude-flow-guidance-implementation
- Issues: https://github.com/sparkling/claude-flow-guidance-implementation/issues
