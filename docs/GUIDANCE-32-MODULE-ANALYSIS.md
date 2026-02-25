# Guidance Control Plane: 32-Module Analysis Report

**Package:** `@claude-flow/guidance` v3.0.0-alpha.1
**Date:** 2026-02-24
**Scope:** All 32 modules evaluated for inclusion in our Guidance Control Plane implementation

---

## 1. Executive Summary

`@claude-flow/guidance` ships **32 TypeScript modules** implementing a complete
AI governance control plane for Claude Code sessions. The package is backed by
**25 ADRs** (G001--G025), uses `vitest` with 1,331 tests, and totals ~15,712 LOC
across the `dist/` directory.

**Target state:** Adopt **24 of 32 modules (75%)** organized across **8
architectural layers**. Skip 3 permanently (ruvbot-integration, crypto-utils,
index facade). Defer 5 to opportunistic adoption.

**Architecture at target state:**

```
+------------------------------------------------------------------+
|                    GOVERNANCE CONTROL PLANE                       |
+------------------------------------------------------------------+
|                                                                  |
|  POLICY          compiler, retriever, generators                 |
|  Define rules    "What should the agent do?"                     |
|                                                                  |
|  ENFORCEMENT     gates, gateway, hooks, authority,               |
|  Apply rules     continue-gate, memory-gate                      |
|                  "Stop the agent from doing wrong things"         |
|                                                                  |
|  OBSERVATION     ledger, persistence, proof, artifacts           |
|  Record events   "What actually happened?"                       |
|                                                                  |
|  LEARNING        optimizer, evolution, meta-governance, analyzer  |
|  Improve rules   "How do we get better?"                         |
|                                                                  |
|  TRUST           trust, adversarial, capabilities                |
|  Agent safety    "Which agents can do what?"                     |
|                                                                  |
|  KNOWLEDGE       coherence, truth-anchors, uncertainty, temporal |
|  Beliefs & facts "What do we know, and how sure are we?"         |
|                                                                  |
|  VALIDATION      conformance-kit, headless, manifest-validator   |
|  Prove it works  "Does the system actually behave correctly?"    |
|                                                                  |
|  INFRASTRUCTURE  wasm-kernel, crypto-utils, types, index         |
|  Supporting      "Plumbing"                                      |
|                                                                  |
+------------------------------------------------------------------+
```

**Key insight:** The old 5-tier model (integrated/must-have/should-have/nice/skip)
conflated *what a module does* with *when we happened to adopt it*. The 12
"already integrated" modules are spread across 6 of 8 layers -- but no layer
is complete. Every layer has gaps.

---

## 2. Methodology

### Sources Analyzed
- All 32 `.js` and `.d.ts` files in `@claude-flow/guidance/dist/`
- `README.md` (1,195 lines) including 25 ADR references
- `package.json` (198 lines) with 28 named export paths
- Our wrapper docs: `guidance-control-plane.md`, `guidance-implementation-guide.md`
- Our hook handler and integration scripts

### Evaluation Criteria
Each module was scored on four axes:

| Criterion | Weight | Description |
|-----------|--------|-------------|
| Safety gap | 40% | What goes wrong if we don't have this module? |
| Integration complexity | 25% | LOC to wire, dependencies required, breaking changes |
| Maintenance burden | 20% | Update frequency, upstream API stability, test surface |
| Performance impact | 15% | Runtime cost, memory footprint, latency |

### Architectural Layer Definitions

| Layer | Purpose | Question It Answers |
|-------|---------|-------------------|
| **Policy** | Define and retrieve governance rules | "What should the agent do?" |
| **Enforcement** | Block/warn/allow at runtime | "Is this action permitted?" |
| **Observation** | Durable record of what happened | "What actually happened?" |
| **Learning** | Improve rules from data | "How do we get better over time?" |
| **Trust** | Agent identity and privilege | "Which agents can do what?" |
| **Knowledge** | Facts, beliefs, confidence, time | "What do we know, and how sure?" |
| **Validation** | Prove the system works | "Does governance actually behave?" |
| **Infrastructure** | Utilities and plumbing | "What supports everything else?" |

### Priority Definitions (within each layer)

| Priority | Meaning |
|----------|---------|
| **Essential** | Layer is broken without this module |
| **Completing** | Layer works but has a dangerous gap |
| **Extending** | Layer works; this adds depth |
| **Skip** | Not applicable to our architecture |

---

## 3. Module Dependency Graph

### Inter-Module Import Edges

```
compiler ──────────────► retriever
                              │
                              ▼
gates ◄──────────────── hooks ──────► ledger
  │                                     │
  │                                     ▼
  ▼                              persistence
gateway ──────────────────┐
  │                       │
  ▼                       ▼
conformance-kit ◄─── coherence
  │                    │
  ▼                    ▼
memory-gate        continue-gate
  │
  ▼
proof ◄──── crypto-utils
  │
  ▼
evolution ──► meta-governance
  │
  ▼
authority ──► crypto-utils

trust (leaf)
adversarial (leaf)
analyzer ──► proof
optimizer ──► ledger
truth-anchors (leaf)
uncertainty (leaf)
temporal (leaf)
capabilities (leaf)
headless (leaf)
wasm-kernel (leaf)
generators (leaf)
artifacts (leaf)
manifest-validator (leaf)
ruvbot-integration ──► memory-gate, coherence
index ──► ALL 23 re-exported modules
```

### Five Adoption Clusters

**Cluster 1: Core Loop** (already adopted)
compiler -> retriever -> gates -> hooks -> ledger
*Status: Integrated via upstream CLI.*

**Cluster 2: Feedback Loop** (Tier 2, highest priority)
persistence + optimizer + coherence + continue-gate
*Gap: Without persistence, ledger events vanish on restart. Without coherence,
long sessions accumulate errors unchecked. Without continue-gate, infinite
loops can burn tokens indefinitely.*

**Cluster 3: Safety Cluster** (Tier 2)
authority + meta-governance
*Gap: Without authority, `rm -rf /` has the same governance as `git status`.
Without meta-governance, evolution/optimizer could weaken safety rules.*

**Cluster 4: Knowledge Cluster** (Tier 3)
truth-anchors + uncertainty + temporal
*Needed when: Multi-agent memory conflicts arise, formal confidence scoring
is required, or sessions regularly exceed 1 hour.*

**Cluster 5: Conformance Dependencies** (already adopted, but incomplete)
conformance-kit internally imports coherence and gateway -- modules we don't
have wired. The conformance tests pass because SimulatedRuntime creates its
own instances, but our live runtime lacks these components.

---

## 4. Per-Module Analysis

### Module 1: compiler (~418 LOC)

**Purpose:** Parses `CLAUDE.md` and optional `CLAUDE.local.md` into a compiled
policy bundle consisting of a constitution (always-loaded invariants), rule
shards (task-scoped), and a manifest (machine-readable index with hashes).

**ADR:** G001 (Guidance Control Plane), G002 (Constitution/Shard Split)

**Key Exports:**
- `GuidanceCompiler` class
- `createCompiler(config?)` factory

**How It Works:** Regex-based extraction of rules from markdown. Rules are
tagged with risk class, tool classes, intents, domains, scopes, verifiers, and
priority. Constitution is built from the first 30--60 lines plus sections with
safety/security/invariant/critical keywords. Shards are demarcated by headings
or horizontal rules. Local rules override root rules by ID.

**Internal Dependencies:** None (leaf module)
**External Dependencies:** `node:crypto` (createHash)

**Current Status:** INTEGRATED via `phase1-runtime.js`

**Pros:**
- Foundation of the entire pipeline; everything depends on it
- Auto-generates IDs for untagged rules
- Merge semantics handle root + local overlay cleanly

**Cons:**
- Regex-based parsing is fragile for edge cases
- Constitution size limit (60 lines) may be restrictive

**Recommendation:** **Policy layer, Essential.** Wired. No action needed.

---

### Module 2: retriever (~393 LOC)

**Purpose:** Intent classifier and shard retriever. Classifies task intent from
description text, embeds shards, and retrieves top-N shards by semantic
similarity with hard filters on risk class and repo scope.

**ADR:** G002 (Constitution/Shard Split), G003 (Intent-Weighted Classification)

**Key Exports:**
- `ShardRetriever` class
- `HashEmbeddingProvider` class (test-only deterministic embedder)
- `createRetriever(embeddingProvider?)` factory
- `IEmbeddingProvider` interface

**How It Works:** 13 intent patterns (bug-fix, feature, refactor, security,
performance, testing, docs, deployment, architecture, debug, general) with
weighted regex matching. Scoring combines cosine similarity (+base), intent
match (+0.15), and risk boost (+0.05/+0.10). Hard filters eliminate shards
before scoring. Contradiction detection prevents conflicting rules from
co-retrieval (higher-priority wins).

**Internal Dependencies:** PolicyBundle from compiler
**External Dependencies:** None

**Current Status:** INTEGRATED via `phase1-runtime.js`

**Pros:**
- Intent classification makes retrieved rules contextually relevant
- Hard filters prevent irrelevant high-risk rules from leaking
- Contradiction resolution prevents confusing the model

**Cons:**
- `HashEmbeddingProvider` is deterministic hash -- not true semantic embeddings
- Would benefit from plugging in a real embedding provider

**Recommendation:** **Policy layer, Essential.** Wired. Consider plugging in a real embedding provider to replace HashEmbeddingProvider.

---

### Module 3: gates (~301 LOC)

**Purpose:** Four non-negotiable enforcement gates that block, warn, or require
confirmation for risky operations. The "model can forget, the hook does not"
principle.

**ADR:** G004 (Four Enforcement Gates)

**Key Exports:**
- `EnforcementGates` class
- `createGates(config?)` factory

**Four Gates:**
1. **Destructive Ops:** 15 patterns (rm -rf, drop table, git push --force, git reset --hard, kubectl delete --all, etc.)
2. **Tool Allowlist:** Blocks non-allowlisted tools
3. **Diff Size:** Warns on diffs > 300 lines (configurable)
4. **Secrets:** 8 patterns (api_key, password, token, BEGIN PRIVATE KEY, sk-*, ghp_*, npm_*, AKIA*)

**Decision Aggregation:** Most restrictive wins: block > require-confirmation > warn > allow.

**Internal Dependencies:** None (leaf module)
**External Dependencies:** None

**Current Status:** INTEGRATED via `phase1-runtime.js`

**Pros:**
- Simple, deterministic, zero false negatives on known patterns
- Aggregation logic is sound (most restrictive wins)
- Remediation messages guide the user

**Cons:**
- Regex patterns miss obfuscated commands
- No context-awareness (can't distinguish safe `rm -rf` in test cleanup)

**Recommendation:** **Enforcement layer, Essential.** Wired. Will be wrapped by gateway (Phase 1, Week 2).

---

### Module 4: hooks (~346 LOC)

**Purpose:** Wires enforcement gates + retriever into the Claude Flow V3 hook
lifecycle. Maps gate decisions to hook results (block -> abort, warn -> warning,
allow -> success).

**ADR:** G001 (Guidance Control Plane)

**Key Exports:**
- `GuidanceHookProvider` class
- `createGuidanceHooks(gates, retriever, ledger, registry?)` factory
- `gateResultsToHookResult()` utility

**Hook Mappings:**
| Event | Handler | Priority |
|-------|---------|----------|
| PreCommand | evaluateCommand() | Critical |
| PreToolUse | evaluateToolUse() | Critical |
| PreEdit | evaluateEdit() | High |
| PreTask | retrieve() + classifyIntent() | Normal |
| PostTask | finalizeEvent() | Normal |

**Internal Dependencies:** gates, retriever, ledger
**External Dependencies:** `@claude-flow/hooks` (HookEvent, HookRegistry, HookResult)

**Current Status:** INTEGRATED via `phase1-runtime.js`

**Pros:**
- Complete lifecycle coverage (pre + post for all event types)
- Priority system ensures safety hooks fire first
- Active run tracking correlates pre-task to post-task

**Cons:**
- Positional API differs from README tutorial (which shows object-style)
- Requires `@claude-flow/hooks` package

**Recommendation:** **Enforcement layer, Essential.** Wired. No action needed.

---

### Module 5: ledger (~374 LOC)

**Purpose:** Run event logging with pluggable evaluators. Captures the full
lifecycle of every run -- tools used, files touched, test results, violations,
rework lines -- with enough detail for post-hoc analysis.

**ADR:** G005 (Proof Envelope), G006 (Deterministic Tool Gateway)

**Key Exports:**
- `RunLedger` class
- 5 evaluator classes: `TestsPassEvaluator`, `ForbiddenCommandEvaluator`, `ForbiddenDependencyEvaluator`, `ViolationRateEvaluator`, `DiffQualityEvaluator`
- `createLedger(maxEvents?)` factory
- `IEvaluator` interface

**Key Methods:**
- `logEvent(event)` -- append with auto UUID
- `finalizeEvent(event)` -- compute duration, store
- `evaluate(event)` -- run all evaluators
- `computeMetrics()` -- violation rate, self-correction rate, rework lines
- `rankViolations()` -- frequency x cost scoring
- `exportEvents()` / `importEvents()` -- persistence bridge

**Internal Dependencies:** None (leaf module)
**External Dependencies:** `node:crypto` (randomUUID)

**Current Status:** INTEGRATED via `phase1-runtime.js`

**Pros:**
- Plugin evaluator interface (`IEvaluator`) is extensible
- Violation ranking by cost x frequency surfaces highest-impact issues
- Export/import enables cross-session analysis

**Cons:**
- In-memory only -- events lost on restart (persistence module addresses this)
- Metrics are simple averages, not time-weighted

**Recommendation:** **Observation layer, Essential.** Wired but leaking -- replace with PersistentLedger in Phase 1, Week 1.

---

### Module 6: proof (~237 LOC)

**Purpose:** Hash-chained, HMAC-signed proof envelopes for audit trail and
tamper detection. Every run event becomes an immutable, verifiable record.

**ADR:** G005 (Proof Envelope)

**Key Exports:**
- `ProofChain` class
- `createProofChain(config)` factory (requires `signingKey`)

**How It Works:** Genesis envelope has previousHash = '0' x 64. Each subsequent
envelope's previousHash = previous.contentHash (SHA-256). All envelopes signed
with HMAC-SHA256 covering all fields except the signature itself. Verification
checks both signature and chain linkage.

**ProofEnvelope fields:** envelopeId, runEventId, timestamp, contentHash,
previousHash, toolCallHashes, guidanceHash, memoryLineage, signature, metadata.

**Internal Dependencies:** `crypto-utils.js` (timingSafeEqual)
**External Dependencies:** `node:crypto`

**Current Status:** INTEGRATED via `advanced-runtime.js`

**Pros:**
- Tamper-evident -- modifying any envelope invalidates all downstream signatures
- Supports long-term compliance and audit requirements
- Memory lineage tracking (key, namespace, operation, hash)

**Cons:**
- Requires signing key management (no defaults, by design per ADR-G026)
- Chain verification is O(n) -- slow for very long chains

**Recommendation:** **Observation layer, Completing.** Wired. No action needed.

---

### Module 7: trust (~472 LOC)

**Purpose:** Per-agent trust accumulation with exponential decay toward baseline.
Gate outcomes (allow/deny/warn) drive score changes. Trust tiers map to privilege
levels and rate limits.

**ADR:** G017 (Trust Score Accumulation)

**Key Exports:**
- `TrustAccumulator` class
- `TrustLedger` class
- `TrustSystem` class (combined)
- `createTrustSystem()` factory
- `getTrustBasedRateLimit(score, baseLimit)` utility

**Trust Tiers:**
| Tier | Score | Rate Multiplier | Behavior |
|------|-------|-----------------|----------|
| trusted | >= 0.8 | 2x | Full privileges |
| standard | >= 0.5 | 1x | Normal |
| probation | >= 0.3 | 0.5x | Restricted tools |
| untrusted | < 0.3 | 0.1x | Read-only |

**Default Deltas:** allow +0.01, warn -0.02, deny -0.05. Decay toward initial
trust (0.5) at 1% per minute.

**Internal Dependencies:** None (leaf module)
**External Dependencies:** None

**Current Status:** INTEGRATED via `advanced-runtime.js`

**Pros:**
- Adaptive privilege system -- agents earn or lose trust over time
- Exponential decay prevents both runaway accumulation and permanent punishment
- Clean separation: accumulator (math) + ledger (history) + system (combined)

**Cons:**
- Default deltas are hardcoded -- may need tuning per environment
- Decay rate (1%/min) means trust resets to baseline in ~100 minutes

**Recommendation:** **Trust layer, Essential.** Wired. No action needed.

---

### Module 8: adversarial (~571 LOC)

**Purpose:** Byzantine fault tolerance for multi-agent systems. Three
independent detectors for threats, collusion, and memory tampering.

**ADR:** G022 (Adversarial Model)

**Key Exports:**
- `ThreatDetector` class -- 6 threat categories: prompt-injection, memory-poisoning, shard-manipulation, malicious-delegation, privilege-escalation, data-exfiltration
- `CollusionDetector` class -- ring topologies, unusual frequency, coordinated timing
- `MemoryQuorum` class -- 2/3 majority voting for critical writes
- Factory functions for each

**Memory Write Rate Limit:** 10 writes/minute. Exceeding triggers memory-poisoning signal (severity 0.7).

**Internal Dependencies:** None (leaf module)
**External Dependencies:** `node:crypto` (randomUUID)

**Current Status:** INTEGRATED via `advanced-runtime.js`

**Pros:**
- Comprehensive threat taxonomy (6 categories, regex + heuristic)
- Collusion detection catches ring topologies and coordinated timing
- Quorum voting prevents single-agent memory tampering

**Cons:**
- Regex-based detection misses sophisticated prompt injection
- Collusion detection requires multi-agent coordination data

**Recommendation:** **Trust layer, Essential.** Wired. Live hook path limited to command input; full suite via npm scripts.

---

### Module 9: conformance-kit (~628 LOC)

**Purpose:** Canonical acceptance test proving all guidance components work
end-to-end. Implements the "Memory Clerk" agent cell pattern that reads 20
entries, runs 1 inference, proposes 5 writes, injects a coherence drop at
write #3, and verifies system response.

**ADR:** G014 (Agent Cell Conformance Kit)

**Key Exports:**
- `SimulatedRuntime` class (wires all components)
- `MemoryClerkCell` class (test agent)
- `ConformanceRunner` class
- `createConformanceRunner()` factory

**SimulatedRuntime integrates:** MemoryWriteGate, ProofChain, RunLedger,
CoherenceScheduler, EconomicGovernor, ToolGateway.

**Internal Dependencies:** memory-gate, proof, ledger, coherence, gateway
**External Dependencies:** `node:crypto`

**Current Status:** INTEGRATED via `advanced-runtime.js`

**Pros:**
- Executable specification of all component interactions
- Replay verification ensures reproducibility
- Coherence drop injection tests privilege degradation

**Cons:**
- SimulatedRuntime creates its own module instances -- our live runtime may
  behave differently since we don't have coherence or gateway wired
- Heavy dependency surface (5 modules)

**Recommendation:** **Validation layer, Essential.** Wired but incomplete -- SimulatedRuntime creates its own coherence + gateway instances, masking gaps in our live runtime. Will be fully functional after Phase 1 wires coherence and gateway.

---

### Module 10: evolution (~499 LOC)

**Purpose:** Safe change proposal pipeline with signed proposals, trace-based
simulation, divergence comparison, staged rollout (canary 5% -> partial 50% ->
full 100%), and automatic rollback.

**ADR:** G013 (Evolution Pipeline)

**Key Exports:**
- `EvolutionPipeline` class
- `createEvolutionPipeline(config)` factory

**Pipeline Stages:** draft -> signed -> simulating -> compared -> staged -> promoted (or rejected/rolled-back)

**Change Types:** rule-modify, rule-add, rule-remove, rule-promote, policy-update, tool-config, budget-adjust.

**Auto-Rollback:** If divergence exceeds stage threshold, automatic rollback triggered.

**Internal Dependencies:** None (uses crypto for signing)
**External Dependencies:** `node:crypto`

**Current Status:** INTEGRATED via `advanced-runtime.js`

**Pros:**
- Every change is signed (HMAC-SHA256) and auditable
- Staged rollout prevents "big bang" rule changes
- Auto-rollback on metric regression

**Cons:**
- Simulation is trace-replay, not live -- may miss runtime-specific issues
- Without meta-governance (Tier 2), evolution has no upper bound on what it can change

**Recommendation:** **Learning layer, Essential.** Wired but unconstrained -- currently can weaken safety rules. Must be paired with meta-governance (Phase 1, Week 3) to enforce constitutional invariants.

---

### Module 11: memory-gate (~381 LOC)

**Purpose:** Memory write access control with authority hierarchy (queen >
coordinator > worker > observer), rate limiting, TTL/decay, and contradiction
detection.

**ADR:** G007 (Memory Write Gating)

**Key Exports:**
- `MemoryWriteGate` class
- `createMemoryWriteGate()` factory
- `createMemoryEntry()` factory

**Evaluation Flow:**
1. Authority check (role >= worker, namespace in allowed list)
2. Rate limit check (sliding window per minute)
3. Overwrite permission check
4. Contradiction detection (5 patterns: must/never, always/never, require/forbid, enable/disable, true/false)

**Confidence Decay:** `confidence * e^(-decayRate * ageHours)` -- entries lose
confidence over time.

**Internal Dependencies:** None (leaf module)
**External Dependencies:** `node:crypto`

**Current Status:** INTEGRATED via `memory-write-gate.js`

**Pros:**
- Role hierarchy prevents unauthorized writes
- Rate limiting stops memory flooding
- Contradiction detection catches conflicting entries
- Temporal decay prevents stale data accumulation

**Cons:**
- Contradiction patterns are string-matching, not semantic
- Role hierarchy is static per authority registration

**Recommendation:** **Enforcement layer, Essential.** Wired. No action needed.

---

### Module 12: analyzer (~2,517 LOC)

**Purpose:** Quantifies CLAUDE.md effectiveness across 6 weighted dimensions.
Supports auto-optimization, size-aware optimization, empirical A/B benchmarking,
and content-aware validation.

**ADR:** None explicit

**Key Exports:**
- `analyze(content, localContent)` -- 6-dimension scoring
- `benchmark(before, after)` -- before/after comparison
- `autoOptimize(content, localContent, maxIterations)` -- iterative improvement
- `optimizeForSize(content, options)` -- context-budget-aware optimization
- `abBenchmark(claudeMdContent, options)` -- A/B testing across 20 tasks
- `validateEffect(original, optimized, options)` -- empirical Pearson r, Spearman rho, Cohen's d

**Scoring Dimensions:**
| Dimension | Weight | What It Measures |
|-----------|--------|-----------------|
| Structure | 20% | Headings, sections, organization |
| Coverage | 20% | Build/test/security/architecture sections |
| Enforceability | 25% | NEVER/ALWAYS statements, concrete rules |
| Compilability | 15% | How well it compiles to constitution + shards |
| Clarity | 10% | Code blocks, examples, specificity |
| Completeness | 10% | Missing common sections |

**A/B Benchmark:** 20 tasks across 7 classes. Composite score = `success_rate - 0.1*norm_cost - 0.2*violations - 0.1*interventions`. Category shift requires B > A by >= 0.2 across >= 3 task classes.

**Internal Dependencies:** proof (ProofEnvelope type only)
**External Dependencies:** None

**Current Status:** INTEGRATED via autopilot scripts

**Pros:**
- Empirical validation (not just metric gaming)
- Cohen's d effect size distinguishes real from noise improvements
- A/B testing across representative task classes

**Cons:**
- Largest module (2,517 LOC) -- highest maintenance surface
- Scoring weights are hardcoded

**Recommendation:** **Learning layer, Essential.** Wired via autopilot scripts. No action needed.

---

### Module 13: persistence (~463 LOC)

**Purpose:** Durable event storage for RunLedger. NDJSON append-only format
with compaction, TTL, file locking, and WAL support.

**ADR:** G008 (Optimizer Promotion Rule)

**Key Exports:**
- `EventStore` class (low-level NDJSON storage)
- `PersistentLedger` class (extends RunLedger)
- `createPersistentLedger(config)` factory
- `createEventStore(path)` factory

**Storage Files:**
- `events.ndjson` -- newline-delimited JSON events
- `index.json` -- metadata (count, timestamps, taskIds)
- `.lock` -- file-based concurrent access prevention (stale: 30s)

**Compaction:** Keeps newest `maxEvents` (default 10,000). Atomic rewrite via
temp file + rename. Periodic timer (unref'd to not block process exit).

**Configuration:**
```javascript
{
  storagePath: '.claude-flow/guidance',
  maxEvents: 10_000,
  compactIntervalMs: 3_600_000,  // 1 hour
  enableWAL: true
}
```

**Internal Dependencies:** `RunLedger` from ledger
**External Dependencies:** `node:fs/promises`, `node:crypto`

**Current Status:** NOT INTEGRATED

**Pros:**
- Fills the #1 gap: events survive restarts
- Extends RunLedger transparently (drop-in replacement)
- Lock-based concurrency prevents corruption
- WAL mode for immediate durability

**Cons:**
- File I/O on every event (mitigated by WAL batching)
- NDJSON format grows unbounded without compaction

**Gap if absent:** Every time a session ends, all ledger events, violation
history, and optimization metrics are lost. The optimizer can never learn
from past sessions. This is the single most impactful missing module.

**Recommendation:** **Observation layer, Essential.** NOT WIRED. #1 priority gap. Replace in-memory RunLedger with PersistentLedger. Integration point: wherever `createLedger()` is currently called, use `createPersistentLedger()` instead. Phase 1, Week 1.

---

### Module 14: coherence (~371 LOC)

**Purpose:** Real-time behavioral drift detection combined with resource
governance. Computes a weighted coherence score from violations, rework, and
intent drift. Maps scores to privilege levels. EconomicGovernor tracks 5
budget dimensions.

**ADR:** G015 (Coherence-Driven Throttling)

**Key Exports:**
- `CoherenceScheduler` class
- `EconomicGovernor` class
- `createCoherenceScheduler(config)` factory
- `createEconomicGovernor(config)` factory

**Coherence Score Formula:**
```
violationComponent = 1 - (violationRate / 10)       [clamped 0-1]
reworkComponent    = 1 - (reworkLines / 100)         [clamped 0-1]
driftComponent     = 1 - (uniqueIntents - 1) / max(windowLen - 1, 1) [clamped 0-1]
overall            = 0.4 * violation + 0.3 * rework + 0.3 * drift
```

**Privilege Levels:**
| Score | Level |
|-------|-------|
| >= 0.7 | full |
| >= 0.5 | restricted |
| >= 0.3 | read-only |
| < 0.3 | suspended |

**EconomicGovernor Budgets:** tokens (1M), tool calls (10K), storage (1 GiB),
time (1 hour), cost ($10 USD). Alerts at 75%, 90%, 95%, 100% utilization.

**Internal Dependencies:** types (RunEvent, OptimizationMetrics)
**External Dependencies:** None

**Current Status:** NOT INTEGRATED (but conformance-kit creates its own internally)

**Pros:**
- Automatic privilege degradation on behavioral drift
- Three-component score catches different failure modes
- Budget governance prevents cost runaway
- conformance-kit already depends on this internally

**Cons:**
- Hardcoded weights (0.4/0.3/0.3) may need tuning
- Window size (20 events) may be too small for long sessions

**Gap if absent:** Long sessions accumulate errors without any automatic
degradation. An agent can make 50 violations in a row and still have full
privileges. conformance-kit's SimulatedRuntime works, but our live runtime
has no coherence checking.

**Recommendation:** **Knowledge layer, Essential.** NOT WIRED. Wire CoherenceScheduler into post-task path. Wire EconomicGovernor budget checks into pre-task gates. Unblocks continue-gate. Phase 1, Week 1.

---

### Module 15: continue-gate (~352 LOC)

**Purpose:** Step-level evaluation for long-running agents. Detects budget
slope acceleration, rework ratio spikes, coherence drops, and uncertainty
peaks. Can stop, pause, throttle, checkpoint, or continue.

**ADR:** G024 (Continue Gate)

**Key Exports:**
- `ContinueGate` class
- `createContinueGate(config)` factory

**Decision Priority (highest to lowest):**
1. Coherence < 0.4 -> **stop**
2. Step limit + no recent checkpoint -> **stop**
3. Budget exhausted -> **stop**
4. Rework ratio > 0.3 -> **pause**
5. Uncertainty > 0.8 -> **pause**
6. Budget acceleration detected -> **throttle**
7. Checkpoint interval reached -> **checkpoint**
8. Otherwise -> **continue**

**Budget Slope Detection:** Linear regression over rolling window of 10 steps.
If slope > 0.02 tokens/step, triggers throttle.

**Configuration:**
```javascript
{
  maxConsecutiveSteps: 100,
  maxBudgetSlopePerStep: 0.02,
  minCoherenceForContinue: 0.4,
  maxUncertaintyForContinue: 0.8,
  maxReworkRatio: 0.3,
  checkpointIntervalSteps: 25,
  cooldownMs: 5000
}
```

**Internal Dependencies:** None (pure computation)
**External Dependencies:** None

**Current Status:** NOT INTEGRATED

**Pros:**
- Prevents the most common and expensive failure mode: infinite loops
- Budget slope detection catches acceleration before exhaustion
- Checkpoint enforcement enables long-running recovery
- Cooldown prevents gate overhead in tight loops
- Zero external dependencies

**Cons:**
- Requires coherence score input (depends on coherence module)
- Requires uncertainty input (depends on uncertainty module, or pass 0)
- 5s cooldown means some violations could slip through

**Gap if absent:** An agent stuck in a loop will burn tokens indefinitely.
Budget slope detection is the only way to catch this before exhaustion.

**Recommendation:** **Enforcement layer, Essential.** NOT WIRED. Wire into pre-task gate. Feed coherence score from CoherenceScheduler. Uncertainty can default to 0 until uncertainty module is adopted. Phase 1, Week 2.

---

### Module 16: gateway (~451 LOC)

**Purpose:** Deterministic tool evaluation with idempotency cache, schema
validation, and budget metering. Wraps EnforcementGates with additional
layers.

**ADR:** G006 (Deterministic Tool Gateway)

**Key Exports:**
- `DeterministicToolGateway` class
- `createToolGateway(config)` factory

**Evaluation Pipeline:**
1. Check idempotency cache (SHA-256 of `toolName:sortedParams`)
2. Validate params against schema (required, optional, types)
3. Check budget (5 dimensions: tokens, toolCalls, storage, time, cost)
4. Run EnforcementGates
5. Return decision + remaining budget

**Idempotency:** TTL-based (5 min default). LRU eviction at 10K entries.
Prevents duplicate tool calls in swarm retries.

**Internal Dependencies:** EnforcementGates from gates
**External Dependencies:** `node:crypto`

**Current Status:** NOT INTEGRATED (but conformance-kit creates its own internally)

**Pros:**
- Idempotency prevents duplicate tool calls in retries
- Schema validation catches malformed parameters
- Budget metering tracks cost per tool call
- Composes with existing gates (additive, not replacement)

**Cons:**
- Cache adds memory overhead (10K entries max)
- Schema definitions need to be maintained per tool

**Gap if absent:** In swarm scenarios, retried tool calls execute multiple
times. Without idempotency, a retried `git push --force` or database write
could cause inconsistency.

**Recommendation:** **Enforcement layer, Essential.** NOT WIRED. Wraps existing gates in phase1-runtime. Replace direct gate calls with gateway calls. Adds idempotency + schema + budget metering. Phase 1, Week 2.

---

### Module 17: authority (~557 LOC)

**Purpose:** Authority hierarchy (agent -> human -> institutional -> regulatory)
with irreversibility classification. Escalation when current authority level
is insufficient. HMAC-signed audit trail for human interventions.

**ADR:** G021 (Human Authority and Irreversibility)

**Key Exports:**
- `AuthorityGate` class
- `IrreversibilityClassifier` class
- `createAuthorityGate(config)` factory
- `createIrreversibilityClassifier(config)` factory
- `isHigherAuthority()`, `getNextHigherAuthority()`, `getAuthorityHierarchy()` utilities

**Irreversibility Classes:**
| Class | Examples | Proof Level |
|-------|----------|-------------|
| irreversible | email, publish, payment, delete, drop | maximum |
| costly-reversible | migrate, deploy, update config | elevated |
| reversible | read, analyze, generate | standard |
| trivial | (default for unknown) | minimal |

**Internal Dependencies:** crypto-utils (timingSafeEqual)
**External Dependencies:** `node:crypto`

**Current Status:** NOT INTEGRATED

**Pros:**
- Typed authority boundaries prevent unauthorized escalation
- Irreversibility classification triggers elevated proof for high-stakes actions
- HMAC audit trail for human decisions enables compliance
- `rm -rf /` gets different treatment than `git status`

**Cons:**
- Authority scope definitions need careful setup
- Irreversibility patterns are regex-based (may miss novel commands)

**Gap if absent:** All actions treated equally. A destructive `rm -rf /`
and a harmless `git status` receive the same governance level. Rare but
catastrophic irreversible actions have no elevated protection.

**Recommendation:** **Enforcement layer, Essential.** NOT WIRED. Wire IrreversibilityClassifier into pre-command and pre-edit gates. Require escalation for irreversible/costly actions. Phase 1, Week 2.

---

### Module 18: meta-governance (~347 LOC)

**Purpose:** Governs governance itself. Constitutional invariants that cannot
be amended. Supermajority voting for amendments. Optimizer constraints that
prevent rapid rule churning.

**ADR:** G023 (Meta-Governance)

**Key Exports:**
- `MetaGovernor` class
- `createMetaGovernor(config)` factory

**Built-in Constitutional Invariants (immutable):**
- Constitution size <= 60 lines
- Gate count >= 4
- Rule count <= 1000 (warning)
- Optimizer drift <= 0.2 (warning)

**Amendment Requirements:**
- 75% supermajority approval
- Max 3 amendments per 24-hour window
- Immutable invariants cannot be modified or removed

**Optimizer Constraints:**
- maxDriftPerCycle: 0.1 (10% change max)
- maxPromotionRate: 2 per cycle
- maxDemotionRate: 1 per cycle
- cooldownMs: 3,600,000 (1 hour between runs)

**Internal Dependencies:** None
**External Dependencies:** `node:crypto`

**Current Status:** NOT INTEGRATED

**Pros:**
- Critical counterbalance to evolution (which we already use)
- Prevents optimizer from weakening safety rules
- Supermajority prevents unilateral governance changes
- Immutable invariants protect foundational safety

**Cons:**
- Voting requires multi-agent setup or human-in-the-loop
- Rate limits (3 amendments/24h) may be too restrictive for rapid iteration

**Gap if absent:** Evolution and optimizer can modify any rule without
constraint. Safety rules like "never force push to main" could be weakened
or removed if the optimizer decides they cause too many violations.

**Recommendation:** **Learning layer, Essential.** NOT WIRED. Wraps evolution pipeline (already wired). Meta-governor checks proposed changes before evolution can stage them. Phase 1, Week 3.

---

### Module 19: optimizer (~328 LOC)

**Purpose:** Weekly optimization cycle that ranks violations by cost x frequency,
proposes rule changes, and promotes local rules that win twice. Uses heuristic
simulation (not live A/B).

**ADR:** G008 (Optimizer Promotion Rule)

**Key Exports:**
- `OptimizerLoop` class
- `createOptimizer(config)` factory

**Cycle Logic:**
1. Rank violations by frequency x cost
2. Propose changes for top N violations
3. Heuristic evaluation: modify = 40% improvement, add = 60%, remove = -20%
4. Promote winners, demote losers
5. Record ADR for each decision

**"Win twice to promote":** Local rules must win 2 consecutive optimization
cycles before promotion to root CLAUDE.md.

**Configuration:**
```javascript
{
  topViolationsPerCycle: 3,
  minEventsForOptimization: 100,
  improvementThreshold: 0.15,
  maxRiskIncrease: 0.1,
  promotionWins: 2,
  adrPath: string
}
```

**Internal Dependencies:** RunLedger
**External Dependencies:** None

**Current Status:** NOT INTEGRATED (CLI uses it, but we don't call createOptimizer directly)

**Pros:**
- Automated rule improvement from violation data
- Conservative heuristics prevent bad promotions
- ADR generation creates audit trail
- "Win twice" prevents one-off flukes

**Cons:**
- Heuristic simulation is not empirical (no actual A/B test)
- Requires persistence module for cross-session data
- Minimum 100 events before first optimization

**Gap if absent:** Rules never evolve from actual usage data. Violations
repeat indefinitely. The system cannot self-improve.

**Recommendation:** **Learning layer, Essential.** NOT WIRED. Requires persistence (Week 1). Wire into session-end hook or scheduled task. Completes the feedback loop. Phase 1, Week 3.

---

### Module 20: truth-anchors (~487 LOC)

**Purpose:** Immutable, externally-signed facts that ground the system to
reality. Truth anchors always win over internal beliefs. Supports supersession
chains and temporal validity windows.

**ADR:** G018 (Truth Anchor System)

**Key Exports:**
- `TruthAnchorStore` class
- `TruthResolver` class
- `createTruthAnchorStore(config)` factory (requires `signingKey`)
- `createTruthResolver(store)` factory

**Key Features:**
- Append-only (anchors never mutated, only superseded)
- HMAC-SHA256 signed and verified
- Validity windows (validFrom/validUntil)
- LRU eviction of expired anchors (active never evicted)
- Conflict resolution: anchor always wins over internal belief

**Internal Dependencies:** None
**External Dependencies:** `node:crypto`

**Current Status:** NOT INTEGRATED

**Pros:**
- Prevents belief drift -- external facts override memory
- Supersession chains create verifiable amendment history
- Temporal validity enables retroactive corrections
- Signing prevents anchor tampering

**Cons:**
- Requires signing key management
- 50K anchor limit may be restrictive for long-lived systems
- Resolution logic is simple (anchor wins) -- no confidence weighting

**When to adopt:** When multi-agent memory conflicts arise and agents
disagree on facts. Also useful for anchoring to external data sources
(API responses, verified test results).

**Recommendation:** **Knowledge layer, Completing.** Adopt alongside uncertainty for complete epistemological stack. Phase 2.

---

### Module 21: uncertainty (~618 LOC)

**Purpose:** First-class uncertainty tracking. Beliefs have confidence
intervals, evidence pointers, temporal decay, and propagation chains.
Status ranges from confirmed through contested to refuted.

**ADR:** G019 (First-Class Uncertainty)

**Key Exports:**
- `UncertaintyLedger` class
- `UncertaintyAggregator` class
- `createUncertaintyLedger(config)` factory
- `createUncertaintyAggregator(ledger)` factory

**Belief Status:**
| Status | Meaning |
|--------|---------|
| confirmed | Evidence strongly supports |
| probable | High confidence, not confirmed |
| uncertain | Insufficient evidence |
| contested | > 67% opposing weight |
| refuted | > 90% opposing weight |
| unknown | No evidence yet |

**Key Features:**
- Confidence intervals (point, lower, upper)
- Evidence tracking (supporting/opposing with weights)
- Temporal decay (configurable per belief)
- Inference chain propagation (child bounded by parent * weight)
- Aggregation (geometric mean penalizes single low-confidence belief)

**Internal Dependencies:** None (leaf module)
**External Dependencies:** None

**Current Status:** NOT INTEGRATED

**Pros:**
- Principled decision-making under incomplete information
- Geometric mean aggregation catches single weak links
- Inference chains prevent false confidence cascades
- Evidence tracking enables belief justification

**Cons:**
- Complex API surface (ledger + aggregator + evidence management)
- Decay rate tuning required per domain
- ContinueGate's uncertainty threshold (0.8) depends on this module

**When to adopt:** When formal confidence scoring is needed for memory
writes, agent decisions, or multi-source fact reconciliation.

**Recommendation:** **Knowledge layer, Completing.** Adopt alongside truth-anchors. ContinueGate's uncertainty threshold (0.8) will gain real data. Phase 2.

---

### Module 22: temporal (~657 LOC)

**Purpose:** Bitemporal assertion storage separating assertion time (when
recorded) from validity time (when true in the real world). Supports
supersession, retraction, temporal queries, and conflict detection.

**ADR:** G020 (Temporal Assertions)

**Key Exports:**
- `TemporalStore` class
- `TemporalReasoner` class
- `createTemporalStore(config)` factory
- `createTemporalReasoner(store)` factory

**Assertion Lifecycle:** future -> active -> expired | superseded | retracted

**Key Queries:**
- `whatWasTrue(namespace, pointInTime)` -- past facts
- `whatIsTrue(namespace)` -- current facts
- `whatWillBeTrue(namespace, futureTime)` -- future facts
- `conflictsAt(namespace, pointInTime)` -- multiple active assertions
- `hasChanged(namespace, sinceTimestamp)` -- change detection

**Internal Dependencies:** None
**External Dependencies:** `node:crypto` (UUID)

**Current Status:** NOT INTEGRATED

**Pros:**
- Retroactive amendment without losing history
- Soft-deletion preserves audit trail
- Conflict detection catches contradictory facts
- Future projection enables planning

**Cons:**
- 100K assertion limit
- Complexity of bitemporal semantics may not be needed for short sessions
- Pruning only removes expired assertions (retracted/superseded preserved forever)

**When to adopt:** When sessions regularly exceed 1 hour and facts change
mid-session. Also useful for multi-session memory where validity windows matter.

**Recommendation:** **Knowledge layer, Extending.** Adopt when sessions regularly exceed 1 hour. Phase 3.

---

### Module 23: capabilities (~484 LOC)

**Purpose:** Capability-based security model where permissions are first-class
objects. Supports grant, restrict, delegate, expire, revoke, and compose
operations. Cascading revocation through delegation trees.

**ADR:** G010 (Capability Algebra)

**Key Exports:**
- `CapabilityAlgebra` class
- `createCapabilityAlgebra()` factory

**Constraint Types:**
| Type | Description |
|------|-------------|
| time-window | Start/end time checks |
| rate-limit | Current usage vs max |
| budget | Used vs limit |
| condition | Context key match |
| scope-restriction | Pattern matching on resource |

**Set-Theoretic Composition:**
- Actions: intersection (only actions in both)
- Constraints: union (all constraints combined)
- Expiry: tighter (earlier) of the two
- Delegatable: true only if both true

**Internal Dependencies:** None
**External Dependencies:** `node:crypto` (UUID)

**Current Status:** NOT INTEGRATED

**Pros:**
- More granular than role-based access control
- Delegation chains enable hierarchical permission sharing
- Composition is mathematically sound (intersection/union)
- Attestation support for audit

**Cons:**
- Requires capability setup for every agent and resource
- Adds complexity vs. simpler role-based model in memory-gate

**When to adopt:** When complex swarm permissions are needed beyond the
queen/coordinator/worker/observer hierarchy in memory-gate.

**Recommendation:** **Trust layer, Extending.** Adopt when swarm complexity grows beyond memory-gate's 4-role hierarchy. Phase 3.

---

### Module 24: headless (~341 LOC)

**Purpose:** Automated CI/CD compliance testing via `claude -p` headless mode.
Runs test suites with 6 assertion types, logs results to ledger, computes
pass rates.

**ADR:** G009 (Headless Testing Harness)

**Key Exports:**
- `ProcessExecutor` class (runs `claude -p`)
- `HeadlessRunner` class
- `createComplianceSuite()` (pre-built 3-task suite)
- `createHeadlessRunner(executor, ledger, guidanceHash)` factory

**Assertion Types:**
1. `output-contains` / `output-not-contains`
2. `files-touched`
3. `no-forbidden-commands` (regex)
4. `tests-pass`
5. `custom`

**Internal Dependencies:** None
**External Dependencies:** `child_process.execFile`

**Current Status:** NOT INTEGRATED

**Pros:**
- Automated compliance verification in CI/CD
- Results feed into ledger for optimizer training
- Pre-built suite covers common safety checks

**Cons:**
- Requires `claude -p` binary available in environment
- Process execution adds latency
- Cannot test interactive sessions

**When to adopt:** When CI/CD compliance testing is needed. Useful for
regression testing after rule changes.

**Recommendation:** **Validation layer, Completing.** Adopt when CI/CD compliance pipeline established. Phase 2.

---

### Module 25: wasm-kernel (~157 LOC)

**Purpose:** Rust WASM kernel for hot-path cryptography. Provides SHA-256,
HMAC-SHA256, secret scanning, and destructive command detection with 1.25--1.96x
speedup. Graceful fallback to Node.js crypto if WASM unavailable.

**ADR:** G025 (Rust WASM Policy Kernel)

**Key Exports:**
- `getKernel()` (lazy singleton)
- `isWasmAvailable()` (boolean check)
- `resetKernel()` (testing)

**WASM Methods:** sha256, hmacSha256, contentHash, signEnvelope, verifyChain,
scanSecrets, detectDestructive, batchProcess.

**JS Fallback:** SHA-256 and HMAC via `node:crypto`. Secret scanning and
destructive detection throw (defer to EnforcementGates).

**Internal Dependencies:** None
**External Dependencies:** `node:crypto`, optional WASM binary

**Current Status:** NOT INTEGRATED

**Pros:**
- 1.25--1.96x speedup for crypto operations
- Graceful degradation (falls back to Node crypto)
- Batch processing for high-throughput scenarios

**Cons:**
- WASM binary must be present (`wasm-pkg/`)
- Speedup only matters at scale (thousands of operations)
- JS fallback works fine for typical usage

**Recommendation:** **Infrastructure layer, Extending.** Adopt when crypto operations become a bottleneck. JS fallback works fine. Phase 3.

---

### Module 26: generators (~681 LOC)

**Purpose:** Code generation engine that scaffolds complete Guidance
infrastructure from a project profile. Generates CLAUDE.md, CLAUDE.local.md,
skill definitions, agent definitions, and agent indices.

**ADR:** None

**Key Exports:**
- `generateClaudeMd(profile)` -- constitution with language/framework rules
- `generateClaudeLocalMd(local)` -- local developer settings
- `generateSkillMd(skill)` -- YAML frontmatter + markdown
- `generateAgentMd(agent)` -- agent definitions with hooks
- `generateAgentIndex(agents)` -- YAML index by type
- `scaffold(options)` -- batch generation

**Language Support:** TypeScript (no `any`, strict mode), Python (PEP 8, type hints),
Rust (clippy, no unwrap), and more.

**Framework Support:** React, Next.js, Express, Django, Vitest, etc.

**Internal Dependencies:** None
**External Dependencies:** None

**Current Status:** NOT INTEGRATED

**Pros:**
- Scaffolds high-quality CLAUDE.md from project metadata
- Language-specific and framework-specific rules built in
- Saves significant setup time for new projects

**Cons:**
- Generated content is generic -- needs customization
- We already have hand-crafted CLAUDE.md files

**Recommendation:** **Policy layer, Extending.** Useful for onboarding new repos. Not needed for existing hand-crafted CLAUDE.md. Phase 3.

---

### Module 27: artifacts (~355 LOC)

**Purpose:** Tamper-evident production artifact ledger. Signs every code
artifact, report, and dataset with HMAC. Tracks lineage (parent artifacts,
source traces, tool calls). Searchable by kind, run, cell, tag, time range.

**ADR:** G011 (Artifact Ledger)

**Key Exports:**
- `ArtifactLedger` class
- `createArtifactLedger(config)` factory (requires `signingKey`)

**Artifact Kinds:** code, report, dataset, and custom.

**Lineage Traversal:** DFS with cycle detection. Returns ancestors in
depth-first order.

**Internal Dependencies:** None
**External Dependencies:** `node:crypto`

**Current Status:** NOT INTEGRATED

**Pros:**
- Complete audit trail for all production outputs
- Content integrity verification on retrieval
- Lineage tracking connects artifacts to their sources
- Export/import for portability

**Cons:**
- Requires signing key management
- FIFO eviction at 10K artifacts may lose important records
- Overhead of signing every artifact

**Recommendation:** **Observation layer, Extending.** Adopt for compliance environments requiring signed artifact lineage. Phase 3.

---

### Module 28: manifest-validator (~837 LOC)

**Purpose:** Agent cell admission control per the Agentic Container spec.
Validates manifests, computes risk scores across 3 dimensions, selects
execution lanes (wasm/sandboxed/native). Includes golden trace conformance
testing.

**ADR:** G012 (Manifest Validator)

**Key Exports:**
- `ManifestValidator` class
- `ConformanceSuite` class
- `createManifestValidator(options)` factory
- `createConformanceSuite(options)` factory

**Risk Scoring (0--100):**
| Component | Range | Factors |
|-----------|-------|---------|
| Tool risk | 0--40 | Bash +15, Task +8, Write/Edit +5, MCP +5, Network +5, Wildcard +10 |
| Data sensitivity | 0--30 | public/internal/confidential/restricted, PII +6 |
| Privilege surface | 0--30 | authority scope 0-15, overwrite +5, native threads +8 |

**Lane Selection:** Risk > max -> wasm. Portable -> wasm. Native threads + low risk -> native. Otherwise sandboxed.

**5 Golden Traces:** Destructive blocked, secret blocked, budget exceeded, memory without evidence blocked, valid operation allowed.

**Internal Dependencies:** None
**External Dependencies:** None

**Current Status:** NOT INTEGRATED

**Pros:**
- Fails-closed: any validation error rejects admission
- 3-dimensional risk scoring is comprehensive
- Lane selection automates sandbox decisions
- Golden traces provide baseline conformance

**Cons:**
- Agentic Container spec may not apply to our deployment model
- Risk scoring weights are hardcoded
- Requires manifest authoring for every agent

**Recommendation:** **Validation layer, Extending.** Adopt for agent admission control per Agentic Container spec. Phase 3.

---

### Module 29: types (~9 LOC)

**Purpose:** Central type definitions for the entire Guidance Control Plane.
21 exported types covering rules, shards, constitution, bundles, gates,
run events, violations, evaluators, metrics, and configuration.

**ADR:** None

**Key Types:** `RiskClass`, `ToolClass`, `TaskIntent`, `GuidanceRule`,
`PolicyBundle`, `GateDecision`, `GateResult`, `RunEvent`, `Violation`,
`OptimizationMetrics`, `GuidanceControlPlaneConfig`, `ControlPlaneStatus`.

**Internal Dependencies:** None
**External Dependencies:** None

**Current Status:** IMPLICITLY AVAILABLE (consumed transitively by all other modules)

**Pros:**
- Single source of truth for all type definitions
- Already available through any module import

**Cons:**
- None

**Recommendation:** **Infrastructure layer, Skip.** Implicit. Already available through transitive imports. No explicit integration needed.

---

### Module 30: ruvbot-integration (~737 LOC)

**Purpose:** Integration bridge between the `ruvbot` npm package (swarm
orchestration) and the Guidance Control Plane. Wraps ruvbot's 6-layer
AIDefence as an enforcement gate. Governs ruvbot memory operations through
MemoryWriteGate. Wires ruvbot lifecycle events to guidance hooks and trust.

**ADR:** None

**Key Exports:**
- `AIDefenceGate` class (wraps ruvbot's prompt injection/jailbreak/PII detection)
- `RuvBotMemoryAdapter` class (governs ruvbot memory via MemoryWriteGate)
- `RuvBotGuidanceBridge` class (event wiring)
- Factory functions for each

**Event Wiring:**
- `message` -> EnforcementGates + AIDefence + TrustSystem
- `agent:spawn` -> ManifestValidator
- `session:create` -> ProofChain init
- `session:end` -> ProofChain finalize
- `error` -> Trust deny outcome
- `agent:stop` -> Final trust snapshot

**Internal Dependencies:** memory-gate, coherence (types)
**External Dependencies:** `ruvbot` package (optional peer dependency)

**Current Status:** NOT INTEGRATED

**Pros:**
- Complete bridge for ruvbot-based swarm orchestration
- AIDefence adds 6-layer threat detection beyond our regex patterns

**Cons:**
- We don't use ruvbot
- Requires `ruvbot` npm package
- 737 LOC of integration code for an unused dependency

**Recommendation:** **Integration layer, Skip.** We don't use ruvbot. Revisit if ruvbot is adopted.

---

### Module 31: crypto-utils (~23 LOC)

**Purpose:** Centralized timing-safe string comparison. Single function
wrapping Node.js `crypto.timingSafeEqual` with UTF-8 buffer conversion.

**ADR:** None

**Key Exports:**
- `timingSafeEqual(a, b)` -- constant-time comparison to prevent timing attacks

**Internal Dependencies:** None
**External Dependencies:** `node:crypto`

**Current Status:** CONSUMED TRANSITIVELY by proof and authority modules

**Pros:**
- Prevents timing attacks on HMAC verification
- Single implementation source

**Cons:**
- Internal helper, not independently useful

**Recommendation:** **Infrastructure layer, Skip.** Internal utility consumed transitively by proof (wired) and authority (Phase 1). No explicit integration needed.

---

### Module 32: index / ControlPlane (~320 LOC)

**Purpose:** Day-1 facade that wires 6 core modules (compiler, retriever,
gates, ledger, optimizer, headless) into a single `GuidanceControlPlane`
class. Re-exports 23 submodules.

**ADR:** G001 (Guidance Control Plane)

**Key Exports:**
- `GuidanceControlPlane` class
- `createGuidanceControlPlane(config)` factory
- `initializeGuidanceControlPlane(config)` factory + auto-init
- Re-exports from all 23 submodules

**Methods:**
- `initialize()` -- read CLAUDE.md, compile, load retriever, set gates
- `retrieveForTask(request)` -- get constitution + relevant shards
- `evaluateCommand/ToolUse/Edit()` -- gate evaluations
- `startRun/recordViolation/finalizeRun()` -- ledger lifecycle
- `optimize()` -- run optimizer cycle if >= 10 events
- `getStatus/getMetrics()` -- health dashboard

**Internal Dependencies:** ALL 23 submodules
**External Dependencies:** `node:fs`

**Current Status:** NOT USED (our architecture surpasses this facade)

**Pros:**
- Single entry point for simple setups
- Handles initialization pipeline automatically

**Cons:**
- Facade only wires 6 of 32 modules
- Our architecture (phase1-runtime + advanced-runtime + hook-handler) is
  more flexible and already wires 12 modules
- Would require significant refactoring to adopt
- Loses granular control over module composition

**Recommendation:** **Infrastructure layer, Skip.** Our phase1-runtime + advanced-runtime architecture composes modules directly. This day-1 facade only wires 6/32 modules.

---

## 5. Architectural Layer View (Target State)

All 32 modules categorized by **where they sit in the architecture**, not
when we happened to adopt them. Each module gets a priority within its layer.

### Layer 1: POLICY -- Define Rules (3 modules, 1,492 LOC)

*"What should the agent do?"*

| Module | LOC | ADR | Priority | Status | Gap |
|--------|-----|-----|----------|--------|-----|
| compiler | 418 | G001, G002 | Essential | Wired | -- |
| retriever | 393 | G002, G003 | Essential | Wired | HashEmbeddingProvider is test-only; no real embeddings |
| generators | 681 | -- | Extending | Not wired | No automated CLAUDE.md scaffolding for new projects |

**Layer completeness: 2/3 modules wired. Layer works but retriever uses
deterministic hash embeddings, not semantic. generators only matters for
onboarding new repos.**

---

### Layer 2: ENFORCEMENT -- Apply Rules at Runtime (6 modules, 2,298 LOC)

*"Is this action permitted right now?"*

| Module | LOC | ADR | Priority | Status | Gap |
|--------|-----|-----|----------|--------|-----|
| gates | 301 | G004 | Essential | Wired | -- |
| hooks | 346 | G001 | Essential | Wired | -- |
| gateway | 451 | G006 | Essential | **NOT wired** | No idempotency, no schema validation, no budget metering |
| authority | 557 | G021 | Essential | **NOT wired** | `rm -rf /` has same governance as `git status` |
| continue-gate | 352 | G024 | Essential | **NOT wired** | Infinite loops burn tokens unchecked |
| memory-gate | 381 | G007 | Essential | Wired | -- |

**Layer completeness: 3/6 modules wired. This is the most dangerous gap.
Half the enforcement layer is missing. gates catches known-bad patterns but
gateway adds idempotency + budget, authority adds irreversibility classification,
and continue-gate prevents runaway loops. All three are Essential, not optional.**

---

### Layer 3: OBSERVATION -- Record What Happened (4 modules, 1,429 LOC)

*"What actually happened, and can we prove it?"*

| Module | LOC | ADR | Priority | Status | Gap |
|--------|-----|-----|----------|--------|-----|
| ledger | 374 | G005, G006 | Essential | Wired | In-memory only -- events lost on restart |
| persistence | 463 | G008 | Essential | **NOT wired** | #1 gap: zero cross-session learning |
| proof | 237 | G005 | Completing | Wired | -- |
| artifacts | 355 | G011 | Extending | Not wired | No signed artifact lineage |

**Layer completeness: 2/4 wired, but ledger without persistence is a leaky
bucket. Every restart wipes all event history. proof works but records
are ephemeral. persistence is the single highest-priority missing module
across the entire system.**

---

### Layer 4: LEARNING -- Improve Rules from Data (4 modules, 3,843 LOC)

*"How do we get better over time?"*

| Module | LOC | ADR | Priority | Status | Gap |
|--------|-----|-----|----------|--------|-----|
| analyzer | 2,517 | -- | Essential | Wired | -- |
| optimizer | 328 | G008 | Essential | **NOT wired** | Rules never self-improve; violations repeat forever |
| evolution | 499 | G013 | Essential | Wired | Works but unconstrained -- can weaken safety rules |
| meta-governance | 347 | G023 | Essential | **NOT wired** | No guardrails on evolution/optimizer |

**Layer completeness: 2/4 wired. evolution without meta-governance is
actively dangerous -- it can weaken or remove safety rules. optimizer
without persistence has nothing to learn from. All four are Essential
because the learning loop is the core value proposition of the control plane.**

---

### Layer 5: TRUST -- Agent Identity and Privilege (3 modules, 1,527 LOC)

*"Which agents can do what?"*

| Module | LOC | ADR | Priority | Status | Gap |
|--------|-----|-----|----------|--------|-----|
| trust | 472 | G017 | Essential | Wired | -- |
| adversarial | 571 | G022 | Essential | Wired | Full suite available; live path limited to command input |
| capabilities | 484 | G010 | Extending | Not wired | Only matters for complex swarms beyond 4 roles |

**Layer completeness: 2/3 wired. Functional for current needs. capabilities
adds typed permission algebra but memory-gate's 4-role hierarchy suffices
for now.**

---

### Layer 6: KNOWLEDGE -- Facts, Beliefs, Confidence, Time (4 modules, 2,027 LOC)

*"What do we know, and how confident are we?"*

| Module | LOC | ADR | Priority | Status | Gap |
|--------|-----|-----|----------|--------|-----|
| coherence | 371 | G015 | Essential | **NOT wired** | No session degradation detection; conformance-kit depends on it |
| truth-anchors | 487 | G018 | Completing | Not wired | No immutable external facts |
| uncertainty | 618 | G019 | Completing | Not wired | No formal confidence scoring |
| temporal | 657 | G020 | Extending | Not wired | No bitemporal fact management |

**Layer completeness: 0/4 wired. The entire Knowledge layer is empty.
coherence is Essential because (a) it feeds continue-gate's stop decision,
(b) conformance-kit already creates internal instances, and (c) without it
there is zero session health monitoring. truth-anchors and uncertainty
complete the epistemological stack. temporal adds time-awareness for
sessions > 1 hour.**

---

### Layer 7: VALIDATION -- Prove the System Works (3 modules, 1,806 LOC)

*"Does governance actually behave correctly?"*

| Module | LOC | ADR | Priority | Status | Gap |
|--------|-----|-----|----------|--------|-----|
| conformance-kit | 628 | G014 | Essential | Wired | Works but its SimulatedRuntime creates own coherence/gateway -- our live runtime lacks them |
| headless | 341 | G009 | Completing | Not wired | No automated CI/CD compliance testing |
| manifest-validator | 837 | G012 | Extending | Not wired | No agent admission control |

**Layer completeness: 1/3 wired. conformance-kit is wired but incomplete --
it passes because SimulatedRuntime creates its own coherence and gateway
instances, masking the gap in our actual runtime.**

---

### Layer 8: INFRASTRUCTURE -- Plumbing (4 modules, 509 LOC)

*"What supports everything else?"*

| Module | LOC | ADR | Priority | Status | Disposition |
|--------|-----|-----|----------|--------|-------------|
| wasm-kernel | 157 | G025 | Extending | Not wired | 1.25--1.96x crypto speedup; JS fallback works fine |
| crypto-utils | 23 | -- | Skip | Transitive | Internal helper consumed by proof + authority |
| types | 9 | -- | Skip | Transitive | Implicit via any module import |
| index | 320 | G001 | Skip | Not used | Our architecture surpasses this day-1 facade |

**Layer completeness: N/A. crypto-utils and types are consumed transitively.
index is superseded by our architecture. wasm-kernel is a performance
optimization with graceful fallback.**

---

### Layer 9: INTEGRATION -- External Systems (1 module, 737 LOC)

*"Bridges to external platforms"*

| Module | LOC | ADR | Priority | Status | Disposition |
|--------|-----|-----|----------|--------|-------------|
| ruvbot-integration | 737 | -- | Skip | Not used | We don't use ruvbot |

**Permanent skip.**

---

## 6. Gap Analysis by Layer

### Layer Health Dashboard

| Layer | Modules | Wired | Essential Missing | Health |
|-------|---------|-------|-------------------|--------|
| **Policy** | 3 | 2 | 0 | HEALTHY |
| **Enforcement** | 6 | 3 | **3** (gateway, authority, continue-gate) | CRITICAL |
| **Observation** | 4 | 2 | **1** (persistence) | BROKEN |
| **Learning** | 4 | 2 | **2** (optimizer, meta-governance) | DANGEROUS |
| **Trust** | 3 | 2 | 0 | HEALTHY |
| **Knowledge** | 4 | 0 | **1** (coherence) | EMPTY |
| **Validation** | 3 | 1 | 0 (but incomplete) | FRAGILE |
| **Infrastructure** | 4 | 0 | 0 | OK (transitive) |
| **Integration** | 1 | 0 | 0 | SKIP |

**7 Essential modules missing across 4 layers.**

### Priority-Ordered Gap List

| # | Module | Layer | Why Essential | Consequence of Absence |
|---|--------|-------|--------------|----------------------|
| 1 | persistence | Observation | Ledger events are ephemeral | Zero cross-session learning. CERTAIN loss on every restart. |
| 2 | coherence | Knowledge | Feeds continue-gate + conformance-kit | Zero session health monitoring. Errors accumulate unchecked. |
| 3 | continue-gate | Enforcement | Only defense against loops | Infinite loops burn tokens. MEDIUM likelihood, CRITICAL impact. |
| 4 | meta-governance | Learning | Guards evolution + optimizer | Safety rules can be weakened. evolution is ALREADY WIRED and unconstrained. |
| 5 | gateway | Enforcement | Wraps gates with idempotency + budget | Duplicate tool calls in retries. Schema violations pass through. |
| 6 | authority | Enforcement | Irreversibility classification | `rm -rf /` and `git status` get identical governance. |
| 7 | optimizer | Learning | Closes the feedback loop | Rules never self-improve. Requires persistence (#1). |

### Completing Modules (layer works but has a gap)

| # | Module | Layer | Adds |
|---|--------|-------|------|
| 8 | truth-anchors | Knowledge | Immutable external facts override internal beliefs |
| 9 | uncertainty | Knowledge | Formal confidence intervals on beliefs |
| 10 | headless | Validation | Automated CI/CD compliance testing |

### Extending Modules (adds depth, not required)

| # | Module | Layer | Adds |
|---|--------|-------|------|
| 11 | temporal | Knowledge | Bitemporal fact management for sessions > 1hr |
| 12 | capabilities | Trust | Typed permission algebra beyond 4 roles |
| 13 | generators | Policy | Automated CLAUDE.md scaffolding |
| 14 | artifacts | Observation | Signed artifact lineage |
| 15 | manifest-validator | Validation | Agent admission control + risk scoring |
| 16 | wasm-kernel | Infrastructure | 1.25--1.96x crypto speedup |

---

## 7. Final Recommendation

### 7.1 Target State: 24/32 (75%)

| Priority | Count | LOC | Modules |
|----------|-------|-----|---------|
| Essential (wired) | 12 | 6,158 | compiler, retriever, gates, hooks, ledger, proof, trust, adversarial, conformance-kit, evolution, memory-gate, analyzer |
| Essential (gaps) | 7 | 2,869 | persistence, coherence, continue-gate, gateway, authority, meta-governance, optimizer |
| Completing | 3 | 1,446 | truth-anchors, uncertainty, headless |
| Extending | 6 | 3,171 | temporal, capabilities, generators, artifacts, manifest-validator, wasm-kernel |
| Skip | 4 | 1,089 | ruvbot-integration, crypto-utils, types, index |
| **Target adopted** | **28** | **13,644** | (or 24 without Extending) |

### 7.2 Phased Roadmap

**Phase 1: Close the Essential Gaps (2--3 weeks)**

These 7 modules fix the 4 broken/critical/dangerous layers.

*Week 1: Observation + Knowledge foundations*
- **persistence** -- Replace `createLedger()` with `createPersistentLedger()`. Unblocks all learning.
- **coherence** -- Wire `CoherenceScheduler` into post-task path. Unblocks continue-gate.

*Week 2: Enforcement layer completion*
- **continue-gate** -- Wire into pre-task gate, feed coherence score
- **gateway** -- Wrap existing gates with idempotency + schema + budget
- **authority** -- Wire `IrreversibilityClassifier` into pre-command/pre-edit

*Week 3: Learning layer safety*
- **meta-governance** -- Wrap evolution pipeline. Constitutional invariants enforced.
- **optimizer** -- Wire into session-end hook. Completes the feedback loop.
- Integration test: full lifecycle through all 8 layers

**Phase 2: Complete the Knowledge + Validation layers (3--4 weeks)**

*Cluster 1: Epistemological stack*
- **truth-anchors** + **uncertainty** (adopt together)

*Cluster 2: CI/CD*
- **headless** (when pipeline established)

**Phase 3: Extending modules (opportunistic)**

Adopt as needed: temporal, capabilities, generators, artifacts,
manifest-validator, wasm-kernel.

### 7.3 Risk Matrix

| Layer | Status | Risk if Not Fixed |
|-------|--------|------------------|
| Enforcement | 3 essential modules missing | CRITICAL -- half the enforcement is absent |
| Observation | persistence missing | HIGH -- all learning impossible |
| Learning | unconstrained evolution, no optimizer | HIGH -- safety rules can erode |
| Knowledge | entirely empty | HIGH -- no session health monitoring |

### 7.4 Answer to "Should We Use Them All?"

**No. 24 of 32 at minimum. 28 of 32 at target.**

4 permanently skipped:
- **ruvbot-integration** -- we don't use ruvbot
- **crypto-utils** -- internal helper, consumed transitively
- **types** -- implicit via any import
- **index (ControlPlane)** -- our architecture surpasses this facade

The remaining 28 are all architecturally justified. The question for each
is *when*, not *whether*. The 7 Essential gaps are urgent -- they represent
broken layers in the current system.

---

## Appendix A: LOC Summary (All 32 Modules by Layer)

| Layer | Module | LOC | Priority |
|-------|--------|-----|----------|
| Policy | compiler | 418 | Essential |
| Policy | retriever | 393 | Essential |
| Policy | generators | 681 | Extending |
| Enforcement | gates | 301 | Essential |
| Enforcement | hooks | 346 | Essential |
| Enforcement | gateway | 451 | Essential |
| Enforcement | authority | 557 | Essential |
| Enforcement | continue-gate | 352 | Essential |
| Enforcement | memory-gate | 381 | Essential |
| Observation | ledger | 374 | Essential |
| Observation | persistence | 463 | Essential |
| Observation | proof | 237 | Completing |
| Observation | artifacts | 355 | Extending |
| Learning | analyzer | 2,517 | Essential |
| Learning | optimizer | 328 | Essential |
| Learning | evolution | 499 | Essential |
| Learning | meta-governance | 347 | Essential |
| Trust | trust | 472 | Essential |
| Trust | adversarial | 571 | Essential |
| Trust | capabilities | 484 | Extending |
| Knowledge | coherence | 371 | Essential |
| Knowledge | truth-anchors | 487 | Completing |
| Knowledge | uncertainty | 618 | Completing |
| Knowledge | temporal | 657 | Extending |
| Validation | conformance-kit | 628 | Essential |
| Validation | headless | 341 | Completing |
| Validation | manifest-validator | 837 | Extending |
| Infrastructure | wasm-kernel | 157 | Extending |
| Infrastructure | crypto-utils | 23 | Skip |
| Infrastructure | types | 9 | Skip |
| Infrastructure | index | 320 | Skip |
| Integration | ruvbot-integration | 737 | Skip |
| | **Total** | **15,712** | |

## Appendix B: ADR Cross-Reference

| ADR | Title | Module(s) | Layer |
|-----|-------|-----------|-------|
| G001 | Guidance Control Plane | compiler, hooks, index | Policy, Enforcement, Infra |
| G002 | Constitution/Shard Split | compiler, retriever | Policy |
| G003 | Intent-Weighted Classification | retriever | Policy |
| G004 | Four Enforcement Gates | gates | Enforcement |
| G005 | Proof Envelope | ledger, proof | Observation |
| G006 | Deterministic Tool Gateway | ledger, gateway | Observation, Enforcement |
| G007 | Memory Write Gating | memory-gate | Enforcement |
| G008 | Optimizer Promotion Rule | persistence, optimizer | Observation, Learning |
| G009 | Headless Testing Harness | headless | Validation |
| G010 | Capability Algebra | capabilities | Trust |
| G011 | Artifact Ledger | artifacts | Observation |
| G012 | Manifest Validator | manifest-validator | Validation |
| G013 | Evolution Pipeline | evolution | Learning |
| G014 | Agent Cell Conformance Kit | conformance-kit | Validation |
| G015 | Coherence-Driven Throttling | coherence | Knowledge |
| G016 | Agentic Container Integration | (runtime) | -- |
| G017 | Trust Score Accumulation | trust | Trust |
| G018 | Truth Anchor System | truth-anchors | Knowledge |
| G019 | First-Class Uncertainty | uncertainty | Knowledge |
| G020 | Temporal Assertions | temporal | Knowledge |
| G021 | Human Authority/Irreversibility | authority | Enforcement |
| G022 | Adversarial Model | adversarial | Trust |
| G023 | Meta-Governance | meta-governance | Learning |
| G024 | Continue Gate | continue-gate | Enforcement |
| G025 | Rust WASM Policy Kernel | wasm-kernel | Infrastructure |

## Appendix C: Current Wrapper Import Map

| Wrapper File | Layer | Modules Imported |
|-------------|-------|-----------------|
| phase1-runtime.js | Policy + Enforcement + Observation | compiler, retriever, gates, hooks, ledger |
| advanced-runtime.js | Observation + Trust + Validation + Learning | proof, trust, adversarial, conformance-kit, evolution |
| memory-write-gate.js | Enforcement | memory-gate |
| autopilot scripts | Learning | analyzer |
| hook-handler.cjs | (indirect) | (via CLI commands) |

**Modules not imported by any wrapper (20):**
- Enforcement: gateway, authority, continue-gate
- Observation: persistence, artifacts
- Learning: optimizer, meta-governance
- Trust: capabilities
- Knowledge: coherence, truth-anchors, uncertainty, temporal
- Validation: headless, manifest-validator
- Infrastructure: wasm-kernel
- Policy: generators
- Skip: ruvbot-integration, crypto-utils, types, index

---

*Report generated from source analysis of `@claude-flow/guidance` v3.0.0-alpha.1
(32 modules, 15,712 LOC, 25 ADRs). Analysis performed by 4 parallel agents
examining all `.js` and `.d.ts` files, README, package.json, and wrapper source.*
