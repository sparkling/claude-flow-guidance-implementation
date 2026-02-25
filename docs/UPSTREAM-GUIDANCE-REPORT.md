# @claude-flow/guidance — Upstream Analysis Report

**Generated:** 2026-02-24
**Source:** github.com/ruvnet/claude-flow/tree/main/v3/@claude-flow/guidance
**Package version:** 3.0.0-alpha.1

---

## Executive Summary

`@claude-flow/guidance` is a **complete governance control plane** for Claude Code agents, delivered in **12 hours** (2026-02-01 to 2026-02-02) across **50 commits** (26 meaningful + 23 automated checkpoints). It comprises **32 TypeScript modules** across 9 architectural layers, backed by **26 Architecture Decision Records** and **1,331 tests**.

Our wrapper (`@sparkleideas/claude-flow-guidance`) currently uses **12 of 32 modules** (37.5%).

---

## Commit History

### Timeline

| Phase | Time | Commits | What |
|-------|------|---------|------|
| 0: Core launch | Feb 01 10:58 | 1 | Control plane: compiler, retriever, gates, ledger, optimizer, headless, hooks |
| 1: Wave 1 | Feb 01 11:29 | 2 | proof, gateway, memory-gate, coherence, persistence |
| 2: Wave 2 | Feb 01 11:43–12:04 | 4 | artifacts, capabilities, manifest-validator, evolution, conformance-kit |
| 3: Wave 3 | Feb 01 14:32–17:05 | 3 | trust, truth-anchors, uncertainty, temporal, authority, adversarial, meta-governance, ruvbot, continue-gate |
| 4: Hardening | Feb 01 17:13–17:44 | 3 | Security fixes, 22-benchmark suite, Rust WASM kernel |
| 5: Docs & tools | Feb 01 19:55–22:33 | 10 | Generators, analyzer, optimizer, validation suite, A/B benchmarks, README, 13 guides |
| 6: Security | Feb 02 01:51 | 1 | Hardcoded key elimination, timing attacks, command injection |
| 7: Checkpoints | Feb 02 03:47–03:52 | 23 | Automated Claude Code checkpoints (5 min burst) |

### Commit Breakdown

| Type | Count |
|------|-------|
| Feature (feat:) | 14 |
| Documentation (docs:) | 8 |
| Security (security:) | 1 |
| Bug fix (fix:) | 2 |
| Performance (perf:) | 1 |
| Chore | 1 |
| Automated checkpoint | 23 |
| **Total** | **50** |

### Test Progression

```
Phase 0:  105 tests (6 files)
Phase 1:  379 tests (12 files)   +274
Phase 2:  639 tests (17 files)   +260
Phase 3: 1008 tests              +369
Phase 4: 1073 tests (23 files)   +65
Phase 5: 1328 tests (26 files)   +255
Phase 6: 1331 tests              +3  (final)
```

---

## Architecture Decision Records (26 ADRs)

All status: **Accepted**. All dated: **2026-02-01**.

### Wave 1: Foundations (G001–G009)

| ADR | Title | Decision | Module(s) |
|-----|-------|----------|-----------|
| G001 | Guidance Control Plane | Build parallel enforcement layer with 5 components (compiler, retriever, gates, ledger, optimizer). 1–5ms gate latency. | compiler, retriever, gates, ledger, optimizer, headless |
| G002 | Constitution/Shard Split | Two-tier rules: constitution (30–60 lines, ~500 tokens, always loaded) + shards (on-demand by semantic similarity). Cuts per-turn cost from 2000+ to ~500 tokens. | compiler, retriever |
| G003 | Intent-Weighted Classification | Deterministic weighted regex patterns per intent (11 categories). Sub-millisecond (<0.1ms). No LLM calls. | retriever |
| G004 | Four Enforcement Gates | destructive-ops (require-confirm), tool-allowlist (block), diff-size (warn at 300 lines), secrets (block + redact). Non-bypassable. | gates |
| G005 | Proof Envelopes | Hash-chained run events with SHA-256 guidance binding. Three-level tracing: guidance hash -> retrieved rules -> triggered rules. | ledger, compiler |
| G006 | Deterministic Tool Gateway | Idempotency cache, schema validation, budget metering. Same input = same output. Aggregation: block > confirm > warn > allow. | gates, ledger, gateway |
| G007 | Memory Write Gating | Authority-based namespace permissions, rate limiting via ViolationRateEvaluator, TTL via optimizer, contradiction detection. | gates, retriever, ledger, memory-gate |
| G008 | Optimizer Promotion Rule | "Win twice to promote." rankViolations -> proposeChanges -> A/B evaluate -> track wins -> promote at 2. 4–6 week journey. | optimizer, ledger |
| G009 | Headless Testing Harness | `claude -p` as evaluation primitive. TestTask with typed assertions. Suite runner with pass/fail/violation stats. Mock executor for unit tests. | headless, ledger |

### Wave 2: Capabilities & Conformance (G010–G016)

| ADR | Title | Decision | Module(s) |
|-----|-------|----------|-----------|
| G010 | Capability Algebra | 6 operations: grant, restrict, delegate, expire, revoke, attest. Set-theoretic composition. Delegation chains prevent escalation. | capabilities |
| G011 | Artifact Ledger | HMAC-signed artifact records with content hash, lineage tracking, kind-based search. 8 artifact kinds. | artifacts |
| G012 | Manifest Validator | Fails-closed admission control. 3-axis risk scoring (tool/data/privilege, 0–100). Lane selection: wasm forced if risk >70. Admission: <30 admit, 30–70 review, >70 reject. | manifest-validator |
| G013 | Evolution Pipeline | Lifecycle: draft -> signed -> simulating -> compared -> staged -> promoted/rolled-back. Staged rollout: 5% canary -> 25% partial -> 100% full. Auto-rollback at >5% divergence. | evolution |
| G014 | Conformance Kit | SimulatedRuntime + MemoryClerkCell (canonical test agent: 20 reads, 1 inference, 5 writes). Replay verification ensures determinism. 5 axioms exercised. | conformance-kit |
| G015 | Coherence-Driven Throttling | Weighted coherence score (violations 0.4, rework 0.3, drift 0.3). 4 privilege levels: full (>=0.8), restricted (>=0.6), read-only (>=0.3), suspended (<0.3). EconomicGovernor: 5 budget types. | coherence |
| G016 | Agentic Container Integration | Maps each container spec section to a control plane component. All 5 agent cell axioms enforced. 10/10 spec sections mapped to existing modules. | (integration layer) |

### Wave 3: Civilization-Grade Governance (G017–G026)

| ADR | Title | Decision | Module(s) |
|-----|-------|----------|-----------|
| G017 | Trust Score Accumulation | Per-agent 0.0–1.0 scores. 4 tiers: untrusted (0–0.3), provisional (0.3–0.6), trusted (0.6–0.85), verified (0.85–1.0). 5:1 penalty/reward ratio. Decay over time. | trust |
| G018 | Truth Anchor System | Immutable HMAC-signed external facts. Conflict resolution: truth anchors override memory when contradicted. | truth-anchors |
| G019 | First-Class Uncertainty | Confidence intervals with evidence chains. Contested detection when multiple agents report conflicting confidence. | uncertainty |
| G020 | Temporal Assertions | Bitemporal windows (valid-time + transaction-time). Supersession tracking. Temporal reasoning queries. | temporal |
| G021 | Human Authority & Irreversibility | Scope-based authority boundaries. IrreversibilityClassifier categorizes actions by reversibility. Escalation hierarchy. | authority |
| G022 | Adversarial Model | ThreatDetector (injection/manipulation). CollusionDetector (agent ring analysis, O(n) optimized). MemoryQuorum (voting for contested writes, O(n) min-find). | adversarial |
| G023 | Meta-Governance | Constitutional invariants (unamendable core rules). Amendment lifecycle with supermajority requirement. | meta-governance |
| G024 | ContinueGate | Budget slope detection (spending acceleration), rework ratio tracking, coherence threshold. Cooldown mode with critical stop conditions. | continue-gate |
| G025 | WASM Policy Kernel | Rust -> WASM with SIMD128. 4 modules: proof, gates, scoring, batch. 1.25x–1.96x performance gains. Fallback to JS when WASM unavailable. | wasm-kernel |
| G026 | Review Remediation | Post-review security hardening decisions. Hardcoded key elimination, timing-safe comparison, command injection fixes, ReDoS protection. | (cross-cutting) |

---

## Module Inventory (32 modules)

### Our wrapper usage vs upstream

| Module | File | ADR(s) | Upstream Phase | Our Status | Wrapper File |
|--------|------|--------|----------------|------------|-------------|
| compiler | compiler.ts | G001, G002 | Phase 1 | **USED** | phase1-runtime.js, autopilot |
| retriever | retriever.ts | G002, G003 | Phase 1 | **USED** | phase1-runtime.js |
| gateway | gateway.ts | G006 | Phase 1 | not used | — |
| continue-gate | continue-gate.ts | G024 | Phase 1 | not used | — |
| persistence | persistence.ts | G008 | Phase 1 | not used | — |
| proof | proof.ts | G005 | Phase 1 | **USED** | advanced-runtime.js |
| memory-gate | memory-gate.ts | G007 | Phase 2 | **USED** | memory-write-gate.js |
| temporal | temporal.ts | G020 | Phase 2 | not used | — |
| uncertainty | uncertainty.ts | G019 | Phase 2 | not used | — |
| trust | trust.ts | G017 | Phase 2 | **USED** | advanced-runtime.js |
| conformance-kit | conformance-kit.ts | G014 | Phase 2 | **USED** | advanced-runtime.js |
| authority | authority.ts | G021 | Phase 3 | not used | — |
| adversarial | adversarial.ts | G022 | Phase 3 | **USED** | advanced-runtime.js |
| meta-governance | meta-governance.ts | G023 | Phase 3 | not used | — |
| gates | gates.ts | G004 | Tooling | **USED** | phase1-runtime.js |
| hooks | hooks.ts | G001 | Tooling | **USED** | phase1-runtime.js |
| ledger | ledger.ts | G005, G006 | Tooling | **USED** | phase1-runtime.js |
| evolution | evolution.ts | G013 | Tooling | **USED** | advanced-runtime.js |
| optimizer | optimizer.ts | G008 | Tooling | not used | — |
| headless | headless.ts | G009 | Tooling | not used | — |
| wasm-kernel | wasm-kernel.ts | G025 | Tooling | not used | — |
| generators | generators.ts | — | Tooling | not used | — |
| analyzer | analyzer.ts | — | Tooling | **USED** | autopilot |
| capabilities | capabilities.ts | G010 | Tooling | not used | — |
| coherence | coherence.ts | G015 | Tooling | not used | — |
| manifest-validator | manifest-validator.ts | G012 | Tooling | not used | — |
| artifacts | artifacts.ts | G011 | Tooling | not used | — |
| truth-anchors | truth-anchors.ts | G018 | Tooling | not used | — |
| ruvbot-integration | ruvbot-integration.ts | — | Tooling | not used | — |
| types | types.ts | — | Internal | implicit | — |
| crypto-utils | crypto-utils.ts | — | Internal | not used | — |

**Score: 12/32 used (37.5%)**

---

## Coverage Gaps by Priority

### Critical (blocks long-horizon autonomy)

| Module | Why | ADR |
|--------|-----|-----|
| **coherence** | Without coherence-driven throttling, long sessions have no automatic degradation. Agents accumulate errors until catastrophic failure. | G015 |
| **gateway** | Without deterministic gateway, no idempotency for retried tool calls in swarms. No schema validation or budget metering. | G006 |
| **persistence** | Without persistent ledger, all run events are lost on restart. No cross-session learning or audit trail. | G008 |
| **optimizer** | Without optimizer, rules never evolve. Violations repeat indefinitely. No A/B testing of rule changes. | G008 |
| **authority** | Without authority gates, no escalation hierarchy for irreversible actions. | G021 |

### High (security and governance)

| Module | Why | ADR |
|--------|-----|-----|
| **truth-anchors** | Memory can contradict known facts with no resolution mechanism. | G018 |
| **uncertainty** | Confidence scores have no formal model. No contested detection for conflicting agent reports. | G019 |
| **temporal** | No bitemporal tracking. Can't reason about when facts were valid vs when they were recorded. | G020 |
| **meta-governance** | No constitutional invariants. Any rule can be changed, including safety-critical ones. | G023 |
| **continue-gate** | Agents can loop indefinitely with no budget slope or rework ratio detection. | G024 |

### Medium (completeness)

| Module | Why | ADR |
|--------|-----|-----|
| **capabilities** | Permissions are flat, not composable. No delegation chains or attestations. | G010 |
| **manifest-validator** | No admission control for agent manifests. | G012 |
| **artifacts** | No signed artifact records or lineage tracking. | G011 |
| **headless** | No automated compliance testing harness. | G009 |
| **generators** | No CLAUDE.md scaffolding or scoring. | — |

### Low (optional/specialized)

| Module | Why | ADR |
|--------|-----|-----|
| **wasm-kernel** | Performance optimization only (1.25x–1.96x). JS fallback works. | G025 |
| **ruvbot-integration** | RuvBot-specific bridge. Only needed if using RuvBot. | — |

---

## Key Architectural Patterns

### 1. Fails-Closed
Manifest validator rejects on any error. Gates block by default for unknown tools. Constructors fail without signing keys (post-G026).

### 2. Deterministic Evaluation
Gates are pure functions of (input, config). No randomness, no network, no time-dependent logic. Same input always produces same decision. Enables replay verification.

### 3. Hash-Chained Audit
Every run event binds to the guidance version (SHA-256 of constitution). Proof chain links events. Artifacts track lineage. All HMAC-signed.

### 4. Coherence-Driven Degradation
Not binary (running/stopped). Four privilege levels that degrade gracefully as coherence drops. Recovery possible if agent self-corrects.

### 5. Conservative Evolution
"Win twice to promote." 4–6 week minimum from violation to root promotion. Staged rollout (5% -> 25% -> 100%). Auto-rollback at >5% divergence.

### 6. Separation of Concerns
Gates (synchronous, stateless) vs Ledger (event recording) vs Optimizer (offline evolution) vs Coherence (runtime monitoring). Each testable independently.

---

## Performance Benchmarks

### WASM Kernel (10k events, SIMD128)

| Operation | JS | WASM | Speedup |
|-----------|----|----- |---------|
| SHA-256 throughput | 505k/s | 910k/s | **1.80x** |
| Secret scan (dirty) | 185k/s | 362k/s | **1.96x** |
| Secret scan (clean) | 402k/s | 676k/s | **1.68x** |
| Proof chain | 76ms | 61ms | **1.25x** |

### Algorithmic Improvements (post-hardening)

| Component | Improvement |
|-----------|------------|
| CollusionDetector | +37% (single graph build vs 3x) |
| MemoryQuorum.propose | +73% |
| MemoryQuorum.vote+resolve | +186% (O(n log n) -> O(n)) |
| Gateway.evaluate | +8% (batch cleanup interval) |
| ContinueGate cooldown | -29% (intentional safety cost) |

---

## Security Hardening (G026)

Applied across all modules in final security pass:

| Fix | Before | After |
|-----|--------|-------|
| HMAC keys | Hardcoded `DEFAULT_SIGNING_KEY` | Fail-closed constructors (must provide key) |
| Timing attacks | `===` string comparison for HMAC | `timingSafeEqual()` XOR-based constant-time |
| Command injection | `exec()` with string interpolation | `execFile()` shell-free execution |
| ReDoS | Nested quantifiers in authority patterns | Rejected patterns + 500-char limit |
| ConformanceRunner | Key not propagated | Key flows through to all components |

---

## Observations

1. **The entire package was built in 12 hours.** This is extraordinarily fast for 32 modules, 26 ADRs, 1,331 tests, a WASM kernel, and comprehensive documentation. The ADRs provide clear rationale for every decision.

2. **ADR-to-code tracing is clean.** Every module has at least one ADR. Every ADR names the modules it affects. This is the standard our wrapper should match.

3. **The "false dichotomy" is confirmed by the ADRs.** G001 defines ControlPlane with 5 components. G006 adds gateway separately. G010–G023 add 14 more modules with no mention of ControlPlane composition. The ADRs treat most modules as standalone.

4. **Our biggest gap is the feedback loop.** We have gates (enforcement) but not optimizer (evolution), persistence (memory), coherence (degradation), or headless (testing). This means our wrapper enforces rules but can't learn, degrade gracefully, or test itself.

5. **Wave 3 modules are deeply interconnected.** Trust feeds adversarial (collusion scoring uses trust). Uncertainty feeds truth-anchors (conflict resolution). Temporal feeds memory-gate (validity windows). Authority feeds meta-governance (amendment scope). Adopting one Wave 3 module without the others provides limited value.

6. **The WASM kernel is optional but the patterns aren't.** Even without WASM, the architectural patterns (fails-closed, deterministic evaluation, hash-chained audit) are fundamental and should be adopted.
