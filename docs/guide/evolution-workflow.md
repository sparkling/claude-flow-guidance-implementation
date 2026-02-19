# Rule evolution workflow

This guide describes the full lifecycle for evolving guidance rules in a
`claude-flow-guidance-implementation` project. It covers the five-stage
evolution pipeline, automated rule optimization with the autopilot, and
controlled experimentation with the A/B benchmark.

## Before you begin

Install the package and its dependencies:

```bash
npm install claude-flow-guidance-implementation
```

Ensure you have a `CLAUDE.md` file at the project root. If you also maintain
experimental rules, place them in `CLAUDE.local.md` alongside it.

Set a signing key for proof chain integrity. In production, use a strong
secret. For local development the runtime falls back to a built-in key:

```bash
export GUIDANCE_PROOF_KEY="your-signing-key"
```

## Concepts

### Evolution pipeline

The evolution pipeline manages the lifecycle of a proposed rule change. It
enforces a structured progression from proposal through simulation, comparison,
staged rollout, and final deployment. At each stage, quantitative metrics
determine whether the change advances or rolls back.

The pipeline is created by `createEvolutionPipeline({ signingKey })` from
`@claude-flow/guidance/evolution`. The `GuidanceAdvancedRuntime` initializes it
at construction time in `src/guidance/advanced-runtime.js` (line 54).

### Golden traces

A golden trace is a known-good decision sequence. It represents the expected
behavior of the guidance engine against a particular input. During simulation
the pipeline replays these traces under both the existing configuration
(baseline) and the proposed configuration (candidate), then measures
divergence.

### Divergence threshold

The pipeline uses a 5% divergence threshold. If the candidate configuration
produces decisions that diverge from the baseline by more than 5%, the proposal
is automatically rejected. This prevents high-risk regressions from reaching
production.

## The five-stage pipeline

### Stage 1: Propose

Create a proposal that describes the intended rule change:

```javascript
import { createGuidanceAdvancedRuntime } from 'claude-flow-guidance-implementation/runtime';

const runtime = createGuidanceAdvancedRuntime({
  signingKey: process.env.GUIDANCE_PROOF_KEY,
});
await runtime.initialize();

const proposal = runtime.evolutionPipeline.propose({
  kind: 'rule-add',
  title: 'Block network calls from memory worker agents',
  description: 'Restrict shell-based network calls for memory worker lanes',
  author: 'security-architect',
  targetPath: 'rules.network.memory-workers',
  diff: {
    before: null,
    after: {
      rule: 'Memory worker agents MUST NOT execute outbound network shell commands',
    },
  },
  rationale: 'Prevent accidental exfiltration from low-trust memory workers',
  riskAssessment: {
    level: 'medium',
    factors: ['new restriction', 'possible false positives'],
  },
});

console.log(proposal.proposalId);
// Example: "prop-a1b2c3d4-..."
```

The `kind` field accepts three values:

| Kind            | Description                           |
|-----------------|---------------------------------------|
| `rule-add`      | Introduce an entirely new rule        |
| `rule-modify`   | Change an existing rule's behavior    |
| `rule-remove`   | Delete an existing rule               |

The call returns a proposal object containing a `proposalId` that you pass to
subsequent stages.

### Stage 2: Simulate

Run the proposal against golden traces to measure behavioral divergence:

```javascript
const goldenTraces = [
  { id: 'trace-1', decisions: ['allow', 'allow', 'allow'] },
  { id: 'trace-2', decisions: ['allow', 'require-confirmation', 'allow'] },
  { id: 'trace-3', decisions: ['allow', 'allow', 'warn'] },
];

const evaluator = (trace, config) => {
  // config is 'baseline' or 'candidate'
  // Return decisions and metrics for this trace under the given config
  const decisions = config === 'candidate'
    ? trace.decisions.map((d, i) =>
        i === 1 && d === 'allow' ? 'require-confirmation' : d
      )
    : [...trace.decisions];

  const metrics = config === 'candidate'
    ? { successRate: 0.96, complianceScore: 0.94 }
    : { successRate: 0.93, complianceScore: 0.91 };

  return { traceHash: 'sha256-of-decisions', metrics, decisions };
};

const simulation = runtime.evolutionPipeline.simulate(
  proposal.proposalId,
  goldenTraces,
  evaluator,
);

console.log(simulation);
// {
//   divergenceScore: 0.02,
//   passed: true,
//   reason: 'Divergence within acceptable threshold'
// }
```

The evaluator function receives each trace and the configuration label. It
returns the decisions the engine would produce and any associated metrics.
The pipeline computes a divergence score across all traces.

### Stage 3: Compare

Compare the baseline and candidate metrics to decide whether to proceed:

```javascript
const comparison = runtime.evolutionPipeline.compare(
  proposal.proposalId,
  simulation,
);

console.log(comparison.approved);
// true  (divergence was below 5%)
```

If the divergence score exceeds the threshold, `comparison.approved` is
`false` and the pipeline halts. No rollout is created.

### Stage 4: Stage

If the comparison passes, create a staged rollout. The rollout proceeds
through three phases: canary, partial, and full:

```javascript
if (comparison.approved) {
  const rollout = runtime.evolutionPipeline.stage(proposal.proposalId);

  console.log(rollout);
  // {
  //   rolloutId: 'roll-...',
  //   status: 'in-progress',
  //   stages: [
  //     { name: 'canary', ... },
  //     { name: 'partial', ... },
  //     { name: 'full', ... }
  //   ],
  //   currentStage: 0
  // }
}
```

At this point the rule change is active for the canary population only.

### Stage 5: Advance

Advance through the rollout stages by supplying live metrics. Each call moves
the rollout forward by one phase if the metrics are acceptable:

```javascript
let status = rollout.status;

while (status === 'in-progress') {
  const result = runtime.evolutionPipeline.advanceStage(
    rollout.rolloutId,
    {
      divergence: 0.01,
      successRate: 0.96,
      complianceScore: 0.94,
    },
  );
  status = result.status;
  console.log(`Advanced to: ${result.currentStage ?? 'complete'}`);
}
```

The `metrics` object requires three fields:

| Field             | Type   | Description                                 |
|-------------------|--------|---------------------------------------------|
| `divergence`      | number | Observed divergence from baseline behavior  |
| `successRate`     | number | Fraction of operations that succeeded       |
| `complianceScore` | number | Fraction of operations that passed policy   |

If divergence exceeds the threshold at any stage, the pipeline triggers an
automatic rollback and the rollout terminates.

## Complete example

The following listing shows the full lifecycle from proposal to completion.
This is the same pattern used by `src/guidance/integration-runners.js`
(lines 344-448).

```javascript
import { createGuidanceAdvancedRuntime } from 'claude-flow-guidance-implementation/runtime';

const runtime = createGuidanceAdvancedRuntime({
  signingKey: process.env.GUIDANCE_PROOF_KEY,
});
await runtime.initialize();

// 1. Propose
const proposal = runtime.evolutionPipeline.propose({
  kind: 'rule-add',
  title: 'Block network calls from memory worker agents',
  description: 'Restrict shell-based network calls for memory worker lanes',
  author: 'security-architect',
  targetPath: 'rules.network.memory-workers',
  diff: {
    before: null,
    after: {
      rule: 'Memory worker agents MUST NOT execute outbound network shell commands',
    },
  },
  rationale: 'Prevent accidental exfiltration from low-trust memory workers',
  riskAssessment: {
    level: 'medium',
    factors: ['new restriction', 'possible false positives'],
  },
});

// 2. Simulate
const goldenTraces = [
  { id: 'trace-1', decisions: ['allow', 'allow', 'allow'] },
  { id: 'trace-2', decisions: ['allow', 'require-confirmation', 'allow'] },
  { id: 'trace-3', decisions: ['allow', 'allow', 'warn'] },
];

const evaluator = (trace, config) => {
  const decisions = config === 'candidate'
    ? trace.decisions.map((d, i) =>
        i === 1 && d === 'allow' ? 'require-confirmation' : d
      )
    : [...trace.decisions];
  const metrics = config === 'candidate'
    ? { successRate: 0.96, complianceScore: 0.94 }
    : { successRate: 0.93, complianceScore: 0.91 };
  return { traceHash: 'computed-hash', metrics, decisions };
};

const simulation = runtime.evolutionPipeline.simulate(
  proposal.proposalId, goldenTraces, evaluator,
);

// 3. Compare
const comparison = runtime.evolutionPipeline.compare(
  proposal.proposalId, simulation,
);

// 4-5. Stage and advance
if (comparison.approved) {
  const rollout = runtime.evolutionPipeline.stage(proposal.proposalId);

  let guard = 0;
  let status = rollout.status;

  while (status === 'in-progress' && guard < 10) {
    const result = runtime.evolutionPipeline.advanceStage(rollout.rolloutId, {
      divergence: 0.01,
      successRate: 0.96,
      complianceScore: 0.94,
    });
    status = result.status ?? rollout.status;
    guard += 1;
  }
}

// Inspect final state
const final = runtime.evolutionPipeline.getProposal(proposal.proposalId);
console.log('Final status:', final.status);
```

## Session-end integration

The evolution pipeline runs automatically at session end. When the
`session-end` hook fires, the `GuidanceAdvancedRuntime` executes both the
conformance suite and the evolution integration:

```javascript
case 'session-end': {
  const conformance = await runtime.runConformanceIntegration();
  const evolution = await runtime.runEvolutionIntegration();
  // Results are persisted to .claude-flow/guidance/advanced/advanced-state.json
}
```

This means that every Claude Code session produces a fresh evolution run.
The results accumulate in the advanced state file and can be reviewed
with `cf-guidance` or by reading the JSON directly.

## Autopilot

The autopilot automates rule promotion from `CLAUDE.local.md` into
`CLAUDE.md`. It identifies local rules that improve the composite guidance
score and promotes them into the shared configuration.

### How it works

1. The autopilot compiles `CLAUDE.md` and `CLAUDE.local.md` into policy
   bundles.
2. It identifies local-only rules that are not yet present in the root
   configuration, or that differ from their root counterparts.
3. It builds a candidate `CLAUDE.md` that includes those rules in a managed
   `## Guidance Auto-Promotions` section.
4. It scores the before and after configurations using the guidance analyzer.
5. If the composite score delta exceeds the minimum threshold (default 0.5),
   and the A/B gate passes (if enabled), the autopilot applies the change.
6. A backup of the original `CLAUDE.md` is saved and an ADR (Architecture
   Decision Record) is written to `docs/adr/`.

### One-shot mode

Run a single optimization pass. This is useful for manual review before
committing changes:

```bash
# Dry run (no changes applied)
npm run guidance:autopilot:once

# Apply changes if threshold is met
npx cf-guidance-autopilot --once --apply
```

The dry run writes a proposal file to
`.claude-flow/guidance/proposals/CLAUDE.promoted.<timestamp>.md` that you
can inspect before applying.

### Daemon mode

Run the autopilot on a timer (default interval: 30 minutes):

```bash
npm run guidance:autopilot:daemon

# Custom interval (10 minutes)
npx cf-guidance-autopilot --daemon --apply --interval-ms 600000
```

In daemon mode the autopilot acquires a file lock at
`.claude-flow/guidance/autopilot.lock` to prevent concurrent runs. If another
instance is already running, the cycle is skipped.

### Configuration flags

| Flag                | Default   | Description                                       |
|---------------------|-----------|---------------------------------------------------|
| `--once`            | (default) | Run a single optimization pass                    |
| `--daemon`          |           | Run continuously on a timer                       |
| `--apply`           | `false`   | Write changes to `CLAUDE.md` (otherwise dry run)  |
| `--min-delta`       | `0.5`     | Minimum composite score improvement to promote    |
| `--max-promotions`  | `12`      | Maximum number of rules to promote per cycle      |
| `--interval-ms`     | `1800000` | Timer interval in milliseconds (daemon mode)      |
| `--ab`              | `false`   | Run A/B benchmark before promoting                |
| `--no-ab`           |           | Disable A/B gating (default)                      |
| `--min-ab-gain`     | `0.05`    | Minimum A/B delta gain to pass the gate           |
| `--source`          | `manual`  | Source tag written into the promotion metadata     |

### Gating with A/B benchmark

To require an A/B benchmark before any promotion, pass the `--ab` flag:

```bash
npx cf-guidance-autopilot --once --apply --ab --min-ab-gain 0.1
```

The autopilot runs the benchmark for both the current and candidate
configurations. If the candidate's composite delta gain does not exceed
`--min-ab-gain`, the promotion is blocked even if the score delta exceeds
`--min-delta`.

## A/B benchmark

The A/B benchmark measures the behavioral difference between unguided and
guided task execution. It uses the `SyntheticContentAwareExecutor`, which
produces deterministic results without making LLM calls.

### How it works

The benchmark runs 20 synthetic tasks under two configurations:

- **Config A (baseline):** Tasks execute with no guidance context.
- **Config B (guided):** Tasks execute with the compiled `CLAUDE.md` applied.

The executor simulates guidance-aware behavior by detecting enforcement terms
(`NEVER`, `ALWAYS`, `MUST`) in the guidance content and adjusting its output
accordingly. This produces measurable differences in composite score,
category adherence, and per-task metrics.

### Running the benchmark

```bash
npm run guidance:ab-benchmark
```

The report is saved to `.claude-flow/guidance/ab-benchmark-report.json`.
Console output includes the key metrics:

```
A/B benchmark complete.
Composite delta: 1.82
Category shift: improved
Baseline score: 3.14
Guided score: 4.96
Report saved: .claude-flow/guidance/ab-benchmark-report.json
```

### Interpreting results

| Field             | Description                                              |
|-------------------|----------------------------------------------------------|
| `compositeDelta`  | Difference between guided and baseline composite scores  |
| `categoryShift`   | Whether the guided config moved to a higher category     |
| `configA.metrics` | Detailed per-dimension scores for the baseline run       |
| `configB.metrics` | Detailed per-dimension scores for the guided run         |

A positive `compositeDelta` indicates that the guidance rules improved task
execution quality. The `categoryShift` field shows whether this improvement
was large enough to move the score into a higher quality tier.

## CLI reference

The following npm scripts and CLI binaries relate to rule evolution:

| Command                              | Description                                |
|--------------------------------------|--------------------------------------------|
| `npm run guidance:evolution`         | Run the evolution integration test         |
| `npm run guidance:autopilot:once`    | One-shot rule optimization (dry run)       |
| `npm run guidance:autopilot:daemon`  | Continuous rule optimization               |
| `npm run guidance:ab-benchmark`      | A/B benchmark (baseline vs guided)         |
| `npx cf-guidance-autopilot`          | Autopilot CLI with full flag support       |
| `npx cf-guidance-benchmark`          | A/B benchmark CLI                          |
| `npx cf-guidance`                    | Run all integration suites including evolution |

## File locations

| Path                                                     | Purpose                                   |
|----------------------------------------------------------|-------------------------------------------|
| `src/guidance/advanced-runtime.js`                       | Pipeline initialization (line 54)         |
| `src/guidance/integration-runners.js`                    | Full evolution demo (lines 344-448)       |
| `src/cli/guidance-autopilot.js`                          | Autopilot CLI entry point                 |
| `src/cli/guidance-ab-benchmark.js`                       | A/B benchmark CLI entry point             |
| `src/guidance/content-aware-executor.js`                 | Synthetic executor for benchmarks         |
| `.claude-flow/guidance/advanced/advanced-state.json`     | Persisted evolution results               |
| `.claude-flow/guidance/autopilot-report.json`            | Latest autopilot run report               |
| `.claude-flow/guidance/autopilot-state.json`             | Autopilot state across runs               |
| `.claude-flow/guidance/autopilot.log`                    | Autopilot activity log                    |
| `.claude-flow/guidance/ab-benchmark-report.json`         | Latest A/B benchmark report               |
| `.claude-flow/guidance/proposals/`                       | Dry-run promotion proposals               |
| `.claude-flow/guidance/backups/`                         | Pre-promotion CLAUDE.md backups           |
| `docs/adr/`                                              | Architecture Decision Records for promotions |

## What's next

- Read the [architecture documentation](../architecture.md) for the full
  solutions architecture with diagrams.
- Review the [migration guide](migration.md) for instructions on wiring hooks
  into a new repository.
- See the [trust system](trust-system.md) and
  [gate configuration](gate-configuration.md) guides for the subsystems that
  complement rule evolution.
