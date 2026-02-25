# Implementation Plan: 28-Module Guidance Control Plane

Status date: 2026-02-24

## 1. Executive Summary

This plan covers wiring all 28 recommended `@claude-flow/guidance` modules into
`@sparkleideas/claude-flow-guidance`. We currently integrate 12 of 32 upstream modules
(37.5%). The target state is 28/32 (87.5%), with 4 permanently skipped.

### Current state

| Layer | Wired | Target | Gap |
|-------|-------|--------|-----|
| Policy (compiler, retriever, optimizer, generators) | 2 | 4 | 2 |
| Enforcement (gates, gateway, authority, continue-gate, meta-governance) | 1 | 5 | 4 |
| Observation (ledger, persistence, proof, artifacts) | 2 | 4 | 2 |
| Learning (hooks, evolution, conformance-kit, headless) | 3 | 4 | 1 |
| Trust (trust, adversarial, capabilities, manifest-validator) | 2 | 4 | 2 |
| Knowledge (memory-gate, truth-anchors, uncertainty, temporal) | 1 | 4 | 3 |
| Validation (analyzer, coherence) | 1 | 2 | 1 |
| Infrastructure (wasm-kernel) | 0 | 1 | 1 |
| **Total** | **12** | **28** | **16** |

### Permanently skipped (4)

| Module | Reason |
|--------|--------|
| ruvbot-integration | We don't use RuvBot |
| crypto-utils | Internal helper, consumed transitively by proof/authority |
| types | Re-export barrel; already available through typed imports |
| index (ControlPlane) | Day-1 facade over 6/32 modules; our architecture surpasses it |

### Approach

Each new module follows the existing null-object pattern: a `createNullXxx()` factory
returns safe no-op defaults, and the real `createXxx()` from upstream is activated when
the component is enabled in `components.json`. This makes every addition zero-risk to
existing behavior.

---

## 2. Architecture Patterns

### 2.1 Null-object gating (existing pattern)

Every optional module gets a null-object factory. The runtime checks
`_enabledComponents.has('name')` and selects the real or null implementation.

```js
// In advanced-runtime.js (existing pattern)
this.trustSystem = this._enabledComponents.has('trust')
  ? createTrustSystem()
  : createNullTrustSystem();
```

### 2.2 Component configuration

`components.json` at `.claude-flow/guidance/components.json` lists enabled components.
When absent, all components are enabled (backwards compat). New modules are added to
the default set in `_loadEnabledComponents()`.

### 2.3 Initialization order

Modules initialize in dependency order. The current two-phase pattern
(phase1-runtime.js then advanced-runtime.js) extends naturally:

```
Phase 1 (policy + enforcement):
  compiler → retriever → gates → gateway → authority → continue-gate → ledger → persistence → hooks

Phase 2 (learning + trust + knowledge):
  trust → adversarial → capabilities → proof → conformance-kit → evolution → meta-governance

Phase 3 (validation + knowledge + infrastructure):
  coherence → optimizer → truth-anchors → uncertainty → temporal → artifacts → manifest-validator

Standalone (no initialization dependency):
  wasm-kernel, generators, headless, analyzer
```

### 2.4 File placement

| File | Responsibility |
|------|---------------|
| `src/guidance/phase1-runtime.js` | Policy + enforcement core |
| `src/guidance/advanced-runtime.js` | Trust + learning + knowledge orchestrator |
| `src/guidance/enforcement-layer.js` | **NEW** — gateway, authority, continue-gate, meta-governance wrappers |
| `src/guidance/knowledge-layer.js` | **NEW** — truth-anchors, uncertainty, temporal wrappers |
| `src/guidance/observation-layer.js` | **NEW** — persistence, artifacts wrappers |
| `src/guidance/validation-layer.js` | **NEW** — coherence, optimizer wrappers |
| `src/guidance/infrastructure-layer.js` | **NEW** — wasm-kernel, generators, headless, manifest-validator, capabilities |
| `src/guidance/integration-runners.js` | Extended with new integration test functions |
| `scripts/event-handlers.js` | Extended with new gate checks in event paths |

---

## 3. Phased Roadmap

### Phase A: Production Hardening (7 modules)

These modules close critical safety and reliability gaps. Without them, the system
has no session degradation detection, no infinite-loop prevention, no irreversibility
classification, and loses all events on restart.

**Week 1: Feedback loop — persistence + coherence + optimizer**

| Module | Factory | Integration point | What it does |
|--------|---------|-------------------|-------------|
| persistence | `createPersistentLedger(config)` | Replace `createLedger()` in phase1-runtime.js line 38 | NDJSON event store with compaction/WAL. Events survive restarts. |
| coherence | `createCoherenceScheduler(config)` + `createEconomicGovernor(config)` | New in advanced-runtime.js, fed by ledger events | Weighted coherence score (violations 0.4, rework 0.3, drift 0.3). 4 privilege levels. Budget tracking. |
| optimizer | `createOptimizer(config)` | New in advanced-runtime.js, runs on session-end | Violation-driven rule evolution. "Win twice to promote." Generates ADRs. |

**Week 2: Safety gates — authority + meta-governance + continue-gate**

| Module | Factory | Integration point | What it does |
|--------|---------|-------------------|-------------|
| authority | `createAuthorityGate(config)` + `createIrreversibilityClassifier(config)` | Wraps gates in phase1-runtime.js, consulted on pre-command/pre-edit | Classifies actions as trivial/reversible/costly/irreversible. Escalation hierarchy. |
| meta-governance | `createMetaGovernor(config)` | Wraps evolution in advanced-runtime.js | Constitutional invariants (unamendable). Prevents optimizer/evolution from weakening safety. |
| continue-gate | `createContinueGate(config)` | New pre-task check in event-handlers.js | Budget slope detection, rework ratio, coherence threshold. Prevents infinite loops. |

**Week 3: Deterministic enforcement — gateway**

| Module | Factory | Integration point | What it does |
|--------|---------|-------------------|-------------|
| gateway | `createToolGateway(config)` | Wraps gates in phase1-runtime.js | Deterministic tool evaluation + idempotency cache + schema validation + budget metering. |

### Phase B: Long-Horizon Autonomy (5 modules)

These modules enable multi-hour sessions, formal confidence tracking, and
multi-agent memory conflict resolution.

**Week 4-5: Knowledge cluster — truth-anchors + uncertainty + temporal**

| Module | Factory | Integration point | What it does |
|--------|---------|-------------------|-------------|
| truth-anchors | `createTruthAnchorStore(config)` + `createTruthResolver(store)` | New in knowledge-layer.js, consulted by memory-write-gate | Ground truth attestations with HMAC signatures. Resolves memory conflicts. |
| uncertainty | `createUncertaintyLedger(config)` + `createUncertaintyAggregator(ledger)` | New in knowledge-layer.js | Formal confidence intervals with time decay. Contested/refuted belief tracking. |
| temporal | `createTemporalStore(config)` + `createTemporalReasoner(store)` | New in knowledge-layer.js | Bitemporal assertion store. "What was true at time T?" queries. |

**Week 6: Swarm permissions — capabilities**

| Module | Factory | Integration point | What it does |
|--------|---------|-------------------|-------------|
| capabilities | `createCapabilityAlgebra()` | New in advanced-runtime.js, consulted on pre-task/pre-command | Algebraic capability tokens with grant/restrict/delegate/revoke. Per-agent tool/memory/network scopes. |

**Week 7: CI/CD compliance — headless**

| Module | Factory | Integration point | What it does |
|--------|---------|-------------------|-------------|
| headless | `createHeadlessRunner(executor?, ledger?, hash?)` | New standalone script | Runs compliance test suites against golden traces. CI/CD integration. |

### Phase C: Polish (4 modules, opportunistic)

These modules add value but have no critical safety gap if absent.

| Module | Factory | Integration point | When |
|--------|---------|-------------------|------|
| wasm-kernel | `getKernel()` | Replace Node crypto calls in proof/authority paths | When performance profiling shows crypto bottleneck |
| generators | `scaffold(options)` | New `cf-guidance scaffold` command | When onboarding new repos |
| artifacts | `createArtifactLedger(config)` | New in observation-layer.js, appended on post-task | When artifact lineage tracking requested |
| manifest-validator | `createManifestValidator(options)` | New pre-task gate for swarm agent admission | When multi-agent manifest validation needed |

---

## 4. Detailed Integration Specifications

### 4.1 persistence (Priority 1)

**Gap**: Ledger events vanish on restart. No cross-session learning.

**Current code** (`phase1-runtime.js:38`):
```js
this.ledger = createLedger();
```

**Target code**:
```js
import { createPersistentLedger } from '@claude-flow/guidance/persistence';

// In constructor:
this.ledger = this._enabledComponents.has('persistence')
  ? createPersistentLedger({
      storagePath: resolve(this.options.rootDir, '.claude-flow/guidance'),
      maxEvents: 10000,
      compactIntervalMs: 3600000,
      enableWAL: true,
    })
  : createLedger();

// In initialize():
if (this.ledger.init) await this.ledger.init();

// In destroy/shutdown:
if (this.ledger.destroy) this.ledger.destroy();
```

**File changes**:
- `src/guidance/phase1-runtime.js` — add import, replace ledger creation, add init/destroy
- `src/guidance/observation-layer.js` — new file, exports `createNullPersistentLedger()`

**Null-object**:
```js
function createNullPersistentLedger() {
  // Falls back to in-memory createLedger() — existing behavior
  return createLedger();
}
```

**Test**: Verify events persist across runtime re-instantiation. Verify compaction.

---

### 4.2 coherence (Priority 2)

**Gap**: No session degradation detection. Long sessions accumulate errors silently.
conformance-kit internally creates its own coherence instance, masking this gap.

**New file**: `src/guidance/validation-layer.js`

```js
import { createCoherenceScheduler, createEconomicGovernor } from '@claude-flow/guidance/coherence';

export function createCoherenceLayer(options = {}) {
  const scheduler = createCoherenceScheduler({
    thresholds: options.thresholds,
    windowSize: options.windowSize ?? 50,
    checkIntervalMs: options.checkIntervalMs ?? 30000,
  });

  const governor = createEconomicGovernor({
    tokenLimit: options.tokenLimit ?? 500000,
    toolCallLimit: options.toolCallLimit ?? 1000,
    timeLimitMs: options.timeLimitMs ?? 3600000,
  });

  return { scheduler, governor };
}

export function createNullCoherenceScheduler() {
  return {
    computeCoherence() { return 1.0; },
    getPrivilegeLevel() { return 'full'; },
    getScoreHistory() { return []; },
    isHealthy() { return true; },
    isDrifting() { return false; },
    shouldRestrict() { return false; },
    getRecommendation() { return 'continue'; },
  };
}

export function createNullEconomicGovernor() {
  return {
    recordTokenUsage() {},
    recordToolCall() {},
    recordStorageUsage() {},
    checkBudget() { return { withinBudget: true }; },
    getUsageSummary() { return {}; },
    resetPeriod() {},
    estimateRemainingCapacity() { return Infinity; },
    getCostEstimate() { return 0; },
  };
}
```

**Integration in advanced-runtime.js**:
```js
import { createCoherenceScheduler, createEconomicGovernor } from '@claude-flow/guidance/coherence';

// In constructor:
this.coherenceScheduler = this._enabledComponents.has('coherence')
  ? createCoherenceScheduler({ windowSize: 50 })
  : createNullCoherenceScheduler();

this.economicGovernor = this._enabledComponents.has('coherence')
  ? createEconomicGovernor({
      tokenLimit: this.options.tokenLimit ?? 500000,
      toolCallLimit: this.options.toolCallLimit ?? 1000,
    })
  : createNullEconomicGovernor();
```

**Event handler integration** (`scripts/event-handlers.js`):
- After each pre-command/pre-edit/pre-task, call `coherenceScheduler.computeCoherence()`
- If `shouldRestrict()` returns true, add warning to response
- On post-task, call `economicGovernor.recordToolCall()`

**Test**: Verify coherence degrades after repeated violations. Verify budget enforcement.

---

### 4.3 continue-gate (Priority 3)

**Gap**: No infinite-loop prevention. No budget slope detection.

**Integration in event-handlers.js** — add to `pre-task` handler:

```js
import { createContinueGate } from '@claude-flow/guidance/continue-gate';

// In runtime constructor:
this.continueGate = this._enabledComponents.has('continue-gate')
  ? createContinueGate({
      maxConsecutiveSteps: 100,
      maxBudgetSlopePerStep: 0.02,
      minCoherenceForContinue: 0.4,
      maxReworkRatio: 0.3,
      cooldownMs: 5000,
    })
  : createNullContinueGate();

// In pre-task event handler:
const continueDecision = runtime.continueGate.evaluate({
  stepNumber: runtime.stepCounter++,
  coherenceScore: runtime.coherenceScheduler.computeCoherence(metrics, recentEvents),
  reworkRatio: currentReworkRatio,
  budgetUsed: runtime.economicGovernor.getUsageSummary(),
});

if (continueDecision.action === 'stop') {
  return { event: 'pre-task', success: false, blocked: true, reason: 'continue-gate-stop' };
}
if (continueDecision.action === 'pause') {
  // Add warning but allow
  warnings.push(`Continue gate recommends pause: ${continueDecision.reason}`);
}
```

**Null-object**:
```js
function createNullContinueGate() {
  return {
    evaluate() { return { action: 'continue', reason: 'gate-disabled' }; },
    evaluateWithHistory() { return { action: 'continue', reason: 'gate-disabled' }; },
    getHistory() { return []; },
    getStats() { return {}; },
    reset() {},
    getConfig() { return {}; },
  };
}
```

**Dependency**: Reads coherence score from coherence module. Implement after 4.2.

---

### 4.4 gateway (Priority 4)

**Gap**: No idempotency for retried tool calls. No schema validation. No budget metering.

**Integration in phase1-runtime.js** — wraps existing gates:

```js
import { createToolGateway } from '@claude-flow/guidance/gateway';

// In constructor:
this.gates = createGates(this.options.gateConfig);
this.gateway = this._enabledComponents.has('gateway')
  ? createToolGateway({
      gateConfig: this.options.gateConfig,
      budget: this.options.budget,
      idempotencyTtlMs: this.options.idempotencyTtlMs ?? 300000,
      maxCacheSize: 10000,
    })
  : null;

// In preCommand/preToolUse, use gateway.evaluate() if available, else gates directly:
async preCommand(command) {
  this.ensureInitialized();
  if (this.gateway) {
    const evaluation = this.gateway.evaluate('Bash', { command }, {
      agentId: this.options.agentId ?? 'claude-main',
    });
    if (!evaluation.allowed) {
      return { success: false, aborted: true, reason: evaluation.reason };
    }
  }
  return this.executor.execute(HookEvent.PreCommand, {
    command: { raw: command, workingDirectory: this.options.rootDir },
  });
}
```

**Null-object**: Not needed — gateway is null-checked (`if (this.gateway)`).

**Test**: Verify idempotent calls return cached result. Verify budget enforcement.

---

### 4.5 authority (Priority 5)

**Gap**: All actions treated equally. `rm -rf /` has same governance as `git status`.

**New additions to enforcement-layer.js**:

```js
import {
  createAuthorityGate,
  createIrreversibilityClassifier,
} from '@claude-flow/guidance/authority';

export function createAuthorityLayer(options = {}) {
  const classifier = createIrreversibilityClassifier({
    irreversiblePatterns: options.irreversiblePatterns,
    costlyReversiblePatterns: options.costlyReversiblePatterns,
  });

  const authorityGate = createAuthorityGate({
    scopes: options.scopes,
    signatureSecret: options.signatureSecret,
  });

  return { classifier, authorityGate };
}

export function createNullIrreversibilityClassifier() {
  return {
    classify() { return 'reversible'; },
    getRequiredProofLevel() { return 'standard'; },
    requiresPreCommitSimulation() { return false; },
    getPatterns() { return []; },
    addPattern() {},
  };
}

export function createNullAuthorityGate() {
  return {
    canPerform() { return true; },
    requiresEscalation() { return false; },
    getMinimumAuthority() { return 'agent'; },
    recordIntervention() {},
    getInterventions() { return []; },
    verifyIntervention() { return true; },
    registerScope() {},
  };
}
```

**Integration in event-handlers.js pre-command**:

```js
// After gate check, before returning:
const classification = runtime.irreversibilityClassifier.classify(command);
if (classification === 'irreversible' || classification === 'costly') {
  const canProceed = runtime.authorityGate.canPerform('agent', command);
  if (!canProceed) {
    return {
      event: 'pre-command',
      blocked: true,
      reason: `Authority gate: ${classification} action requires escalation`,
      classification,
    };
  }
}
```

---

### 4.6 meta-governance (Priority 6)

**Gap**: Evolution module can weaken safety rules. No constitutional invariants.

**Integration in advanced-runtime.js** — wraps evolution pipeline:

```js
import { createMetaGovernor } from '@claude-flow/guidance/meta-governance';

// In constructor:
this.metaGovernor = this._enabledComponents.has('meta-governance')
  ? createMetaGovernor({
      supermajorityThreshold: 0.75,
      maxAmendmentsPerWindow: 3,
      amendmentWindowMs: 86400000, // 24 hours
      signingKey: this.options.signingKey,
    })
  : createNullMetaGovernor();

// Register constitutional invariants on initialize():
if (this._enabledComponents.has('meta-governance')) {
  this.metaGovernor.addInvariant({
    id: 'no-weaken-security',
    description: 'Security rules cannot be weakened by automated evolution',
    check: (state) => state.securityRulesIntact,
  });
  this.metaGovernor.addInvariant({
    id: 'no-remove-gates',
    description: 'Enforcement gates cannot be removed',
    check: (state) => state.gatesActive,
  });
}

// Wrap evolution.propose():
const originalPropose = this.evolutionPipeline.propose.bind(this.evolutionPipeline);
this.evolutionPipeline.propose = (params) => {
  const valid = this.metaGovernor.validateOptimizerAction({
    type: 'propose',
    ...params,
  });
  if (!valid.allowed) {
    return { proposalId: null, blocked: true, reason: valid.reason };
  }
  return originalPropose(params);
};
```

**Null-object**:
```js
function createNullMetaGovernor() {
  return {
    addInvariant() {},
    removeInvariant() {},
    checkAllInvariants() { return { allPassed: true, results: [] }; },
    proposeAmendment() { return { id: 'null' }; },
    voteOnAmendment() {},
    resolveAmendment() { return { enacted: false }; },
    enactAmendment() {},
    vetoAmendment() {},
    getAmendmentHistory() { return []; },
    validateOptimizerAction() { return { allowed: true }; },
    getConstraints() { return []; },
    resetOptimizerTracking() {},
    getInvariants() { return []; },
    getPendingAmendments() { return []; },
  };
}
```

---

### 4.7 optimizer (Priority 7)

**Gap**: Rules never evolve from data. Violations repeat indefinitely.

**Integration in advanced-runtime.js**:

```js
import { createOptimizer } from '@claude-flow/guidance/optimizer';

// In constructor:
this.optimizer = this._enabledComponents.has('optimizer')
  ? createOptimizer({
      topViolationsPerCycle: 5,
      minEventsForOptimization: 50,
      improvementThreshold: 0.1,
      promotionWins: 2,
      adrPath: resolve(this.rootDir, 'docs/adr'),
    })
  : createNullOptimizer();

// On session-end (in event-handlers.js):
if (runtime.optimizer && runtime.phase1.ledger.eventCount >= 50) {
  const cycle = runtime.optimizer.runCycle(
    runtime.phase1.ledger,
    runtime.phase1.getBundle()
  );
  // Meta-governance check before applying promotions
  if (cycle.promotions.length > 0 && runtime.metaGovernor) {
    const valid = runtime.metaGovernor.validateOptimizerAction({
      type: 'promote',
      changes: cycle.promotions,
    });
    if (valid.allowed) {
      // Apply promotions to bundle
    }
  }
}
```

**Dependency**: Requires persistence (to have enough events). Requires meta-governance
(to constrain promotions). Implement last in Phase A.

---

### 4.8 truth-anchors (Priority 8)

**Integration**: New `src/guidance/knowledge-layer.js`

```js
import { createTruthAnchorStore, createTruthResolver } from '@claude-flow/guidance/truth-anchors';

export function createTruthLayer(options = {}) {
  const store = createTruthAnchorStore({
    signingKey: options.signingKey,
    maxAnchors: options.maxAnchors ?? 50000,
  });
  const resolver = createTruthResolver(store);
  return { store, resolver };
}
```

**Advanced-runtime integration**: Add `this.truthStore` and `this.truthResolver`.
Wire `truthResolver.resolveMemoryConflict()` into memory-write-gate.

---

### 4.9 uncertainty (Priority 9)

**Integration**: Added to knowledge-layer.js

```js
import { createUncertaintyLedger, createUncertaintyAggregator } from '@claude-flow/guidance/uncertainty';

export function createUncertaintyLayer(options = {}) {
  const ledger = createUncertaintyLedger({
    defaultConfidence: options.defaultConfidence ?? 0.7,
    decayRatePerHour: options.decayRatePerHour ?? 0.02,
    minConfidenceForAction: options.minConfidenceForAction ?? 0.3,
  });
  const aggregator = createUncertaintyAggregator(ledger);
  return { ledger, aggregator };
}
```

**Wire**: Feed uncertainty scores into continue-gate's `maxUncertaintyForContinue`.

---

### 4.10 temporal (Priority 10)

**Integration**: Added to knowledge-layer.js

```js
import { createTemporalStore, createTemporalReasoner } from '@claude-flow/guidance/temporal';

export function createTemporalLayer(options = {}) {
  const store = createTemporalStore({
    maxAssertions: options.maxAssertions ?? 100000,
    autoExpireCheckIntervalMs: options.autoExpireCheckIntervalMs ?? 60000,
  });
  const reasoner = createTemporalReasoner(store);
  return { store, reasoner };
}
```

**Wire**: Use `temporalReasoner.whatIsTrue()` to resolve stale memory entries.

---

### 4.11 capabilities (Priority 11)

**Integration in advanced-runtime.js**:

```js
import { createCapabilityAlgebra } from '@claude-flow/guidance/capabilities';

// In constructor:
this.capabilities = this._enabledComponents.has('capabilities')
  ? createCapabilityAlgebra()
  : createNullCapabilityAlgebra();

// On pre-task/pre-command:
const canProceed = this.capabilities.check(agentId, 'tool', toolName, 'execute');
```

---

### 4.12 headless (Priority 12)

**Integration**: New standalone script `scripts/run-compliance.js`

```js
import { createHeadlessRunner, createComplianceSuite } from '@claude-flow/guidance/headless';
import { createPersistentLedger } from '@claude-flow/guidance/persistence';

const ledger = createPersistentLedger({ storagePath: '.claude-flow/guidance' });
await ledger.init();

const runner = createHeadlessRunner(undefined, ledger, guidanceHash);
const suite = createComplianceSuite();
const results = await runner.runSuite(suite);
```

Add npm script: `"guidance:compliance": "node scripts/run-compliance.js"`

---

### 4.13-4.16 Phase C modules (opportunistic)

**wasm-kernel**: Replace `crypto.createHash('sha256')` calls in proof and authority
paths with `getKernel().sha256()`. Feature-detected: if WASM unavailable, JS fallback
is automatic. No null-object needed.

**generators**: Wire into existing `cf-guidance scaffold` command. Replace custom
template logic with `scaffold(options)` call.

**artifacts**: Add `this.artifactLedger` to advanced-runtime.js. Record artifact on
post-task when files are touched. Uses same null-object pattern.

**manifest-validator**: Add agent manifest validation on pre-task when agent manifest
is provided in payload. Compute risk score and assign lane.

---

## 5. New Files Summary

| File | Contents | Phase |
|------|----------|-------|
| `src/guidance/enforcement-layer.js` | gateway, authority, continue-gate, meta-governance null-objects and helpers | A |
| `src/guidance/observation-layer.js` | persistence, artifacts null-objects and helpers | A |
| `src/guidance/validation-layer.js` | coherence, optimizer null-objects and helpers | A |
| `src/guidance/knowledge-layer.js` | truth-anchors, uncertainty, temporal null-objects and helpers | B |
| `src/guidance/infrastructure-layer.js` | wasm-kernel, generators, headless, manifest-validator, capabilities wrappers | B-C |
| `scripts/run-compliance.js` | Headless compliance suite runner | B |

## 6. Modified Files Summary

| File | Changes | Phase |
|------|---------|-------|
| `src/guidance/phase1-runtime.js` | Add persistence (replace createLedger), add gateway (wrap gates) | A |
| `src/guidance/advanced-runtime.js` | Add coherence, continue-gate, authority, meta-governance, optimizer, capabilities, artifacts, truth-anchors, uncertainty, temporal; extend `_loadEnabledComponents()` default set; add null-objects | A-C |
| `scripts/event-handlers.js` | Add continue-gate check in pre-task, authority check in pre-command, coherence tracking on all events, optimizer cycle on session-end | A |
| `src/guidance/integration-runners.js` | Add integration test functions for each new module | A-C |
| `src/guidance/memory-write-gate.js` | Wire truth-anchors resolver for conflict resolution | B |
| `package.json` | Add new export paths for layer files | A |

---

## 7. Component Enable/Disable Configuration

Updated default set in `_loadEnabledComponents()`:

```js
return new Set([
  // Existing
  'trust', 'adversarial', 'proof', 'conformance', 'evolution',
  'autopilot', 'analysis', 'codex',
  // Phase A
  'persistence', 'coherence', 'continue-gate', 'gateway',
  'authority', 'meta-governance', 'optimizer',
  // Phase B
  'truth-anchors', 'uncertainty', 'temporal',
  'capabilities', 'headless',
  // Phase C
  'wasm-kernel', 'generators', 'artifacts', 'manifest-validator',
]);
```

Each can be disabled by editing `components.json`:
```json
{
  "components": ["trust", "adversarial", "proof", "conformance", "evolution",
                  "persistence", "coherence"]
}
```

---

## 8. Testing Strategy

### Unit tests (per module)

Each new module gets a test file in `tests/guidance/`:

| Test file | What it covers |
|-----------|---------------|
| `persistence.test.js` | NDJSON persistence, compaction, WAL, cross-restart recovery |
| `coherence.test.js` | Score computation, privilege levels, budget enforcement |
| `continue-gate.test.js` | Stop/pause/throttle decisions, cooldown, budget slope |
| `gateway.test.js` | Idempotency cache, schema validation, budget metering |
| `authority.test.js` | Irreversibility classification, escalation, intervention recording |
| `meta-governance.test.js` | Invariant enforcement, amendment supermajority, optimizer constraints |
| `optimizer.test.js` | Cycle execution, promotion tracking, ADR generation |
| `knowledge-layer.test.js` | Truth anchors, uncertainty, temporal — lifecycle tests |
| `capabilities.test.js` | Grant/restrict/delegate/revoke, capability composition |
| `headless.test.js` | Compliance suite execution, assertion evaluation |

### Integration tests

| Test | What it covers |
|------|---------------|
| `full-lifecycle.test.js` | pre-task → pre-command → post-edit → post-task → session-end with all modules |
| `degradation.test.js` | Coherence score drops → continue-gate fires → privilege restriction |
| `meta-safety.test.js` | Evolution proposes weakening → meta-governance blocks |
| `persistence-recovery.test.js` | Runtime shutdown → restart → events and state restored |

### Null-object tests

Every null-object factory is tested to ensure it returns the correct method signatures
with safe defaults, preventing runtime errors when a module is disabled.

---

## 9. Risk Assessment

### Risks of NOT implementing (by priority)

| Module | Risk | Likelihood | Impact |
|--------|------|-----------|--------|
| persistence | Events lost every restart | Certain | HIGH |
| coherence | Long sessions accumulate silent errors | High | CRITICAL |
| continue-gate | Infinite loops burn tokens/time | Medium | CRITICAL |
| gateway | Inconsistent swarm enforcement | Medium | MEDIUM |
| authority | Catastrophic irreversible action undetected | Low | CRITICAL |
| meta-governance | Safety rules weakened by optimizer | Medium | HIGH |
| optimizer | Rules stagnate forever | Certain | MEDIUM |

### Risks of implementing

| Risk | Mitigation |
|------|-----------|
| Breaking existing behavior | Null-object pattern: disabled modules return safe defaults |
| Initialization order bugs | Strict phase ordering with dependency checks |
| Performance regression | wasm-kernel optional; coherence check interval configurable |
| Configuration complexity | Sensible defaults; components.json for opt-out |

---

## 10. Dependency Graph

```
compiler ──→ retriever ──→ gates ──→ gateway (wraps gates)
                                  ╰→ authority (classifies actions)
                                  ╰→ continue-gate (reads coherence)
                           ledger ──→ persistence (extends ledger)
                                  ╰→ optimizer (reads ledger events)
                           hooks

trust ──→ adversarial ──→ capabilities (extends permissions)
proof ──→ artifacts (extends lineage)
conformance-kit ──→ coherence (internal dep, now explicit)
evolution ──→ meta-governance (constrains evolution)
         ╰→ optimizer (feeds rule changes)

memory-gate ──→ truth-anchors (conflict resolution)
            ╰→ uncertainty (confidence scoring)
            ╰→ temporal (time-based resolution)

headless (standalone, uses ledger)
wasm-kernel (standalone, perf optimization)
generators (standalone, scaffolding)
manifest-validator (standalone, admission control)
analyzer (standalone, already wired)
```

---

## 11. Migration Notes

### Backwards compatibility

- All new modules default to enabled when `components.json` is absent
- Existing `components.json` files need updating to include new component names
- The `persistence` module extends `RunLedger` — all existing ledger API calls continue to work
- No breaking changes to existing exports or runtime API

### Upgrade path for existing users

1. Update package version
2. Run `cf-guidance scaffold` to generate updated `components.json`
3. Existing behavior unchanged unless new components are explicitly enabled
4. Optional: configure component-specific options via runtime constructor

### Package exports to add

```json
{
  "./enforcement": { "import": "./src/guidance/enforcement-layer.js" },
  "./observation": { "import": "./src/guidance/observation-layer.js" },
  "./validation": { "import": "./src/guidance/validation-layer.js" },
  "./knowledge": { "import": "./src/guidance/knowledge-layer.js" },
  "./infrastructure": { "import": "./src/guidance/infrastructure-layer.js" }
}
```
