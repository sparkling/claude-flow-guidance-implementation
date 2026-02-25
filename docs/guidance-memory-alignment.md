# Guidance Memory Alignment Analysis

How the `claude-flow-guidance-implementation` memory system relates to the
CLI memory system we built via patches, and what to do about it.

**Date**: 2026-02-25
**Method**: 4-agent parallel research swarm analyzing source code, docs, and ADRs
across both repos.

---

## Contents

- [Executive Summary](#executive-summary)
- [The Two Memory Systems](#the-two-memory-systems)
  - [CLI Memory (Patches)](#cli-memory-patches)
  - [Guidance Memory](#guidance-memory)
- [Existing Bridges](#existing-bridges)
  - [EmbeddingProvider Bridge](#embeddingprovider-bridge)
  - [MemoryWriteGateHook](#memorywritegatehook)
- [Should We Merge?](#should-we-merge)
- [Alignment Recommendations](#alignment-recommendations)
- [Trust Boundary Architecture](#trust-boundary-architecture)
- [Phased Implementation](#phased-implementation)
- [Config Alignment](#config-alignment)
- [Risk Assessment](#risk-assessment)

---

<a id="executive-summary"></a>

## Executive Summary

**Verdict: Do NOT merge. Align.**

The CLI memory system and the guidance memory system serve fundamentally different
purposes. The CLI system stores *agent knowledge* (what the agent has learned about
the codebase). The guidance system enforces *governance policy* (what the agent is
allowed to do). Merging them would violate a trust boundary: an agent that can write
to its own memory must NOT be able to write to the rules that govern its behavior.

Instead of merging, we should **tighten the alignment** between the two systems:

1. **Wire MemoryWriteGateHook into the write path** -- currently unwired
   dead code (exported but never imported by any runtime path), it must gate every
   `memory_store` MCP call
2. **Wire trust scores into search ranking** -- governance trust tiers should
   influence which AgentDB results surface first
3. **Share the embedding space** -- the EmbeddingProvider bridge already does this; ensure both systems
   use `AgentDBEmbeddingProvider` (not the `hash` fallback) in production
4. **Separate RVF files** -- `.swarm/agentdb-memory.rvf` for agent knowledge,
   `.swarm/governance.rvf` for governance state (never merged)

The two repos already generate matching `config.json` schemas (19 keys aligned
since WM-007 and `buildConfigJson()` in the guidance repo). The bridge code exists
as exported-but-never-imported dead code in the guidance repo. The remaining work
is wiring it into the actual runtime paths.

---

<a id="the-two-memory-systems"></a>

## The Two Memory Systems

<a id="cli-memory-patches"></a>

### CLI Memory (Patches)

**Purpose**: Store and retrieve agent knowledge -- what the agent learns about the
codebase, patterns, user preferences, session context.

**Implementation**: 12 patches (WM-001 through WM-012, plus IN-001, NS-001/002/003).

| Component | Patch | What It Does |
|-----------|-------|-------------|
| HybridBackend | WM-001 | Dual-write to SQLite + AgentDB RVF |
| AutoMemoryBridge | WM-003 | Sync `~/.claude/memory/` <-> HybridBackend at session boundaries |
| Intelligence.cjs | IN-001 | PageRank graph for context ranking (replaces 197-line stub) |
| Config wiring | WM-007 | 19 config.json keys consumed at runtime |
| AgentDB v3 | WM-008 | RVF single-file format, SelfLearningRvfBackend |
| Self-learning | WM-009 | `recordFeedback()` API for contrastive training |
| Witness chain | WM-010 | SHAKE-256 tamper detection at session start |
| ReasoningBank | WM-011 | Pattern storage for successful reasoning trajectories |
| Proxy methods | WM-012 | `HybridBackend.recordFeedback()` etc. without backend reach-through |

**Storage**:

```
.swarm/
  hybrid-memory.db       # SQLite -- structured queries (key, prefix, tag)
  agentdb-memory.rvf     # AgentDB v3 -- HNSW vectors, learning state, witness chain
```

**Learning**: Two feedback loops operate in parallel:
- **PageRank** (Intelligence.cjs): +0.05/-0.02 confidence, trigram Jaccard matching
- **AgentDB contrastive** (WM-009): positive/negative feedback pairs -> LoRA adaptation -> EWC++ consolidation

<a id="guidance-memory"></a>

### Guidance Memory

**Purpose**: Enforce governance policy -- what the agent is allowed to do, trust
scoring, cryptographic audit trails, rule evolution.

**Implementation**: `@sparkleideas/claude-flow-guidance` wrapping `@claude-flow/guidance`.

| Component | Source | What It Does |
|-----------|--------|-------------|
| Phase 1 Runtime | `phase1-runtime.js` | Compiler, retriever, gates, ledger (lightweight) |
| Advanced Runtime | `advanced-runtime.js` | Trust, adversarial, proof, conformance, evolution |
| TrustAccumulator | `@claude-flow/guidance/trust` | Per-agent reputation: exponential decay, 4 privilege tiers |
| ProofChain | `@claude-flow/guidance/proof` | SHA-256 HMAC hash chain for tamper-evident audit |
| Evolution Pipeline | `@claude-flow/guidance/evolution` | 5-stage rule evolution: propose > simulate > compare > stage > advance |
| Coherence | `@claude-flow/guidance/coherence` | Session health scoring (violations 0.4, rework 0.3, drift 0.3) |
| Optimizer | `@claude-flow/guidance/optimizer` | "Win twice to promote" -- violation-driven rule adaptation |
| MemoryWriteGate | `memory-write-gate.js` | 4-check write validation (authority, rate, pattern, semantic) |
| EmbeddingProvider | `embedding-provider.js` | Shared vector space via AgentDB or hash fallback |

**Storage**:

```
.claude-flow/guidance/
  events.ndjson          # Persistent ledger (NDJSON append-only)
  *.json                 # Component state files
  advanced/
    advanced-state.json  # Trust scores, adversarial state
    proof-chain.json     # Hash chain for audit
```

**Learning**: Trust accumulation (exponential decay, per-agent), evolution pipeline
(A/B testing with rollback), optimizer cycle (4-6 weeks for rule promotion).

---

<a id="existing-bridges"></a>

## Existing Bridges

Two bridge components exist in the guidance implementation repo. Both are
**exported but never imported or called by any runtime code path** -- they are
dead code that needs to be wired in.

<a id="embeddingprovider-bridge"></a>

### EmbeddingProvider Bridge

**File**: `src/guidance/embedding-provider.js`

Creates a shared vector space so both systems can compute semantic similarity using
the same embedding model.

| Implementation | Backend | Use Case |
|----------------|---------|----------|
| `HashEmbeddingProvider` | Deterministic hash (sin-based) | Tests, environments without AgentDB |
| `AgentDBEmbeddingProvider` | AgentDB v3 `EmbeddingService` | Production: real transformer embeddings |

**Current status**: Imported by `memory-write-gate.js` internally (MemoryWriteGateHook uses it
for semantic contradiction checks). But since MemoryWriteGateHook itself is never called at
runtime, the EmbeddingProvider bridge is also effectively dead code. Falls back to hash if AgentDB isn't
available. The `AgentDBEmbeddingProvider` wraps the same embedding pipeline that
`HybridBackend` uses for `memory_search`, ensuring cosine similarity scores are
comparable across systems -- once wired in.

**Gap**: No runtime code imports `createEmbeddingProvider()`. The guidance retriever
(`@claude-flow/guidance/retriever`) uses its own internal similarity function, not
the EmbeddingProvider bridge. Shard retrieval and memory search use different vector spaces.

<a id="memorywritegatehook"></a>

### MemoryWriteGateHook

**File**: `src/guidance/memory-write-gate.js`

Validates every memory write against four checks:

| Check | What It Validates | Depends On |
|-------|------------------|-----------|
| Authority | Agent role + namespace access | Governance (TrustSystem) |
| Rate limit | Per-agent writes/min cap | Governance (trust tiers) |
| Pattern contradiction | Keyword opposition pairs | Self-contained (regex) |
| Semantic contradiction | Cosine similarity >= 0.85 | EmbeddingProvider |

**Current status**: Implemented and unit-tested. But **completely unwired** --
`createMemoryWriteGateHook()` is exported from `memory-write-gate.js` but never
imported by any runtime code. Not by `auto-memory-hook.mjs`, not by the MCP
`memory_store` handler, not by `hook-handler.cjs`. The class exists but no code
path ever instantiates or calls it.

**Gap**: MemoryWriteGateHook must be wired into the write path. This requires changes in both
repos: a direct edit in the guidance repo's hook handler to instantiate the gate,
and a patch in the CLI's `memory-initializer.js` to call `checkWrite()` before
`store()`.

---

<a id="should-we-merge"></a>

## Should We Merge?

**No.** Three reasons:

### 1. Trust boundary violation

If governance data (trust scores, proof chain, evolution state) lives in the same
database as agent memory, an agent with write access to its memory can potentially
tamper with the rules that govern it. The systems MUST use separate storage:

```
.swarm/agentdb-memory.rvf    # Agent writes here freely
.swarm/governance.rvf         # Only governance system writes here
```

Even with namespace isolation within a single RVF, a bug in namespace enforcement
would collapse the boundary. Separate files = separate attack surface.

### 2. Different data models

| Dimension | CLI Memory | Governance |
|-----------|-----------|-----------|
| Entry type | Key-value with embeddings | Events, scores, hash chains |
| Write pattern | Frequent (every MCP call) | Rare (per decision/violation) |
| Read pattern | Search by similarity | Read by agent ID or chain position |
| Retention | Persistent across sessions | Persistent + tamper-evident |
| Schema | Flat (key, value, namespace, tags) | Structured (envelopes, proposals, scores) |

Forcing governance events into AgentDB's key-value-with-embeddings model would
require impedance mismatch adapters that add complexity without benefit.

### 3. Different lifecycle

Agent memory grows continuously and benefits from decay/consolidation. Governance
state is append-only (proof chain) or accumulative (trust scores). Merging would
require careful isolation of garbage collection to avoid accidentally pruning
governance history.

### What we SHOULD merge

The **embedding space** should be shared. When the guidance retriever computes
"how similar is this task to this CLAUDE.md shard?", it should use the same
vector model as "how similar is this query to stored memory entries?". The
EmbeddingProvider bridge already enables this -- it just needs to be wired into
the retriever path.

---

<a id="alignment-recommendations"></a>

## Alignment Recommendations

### R1: Make MemoryWriteGateHook mandatory in the write path

**Current**: `memory_store` MCP handler -> `HybridBackend.store()` (no governance check)
**Target**: `memory_store` MCP handler -> `MemoryWriteGateHook.checkWrite()` -> `HybridBackend.store()`

Implementation: Patch `mcp-tools/memory-tools.js` to import and call `MemoryWriteGateHook`
before delegating to `storeEntry()`. This is a single early-return gate:

```javascript
const decision = await writeGate.checkWrite({ key, namespace, value, agentId });
if (!decision.allowed) {
  return { success: false, reason: decision.reason, contradictions: decision.contradictions };
}
```

### R2: Wire trust scores into search result ranking

**Current**: AgentDB returns results ranked by cosine similarity only.
**Target**: Results reranked by `similarity * trustMultiplier(agentId)`.

The guidance TrustAccumulator already computes per-agent trust tiers:

| Tier | Trust Range | Multiplier |
|------|-------------|-----------|
| Full | >= 0.7 | 1.0 |
| Restricted | 0.4 - 0.7 | 0.8 |
| Read-only | 0.2 - 0.4 | 0.6 |
| Suspended | < 0.2 | 0.0 (filtered out) |

Entries authored by suspended agents would be filtered from search results entirely.
This prevents a malicious agent from poisoning the memory store.

### R3: Use AgentDBEmbeddingProvider in production

**Current**: `createEmbeddingProvider({ provider: 'hash' })` is the default.
**Target**: `createEmbeddingProvider({ provider: 'agentdb' })` when AgentDB is available.

The `buildConfigJson()` in the guidance repo already generates `agentdb.vectorBackend: 'rvf'`
and `agentdb.enableLearning: true`. The EmbeddingProvider bridge should read this config
and auto-select the AgentDB implementation.

### R4: Separate governance RVF

**Current**: Governance state stored as JSON in `.claude-flow/guidance/advanced/`.
**Target**: Critical governance state (trust scores, proof chain) in a separate
`.swarm/governance.rvf` for tamper detection via witness chain.

This leverages the same witness chain verification that WM-010 already wires for
agent memory. Running `verifyWitnessChain()` on the governance RVF at session start
detects if someone tampered with trust scores or proof chain between sessions.

### R5: Add cross-system integration tests

**Current**: Zero tests that exercise CLI memory + guidance together.
**Target**: Test suite that verifies:

- MemoryWriteGateHook blocks contradictory writes to HybridBackend
- Trust tier changes affect search result ranking
- Witness chain detects governance state tampering
- Embedding space consistency (same text -> same vector in both systems)

---

<a id="trust-boundary-architecture"></a>

## Trust Boundary Architecture

```
                    Trust Boundary
                         |
    Agent Memory         |         Governance
    (read/write)         |         (read-only to agents)
                         |
  .swarm/                |    .swarm/
    agentdb-memory.rvf   |      governance.rvf
    hybrid-memory.db     |
                         |    .claude-flow/guidance/
                         |      events.ndjson
                         |      advanced/
                         |        advanced-state.json
                         |        proof-chain.json
                         |
  Written by:            |    Written by:
    memory_store MCP     |      GuidanceAdvancedRuntime
    AutoMemoryBridge     |      TrustAccumulator
    recordFeedback()     |      ProofChain
                         |      EvolutionPipeline
                         |
  Read by:               |    Read by:
    memory_search MCP    |      MemoryWriteGateHook
    Intelligence.cjs     |      hook-handler.cjs
    AutoMemoryBridge     |      GuidancePhase1Runtime
                         |
  Crosses boundary:      |
    MemoryWriteGateHook  |    EmbeddingProvider reads
    reads trust scores   |    AgentDB embeddings from
    from right side for  |    left side for semantic
    rate limiting        |    similarity
```

The trust boundary is enforced by **file-level separation** (different RVF files,
different directories) and **process-level access control** (only governance code
writes to governance storage). No namespace tricks inside a shared database.

---

<a id="phased-implementation"></a>

## Phased Implementation

### Phase 1: Mandatory write gate (patches + direct code)

| Task | Repo | Method | Effort |
|------|------|--------|--------|
| Wire MemoryWriteGateHook into `memory_store` MCP handler | patch | `patch()` in fix.py | 1 patch op in `mcp-tools/memory-tools.js` |
| Wire MemoryWriteGateHook into `AutoMemoryBridge.doSync()` | patch | `patch()` in fix.py | 1 patch op in `auto-memory-hook.mjs` |
| Default `embeddingProvider` to `'agentdb'` when available | guidance | **direct edit** | Edit `createMemoryWriteGateHook()` |
| Wire MemoryWriteGateHook as mandatory gate in hook handler | guidance | **direct edit** | Edit `src/hooks/hook-handler.cjs` |

### Phase 2: Trust-aware search (patches only)

| Task | Repo | Method | Effort |
|------|------|--------|--------|
| Read trust scores from governance state | patch | `patch()` in fix.py | New helper in `memory/memory-initializer.js` |
| Rerank search results by trust multiplier | patch | `patch()` in fix.py | Modify search result processing in MCP handler |
| Filter suspended-agent entries from results | patch | `patch()` in fix.py | Add to reranking logic |
| Expose trust tier in `memory status` output | patch | `patch()` in fix.py | Update `commands/memory.js` |

### Phase 3: Governance witness chain (direct code + 1 patch)

| Task | Repo | Method | Effort |
|------|------|--------|--------|
| Create separate `.swarm/governance.rvf` | guidance | **direct edit** | New AgentDB backend in `advanced-runtime.js` |
| Store trust + proof in governance RVF | guidance | **direct edit** | Migrate persistence in `advanced-runtime.js` |
| Verify governance chain at session start | patch | `patch()` in fix.py | Extend WM-010's verification |

### Phase 4: Integration tests

| Task | Repo | Effort |
|------|------|--------|
| E2E: MemoryWriteGateHook blocks contradictions | guidance | Test using patch fixtures |
| E2E: trust affects ranking | guidance | Test with mock trust scores |
| E2E: witness chain tampering detected | guidance | Corrupt RVF, verify detection |

---

<a id="config-alignment"></a>

## Config Alignment

Both repos generate `config.json` with the same schema. The guidance repo's
`buildConfigJson()` and the patch's WM-007 config wiring share 19 keys:

| Key Path | Guidance Default | Patch Default | Aligned? |
|----------|-----------------|---------------|----------|
| `memory.backend` | `'hybrid'` | `'hybrid'` | Yes |
| `memory.enableHNSW` | `true` | `true` | Yes |
| `memory.cacheSize` | `100` | `100` | Yes |
| `memory.learningBridge.enabled` | `true` | `true` | Yes |
| `memory.learningBridge.sonaMode` | `'balanced'` | `'balanced'` | Yes |
| `memory.learningBridge.confidenceDecayRate` | `0.005` | `0.005` | Yes |
| `memory.learningBridge.accessBoostAmount` | `0.03` | `0.03` | Yes |
| `memory.learningBridge.consolidationThreshold` | `10` | `10` | Yes |
| `memory.memoryGraph.enabled` | `true` | `true` | Yes |
| `memory.memoryGraph.pageRankDamping` | `0.85` | `0.85` | Yes |
| `memory.memoryGraph.maxNodes` | `5000` | `5000` | Yes |
| `memory.memoryGraph.similarityThreshold` | `0.8` | `0.8` | Yes |
| `memory.agentdb.vectorBackend` | `'rvf'` | `'rvf'` | Yes |
| `memory.agentdb.enableLearning` | `true` | `true` | Yes |
| `memory.agentdb.learningPositiveThreshold` | `0.7` | `0.7` | Yes |
| `memory.agentdb.learningNegativeThreshold` | `0.3` | `0.3` | Yes |
| `memory.agentdb.learningBatchSize` | `32` | `32` | Yes |
| `memory.agentdb.learningTickInterval` | `30000` | `30000` | Yes |
| `neural.enabled` | `true` | `true` | Yes |

All 19 keys are aligned. The `buildConfigJson()` function in the guidance repo was
specifically designed to match the schema that WM-007 wires into the CLI runtime.

---

<a id="risk-assessment"></a>

## Risk Assessment

### Risks of NOT aligning

| Gap | Risk | Impact | Likelihood |
|-----|------|--------|-----------|
| MemoryWriteGateHook unwired | Contradictory entries stored | Memory poisoning | High (any concurrent agent) |
| No trust ranking | Suspended agent's entries surface | Bad context injection | Medium (requires malicious agent) |
| Hash fallback | Semantic checks are cosmetic | Contradiction detection fails | High (default config) |
| No governance witness | Trust scores tampered between sessions | Trust bypass | Low (requires file access) |
| No integration tests | Regressions go undetected | Silent degradation | Certain |

### Risks of full merge

| Risk | Impact | Why |
|------|--------|-----|
| Trust boundary collapse | Agent writes to own governance rules | Critical -- architectural violation |
| Impedance mismatch | Complex adapters for governance -> KV model | Medium -- ongoing maintenance |
| GC interference | Agent memory cleanup affects governance history | Medium -- data loss risk |
| Single point of failure | Corrupted RVF loses both memory and governance | High -- blast radius |

### Conclusion

The risk profile strongly favors alignment over merge. The trust boundary is
non-negotiable. The bridge code (EmbeddingProvider, MemoryWriteGateHook) already
exists as dead exports and needs to be wired into the runtime. The config schemas
are already aligned. The implementation effort for Phase 1 (wiring the write gate)
is approximately 2 patch ops + 2 direct edits -- significantly less than a merge
would require.

---

## Related Documents

| Document | Location | Covers |
|----------|----------|--------|
| [Memory System Architecture](memory-system.md) | patch repo | Full CLI memory system documentation |
| [Memory & Learning System Overlap Analysis](memory-system-analysis.md) | patch repo | Overlap analysis with architecture diagrams |
| [Memory Systems Analysis](../../../claude-flow-guidance-implementation/docs/memory-systems-analysis.md) | guidance repo | Three-system comparison with target architecture |
| [ADR-001](adr/ADR-001-use-hybridbackend-directly.md) | patch repo | Why HybridBackend, not UnifiedMemoryService |
| [ADR-003](adr/ADR-003-separate-database-files.md) | patch repo | Separate database files for schema coexistence |
