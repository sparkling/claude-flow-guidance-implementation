# Trust System Reference

This document describes the trust system in the `claude-flow-guidance-implementation`
package. The trust system tracks agent behavior over time, assigns each agent a
trust tier, and adjusts operational privileges such as throughput rate limits
based on accumulated trust scores.

## Overview

The trust system serves as a behavioral feedback loop for agents operating under
guidance policy enforcement. Every action an agent takes -- running a command,
editing a file, starting or completing a task -- produces a trust outcome. These
outcomes accumulate into a score that determines the agent's trust tier. Higher
tiers grant faster throughput; lower tiers impose restrictions.

The trust system is created by calling `createTrustSystem()` from
`@claude-flow/guidance/trust`. The `GuidanceAdvancedRuntime` instantiates it at
construction time in `src/guidance/advanced-runtime.js`:

```javascript
this.trustSystem = createTrustSystem();
```

## Trust outcomes

Every guidance event handler records exactly one trust outcome per invocation.
An outcome is one of three values:

| Outcome | Meaning |
|---------|---------|
| `allow` | The action passed all policy gates without warnings. |
| `warn` | The action passed but triggered one or more policy warnings. |
| `deny` | The action was blocked by a policy gate or threat detector. |

The mapping from hook results to outcomes follows this logic, implemented in
`src/utils.mjs`:

```javascript
function outcomeFromHookResult(result) {
  if (!result) return 'warn';
  if (!result.success || result.aborted) return 'deny';
  if ((result.warnings?.length ?? 0) > 0) return 'warn';
  return 'allow';
}
```

An `allow` outcome increases the agent's trust score. A `warn` outcome has a
smaller positive or neutral effect. A `deny` outcome decreases the score.

## Recording trust

The advanced runtime exposes a `recordTrust` method that delegates to the
trust system:

```javascript
runtime.recordTrust(agentId, outcome, reason);
```

Parameters:

- `agentId` (string): The identifier of the agent whose score should be
  updated. Defaults to `'claude-main'` when not provided by the caller.
- `outcome` (string): One of `'allow'`, `'warn'`, or `'deny'`.
- `reason` (string): A human-readable explanation, used for audit logging.

Internally this calls `trustSystem.recordOutcome(agentId, outcome, reason)`,
which updates the accumulator score and appends a record to the trust ledger.

## Trust tiers

The trust system defines four tiers. An agent's tier is determined by its
cumulative trust score.

| Tier | Score range | Throughput multiplier | Description |
|------|-------------|----------------------|-------------|
| `trusted` | High | 2x | The agent has consistently followed policy. It receives double the base throughput allocation. |
| `standard` | Default | 1x | Normal operating mode. All new agents start here. |
| `probation` | Below standard | 0.5x | The agent has accumulated policy violations. Throughput is halved. |
| `untrusted` | Very low | 0.1x | The agent has repeated or severe violations. Throughput is reduced to 10% of the base rate. |

### Tier transitions

Tier boundaries are evaluated after every recorded outcome. An agent that
resolves its violations and accumulates `allow` outcomes will gradually move
back toward `standard` and eventually `trusted`. Conversely, repeated `deny`
outcomes push an agent toward `probation` and then `untrusted`.

There is no manual tier override. Tier assignment is always derived from the
cumulative score.

## Trust-based rate limiting

The trust system provides a method to compute an effective rate limit for a
given agent:

```javascript
const effectiveLimit = trustSystem.getTrustBasedRateLimit(agentId, baseRateLimit);
```

The returned value equals `baseRateLimit * tierMultiplier`, where
`tierMultiplier` is the multiplier from the tier table above.

**Example:** If the base rate limit is 100 requests per minute:

| Agent tier | Effective rate limit |
|------------|---------------------|
| `trusted` | 200 |
| `standard` | 100 |
| `probation` | 50 |
| `untrusted` | 10 |

## How hooks record trust

The event handlers in `src/cli/event-handlers.js` record trust for every
lifecycle event. The following table summarizes the recording behavior:

| Hook | Outcome when blocked | Outcome when passed | Notes |
|------|---------------------|---------------------|-------|
| `pre-command` | `deny` | `allow` or `warn` | Records `deny` if blocked by policy gates or severe threat detection. Records `warn` if warnings are present. Records `allow` otherwise. |
| `pre-edit` | `deny` | `allow` or `warn` | Records `deny` if blocked by policy gates. |
| `pre-task` | `deny` | `allow` or `warn` | Records `deny` if blocked by policy gates. |
| `post-task` | Derived from result | Derived from result | Outcome is computed from the hook result using `outcomeFromHookResult`. |
| `post-edit` | -- | `allow` | Always records `allow`. Post-edit is informational and does not block. |

Each handler also includes the current trust snapshot in its return value:

```javascript
trust: runtime.trustSystem.getSnapshot(agentId)
```

This allows callers to inspect the agent's score and tier after every event.

## Inspecting trust state

### Single-agent snapshot

To retrieve the trust state for a specific agent, call `getSnapshot`:

```javascript
const snapshot = trustSystem.getSnapshot(agentId);
// Returns: { score: 0.85, tier: 'trusted' }
```

The snapshot contains two fields:

- `score` (number): The agent's current cumulative trust score.
- `tier` (string): One of `'trusted'`, `'standard'`, `'probation'`, or
  `'untrusted'`.

### All-agent snapshots

To retrieve snapshots for every tracked agent:

```javascript
const allSnapshots = trustSystem.getAllSnapshots();
// Returns: [{ agentId: 'coder-1', score: 0.85, tier: 'trusted' }, ...]
```

### Trust history

The trust ledger maintains a record of every outcome. To retrieve the history
for a specific agent:

```javascript
const history = trustSystem.ledger.getHistoryForAgent(agentId);
```

Each record in the history contains the outcome, reason, and timestamp.

### Runtime status

The advanced runtime's `getStatus()` method includes a count of tracked agents:

```javascript
const status = runtime.getStatus();
console.log(status.trustAgents); // Number of agents with trust records
```

## Persistence

Trust state is persisted to disk at
`.claude-flow/guidance/advanced/advanced-state.json`. The runtime writes this
file after every event handler invocation by calling `runtime.persistState()`.

### What is persisted

The state file contains:

- `trustSnapshots`: An array of `{ agentId, score }` objects for all tracked
  agents.
- `trustRecords`: The full trust ledger, exported via
  `trustSystem.ledger.exportRecords()`.
- `updatedAt`: An ISO 8601 timestamp of the last write.

### Restoration on startup

When the advanced runtime initializes, it reads the saved state file and
restores trust scores:

```javascript
const savedState = readJson(this.statePath, {});
const trustSnapshots = savedState?.trustSnapshots ?? [];
for (const snapshot of trustSnapshots) {
  if (snapshot?.agentId && typeof snapshot?.score === 'number') {
    this.trustSystem.accumulator.setScore(snapshot.agentId, snapshot.score);
  }
}

const trustRecords = savedState?.trustRecords ?? [];
if (Array.isArray(trustRecords) && trustRecords.length > 0) {
  this.trustSystem.ledger.importRecords(trustRecords);
}
```

This means trust scores survive across sessions. An agent that was on
`probation` when a session ended will remain on `probation` when the next
session starts.

### State file location

The default path is relative to the project root:

```
<project-root>/.claude-flow/guidance/advanced/advanced-state.json
```

You can override the data directory by passing `dataDir` in the runtime options:

```javascript
const runtime = createGuidanceAdvancedRuntime({
  dataDir: '.claude-flow/guidance/custom-data',
});
```

## Running the trust integration test

The package includes a trust integration runner that exercises the full
trust lifecycle. It records five outcomes (three `allow`, one `warn`, one
`deny`), then reports the resulting score and tier.

Run it with:

```bash
npm run guidance:trust
```

The runner is defined at `src/guidance/integration-runners.js` (lines 152-181).
It performs the following sequence:

1. Records `allow` for "passed gate: tests included".
2. Records `allow` for "passed gate: no secrets".
3. Records `warn` for "required confirmation for high-risk tool".
4. Records `deny` for "blocked destructive command".
5. Records `allow` for "fixed issue and retried safely".

After recording, it reports:

- The number of events recorded.
- The resulting score and tier.
- The effective rate limit (given a base rate of 100).
- The five most recent ledger entries for the agent.

Example output:

```json
{
  "integration": "trust",
  "agentId": "coder-1",
  "eventsRecorded": 5,
  "score": 0.72,
  "tier": "standard",
  "trustBasedRateLimit": 100,
  "recentEvents": [...]
}
```

## Practical examples

### Example 1: Monitoring an agent's trust trajectory

After deploying guidance hooks, monitor an agent's trust trajectory by
inspecting the state file:

```bash
cat .claude-flow/guidance/advanced/advanced-state.json | jq '.trustSnapshots'
```

Sample output:

```json
[
  { "agentId": "claude-main", "score": 0.91 },
  { "agentId": "coder-1", "score": 0.65 }
]
```

In this example, `claude-main` is in the `trusted` tier while `coder-1` is in
the `standard` tier approaching `probation`.

### Example 2: Using trust-based rate limiting in a custom integration

```javascript
import { createGuidanceAdvancedRuntime } from 'claude-flow-guidance-implementation/runtime';

const runtime = createGuidanceAdvancedRuntime();
await runtime.initialize();

const baseRateLimit = 120; // requests per minute
const agentId = 'worker-3';

const effectiveLimit = runtime.trustSystem.getTrustBasedRateLimit(
  agentId,
  baseRateLimit
);

console.log(`Agent ${agentId} effective rate limit: ${effectiveLimit} req/min`);
```

### Example 3: Programmatically recording a trust outcome

```javascript
// Record a deny outcome when an agent attempts a forbidden operation
runtime.recordTrust('coder-2', 'deny', 'attempted to write to protected path');

// Check the updated state
const snapshot = runtime.trustSystem.getSnapshot('coder-2');
console.log(`Score: ${snapshot.score}, Tier: ${snapshot.tier}`);
```

### Example 4: Reviewing trust history for audit

```javascript
const history = runtime.trustSystem.ledger.getHistoryForAgent('coder-1');

for (const record of history) {
  console.log(`${record.outcome} - ${record.reason}`);
}
```

## Relationship to other subsystems

The trust system integrates with several other components of the advanced
runtime:

- **Proof chain**: Every event handler appends a proof envelope alongside
  the trust record. This creates an auditable chain linking trust decisions
  to specific actions.
- **Threat detection**: The `pre-command` handler runs threat analysis before
  recording trust. Severe threats (severity >= 0.85) result in a `deny`
  outcome regardless of policy gate results.
- **Conformance testing**: The conformance runner (`createConformanceRunner`)
  validates Memory Clerk rules (authority, TTL, contradiction). It operates
  independently of the trust system but both contribute to the overall
  governance posture.
- **Evolution pipeline**: Rule changes proposed through the evolution pipeline
  do not directly alter trust scores, but new rules may change which actions
  produce `allow`, `warn`, or `deny` outcomes in future evaluations.
