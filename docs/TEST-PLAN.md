# Test Plan: 28-Module Guidance Control Plane

Status date: 2026-02-24

## 1. Executive Summary

### Current test coverage

- **26 test files**, 9,653 lines of test code
- **Framework**: Vitest 4.0.18, globals mode, Node environment
- **Coverage thresholds**: 50% statements, 40% branches, 50% functions, 50% lines
- **Mocking**: None. Tests use real temp dirs, real subprocesses, and skip guards for unavailable packages.
- **Pattern**: No `vi.mock()` anywhere. All tests are either pure unit tests or subprocess-based E2E tests.

### Gap analysis

The 16 newly-wired modules have **zero test coverage**. Additionally, several
existing tests need updates because the files they test were modified.

| Category | Existing | Needs update | Needs creation | Total target |
|----------|----------|-------------|----------------|-------------|
| Unit tests (null-objects) | 0 | 0 | 5 files | 5 |
| Unit tests (existing modules) | 0 | 3 files | 0 | 3 |
| Integration tests (new runners) | 0 | 1 file | 1 file | 2 |
| E2E tests (full pipeline) | 1 | 1 file | 1 file | 2 |
| **Total** | **1** | **5** | **7** | **12** |

### Test strategy principles

1. **No mocking library** — continue the existing pattern of real objects + null-objects
2. **Null-objects ARE the mocks** — test them as contract-verifying fakes
3. **Upstream factories accept zero args** — every `createXxx()` works with no config
4. **conformance-kit is the upstream test harness** — use `SimulatedRuntime` + `ConformanceRunner`
5. **Skip guards for optional packages** — E2E tests that need `@claude-flow/guidance` use `try/catch` + `{ skip: true }`

---

## 2. Existing Tests That Need Modification

### 2.1 `phase1-runtime.test.mjs` (322 lines) — MODIFY

**Why**: `phase1-runtime.js` now has persistence, gateway, and destroy().

**Changes needed**:

| Area | Current | Update |
|------|---------|--------|
| Constructor tests | Tests `createLedger()` | Add: tests for `enablePersistence` / `enableGateway` options |
| Constructor tests | No gateway property | Add: `runtime.gateway` exists and has expected methods |
| initialize() | No ledger.init() | Add: verify `ledger.init()` is called when persistence enabled |
| preCommand | Direct hook execution | Add: gateway evaluation before hook execution |
| preToolUse | Direct hook execution | Add: gateway evaluation before hook execution |
| getStatus | 8 fields | Add: `persistenceEnabled`, `storageStats`, `gatewayEnabled`, `gatewayBudget` |
| destroy() | Method doesn't exist | Add: new `describe('destroy')` block |

**New tests to add** (~80 lines):

```
describe('GuidancePhase1Runtime: persistence')
  it('uses persistent ledger when enablePersistence is true')
  it('falls back to in-memory ledger when enablePersistence is false')
  it('calls ledger.init() during initialize')
  it('calls ledger.save() and ledger.destroy() on destroy()')

describe('GuidancePhase1Runtime: gateway')
  it('creates gateway when enableGateway is true')
  it('creates null gateway when enableGateway is false')
  it('preCommand checks gateway before hook execution')
  it('preCommand returns gatewayBlocked when gateway denies')
  it('preToolUse checks gateway before hook execution')
  it('preToolUse returns gatewayBlocked when gateway denies')
  it('getStatus includes gateway budget')
```

### 2.2 `advanced-runtime-full.test.mjs` (446 lines) — MODIFY

**Why**: `advanced-runtime.js` now has 16 new module properties + extended status/state.

**Changes needed**:

| Area | Current | Update |
|------|---------|--------|
| Constructor | Tests 7 original subsystems | Add: tests for 16 new module properties |
| _loadEnabledComponents | Default set has 8 | Default set now has 24 components |
| initialize() | No meta-governance invariants | Add: verify invariants registered |
| persistState() | 3 state fields | Add: 6 new state fields |
| getStatus() | ~10 fields | Add: 11 new fields |

**New tests to add** (~120 lines):

```
describe('GuidanceAdvancedRuntime: new modules')
  it('creates coherenceScheduler when coherence enabled')
  it('creates null coherenceScheduler when coherence disabled')
  it('creates economicGovernor when coherence enabled')
  it('creates continueGate when continue-gate enabled')
  it('creates null continueGate when continue-gate disabled')
  it('creates irreversibilityClassifier when authority enabled')
  it('creates authorityGate when authority enabled')
  it('creates metaGovernor when meta-governance enabled')
  it('creates optimizer when optimizer enabled')
  it('creates truthAnchorStore when truth-anchors enabled')
  it('creates truthResolver when truth-anchors enabled')
  it('creates uncertaintyLedger when uncertainty enabled')
  it('creates uncertaintyAggregator when uncertainty enabled')
  it('creates temporalStore when temporal enabled')
  it('creates temporalReasoner when temporal enabled')
  it('creates capabilities when capabilities enabled')
  it('creates artifactLedger when artifacts enabled')
  it('creates manifestValidator when manifest-validator enabled')
  it('initializes stepCounter to 0')

describe('GuidanceAdvancedRuntime: meta-governance invariants')
  it('registers no-weaken-security invariant on initialize')
  it('registers no-remove-gates invariant on initialize')
  it('registers no-disable-proof invariant on initialize')
  it('skips invariant registration when meta-governance disabled')

describe('GuidanceAdvancedRuntime: extended persistState')
  it('persists coherence history')
  it('persists economic usage')
  it('persists continue gate stats')
  it('persists authority interventions')
  it('persists optimizer last run')
  it('persists step counter')

describe('GuidanceAdvancedRuntime: extended getStatus')
  it('includes coherence score and health')
  it('includes economic budget')
  it('includes continue gate stats')
  it('includes authority interventions count')
  it('includes meta-governance invariant count')
  it('includes optimizer last run')
  it('includes truth anchors active count')
  it('includes uncertainty contested count')
  it('includes capabilities granted count')
  it('includes artifacts recorded count')
```

### 2.3 `event-handlers.test.mjs` (493 lines) — MODIFY

**Why**: `event-handlers.js` now has continue-gate, authority, coherence tracking, and optimizer.

**Changes needed**:

| Area | Current | Update |
|------|---------|--------|
| pre-command | No authority check | Add: authority/irreversibility classification tests |
| pre-command | No coherence tracking | Add: coherence field in response |
| pre-task | No continue-gate | Add: continue-gate evaluation tests |
| pre-task | No coherence tracking | Add: coherence field in response |
| pre-edit | No coherence tracking | Add: coherence field in response |
| session-end | No optimizer | Add: optimizer cycle tests |

**New tests to add** (~150 lines):

```
describe('runEvent: pre-command authority')
  it('classifies irreversible commands')
  it('blocks irreversible commands at agent level')
  it('allows reversible commands at agent level')
  it('includes classification in response')
  it('adds authority-blocked violation')
  it('includes coherence tracking in response')

describe('runEvent: pre-task continue-gate')
  it('evaluates continue-gate before task execution')
  it('blocks when continue-gate returns stop')
  it('allows when continue-gate returns continue')
  it('increments step counter')
  it('includes continueDecision in response')
  it('includes coherence tracking in response')

describe('runEvent: pre-edit coherence')
  it('includes coherence tracking in response')

describe('runEvent: session-end optimizer')
  it('runs optimizer cycle when enough events accumulated')
  it('skips optimizer when below event threshold')
  it('validates promotions through meta-governance')
  it('blocks promotions when meta-governance denies')
  it('includes optimizer result in response')
  it('handles optimizer errors gracefully')
```

### 2.4 `integration-runners.test.mjs` (461 lines) — MODIFY

**Why**: 7 new integration runner functions added.

**Changes needed**:

| Area | Current | Update |
|------|---------|--------|
| createIntegrationRunners | Returns 6 functions | Returns 13 functions |
| runAllIntegrations | Runs 6 integrations | Runs 13 integrations |
| Individual runner tests | 6 describe blocks | Add 7 new describe blocks |

**New tests to add** (~250 lines):

```
describe('runCoherenceIntegration')
  it('records tool usage to economic governor')
  it('computes coherence score')
  it('determines privilege level')
  it('checks budget status')
  it('returns usage summary')
  it('persists state')

describe('runContinueGateIntegration')
  it('evaluates 5 steps with degrading coherence')
  it('returns decisions array')
  it('returns gate stats')
  it('persists state')

describe('runAuthorityIntegration')
  it('classifies 5 test actions')
  it('returns classification per action')
  it('returns canPerform per action')
  it('returns requiredLevel per action')
  it('persists state')

describe('runMetaGovernanceIntegration')
  it('checks invariants')
  it('proposes amendment')
  it('validates optimizer action')
  it('reports pending amendments')
  it('persists state')

describe('runOptimizerIntegration')
  it('runs optimizer cycle')
  it('reports cycle number')
  it('reports proposed changes count')
  it('persists state')

describe('runKnowledgeIntegration')
  it('anchors truth claim')
  it('resolves memory conflict')
  it('asserts uncertain belief')
  it('computes confidence')
  it('checks actionability')
  it('asserts temporal claim')
  it('queries current truth')
  it('persists state')

describe('runCapabilitiesIntegration')
  it('grants capability')
  it('checks allowed capability')
  it('checks denied capability')
  it('lists agent capabilities')
  it('persists state')

describe('runAllIntegrations (updated)')
  it('runs all 13 integrations')
  it('includes all 13 results in report')
  it('includes generatedAt')
```

### 2.5 `components.test.mjs` (391 lines) — MODIFY

**Why**: Default component set expanded from 8 to 24.

**Changes needed**:

- Update test that checks `_loadEnabledComponents()` default set size
- Update any hardcoded component name lists
- Add tests for new component names in enable/disable gating

---

## 3. New Test Files to Create

### 3.1 `null-objects-enforcement.test.mjs` — CREATE

**Purpose**: Verify all enforcement-layer null-objects match upstream API contracts.

**Approach**: Call every method on every null-object, verify return types and safe defaults.

```
describe('createNullToolGateway')
  it('evaluate returns allowed:true')
  it('recordCall is no-op')
  it('validateSchema returns valid:true')
  it('checkBudget returns withinBudget:true')
  it('getBudget returns all-infinity limits')
  it('getCallHistory returns empty array')
  it('resetBudget is no-op')

describe('createNullAuthorityGate')
  it('canPerform returns true for any level/action')
  it('requiresEscalation returns false')
  it('getMinimumAuthority returns agent')
  it('recordIntervention is no-op')
  it('getInterventions returns empty array')

describe('createNullIrreversibilityClassifier')
  it('classify returns reversible for any action')
  it('getRequiredProofLevel returns standard')
  it('requiresPreCommitSimulation returns false')
  it('getPatterns returns empty array')

describe('createNullContinueGate')
  it('evaluate returns action:continue')
  it('evaluateWithHistory returns action:continue')
  it('getHistory returns empty array')
  it('getStats returns zero counters')
  it('reset is no-op')

describe('createNullMetaGovernor')
  it('addInvariant is no-op')
  it('checkAllInvariants returns allPassed:true')
  it('proposeAmendment returns null-amendment')
  it('validateOptimizerAction returns allowed:true')
  it('getInvariants returns empty array')
  it('getPendingAmendments returns empty array')
```

**Estimated size**: ~120 lines

### 3.2 `null-objects-observation.test.mjs` — CREATE

```
describe('createNullPersistentLedger')
  it('is an instance of upstream RunLedger (or has same interface)')
  it('init is no-op async')
  it('save is no-op async')
  it('load is no-op async')
  it('compact is no-op async')
  it('destroy is no-op')
  it('getStorageStats returns zero values')
  it('getEventStore returns null')
  it('logEvent works (delegates to in-memory ledger)')
  it('eventCount starts at 0')

describe('createNullArtifactLedger')
  it('record returns null-artifact')
  it('verify returns valid:true')
  it('get returns null')
  it('getByRun returns empty array')
  it('getByKind returns empty array')
  it('search returns empty array')
  it('export returns empty artifacts')
  it('getStats returns zeros')
```

**Estimated size**: ~80 lines

### 3.3 `null-objects-validation.test.mjs` — CREATE

```
describe('createNullCoherenceScheduler')
  it('computeCoherence returns 1.0')
  it('getPrivilegeLevel returns full')
  it('isHealthy returns true')
  it('isDrifting returns false')
  it('shouldRestrict returns false')
  it('getRecommendation returns continue')

describe('createNullEconomicGovernor')
  it('recordTokenUsage is no-op')
  it('recordToolCall is no-op')
  it('checkBudget returns withinBudget:true')
  it('getUsageSummary returns all-infinity limits')
  it('estimateRemainingCapacity returns Infinity')
  it('getCostEstimate returns 0')

describe('createNullOptimizer')
  it('runCycle returns skipped:true')
  it('proposeChanges returns empty array')
  it('evaluateChange returns improved:false')
  it('getADRs returns empty array')
  it('getPromotionTracker returns empty Map')
  it('lastRun is null')
```

**Estimated size**: ~80 lines

### 3.4 `null-objects-knowledge.test.mjs` — CREATE

```
describe('createNullTruthAnchorStore')
  it('anchor returns null-anchor')
  it('get returns null')
  it('getActive returns empty array')
  it('verify returns valid:true')
  it('resolve returns internal resolution')
  it('exportAnchors returns empty')

describe('createNullTruthResolver')
  it('resolveMemoryConflict returns resolved:true')
  it('resolveDecisionConflict returns the same action')
  it('getGroundTruth returns null')

describe('createNullUncertaintyLedger')
  it('assert returns belief with default confidence')
  it('getBelief returns null')
  it('getContested returns empty array')
  it('computeConfidence returns mid-range interval')
  it('isActionable returns true')
  it('exportBeliefs returns empty')

describe('createNullUncertaintyAggregator')
  it('aggregate returns mid-range interval')
  it('worstCase returns lower interval')
  it('bestCase returns upper interval')
  it('anyContested returns false')
  it('allConfirmed returns true')

describe('createNullTemporalStore')
  it('assert returns null-assertion')
  it('get returns null')
  it('getActiveAt returns empty array')
  it('getCurrentTruth returns empty array')
  it('reconcile returns no conflicts')
  it('pruneExpired returns 0')

describe('createNullTemporalReasoner')
  it('whatWasTrue returns empty array')
  it('whatIsTrue returns empty array')
  it('whatWillBeTrue returns empty array')
  it('hasChanged returns false')
  it('conflictsAt returns empty array')
```

**Estimated size**: ~120 lines

### 3.5 `null-objects-infrastructure.test.mjs` — CREATE

```
describe('createNullCapabilityAlgebra')
  it('grant returns null-cap')
  it('check returns allowed:true for any scope')
  it('getCapabilities returns empty array')
  it('getCapability returns null')
  it('compose returns first arg')
  it('isSubset returns true')
  it('revoke is no-op')
  it('delegate returns capability unchanged')

describe('createNullManifestValidator')
  it('validate returns valid:true')
  it('computeRiskScore returns 0')
  it('selectLane returns standard')

describe('createNullConformanceSuite')
  it('run returns passed:true')
  it('getTraces returns empty array')
  it('createDefaultTraces returns empty array')

describe('createNullHeadlessRunner')
  it('runTask returns passed:true, skipped:true')
  it('runSuite returns all skipped')

describe('createNullWasmKernel')
  it('available is false')
  it('sha256 returns valid hex hash')
  it('hmacSha256 returns valid hex hash')
  it('sha256 is deterministic for same input')
  it('sha256 differs for different inputs')
  it('scanSecrets returns empty array')
  it('detectDestructive returns null')

describe('createNullGenerators')
  it('generateClaudeMd returns markdown string')
  it('generateClaudeLocalMd returns markdown string')
  it('scaffold returns object with files Map')
```

**Estimated size**: ~120 lines

### 3.6 `upstream-modules.test.mjs` — CREATE

**Purpose**: Integration tests that exercise the real upstream `createXxx()` factories
with zero-arg config to verify they work in our environment. Uses skip guards.

**Approach**: Dynamic import each module, call factory with no args, verify it returns
an object with the expected method names.

```
describe('upstream module smoke tests', { skip: !upstreamAvailable })

  describe('persistence')
    it('createPersistentLedger() returns object with init/save/load/compact/destroy')
    it('extends RunLedger interface')

  describe('coherence')
    it('createCoherenceScheduler() returns object with computeCoherence/getPrivilegeLevel')
    it('createEconomicGovernor() returns object with recordTokenUsage/checkBudget')

  describe('continue-gate')
    it('createContinueGate() returns object with evaluate/evaluateWithHistory/getStats')
    it('evaluate with defaults returns continue')

  describe('gateway')
    it('createToolGateway() returns object with evaluate/recordCall/validateSchema')

  describe('authority')
    it('createAuthorityGate() returns object with canPerform/requiresEscalation')
    it('createIrreversibilityClassifier() returns object with classify/getRequiredProofLevel')
    it('isHigherAuthority correctly orders levels')
    it('getAuthorityHierarchy returns 4 levels')

  describe('meta-governance')
    it('createMetaGovernor() returns object with addInvariant/checkAllInvariants/validateOptimizerAction')

  describe('optimizer')
    it('createOptimizer() returns object with runCycle/proposeChanges')

  describe('truth-anchors')
    it('createTruthAnchorStore() returns object with anchor/get/verify/resolve')
    it('createTruthResolver(store) returns object with resolveMemoryConflict')

  describe('uncertainty')
    it('createUncertaintyLedger() returns object with assert/computeConfidence/isActionable')
    it('createUncertaintyAggregator(ledger) returns object with aggregate')

  describe('temporal')
    it('createTemporalStore() returns object with assert/getActiveAt/reconcile')
    it('createTemporalReasoner(store) returns object with whatIsTrue')

  describe('capabilities')
    it('createCapabilityAlgebra() returns object with grant/check/delegate/revoke')

  describe('headless')
    it('createHeadlessRunner() returns object with runTask/runSuite')
    it('createComplianceSuite() returns array of TestTask objects')

  describe('artifacts')
    it('createArtifactLedger() returns object with record/verify/getStats')

  describe('manifest-validator')
    it('createManifestValidator() returns object with validate/computeRiskScore')
    it('createConformanceSuite() returns object with run/getTraces')

  describe('wasm-kernel')
    it('getKernel() returns object with sha256/hmacSha256/available')
    it('resetKernel() resets singleton')
    it('isWasmAvailable() returns boolean')

  describe('generators')
    it('generateClaudeMd with minimal profile returns markdown')
    it('scaffold with minimal options returns files Map')
```

**Estimated size**: ~300 lines

### 3.7 `e2e-full-pipeline.test.mjs` — CREATE

**Purpose**: End-to-end test that exercises the entire 28-module pipeline through
the event handler, verifying all modules interact correctly.

**Approach**: Create a real `GuidanceAdvancedRuntime` in a temp dir, run a complete
session lifecycle, verify all new module outputs.

```
describe('e2e: full 28-module pipeline', { skip: !upstreamAvailable })

  describe('session lifecycle with all modules')
    it('initializes with all 24 default components')
    it('status reports all new module fields')

  describe('pre-command with authority')
    it('safe command includes classification:reversible')
    it('destructive command includes authority check')
    it('irreversible command is blocked at agent level')
    it('response includes coherence tracking')

  describe('pre-task with continue-gate')
    it('first task includes continueDecision:continue')
    it('response includes coherence score')
    it('step counter increments')

  describe('post-task records artifacts')
    it('post-task completes successfully')
    it('trust accumulated from lifecycle')

  describe('session-end with optimizer')
    it('conformance runs')
    it('evolution runs')
    it('optimizer result included (skipped if below threshold)')

  describe('coherence degradation scenario')
    it('repeated violations lower coherence score')
    it('coherence eventually triggers shouldRestrict')
    it('continue-gate stops after sufficient degradation')

  describe('meta-governance safety')
    it('evolution proposal checked against invariants')
    it('unsafe promotion blocked by meta-governance')

  describe('knowledge layer round-trip')
    it('truth anchor stored and retrieved')
    it('uncertainty belief asserted and queried')
    it('temporal assertion stored and reasoned about')

  describe('capability gating')
    it('granted capability allows action')
    it('missing capability denies action')

  describe('state persistence across restart')
    it('all new module state survives runtime restart')
    it('coherence history restored')
    it('authority interventions restored')
    it('step counter restored')
```

**Estimated size**: ~400 lines

---

## 4. Tests to Delete

**None.** No existing tests need to be deleted. All 26 current test files remain valid.
The tests that need modification (Section 2) are additive — existing test cases stay
unchanged, new test cases are appended.

---

## 5. Test File Inventory (Target State)

### Existing (keep as-is): 21 files

| File | Lines | Status |
|------|-------|--------|
| `utils.test.mjs` | 570 | Keep |
| `utils-cjs.test.mjs` | 606 | Keep |
| `default-settings.test.mjs` | 364 | Keep |
| `installer.test.mjs` | 230 | Keep |
| `installer-helpers.test.mjs` | 314 | Keep |
| `enforcement.test.mjs` | 148 | Keep |
| `enforcement-internals.test.mjs` | 338 | Keep |
| `embedding-provider.test.mjs` | 254 | Keep |
| `content-aware-executor.test.mjs` | 130 | Keep |
| `memory-write-gate.test.mjs` | 599 | Keep |
| `memory-backend.test.mjs` | 89 | Keep |
| `memory-config.test.mjs` | 281 | Keep |
| `memory-concurrent.test.mjs` | 118 | Keep |
| `memory-error-handling.test.mjs` | 123 | Keep |
| `memory-lifecycle.test.mjs` | 130 | Keep |
| `memory-namespace.test.mjs` | 143 | Keep |
| `autopilot.test.mjs` | 365 | Keep |
| `codex-bridge.test.mjs` | 361 | Keep |
| `e2e-init-install.test.mjs` | 353 | Keep |
| `e2e-memory-agentdb-v3.test.mjs` | 1122 | Keep |
| `e2e-behavioral-integration.test.mjs` | 902 | Keep |

### Existing (modify): 5 files

| File | Current lines | Est. new lines | Change type |
|------|---------------|----------------|-------------|
| `phase1-runtime.test.mjs` | 322 | +80 | Add persistence + gateway tests |
| `advanced-runtime-full.test.mjs` | 446 | +120 | Add 16 new module + state tests |
| `event-handlers.test.mjs` | 493 | +150 | Add authority + continue-gate + coherence + optimizer tests |
| `integration-runners.test.mjs` | 461 | +250 | Add 7 new runner tests |
| `components.test.mjs` | 391 | +30 | Update default component set |

### New: 7 files

| File | Est. lines | Type |
|------|-----------|------|
| `null-objects-enforcement.test.mjs` | 120 | Unit (pure) |
| `null-objects-observation.test.mjs` | 80 | Unit (pure) |
| `null-objects-validation.test.mjs` | 80 | Unit (pure) |
| `null-objects-knowledge.test.mjs` | 120 | Unit (pure) |
| `null-objects-infrastructure.test.mjs` | 120 | Unit (pure) |
| `upstream-modules.test.mjs` | 300 | Integration (skip-guarded) |
| `e2e-full-pipeline.test.mjs` | 400 | E2E (skip-guarded) |

### Summary

| Metric | Current | Target |
|--------|---------|--------|
| Test files | 26 | 33 |
| Test lines | 9,653 | ~11,383 |
| Null-object coverage | 0% | 100% (22 factories) |
| New module unit coverage | 0% | ~85% |
| New module integration coverage | 0% | ~90% |
| E2E pipeline coverage | 12 modules | 28 modules |

---

## 6. Implementation Order

### Wave 1: Null-object unit tests (no dependencies, pure, fast)

These can be written and run immediately with zero setup. They validate
that every null-object factory returns the correct API surface with safe
defaults. This is the foundation — if a null-object is wrong, integration
tests will fail with confusing errors.

1. `null-objects-enforcement.test.mjs`
2. `null-objects-observation.test.mjs`
3. `null-objects-validation.test.mjs`
4. `null-objects-knowledge.test.mjs`
5. `null-objects-infrastructure.test.mjs`

**Parallel**: All 5 can be written simultaneously — no interdependencies.

### Wave 2: Modified existing tests (extend coverage of changed files)

These update existing tests to cover the new code paths added to
phase1-runtime, advanced-runtime, event-handlers, and integration-runners.

6. `phase1-runtime.test.mjs` — add persistence + gateway tests
7. `advanced-runtime-full.test.mjs` — add new module + state tests
8. `event-handlers.test.mjs` — add authority + continue-gate + optimizer tests
9. `integration-runners.test.mjs` — add 7 new runner tests
10. `components.test.mjs` — update default component set

**Partial parallelism**: 6 and 7 can be done in parallel. 8 depends on 7
(needs the runtime to create test instances). 9 depends on 7. 10 is independent.

### Wave 3: Upstream smoke tests + E2E pipeline

11. `upstream-modules.test.mjs` — verify all 16 upstream factories work
12. `e2e-full-pipeline.test.mjs` — full 28-module lifecycle test

**Sequential**: 12 depends on all prior work being stable. 11 can be done
in parallel with Wave 2.

---

## 7. vitest.config.js Updates

No changes needed to the vitest config. The existing patterns cover the new files:

- `include: ['tests/**/*.test.{js,mjs}']` matches all new `.test.mjs` files
- `coverage.include: ['src/**/*.{js,mjs,cjs}']` covers all new layer files
- The existing coverage thresholds (50/40/50/50) should be maintained initially

**Future consideration**: Once all tests are written, raise thresholds to 60/50/60/60.

---

## 8. Testing Patterns Reference

### Pattern 1: Null-object contract test

```js
import { createNullToolGateway } from '../src/guidance/enforcement-layer.js';

describe('createNullToolGateway', () => {
  it('evaluate returns allowed:true', () => {
    const gw = createNullToolGateway();
    const result = gw.evaluate('Bash', { command: 'rm -rf /' });
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('gateway-disabled');
  });

  it('getBudget returns all-infinity limits', () => {
    const gw = createNullToolGateway();
    const budget = gw.getBudget();
    expect(budget.tokenBudget.limit).toBe(Infinity);
    expect(budget.toolCallBudget.limit).toBe(Infinity);
  });
});
```

### Pattern 2: Component gating test (existing pattern)

```js
import { GuidanceAdvancedRuntime } from '../src/guidance/advanced-runtime.js';

it('uses null coherence when disabled', () => {
  // Write components.json with only ['trust', 'proof']
  writeJson(componentsPath, { components: ['trust', 'proof'] });
  const runtime = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
  const score = runtime.coherenceScheduler.computeCoherence({}, []);
  expect(score).toBe(1.0); // null-object returns 1.0
});
```

### Pattern 3: Event handler integration test (existing pattern)

```js
import { runEvent } from '../scripts/event-handlers.js';

it('pre-command includes authority classification', async () => {
  const result = await runEvent(runtime, 'pre-command', {
    command: 'rm -rf /',
  });
  expect(result.classification).toBeDefined();
  expect(result.authorityBlocked).toBeDefined();
  expect(result.coherence).toBeDefined();
  expect(result.coherence.score).toBeTypeOf('number');
});
```

### Pattern 4: Skip-guarded upstream test

```js
let upstreamAvailable = false;
try {
  await import('@claude-flow/guidance/coherence');
  upstreamAvailable = true;
} catch {}

describe('coherence upstream', { skip: !upstreamAvailable }, () => {
  it('createCoherenceScheduler() returns expected interface', async () => {
    const { createCoherenceScheduler } = await import('@claude-flow/guidance/coherence');
    const scheduler = createCoherenceScheduler();
    expect(scheduler.computeCoherence).toBeTypeOf('function');
    expect(scheduler.getPrivilegeLevel).toBeTypeOf('function');
    expect(scheduler.isHealthy).toBeTypeOf('function');
  });
});
```

### Pattern 5: Full lifecycle E2E test (existing pattern)

```js
// Uses real temp dir with CLAUDE.md, runs full event sequence
const tmpDir = mkdtempSync(join(tmpdir(), 'guidance-e2e-'));
writeFileSync(join(tmpDir, 'CLAUDE.md'), '# Test\n- NEVER use force push\n');

const runtime = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
await runtime.initialize();

const preTask = await runEvent(runtime, 'pre-task', {
  taskDescription: 'Implement auth guard',
});
expect(preTask.blocked).toBe(false);
expect(preTask.continueDecision).toBeDefined();

const preCmd = await runEvent(runtime, 'pre-command', {
  command: 'git push --force origin main',
  taskId: preTask.taskId,
});
expect(preCmd.blocked).toBe(true);
expect(preCmd.classification).toBeDefined();
```

---

## 9. Upstream Test Helpers We Should Use

The upstream package provides three test-oriented facilities:

| Facility | Module | Usage |
|----------|--------|-------|
| `SimulatedRuntime` | `conformance-kit` | Full in-process runtime mock with injectable services |
| `ICommandExecutor` | `headless` | Injectable seam for testing headless runner without real processes |
| `createDefaultTraces()` | `manifest-validator` | 5 golden traces for conformance testing |
| `resetKernel()` | `wasm-kernel` | Reset singleton between tests |

These should be used in `upstream-modules.test.mjs` and `e2e-full-pipeline.test.mjs`.

---

## 10. Error Conditions to Test

From upstream type analysis, these error conditions should have explicit test coverage:

| Module | Condition | Expected behavior |
|--------|-----------|-------------------|
| persistence | Lock held by another process | throws |
| authority | ReDoS pattern in `addPattern()` | throws |
| truth-anchors | `supersede(nonexistentId)` | throws |
| capabilities | `delegate()` non-delegatable | throws |
| capabilities | `compose()` mismatched scope | throws |
| temporal | `importAssertions()` bad version | throws |
| uncertainty | `importBeliefs()` bad version | throws |
| artifacts | `import()` bad version | throws |
| manifest-validator | Any validation error | fails closed (returns reject) |
| temporal | `supersede()` missing oldId | returns undefined (does NOT throw) |

These go in `upstream-modules.test.mjs` under a `describe('error conditions')` block.
