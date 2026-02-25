# GuidanceControlPlane — Forensic Analysis Report

**Generated:** 2026-02-24
**Source:** `v3/@claude-flow/guidance/src/index.ts` lines 310–540
**Package:** `@claude-flow/guidance` 3.0.0-alpha.1

---

## 1. What GuidanceControlPlane Is

A convenience facade class defined directly in `index.ts` (not its own module). It composes 6 of 32 upstream modules and delegates every method call to internal fields with zero unique logic.

```typescript
export class GuidanceControlPlane {
  private compiler: GuidanceCompiler;       // compiler.ts
  private retriever: ShardRetriever;        // retriever.ts
  private gates: EnforcementGates;          // gates.ts
  private ledger: RunLedger;                // ledger.ts
  private optimizer: OptimizerLoop;         // optimizer.ts
  private headless: HeadlessRunner | null;  // headless.ts (conditional)
}
```

### Methods (all one-liner delegations)

| Method | Delegates to | Purpose |
|--------|-------------|---------|
| `initialize()` | compiler.compile(), retriever.loadBundle(), gates.setActiveRules() | Read CLAUDE.md, compile, load shards |
| `compile()` | compiler.compile(), retriever.loadBundle(), gates.setActiveRules() | Same as initialize() but with explicit content |
| `retrieveForTask()` | retriever.retrieve() | Get relevant shards for a task |
| `evaluateCommand()` | gates.evaluateCommand() | Check command against gates |
| `evaluateToolUse()` | gates.evaluateToolUse() | Check tool use against gates |
| `evaluateEdit()` | gates.evaluateEdit() | Check file edit against gates |
| `startRun()` | ledger.createEvent() | Begin a run event |
| `recordViolation()` | event.violations.push() | Append violation to event |
| `finalizeRun()` | ledger.finalizeEvent(), ledger.evaluate() | Close event and run evaluators |
| `optimize()` | optimizer.runCycle(), optimizer.applyPromotions() | Run optimization (if 10+ events) |
| `getStatus()` | Reads internal field states | Return status object |
| `getMetrics()` | ledger.computeMetrics(), ledger.rankViolations() | Return violation stats |

No method contains logic beyond delegation + null checks.

---

## 2. What It Does Not Include

**26 of 32 modules** are absent from the class:

### Absent from Wave 1 (3 modules)
| Module | ADR | Why it matters |
|--------|-----|---------------|
| gateway | G006 | Idempotency cache, schema validation, budget metering |
| persistence | G008 | NDJSON event store — without it, all run events are lost on restart |
| hooks | G001 | The actual Claude Code hook wiring — the integration point |

### Absent from Wave 2 (5 modules)
| Module | ADR | Why it matters |
|--------|-----|---------------|
| memory-gate | G007 | Authority-based memory write governance |
| conformance-kit | G014 | Agent cell acceptance testing |
| capabilities | G010 | Typed permission algebra with delegation chains |
| artifacts | G011 | Signed artifact records with lineage |
| evolution | G013 | Safe rule change lifecycle (draft -> simulate -> canary -> promote) |

### Absent from Wave 3 (8 modules)
| Module | ADR | Why it matters |
|--------|-----|---------------|
| trust | G017 | Per-agent scoring, 4 tiers, 5:1 penalty/reward |
| truth-anchors | G018 | Immutable facts, memory conflict resolution |
| uncertainty | G019 | Confidence intervals, contested detection |
| temporal | G020 | Bitemporal assertions, validity windows |
| authority | G021 | Irreversibility classification, escalation hierarchy |
| adversarial | G022 | Injection detection, collusion, memory quorum |
| meta-governance | G023 | Constitutional invariants, amendment supermajority |
| continue-gate | G024 | Budget slope detection, rework ratio, loop prevention |

### Absent from Tooling (7 modules)
| Module | ADR | Why it matters |
|--------|-----|---------------|
| coherence | G015 | Privilege degradation based on coherence score |
| manifest-validator | G012 | Fails-closed admission control |
| wasm-kernel | G025 | 1.25x–1.96x performance (optional) |
| generators | — | CLAUDE.md scaffolding and scoring |
| analyzer | — | 6-dimension CLAUDE.md analysis |
| ruvbot-integration | — | RuvBot bridge |
| proof | G005 | Hash-chained cryptographic audit trail |

### Internal (2 modules)
- types.ts, crypto-utils.ts

---

## 3. ADR Evidence

### ADR-G001 — The founding definition

> Build `@claude-flow/guidance` as a parallel control plane with five components: Compiler, Retriever, Gates, Ledger, Optimizer

This is the only ADR that architecturally defines the ControlPlane class. It describes a 5-component orchestrator. The class implements exactly this, plus optional headless.

### ADR-G004, G005, G006, G008, G009 — ControlPlane as routing layer

These ADRs reference ControlPlane only to say "method X lives here":

- G004: "`GuidanceControlPlane.evaluateCommand()`, `evaluateToolUse()`, `evaluateEdit()`"
- G005: "`GuidanceControlPlane.startRun()`, `finalizeRun()`"
- G006: "Implement deterministic tool evaluation **in** the GuidanceControlPlane orchestrator"
- G008: "`GuidanceControlPlane.optimize()`"
- G009: "`GuidanceControlPlane.getHeadlessRunner()`"

They treat the class as an address, not as an architectural decision.

### ADR-G006 — The most substantive mention

G006 describes the ControlPlane's three facade methods and calls it an "orchestrator." But the actual decision in G006 is about gates being deterministic pure functions — the ControlPlane is just where they're called from.

### ADR-G007 — Acknowledges the gap

> "The guidance control plane's role is to define policies for memory writes."

But then immediately:

> "Memory writes go through MCP tools, so gating depends on the MCP layer invoking the guidance control plane. If an agent bypasses MCP, the gates are ineffective."

Memory-gate is NOT composed into ControlPlane. G007 treats "control plane" as the conceptual system, not the class.

### ADR-G010 through G025 — Wave 2 and Wave 3

All 16 ADRs list **"Author: Guidance Control Plane Team"** but **none proposes adding their module to the ControlPlane class.** Every module is defined as standalone:

- G010 (capabilities): Standalone `CapabilityAlgebra` class
- G013 (evolution): Standalone `EvolutionPipeline` class
- G015 (coherence): Standalone `CoherenceScheduler` + `EconomicGovernor`
- G017 (trust): Standalone `TrustSystem` class
- G022 (adversarial): Standalone `ThreatDetector` + `CollusionDetector` + `MemoryQuorum`
- G023 (meta-governance): Standalone `MetaGovernor` class

Not one of these ADRs proposes: "extend GuidanceControlPlane to compose this new module."

### ADR-G014 — Uses "control plane" as a concept

> "The Memory Clerk becomes the canonical acceptance test for the entire control plane"

Here "control plane" means the whole governance system — not the 6-module class. The conformance-kit tests gates, coherence, proof, and memory — most of which are absent from the actual class.

### ADR-G016 — Maps spec to components, not to class

G016 maps 10 Agentic Container Spec sections to control plane components:

| Spec Section | Component | In ControlPlane class? |
|-------------|-----------|----------------------|
| Runtime Lanes | ManifestValidator | No |
| Agent Cell Manifest | ManifestValidator | No |
| Tool Gateway API | DeterministicToolGateway | No |
| Memory Plane | MemoryWriteGate + CoherenceScheduler | No |
| Supply Chain Integrity | ArtifactLedger + ProofChain | No |
| Observability | PersistentLedger + RunLedger | RunLedger only |
| Identity & Secrets | CapabilityAlgebra + EnforcementGates | Gates only |
| Cost Accounting | EconomicGovernor | No |
| Failure Modes | CoherenceScheduler | No |
| Evolution | EvolutionPipeline | No |

**9 of 10 spec mappings reference modules outside the ControlPlane class.**

---

## 4. Commit Evidence

### Commit 012c445 (Feb 01 10:58) — Creation

> "feat: add @claude-flow/guidance control plane package"

The ControlPlane class is created in the first commit with all 6 fields. 105 tests.

### Commits 8425acf through 65b5a59 (Feb 01 11:29 – Feb 02 01:51) — 25 subsequent commits

**Waves 1, 2, and 3 each add 5–8 modules. None are wired into ControlPlane.**

| Commit | Modules added | Added to ControlPlane? |
|--------|--------------|----------------------|
| 8425acf (Wave 1) | proof, gateway, memory-gate, coherence, hooks, persistence | No |
| d166111 | artifacts | No |
| c234de0 | capabilities, evolution | No |
| 682f58f | manifest-validator | No |
| abb8931 | conformance-kit | No |
| f079efb (Wave 3) | trust, truth-anchors, uncertainty, temporal, authority, adversarial, meta-governance, ruvbot | No |
| 9e80e1f | continue-gate | No |
| 8a3b0f5 | wasm-kernel | No |
| 4555688 | generators, analyzer | No |

The class was created once and never extended. All 26 new modules were added as peer exports in `index.ts`, sitting alongside the ControlPlane — not inside it.

### Automated checkpoints (Feb 02 03:47–03:52)

23 checkpoint commits touch `index.ts` (re-exports) but none modify the ControlPlane class body.

---

## 5. The Two Meanings of "Control Plane"

The codebase uses "control plane" in two distinct senses:

| Usage | Meaning | Where |
|-------|---------|-------|
| **Conceptual** | The entire governance system (all 32 modules) | ADR titles, G007, G014, G016, README header |
| **Concrete** | The `GuidanceControlPlane` class (6 modules) | `index.ts` class definition, G001 decision |

This ambiguity is the source of confusion. When ADR-G016 says "the Guidance Control Plane provides complete governance for the Agentic Container Specification," it means the package — not the class. The class provides governance for 2 of 10 spec sections.

---

## 6. Why It Was Never Extended

The commit and ADR evidence suggests this was a deliberate design choice, not an oversight:

1. **Composition over aggregation.** Every wave-2 and wave-3 module is designed as a standalone factory (`createTrustSystem()`, `createEvolutionPipeline()`, etc.). They accept configuration and return independent instances. None requires ControlPlane as a dependency.

2. **Different lifecycles.** The ControlPlane's `initialize()` reads CLAUDE.md and compiles once. Trust, adversarial, and evolution have their own lifecycles (trust accumulates over time, evolution has a multi-day staged rollout, adversarial runs continuously). Forcing them into a single `initialize()`/`optimize()` lifecycle would be architecturally wrong.

3. **Different consumers.** The ControlPlane serves the core compile-retrieve-enforce loop. Memory-gate serves the memory subsystem. Trust serves agent management. Conformance-kit serves CI/CD. They have different callers.

4. **The hooks module bypasses it.** `createGuidanceHooks()` accepts pre-instantiated gates, retriever, and ledger — the same 3 components. It doesn't take a ControlPlane instance. This is the actual Claude Code integration point, and it was designed to work without the class.

---

## 7. Implications for Our Wrapper

### What our wrapper already does right

Our wrapper (`@sparkleideas/claude-flow-guidance`) already follows the same pattern as the upstream codebase: instantiate individual factories, compose them ourselves. We don't use ControlPlane, and the upstream evidence confirms this is the intended usage pattern for anything beyond the starter loop.

### What this means for the 20 unused modules

The 20 modules we don't use are all standalone factories. There is no aggregation layer to discover that would give us batch access to them. Each must be individually:

1. Imported
2. Instantiated with configuration
3. Wired into the appropriate lifecycle point
4. Tested

### The ControlPlane is not a roadmap

The ControlPlane's composition (compiler + retriever + gates + ledger + optimizer + headless) reflects the day-1 architecture from ADR-G001. It does not reflect the current state of the package. Using it as a guide for what to adopt would mean missing 26 modules — including the ones the ADRs describe as most architecturally significant (trust, adversarial, coherence, authority, evolution).

---

## 8. Summary

| Question | Answer | Evidence |
|----------|--------|----------|
| What is GuidanceControlPlane? | A day-1 convenience facade over 6/32 modules | `index.ts` source, commit 012c445 |
| Was it designed to grow? | No — 25 subsequent commits added 26 modules, none to ControlPlane | Git log, all wave commits |
| Do the ADRs propose extending it? | No — 16 ADRs add standalone modules without mentioning ControlPlane extension | ADR-G010 through G025 |
| Is "control plane" the class or the concept? | Both — the codebase uses the term ambiguously | G007, G014, G016 vs G001 |
| Should we use it? | No — we already follow the correct pattern (individual factories) | Upstream design, hooks module design |
| Is it a roadmap for adoption? | No — it reflects day-1 scope, not current package capabilities | Commits, ADRs, module inventory |
