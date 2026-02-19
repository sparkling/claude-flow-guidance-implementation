# API Reference: claude-flow-guidance-implementation

**Package version:** 0.2.0
**License:** MIT
**Node.js requirement:** >=20
**Module system:** ESM (`"type": "module"`)

This document describes the public API surface of the
`claude-flow-guidance-implementation` package, including programmatic exports,
CLI binaries, hook-handler dispatch, and configuration constants.

---

## Table of contents

1. [Package exports](#package-exports)
2. [Installer (`./installer`)](#installer)
   - [initRepo](#initrepo)
   - [installIntoRepo](#installintorepo)
   - [verifyRepo](#verifyrepo)
3. [GuidancePhase1Runtime (`./phase1`)](#guidancephase1runtime)
4. [GuidanceAdvancedRuntime (`./runtime`)](#guidanceadvancedruntime)
5. [SyntheticContentAwareExecutor (`./executor`)](#syntheticcontentawareexecutor)
6. [Default settings (`./settings`)](#default-settings)
7. [Hook handler (`./hook-handler`)](#hook-handler)
8. [CLI binaries](#cli-binaries)
9. [Types](#types)
10. [Changelog](#changelog)

---

## Package exports

| Export path | Module | Format |
|---|---|---|
| `.` | `src/installer.mjs` | ESM |
| `./installer` | `src/installer.mjs` | ESM |
| `./settings` | `src/default-settings.mjs` | ESM |
| `./runtime` | `src/guidance/advanced-runtime.js` | ESM |
| `./phase1` | `src/guidance/phase1-runtime.js` | ESM |
| `./executor` | `src/guidance/content-aware-executor.js` | ESM |
| `./hook-handler` | `src/hook-handler.cjs` | CJS + ESM (dual) |

Import examples:

```js
// Default / installer
import { initRepo, installIntoRepo, verifyRepo } from 'claude-flow-guidance-implementation';

// Named sub-path imports
import { GuidancePhase1Runtime } from 'claude-flow-guidance-implementation/phase1';
import { GuidanceAdvancedRuntime } from 'claude-flow-guidance-implementation/runtime';
import { SyntheticContentAwareExecutor } from 'claude-flow-guidance-implementation/executor';
import { GUIDANCE_ENV_DEFAULTS } from 'claude-flow-guidance-implementation/settings';
```

---

## Installer

Imported from `claude-flow-guidance-implementation` or
`claude-flow-guidance-implementation/installer`.

### initRepo

Runs the full initialization sequence: optional `@claude-flow/cli init`, hook
wiring via `installIntoRepo`, and optional verification.

```js
initRepo(options: InitRepoOptions): InitRepoResult
```

**Parameters**

| Name | Type | Default | Description |
|---|---|---|---|
| `targetRepo` | `string` | *required* | Absolute or relative path to the target repository root. |
| `force` | `boolean` | `false` | Overwrite existing hook shims and npm scripts. |
| `installDeps` | `boolean` | `false` | Run `npm install` after updating `package.json`. |
| `targetMode` | `'both' \| 'claude' \| 'codex'` | `'both'` | Target platform. Controls which config files are written. |
| `dual` | `boolean` | `true` | Pass `--dual` to `@claude-flow/cli init` when `targetMode` is `'both'`. |
| `skipCfInit` | `boolean` | `false` | Skip the `npx @claude-flow/cli init` step. |
| `verify` | `boolean` | `true` | Run `verifyRepo` after installation. Throws on failure. |
| `components` | `string[]` | `undefined` | Explicit list of component names to install. Overrides `preset`. |
| `preset` | `'minimal' \| 'standard' \| 'full'` | `undefined` | Named preset. Defaults to `'full'` for programmatic API, `'standard'` for CLI. |
| `exclude` | `string[]` | `undefined` | Component names to exclude from the resolved set. |

**Returns** `InitRepoResult`

```js
{
  target: string,
  targetMode: 'both' | 'claude' | 'codex',
  claudeFlowInit: { skipped: boolean, command?: string, exitCode?: number, stdout?: string, stderr?: string },
  install: InstallResult,
  verify: VerifyResult | null,
}
```

**Throws** `Error` if `targetRepo` does not exist, if `@claude-flow/cli init`
fails, or if verification fails.

**Example**

```js
import { initRepo } from 'claude-flow-guidance-implementation';

const result = initRepo({
  targetRepo: '/path/to/my-project',
  targetMode: 'claude',
  installDeps: true,
});

console.log(result.install.settingsUpdated);
// "/path/to/my-project/.claude/settings.json"
```

### installIntoRepo

Writes hook shims, merges `package.json` scripts and dependencies, merges
`.claude/settings.json` hooks, and optionally appends Codex bridge
configuration. Does not run `@claude-flow/cli init`.

```js
installIntoRepo(options: InstallOptions): InstallResult
```

**Parameters**

| Name | Type | Default | Description |
|---|---|---|---|
| `targetRepo` | `string` | *required* | Path to the target repository root. |
| `force` | `boolean` | `false` | Overwrite existing shims and scripts. |
| `installDeps` | `boolean` | `false` | Run `npm install` after writing `package.json`. |
| `targetMode` | `'both' \| 'claude' \| 'codex'` | `'both'` | Target platform. |
| `components` | `string[]` | `undefined` | Explicit list of component names. Overrides `preset`. |
| `preset` | `'minimal' \| 'standard' \| 'full'` | `undefined` | Named preset. Defaults to `'full'` when called programmatically. |
| `exclude` | `string[]` | `undefined` | Component names to exclude from the resolved set. |

**Returns** `InstallResult`

```js
{
  target: string,
  targetMode: 'both' | 'claude' | 'codex',
  filesInstalled: string[],
  compatActions: Array<{ module: string, action: 'cjs->js' | 'js->cjs' }>,
  packageUpdated: string,
  settingsUpdated: string | null,
  agentsConfigUpdated: string | null,
  agentsDocUpdated: string | null,
  codexConfigAdded: boolean,
  codexAgentsDocAdded: boolean,
  installDeps: boolean,
  installExitCode?: number,
  installStdout?: string,
  installStderr?: string,
}
```

**Throws** `Error` if `targetRepo` does not exist or if `npm install` exits
non-zero.

### verifyRepo

Validates that all hook wiring, dependency declarations, helper compatibility
pairs, syntax checks, and smoke tests pass in the target repository.

```js
verifyRepo(options: VerifyOptions): VerifyResult
```

**Parameters**

| Name | Type | Default | Description |
|---|---|---|---|
| `targetRepo` | `string` | *required* | Path to the target repository root. |
| `targetMode` | `'both' \| 'claude' \| 'codex'` | `'both'` | Target platform. |

**Returns** `VerifyResult`

```js
{
  target: string,
  targetMode: 'both' | 'claude' | 'codex',
  passed: boolean,
  files: Array<{ path: string, exists: boolean }>,
  compatPairs: Array<{ module: string, cjs: boolean, js: boolean, hasBoth: boolean, hasEither: boolean }>,
  syntaxChecks: Array<{ path: string, ok: boolean, stderr?: string, reason?: string }>,
  smoke: { exitCode: number, stdout: string, stderr: string },
  smokeCodex: { exitCode: number, stdout: string, stderr: string },
}
```

---

## GuidancePhase1Runtime

Imported from `claude-flow-guidance-implementation/phase1`.

A lightweight policy enforcement runtime. Compiles CLAUDE.md into a rule
bundle, loads rules into gates, and executes hooks against incoming lifecycle
events. Suitable for real-time hook enforcement where latency matters.

### Constructor

```js
new GuidancePhase1Runtime(options?: Phase1Options)
```

| Option | Type | Default | Description |
|---|---|---|---|
| `rootDir` | `string` | `process.cwd()` | Repository root directory. |
| `rootGuidancePath` | `string` | `'CLAUDE.md'` | Path to the root guidance file, relative to `rootDir`. |
| `localGuidancePath` | `string` | `'CLAUDE.local.md'` | Path to the local guidance overlay, relative to `rootDir`. |
| `gateConfig` | `object` | `{}` | Configuration object passed to `@claude-flow/guidance` gate creation. |

### Factory

```js
createGuidancePhase1Runtime(options?: Phase1Options): GuidancePhase1Runtime
```

Returns a new `GuidancePhase1Runtime` instance. Equivalent to calling the
constructor directly.

### Methods

#### initialize

```js
async initialize(): Promise<void>
```

Reads and compiles CLAUDE.md (and CLAUDE.local.md if present), loads the
compiled bundle into the retriever, activates gate rules, and registers
guidance hooks. Must be called before any other method. Subsequent calls are
no-ops.

**Throws** `Error` if the root guidance file does not exist.

#### preTask

```js
async preTask(params: { taskId: string, taskDescription: string }): Promise<HookResult>
```

Evaluates pre-task policy gates. Call this before a task begins to check
whether guidance rules permit it.

#### postTask

```js
async postTask(params: {
  taskId: string,
  status?: string,
  toolsUsed?: string[],
  filesTouched?: string[],
}): Promise<HookResult>
```

Records a completed task through post-task hooks. The `status` parameter
defaults to `'completed'`.

#### preCommand

```js
async preCommand(command: string): Promise<HookResult>
```

Evaluates a shell command string against pre-command policy gates. Returns a
blocked result if the command violates any active rules.

#### preToolUse

```js
async preToolUse(toolName: string, parameters?: object): Promise<HookResult>
```

Evaluates a tool invocation against pre-tool-use policy gates.

#### preEdit

```js
async preEdit(params: {
  filePath: string,
  operation?: string,
  content?: string,
  diffLines?: number,
}): Promise<HookResult>
```

Evaluates a file edit against pre-edit policy gates. The `operation` parameter
defaults to `'modify'`.

#### isBlocked

```js
isBlocked(result: HookResult): boolean
```

Returns `true` if the given hook result indicates that the action was blocked
(either `success` is `false` or `aborted` is `true`).

#### extractPolicyText

```js
extractPolicyText(result: HookResult): string | null
```

Extracts the `policyText` string from the hook result metadata, if present.
Returns `null` when no policy text is available.

#### getBundle

```js
getBundle(): Bundle | null
```

Returns the compiled guidance bundle, or `null` if `initialize()` has not been
called.

#### getStatus

```js
getStatus(): Phase1Status
```

Returns a status snapshot.

```js
{
  initialized: boolean,
  hookCount: number,
  registryStats: object,
  shardCount: number,
  constitutionRuleCount: number,
  manifestRuleCount: number,
  activeGateCount: number,
  ledgerEventCount: number,
}
```

### Example

```js
import { createGuidancePhase1Runtime } from 'claude-flow-guidance-implementation/phase1';

const runtime = createGuidancePhase1Runtime({ rootDir: '/path/to/repo' });
await runtime.initialize();

const result = await runtime.preCommand('rm -rf /');
if (runtime.isBlocked(result)) {
  console.error('Command blocked:', runtime.extractPolicyText(result));
}
```

---

## GuidanceAdvancedRuntime

Imported from `claude-flow-guidance-implementation/runtime`.

An extended runtime that layers trust scoring, adversarial threat detection,
collusion detection, proof chains, conformance testing, and rule evolution on
top of `GuidancePhase1Runtime`. Designed for comprehensive integration suites
and continuous security analysis.

### Constructor

```js
new GuidanceAdvancedRuntime(options?: AdvancedOptions)
```

| Option | Type | Default | Description |
|---|---|---|---|
| `rootDir` | `string` | `process.cwd()` | Repository root directory. |
| `dataDir` | `string` | `'.claude-flow/guidance/advanced'` | Directory for persisted state and proof files, relative to `rootDir`. |
| `signingKey` | `string` | `process.env.GUIDANCE_PROOF_KEY` or `'local-guidance-dev-signing-key'` | Key used for proof chain signing. Set `GUIDANCE_PROOF_KEY` in production. |
| `authority` | `AuthorityConfig` | See below | Authority descriptor for conformance testing. |

Default `authority`:

```js
{
  agentId: 'guidance-orchestrator',
  role: 'coordinator',
  namespaces: ['clerk-workspace', 'guidance', 'security', 'tasks'],
  maxWritesPerMinute: 240,
  canDelete: true,
  canOverwrite: true,
  trustLevel: 0.9,
}
```

### Factory

```js
createGuidanceAdvancedRuntime(options?: AdvancedOptions): GuidanceAdvancedRuntime
```

### Methods

#### initialize

```js
async initialize(): Promise<void>
```

Creates the data directory, initializes the underlying Phase 1 runtime,
restores trust snapshots and proof chain from disk. Issues a console warning
when `GUIDANCE_PROOF_KEY` is not set. Subsequent calls are no-ops.

#### recordTrust

```js
recordTrust(agentId: string, outcome: string, reason: string): TrustRecord
```

Records a trust outcome for the given agent. Valid `outcome` values are
`'allow'`, `'warn'`, and `'deny'`. Returns the stored trust record.

#### appendProof

```js
appendProof(params: {
  taskId: string,
  agentId: string,
  toolsUsed?: string[],
  violations?: Violation[],
  intent?: string,
  outcomeAccepted?: boolean,
  durationMs?: number,
  memoryOps?: MemoryOp[],
  details?: object,
}): ProofEnvelope
```

Appends a signed proof envelope to the proof chain. The envelope captures task
execution metadata including tools invoked, violations detected, and memory
operations performed. Returns the created `ProofEnvelope`.

#### persistState

```js
persistState(extra?: object): void
```

Writes trust snapshots, trust records, threat history, and proof chain data to
disk. Accepts an optional `extra` object that is merged into the persisted
state file.

#### getGuidanceHash

```js
getGuidanceHash(): string
```

Returns the SHA hash of the compiled CLAUDE.md constitution, or
`'unknown-guidance-hash'` if not yet initialized.

#### getStatus

```js
getStatus(): AdvancedStatus
```

Returns a status snapshot.

```js
{
  initialized: boolean,
  guidanceHash: string,
  trustAgents: number,
  threatSignals: number,
  proofChainLength: number,
  evolutionProposals: number,
  statePath: string,
  proofPath: string,
}
```

#### Integration runners

Each integration runner initializes the runtime (if needed), exercises a
specific subsystem, records a proof envelope, persists state, and returns a
summary object.

| Method | Parameters | Description |
|---|---|---|
| `runHooksIntegration(options?)` | `{ taskDescription?, taskId?, agentId? }` | Exercises the Phase 1 hook pipeline with safe and destructive commands. |
| `runTrustIntegration(options?)` | `{ agentId?, baseRateLimit? }` | Records a sequence of trust outcomes and reports the resulting score and tier. |
| `runAdversarialIntegration()` | None | Runs threat detection, collusion detection, and memory quorum exercises. |
| `runProofIntegration()` | None | Appends proof envelopes, verifies chain integrity, and tests export/import. |
| `runConformanceIntegration()` | None | Runs conformance tests and replay verification against the authority config. |
| `runEvolutionIntegration()` | None | Proposes a rule change, simulates it against golden traces, and stages a rollout. |
| `runAllIntegrations()` | None | Runs all six integrations in sequence and returns a combined report. |

All runners return `Promise<Summary>` where `Summary` is an object whose
`integration` field identifies the subsystem.

### Example

```js
import { createGuidanceAdvancedRuntime } from 'claude-flow-guidance-implementation/runtime';

const runtime = createGuidanceAdvancedRuntime({
  rootDir: '/path/to/repo',
  signingKey: process.env.GUIDANCE_PROOF_KEY,
});

await runtime.initialize();

runtime.recordTrust('agent-1', 'allow', 'Passed all gates');
runtime.recordTrust('agent-1', 'deny', 'Attempted destructive command');

const envelope = runtime.appendProof({
  taskId: 'task-001',
  agentId: 'agent-1',
  toolsUsed: ['Bash', 'Edit'],
  violations: [],
  outcomeAccepted: true,
  durationMs: 1200,
});

runtime.persistState();
console.log(runtime.getStatus());
```

---

## SyntheticContentAwareExecutor

Imported from `claude-flow-guidance-implementation/executor`.

A lightweight in-process executor that produces behavior differences between
guided and unguided modes without requiring external process execution. Used
by the A/B benchmarking CLI to measure the impact of CLAUDE.md enforcement.

### Constructor

```js
new SyntheticContentAwareExecutor()
```

No parameters. Creates an executor with empty context and zero guidance
strength.

### Factory

```js
createSyntheticContentAwareExecutor(): SyntheticContentAwareExecutor
```

### Methods

#### setContext

```js
setContext(claudeMdContent: string): void
```

Sets the CLAUDE.md content and calculates guidance strength. Strength is
determined by counting enforcement terms (`NEVER`, `ALWAYS`, `MUST`) in the
content. When guidance strength is zero, `execute` produces minimal baseline
output.

#### execute

```js
async execute(prompt: string): Promise<ExecutionResult>
```

Produces guided or unguided output depending on the current guidance strength.

**Returns** `ExecutionResult`

```js
{
  stdout: string,
  stderr: string,   // Always empty string
  exitCode: number, // Always 0
}
```

When guidance strength is greater than zero, the output includes task-specific
implementation guidance (validation, testing, security, caching, rate
limiting). When guidance strength is zero, the output contains only a brief
working note.

---

## Default settings

Imported from `claude-flow-guidance-implementation/settings`.

### GUIDANCE_ENV_DEFAULTS

Environment variable defaults written to `.claude/settings.json` during
installation.

```js
{
  CLAUDE_FLOW_HOOKS_ENABLED: 'true',
  GUIDANCE_EVENT_WIRING_ENABLED: '1',
  GUIDANCE_EVENT_SYNC_TIMEOUT_MS: '8000',
  GUIDANCE_EVENT_FAIL_CLOSED: '0',
}
```

### GUIDANCE_HOOKS_DEFAULTS

Hook block definitions merged into `.claude/settings.json`. Defines hook
commands for the following events:

| Event | Matcher | Hook command |
|---|---|---|
| `PreToolUse` | `Write\|Edit\|MultiEdit` | `hook-handler.cjs pre-edit` |
| `PreToolUse` | `Bash` | `hook-handler.cjs pre-bash` |
| `PreToolUse` | `Task` | `hook-handler.cjs pre-task` |
| `PostToolUse` | `Write\|Edit\|MultiEdit` | `hook-handler.cjs post-edit` |
| `PostToolUse` | `Task` | `hook-handler.cjs post-task` |
| `SessionStart` | (all) | `hook-handler.cjs session-restore` |
| `SessionEnd` | (all) | `hook-handler.cjs session-end` |

All hooks use a 5000 ms timeout.

### GUIDANCE_PACKAGE_SCRIPTS

npm scripts added to the target repository's `package.json`. Includes
scripts for analysis, optimization, autopilot, benchmarking, scaffolding,
integration suite commands, and Codex bridge lifecycle commands.

### GUIDANCE_COMPONENTS

Map of component name to metadata. Each entry has:

| Field | Type | Description |
|---|---|---|
| `label` | `string` | Human-readable component name. |
| `description` | `string` | Short description of what the component provides. |
| `scripts` | `string[]` | npm script names owned by this component. |
| `runtimeSubsystems` | `string[]` | Runtime subsystem property names gated by this component. |

8 components: `trust`, `adversarial`, `proof`, `conformance`, `evolution`,
`autopilot`, `analysis`, `codex`.

### GUIDANCE_CORE_SCRIPTS

Array of npm script names that are always installed regardless of component
selection: `guidance:status`, `guidance:all`, `guidance:hooks`,
`guidance:runtime`.

### GUIDANCE_PRESETS

Map of preset name to component name array:

| Preset | Components |
|---|---|
| `minimal` | *(none)* |
| `standard` | `trust`, `proof`, `analysis` |
| `full` | All 8 components |

### resolveComponents

```js
resolveComponents(options?: { components?: string[], exclude?: string[], preset?: string }): string[]
```

Resolves a final list of enabled component names. When `components` is
provided, it overrides the preset. Otherwise the `preset` is used (default:
`'standard'`). The `exclude` array removes names from the resolved set.
Returns a sorted array. Throws on unknown component or preset names.

### GUIDANCE_PACKAGE_DEPS

Dependencies added to the target repository's `package.json`:

```js
{
  'claude-flow-guidance-implementation': '^0.2.0',
}
```

---

## Hook handler

Imported from `claude-flow-guidance-implementation/hook-handler`.

A CommonJS dispatcher that Claude Code and the Codex bridge invoke as a
subprocess. It reads JSON from stdin (the `tool_input` payload provided by
Claude Code hooks), resolves the command from `process.argv[2]`, and
dispatches to the appropriate handler.

### Supported commands

| Command | Behavior |
|---|---|
| `route` | Routes the prompt to an agent via the intelligence and router helpers. |
| `pre-bash` | Validates a shell command against guidance gates and dangerous-pattern rules. Exits `1` if blocked. |
| `pre-edit` | Validates a file edit against guidance gates. Exits `1` if blocked. |
| `post-edit` | Records the edit in session metrics and intelligence, fires async guidance event. |
| `pre-task` | Validates a task against guidance gates, records task context, routes to an agent. Exits `1` if blocked. |
| `post-task` | Records task completion, fires async guidance event. |
| `session-restore` | Restores or starts a session, initializes the intelligence module. |
| `session-end` | Consolidates intelligence, ends the session, fires async guidance event, launches autopilot. |
| `compact-manual` | Prints guidance context for manual compact operations. |
| `compact-auto` | Prints guidance context for automatic compact operations. |
| `status` | Prints a status confirmation. |
| `stats` | Prints intelligence statistics. Pass `--json` for JSON output. |

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `GUIDANCE_EVENT_WIRING_ENABLED` | `'1'` | Set to `'0'` to disable guidance event dispatch. |
| `GUIDANCE_EVENT_SYNC_TIMEOUT_MS` | `'8000'` | Timeout for synchronous guidance event calls. |
| `GUIDANCE_EVENT_FAIL_CLOSED` | `'0'` | Set to `'1'` to block actions when guidance events fail. |
| `GUIDANCE_AUTOPILOT_ENABLED` | (unset) | Set to `'0'` to disable autopilot launch on session-end. |
| `CLAUDE_PROJECT_DIR` | `process.cwd()` | Project directory used to resolve script paths. |
| `CLAUDE_SESSION_ID` | (generated) | Explicit session ID override. |
| `CLAUDE_AGENT_ID` | `'claude-main'` | Explicit agent ID override. |
| `__GUIDANCE_HELPERS_DIR` | `__dirname` | Directory containing helper modules (router, session, intelligence). |

---

## CLI binaries

All binaries are installed into `node_modules/.bin` when the package is added
as a dependency.

| Binary | Script | Description |
|---|---|---|
| `cf-guidance-impl` | `bin/cf-guidance-impl.mjs` | Init, install, or verify guidance wiring in a target repository. |
| `cf-guidance` | `src/cli/guidance-integrations.js` | Run integration suites (status, hooks, trust, adversarial, proof, conformance, evolution, all). |
| `cf-guidance-runtime` | `src/cli/guidance-runtime.js` | Demo the advanced guidance runtime. |
| `cf-guidance-autopilot` | `src/cli/guidance-autopilot.js` | One-shot or daemon-mode CLAUDE.md rule optimization. |
| `cf-guidance-benchmark` | `src/cli/guidance-ab-benchmark.js` | A/B benchmark comparing baseline and guided execution. |
| `cf-guidance-codex` | `src/cli/guidance-codex-bridge.js` | Codex lifecycle bridge (status, pre-command, pre-edit, pre-task, post-edit, post-task, session-start, session-end). |
| `cf-guidance-analyze` | `src/cli/analyze-guidance.js` | Compile and score a CLAUDE.md policy bundle across 6 dimensions. |
| `cf-guidance-scaffold` | `src/cli/scaffold-guidance.js` | Scaffold guidance files into a new project. |

### cf-guidance-impl

```
cf-guidance-impl init --target <path> [options]
cf-guidance-impl install --target <path> [options]
cf-guidance-impl verify --target <path> [options]
```

**Options**

| Flag | Description |
|---|---|
| `--target <path>` | Target repository path. Defaults to the current directory. |
| `--target-mode both\|claude\|codex` | Platform target. Default: `both`. |
| `--force` | Overwrite existing files. |
| `--install-deps` | Run `npm install` after updating `package.json`. |
| `--no-dual` | Skip `--dual` flag on `@claude-flow/cli init`. |
| `--skip-cf-init` | Skip the `@claude-flow/cli init` step entirely. |
| `--no-verify` | Skip post-install verification. |

The `verify` subcommand exits with code `0` on success and code `2` on
failure.

---

## Types

The following type definitions describe the shapes used throughout the API.
The package does not ship TypeScript declaration files; these definitions are
provided for documentation purposes.

### HookResult

```ts
interface HookResult {
  success: boolean;
  aborted?: boolean;
  hooksExecuted: number;
  hooksFailed: number;
  messages?: string[];
  warnings?: string[];
  finalContext?: {
    metadata?: {
      policyText?: string;
    };
  };
}
```

### ProofEnvelope

```ts
interface ProofEnvelope {
  envelopeId: string;
  contentHash: string;
  // Additional fields defined by @claude-flow/guidance/proof
}
```

### Violation

```ts
interface Violation {
  ruleId: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  autoCorrected: boolean;
}
```

### MemoryOp

```ts
interface MemoryOp {
  key: string;
  namespace: string;
  operation: 'read' | 'write' | 'delete';
  valueHash: string;
  timestamp: number;
}
```

### ExecutionResult

```ts
interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}
```

---

## Dependencies

### Runtime dependencies

| Package | Version |
|---|---|
| `@claude-flow/guidance` | `^3.0.0-alpha.1` |
| `@claude-flow/hooks` | `^3.0.0-alpha.7` |

### Development dependencies

| Package | Version |
|---|---|
| `vitest` | `^4.0.18` |
| `@vitest/coverage-v8` | `^4.0.18` |

---

## Changelog

### 0.2.0 (2025-06-19)

Initial public release.

**Features**

- One-command installer (`cf-guidance-impl init`) that scaffolds hook-handler
  shims, merges `.claude/settings.json` hooks, injects Codex `config.toml`
  bridge entries, and adds npm scripts. Supports targeting Claude Code, Codex,
  or both platforms via `--target-mode`.
- Hook-handler dispatch (`.claude/helpers/hook-handler.cjs`) routing Claude
  Code lifecycle events (`pre-bash`, `pre-edit`, `post-edit`, `pre-task`,
  `post-task`, `session-restore`, `session-end`) through the
  `@claude-flow/guidance` control plane for policy enforcement, intelligent
  routing, session persistence, and neural learning.
- Codex bridge (`guidance-codex-bridge.js`) mapping Codex lifecycle events to
  the same hook-handler for equivalent guidance enforcement without Claude
  Code's native hook system.
- `GuidancePhase1Runtime` providing lightweight, low-latency policy
  enforcement via compiled CLAUDE.md rule bundles, retriever, gates, and
  ledger.
- `GuidanceAdvancedRuntime` layering trust scoring, adversarial threat
  detection, collusion detection, proof chains, conformance testing, and rule
  evolution on top of Phase 1.
- `SyntheticContentAwareExecutor` for in-process A/B benchmarking without
  external process execution.
- Six integration runners (hooks, trust, adversarial, proof, conformance,
  evolution) accessible individually or as a combined suite via
  `runAllIntegrations()`.
- Autopilot (`cf-guidance-autopilot`) for one-shot or daemon-mode CLAUDE.md
  rule optimization with A/B benchmarking support.
- Policy analyzer (`cf-guidance-analyze`) compiling CLAUDE.md into a policy
  bundle and scoring it across 6 dimensions.
- Project scaffolding (`cf-guidance-scaffold`) for bootstrapping guidance
  files in new repositories.
- Verification (`cf-guidance-impl verify`) validating hook wiring, dependency
  declarations, helper compatibility pairs, syntax checks, and smoke tests.
- Helper module compatibility layer automatically generating `.cjs`/`.js`
  pairs for router, session, memory, and statusline modules.
- Default settings export (`./settings`) providing environment variable
  defaults, hook block definitions, npm scripts, and dependency declarations.
