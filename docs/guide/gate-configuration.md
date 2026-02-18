# Gate configuration reference

This page describes the enforcement gates provided by the
`@claude-flow/guidance` package and how to configure them in the
`claude-flow-guidance-implementation` runtime.

## Overview

Enforcement gates are programmatic checkpoints that evaluate agent actions
before they execute. Each gate inspects a specific dimension of the action
(destructiveness, tool identity, change size, or secret exposure) and returns a
decision: **allow**, **warn**, **require-confirmation**, or **block**.

Gates are created by `createGates(gateConfig)` from
`@claude-flow/guidance/gates`. The `GuidancePhase1Runtime` constructor
instantiates them at
[`src/guidance/phase1-runtime.js:37`](../../src/guidance/phase1-runtime.js):

```javascript
this.gates = createGates(this.options.gateConfig);
```

After the runtime compiles the CLAUDE.md policy bundle, it activates rule
matching on the gates:

```javascript
const rules = [
  ...this.bundle.constitution.rules,
  ...this.bundle.shards.map((entry) => entry.rule),
];
this.gates.setActiveRules(rules);
```

## Passing gate configuration

Supply gate overrides through the `gateConfig` property when you create the
Phase 1 runtime:

```javascript
import { createGuidancePhase1Runtime } from './guidance/phase1-runtime.js';

const runtime = createGuidancePhase1Runtime({
  rootDir: '/path/to/project',
  gateConfig: {
    destructiveOps: true,
    toolAllowlist: true,
    diffSize: true,
    secrets: true,
    diffSizeThreshold: 200,
    allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
  },
});

await runtime.initialize();
```

Any field you omit uses the default value described in
[GateConfig fields](#gateconfig-fields).

## GateConfig fields

| Field | Type | Default | Description |
|---|---|---|---|
| `destructiveOps` | `boolean` | `true` | Enable the destructive operations gate. |
| `toolAllowlist` | `boolean` | `false` | Enable the tool allowlist gate. |
| `diffSize` | `boolean` | `true` | Enable the diff size gate. |
| `secrets` | `boolean` | `true` | Enable the secrets detection gate. |
| `diffSizeThreshold` | `number` | `300` | Line count above which the diff size gate fires. |
| `allowedTools` | `string[]` | `[]` | Tool names permitted when the allowlist gate is enabled. Supports trailing wildcards (`mcp__*`). An empty array with `toolAllowlist: false` disables the gate entirely. |
| `secretPatterns` | `RegExp[]` | See [defaults](#default-secret-patterns) | Regular expressions matched against file content and command text. |
| `destructivePatterns` | `RegExp[]` | See [defaults](#default-destructive-patterns) | Regular expressions matched against shell commands. |

## The four enforcement gates

### Gate 1: Destructive operations

**Purpose.** Block commands that could cause irreversible damage to the
filesystem, database, or version control history.

**Evaluation entry point.** `preCommand(command)` routes commands through this
gate.

**Decision on match.** `require-confirmation` -- the action is not silently
blocked, but the agent must provide explicit confirmation and a documented
rollback plan before the runtime allows execution.

**Default destructive patterns:**

| Pattern | Matches |
|---|---|
| `rm -rf` | Recursive forced deletion |
| `drop database\|table\|schema\|index` | SQL object destruction |
| `truncate table` | SQL table truncation |
| `git push --force` | Force-push to remote |
| `git reset --hard` | Hard reset of working tree |
| `git clean -f` | Removal of untracked files |
| `format [drive]:` | Disk formatting (Windows) |
| `del /s` or `del /f` | Recursive or forced file deletion (Windows) |
| `kubectl delete --all\|namespace` | Kubernetes resource deletion |
| `DELETE FROM table` (bare, no WHERE) | Unrestricted SQL delete |
| `ALTER TABLE ... DROP` | Column or constraint removal |

**Local fallback.** The hook handler at `src/hook-handler.cjs:275-283`
maintains a secondary regex list that runs even when the guidance event wiring
is disabled:

```javascript
const dangerousPatterns = [
  /rm\s+-rf\s+\//,
  /format\s+c:/i,
  /del\s+\/s\s+\/q\s+c:\\/i,
  /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, // fork bomb
];
```

This fallback catches the most critical patterns (including fork bombs) as a
last line of defense when upstream evaluation is unavailable.

**Example -- blocked command:**

```
$ rm -rf /var/data
[BLOCKED] Destructive operation detected: "rm -rf". Requires explicit
confirmation and a rollback plan before proceeding.
```

**Example -- allowed command:**

```
$ rm build/cache/*.tmp
[OK] Command validated
```

### Gate 2: Tool allowlist

**Purpose.** Restrict which tools an agent can invoke. Useful in production
environments where agents should only use a curated set of capabilities.

**Evaluation entry point.** `preToolUse(toolName, parameters)` routes tool
invocations through this gate.

**Decision on match.** `block` -- the tool call is rejected outright.

**Enabled by default.** No. Set `toolAllowlist: true` and provide a non-empty
`allowedTools` array to activate this gate.

**Wildcard support.** Entries ending with `*` match any tool name that starts
with the prefix. For example, `mcp__claude-flow__*` permits all MCP tools in
the `claude-flow` namespace.

**Configuration example:**

```javascript
gateConfig: {
  toolAllowlist: true,
  allowedTools: [
    'Read',
    'Write',
    'Edit',
    'Bash',
    'Glob',
    'Grep',
    'WebFetch',
    'mcp__claude-flow__*',
  ],
}
```

**Example -- blocked tool:**

```
Tool "DatabaseDrop" is not in the allowlist.
Request permission before using this tool.
```

**Example -- allowed tool:**

```
Tool "Edit" matched allowlist entry "Edit". Proceeding.
```

### Gate 3: Diff size

**Purpose.** Prevent large, unreviewed changes from landing in a single edit.
When a diff exceeds the configured line threshold, the gate requires the agent
to plan and stage the change incrementally.

**Evaluation entry point.** `preEdit({ filePath, operation, content, diffLines })`
routes edits through this gate. The `diffLines` value is computed by the hook
handler: if the caller provides `diff_lines` or `diffLines` explicitly, that
value is used; otherwise the handler counts newlines in the edit content.

**Decision on match.** `warn` -- the edit is not blocked, but the runtime
emits a warning and recommends breaking the change into staged commits.

**Threshold.** 300 lines by default. Override with `diffSizeThreshold`.

**Configuration example:**

```javascript
gateConfig: {
  diffSize: true,
  diffSizeThreshold: 150, // stricter threshold for critical paths
}
```

**Example -- warning issued:**

```
Diff for "src/auth/service.ts" is 420 lines (threshold: 300).
Large changes should be planned and staged.
Remediation:
  1. Create a plan breaking this change into logical commits
  2. Stage changes incrementally (one concern per commit)
  3. Run tests after each staged commit
  4. Consider if this change should be split into multiple PRs
```

**Example -- no warning:**

An edit of 280 lines against the default 300-line threshold passes without a
warning.

### Gate 4: Secrets detection

**Purpose.** Scan file content, command text, and tool parameters for
credential patterns. Blocks writes that would embed secrets in source
files or expose them in shell commands.

**Evaluation entry points.**

- `preCommand(command)` -- scans the command string.
- `preEdit({ filePath, content })` -- scans the file content being written.
- `preToolUse(toolName, parameters)` -- serializes tool parameters to JSON
  and scans the result.

**Decision on match.** `block` -- the action is rejected. The gate redacts
matched secrets in its output (showing only the first and last four characters
for strings longer than 12 characters).

#### Default secret patterns

| Pattern | Detects |
|---|---|
| `api_key\|apikey = '...'` | Generic API keys |
| `secret\|password\|passwd\|pwd = '...'` | Passwords and secrets |
| `token\|bearer = '...'` | Bearer tokens |
| `-----BEGIN ... PRIVATE KEY-----` | PEM private keys (RSA, EC, DSA) |
| `sk-[a-zA-Z0-9]{20,}` | OpenAI-style API keys |
| `ghp_[a-zA-Z0-9]{36}` | GitHub personal access tokens |
| `npm_[a-zA-Z0-9]{36}` | npm tokens |
| `AKIA[0-9A-Z]{16}` | AWS access key IDs |

**Adding custom patterns:**

```javascript
gateConfig: {
  secrets: true,
  secretPatterns: [
    // Keep the defaults (spread from a shared constant, or list them
    // explicitly) and add your own:
    /PRIVATE_KEY_[A-Z0-9]{32}/g,
    /mongodb\+srv:\/\/[^\s]+/g,
  ],
}
```

**Example -- blocked write:**

```
Detected 1 potential secret(s) in content.
Secrets must not be committed or exposed.
Remediation:
  1. Move secrets to environment variables
  2. Use .env files (ensure they are in .gitignore)
  3. Use a secret management service for production
  Detected patterns: sk-a************************************b3xY
```

## Continue gate

The `ContinueGate` is a separate gate created via
`createContinueGate(config)` from `@claude-flow/guidance/continue-gate`. It
monitors long-running agent sessions rather than individual tool calls.

### What the continue gate monitors

| Signal | Default threshold | Decision when exceeded |
|---|---|---|
| Coherence score | < 0.4 | `stop` |
| Consecutive steps without checkpoint | > 100 | `stop` |
| Budget exhaustion (tokens, tool calls, time) | 0 remaining | `stop` |
| Rework ratio (rework steps / total steps) | > 0.3 | `pause` |
| Uncertainty score | > 0.8 | `pause` |
| Budget acceleration (token slope per step) | > 0.02 | `throttle` |
| Checkpoint interval | Every 25 steps | `checkpoint` |

### ContinueGateConfig fields

| Field | Type | Default | Description |
|---|---|---|---|
| `maxConsecutiveSteps` | `number` | `100` | Hard step limit without a checkpoint. |
| `maxBudgetSlopePerStep` | `number` | `0.02` | Maximum token-consumption slope before throttling. |
| `minCoherenceForContinue` | `number` | `0.4` | Coherence score floor (0--1). |
| `maxUncertaintyForContinue` | `number` | `0.8` | Uncertainty score ceiling (0--1). |
| `maxReworkRatio` | `number` | `0.3` | Maximum fraction of steps that revisit previously edited lines. |
| `checkpointIntervalSteps` | `number` | `25` | Steps between forced checkpoints. |
| `cooldownMs` | `number` | `5000` | Minimum milliseconds between evaluations to avoid overhead. |

### Decision priority order

The continue gate evaluates signals in a fixed priority order. The first
matching condition determines the decision:

1. Coherence below threshold -- `stop`
2. Step limit exceeded -- `stop`
3. Budget exhausted -- `stop`
4. High rework ratio -- `pause`
5. High uncertainty -- `pause`
6. Budget acceleration -- `throttle`
7. Checkpoint interval reached -- `checkpoint`
8. No condition triggered -- `continue`

## Threat detection layer

In addition to enforcement gates, the `pre-command` event handler runs commands
through an adversarial threat detector
(`runtime.threatDetector.analyzeInput()` from
`@claude-flow/guidance/adversarial`). This layer operates independently of the
four gates.

Threats are scored on a 0--1 severity scale. Any threat with
**severity >= 0.85** blocks the command regardless of the gate evaluation
result. The block message identifies the source:

```
[BLOCKED] Adversarial threat detected in command input
```

The threat detector and the enforcement gates are evaluated in parallel for
`pre-command` events. A command is blocked if **either** produces a blocking
result.

## Gate results

Every gate evaluation returns a `GateResult` object:

```typescript
interface GateResult {
  decision: 'allow' | 'block' | 'warn' | 'require-confirmation';
  gateName: string;
  reason: string;
  triggeredRules: string[];
  remediation?: string;
  metadata?: Record<string, unknown>;
}
```

When multiple gates evaluate the same action, the runtime aggregates the
results by selecting the most restrictive decision. Severity ranking from
lowest to highest: `allow` < `warn` < `require-confirmation` < `block`.

The hook handler converts gate results into a hook result object with the
shape `{ success, aborted, messages, warnings }`. When `success` is `false`
or `aborted` is `true`, the action is blocked and the process exits with
code 1.

## Fail-open vs. fail-closed

If gate evaluation itself fails (for example, the guidance script crashes or
exceeds the sync timeout), the system defaults to **fail-open**: the action is
allowed.

Set the following environment variable to switch to fail-closed mode in
production:

```bash
export GUIDANCE_EVENT_FAIL_CLOSED=1
```

In fail-closed mode, any evaluation failure blocks the action.

## Sync timeout

Blocking gate evaluations run synchronously with a configurable timeout.
The default is 8000 milliseconds. Override it with:

```bash
export GUIDANCE_EVENT_SYNC_TIMEOUT_MS=5000
```

If the evaluation does not complete within this window, the fail-open or
fail-closed policy (see above) determines whether the action proceeds.

## Disabling gate evaluation

To disable all guidance event wiring (for example, during local development
when latency matters), set:

```bash
export GUIDANCE_EVENT_WIRING_ENABLED=0
```

When wiring is disabled, the local fallback patterns in the hook handler
still apply. This ensures that the most dangerous commands (recursive
deletion, fork bombs, disk formatting) remain blocked even without the full
guidance runtime.

## Evaluation routing summary

The following table maps each runtime method to the gates it activates:

| Method | Destructive ops | Tool allowlist | Diff size | Secrets | Threat detector |
|---|---|---|---|---|---|
| `preCommand(command)` | Yes | -- | -- | Yes | Yes |
| `preEdit({ filePath, content, diffLines })` | -- | -- | Yes | Yes | -- |
| `preToolUse(toolName, parameters)` | -- | Yes | -- | Yes | -- |
