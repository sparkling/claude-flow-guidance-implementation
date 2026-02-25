# Architecture

## System Overview

This package is a **wrapper implementation** that bridges the upstream `@claude-flow/guidance` control plane into real Claude Code and Codex environments. It does not duplicate the upstream logic — it instantiates, configures, and wires the upstream modules through a layered runtime with null-object fallbacks for disabled components.

```mermaid
graph TB
    subgraph "User Environment"
        CC[Claude Code Session]
        CX[OpenAI Codex]
        CMD[CLAUDE.md + CLAUDE.local.md]
    end

    subgraph "This Package: @sparkleideas/claude-flow-guidance"
        INS[Installer<br/>installer.mjs]
        ENF[Enforcement Handler<br/>enforcement.cjs]
        P1[Phase 1 Runtime<br/>phase1-runtime.js]
        ADV[Advanced Runtime<br/>advanced-runtime.js]
        MWG[Memory Write Gate<br/>memory-write-gate.js]
        EP[Embedding Provider<br/>embedding-provider.js]
        EH[Event Handlers<br/>event-handlers.js]
        AP[Autopilot<br/>guidance-autopilot.js]
    end

    subgraph "Upstream: @claude-flow/guidance"
        COMP[Compiler]
        RET[Retriever]
        GT[Gates]
        TR[Trust System]
        ADV_U[Adversarial Detection]
        PR[Proof Chain]
        EV[Evolution Pipeline]
        COH[Coherence Scheduler]
        AUTH[Authority Gate]
        MG[Meta-Governance]
        OPT[Optimizer]
        TA[Truth Anchors]
        UNC[Uncertainty Ledger]
        TMP[Temporal Store]
        CAP[Capabilities Algebra]
        ART[Artifact Ledger]
        MAN[Manifest Validator]
        PER[Persistent Ledger]
        GW[Tool Gateway]
        CG[Continue Gate]
    end

    subgraph "Upstream: @claude-flow/hooks"
        HR[HookRegistry]
        HE[HookExecutor]
        HEV[HookEvent]
    end

    CC -->|hooks| ENF
    CX -->|bridge| ENF
    INS -->|wires| CC
    INS -->|wires| CX
    ENF -->|dispatches| EH
    EH -->|initialises| ADV
    ADV -->|creates| P1
    P1 -->|uses| COMP
    P1 -->|uses| RET
    P1 -->|uses| GT
    P1 -->|uses| HR
    P1 -->|uses| HE
    P1 -->|uses| PER
    P1 -->|uses| GW
    ADV -->|uses| TR
    ADV -->|uses| ADV_U
    ADV -->|uses| PR
    ADV -->|uses| EV
    ADV -->|uses| COH
    ADV -->|uses| AUTH
    ADV -->|uses| MG
    ADV -->|uses| OPT
    ADV -->|uses| TA
    ADV -->|uses| UNC
    ADV -->|uses| TMP
    ADV -->|uses| CAP
    ADV -->|uses| ART
    ADV -->|uses| MAN
    ADV -->|uses| CG
    MWG -->|wraps| EP
    MWG -->|cosine similarity| EP
    AP -->|analyses| CMD
    AP -->|benchmarks| COMP
```

## Layered Architecture

The implementation follows a layered architecture where each layer wraps a set of upstream modules with null-object fallbacks:

```mermaid
graph LR
    subgraph "Layer 5: Infrastructure"
        L5A[Capabilities Algebra]
        L5B[Manifest Validator]
        L5C[Headless Runner]
        L5D[WASM Kernel]
        L5E[Generators]
    end

    subgraph "Layer 4: Knowledge"
        L4A[Truth Anchors + Resolver]
        L4B[Uncertainty Ledger + Aggregator]
        L4C[Temporal Store + Reasoner]
    end

    subgraph "Layer 3: Validation"
        L3A[Coherence Scheduler]
        L3B[Economic Governor]
        L3C[Optimizer]
    end

    subgraph "Layer 2: Enforcement"
        L2A[Tool Gateway]
        L2B[Authority Gate]
        L2C[Continue Gate]
        L2D[Meta-Governor]
    end

    subgraph "Layer 1: Core Pipeline"
        L1A[Compiler]
        L1B[Retriever]
        L1C[Gates]
        L1D[Ledger]
        L1E[Hooks]
    end

    subgraph "Layer 0: Foundation"
        L0A[Trust System]
        L0B[Adversarial Detection]
        L0C[Proof Chain]
        L0D[Conformance Runner]
        L0E[Evolution Pipeline]
    end

    L5A --> L4A
    L4A --> L3A
    L3A --> L2A
    L2A --> L1A
    L1A --> L0A
```

Each layer has a corresponding `*-layer.js` file that provides null-object factories:

| Layer | File | Null Factories |
|---|---|---|
| Enforcement | `enforcement-layer.js` | Gateway, Authority, Continue Gate, Meta-Governor |
| Observation | `observation-layer.js` | Persistent Ledger, Artifact Ledger |
| Validation | `validation-layer.js` | Coherence Scheduler, Economic Governor, Optimizer |
| Knowledge | `knowledge-layer.js` | Truth Anchors/Resolver, Uncertainty Ledger/Aggregator, Temporal Store/Reasoner |
| Infrastructure | `infrastructure-layer.js` | Capability Algebra, Manifest Validator, Headless, WASM, Generators |

## Hook Event Flow

When Claude Code fires a hook event, this is the processing pipeline:

```mermaid
sequenceDiagram
    participant CC as Claude Code
    participant ENF as enforcement.cjs
    participant EH as event-handlers.js
    participant ADV as Advanced Runtime
    participant P1 as Phase 1 Runtime
    participant UP as Upstream Gates
    participant TR as Trust System
    participant PR as Proof Chain
    participant AP as Autopilot

    CC->>ENF: Hook event (stdin JSON)
    ENF->>ENF: Parse command + tool_input
    ENF->>EH: runGuidanceEventSync(event, payload)
    EH->>ADV: runtime.initialize()
    ADV->>P1: phase1.initialize()
    P1->>UP: compiler.compile(CLAUDE.md)
    P1->>UP: retriever.loadBundle(bundle)
    P1->>UP: gates.setActiveRules(rules)

    alt pre-command
        EH->>P1: phase1.preCommand(command)
        P1->>UP: gates.evaluate(command)
        UP-->>P1: {success, aborted, warnings}
        EH->>ADV: threatDetector.analyzeInput(command)
        EH->>ADV: irreversibilityClassifier.classify(command)
        EH->>ADV: authorityGate.canPerform(level, command)
    end

    EH->>TR: recordTrust(agentId, outcome)
    EH->>PR: appendProof({taskId, violations, ...})
    EH->>ADV: persistState()
    EH-->>ENF: {success, blocked, trust, proof}

    alt blocked
        ENF->>CC: exit(1) + BLOCKED message
    else allowed
        ENF->>CC: exit(0) + OK message
    end

    alt session-end
        EH->>ADV: runConformanceIntegration()
        EH->>ADV: runEvolutionIntegration()
        EH->>ADV: optimizer.runCycle()
        EH->>ADV: metaGovernor.validateOptimizerAction()
        ENF->>AP: launchGuidanceAutopilot(source)
    end
```

## Installer Flow

The installer wires guidance into both Claude Code and Codex environments:

```mermaid
flowchart TD
    START([cf-guidance init]) --> RESOLVE[Resolve components<br/>preset/selection/exclusion]
    RESOLVE --> ENV[Build env overrides<br/>from CLI flags]
    ENV --> DRY{Dry run?}
    DRY -->|Yes| REPORT[Return would-write list]
    DRY -->|No| SHIM[Write enforcement shim<br/>.claude/helpers/guidance-enforcement.cjs]
    SHIM --> PKG[Merge package.json<br/>scripts + dependencies]
    PKG --> MODE{Target mode?}
    MODE -->|claude/both| SETTINGS[Merge .claude/settings.json<br/>hooks + env vars]
    MODE -->|codex/both| CODEX[Write .agents/config.toml<br/>+ AGENTS.md bridge docs]
    SETTINGS --> COMP_JSON[Write components.json<br/>.claude-flow/guidance/]
    CODEX --> COMP_JSON
    COMP_JSON --> LOCAL[Ensure CLAUDE.local.md<br/>+ .gitignore entries]
    LOCAL --> DEPS{Install deps?}
    DEPS -->|Yes| NPM[npm install]
    DEPS -->|No| VERIFY{Verify?}
    NPM --> VERIFY
    VERIFY -->|Yes| CHECK[Run verify checks<br/>files + syntax + smoke]
    VERIFY -->|No| DONE([Complete])
    CHECK --> DONE
```

## Component System

Components can be toggled via presets or individual selection:

```mermaid
graph TD
    subgraph "Presets"
        MIN[minimal<br/>empty]
        STD[standard<br/>trust, proof, analysis]
        FULL[full<br/>all 8 components]
    end

    subgraph "Components"
        C1[trust<br/>Per-agent trust scoring]
        C2[adversarial<br/>Threat + collusion detection]
        C3[proof<br/>HMAC-SHA256 proof chain]
        C4[conformance<br/>Memory Clerk acceptance]
        C5[evolution<br/>Rule change pipeline]
        C6[autopilot<br/>Auto rule optimisation]
        C7[analysis<br/>Policy scoring + scaffolding]
        C8[codex<br/>Codex lifecycle bridge]
    end

    MIN -.->|none| C1
    STD --> C1
    STD --> C3
    STD --> C7
    FULL --> C1
    FULL --> C2
    FULL --> C3
    FULL --> C4
    FULL --> C5
    FULL --> C6
    FULL --> C7
    FULL --> C8
```

## Runtime Subsystem Graph

The Advanced Runtime instantiates 23+ subsystems. Components.json controls which are real vs null-object:

```mermaid
graph TB
    subgraph "Phase 0: Foundation"
        TS[Trust System]
        TD[Threat Detector]
        CD[Collusion Detector]
        MQ[Memory Quorum]
        PC[Proof Chain]
        CR[Conformance Runner]
        EP2[Evolution Pipeline]
    end

    subgraph "Phase A: Production Hardening"
        CS[Coherence Scheduler]
        EG[Economic Governor]
        CG2[Continue Gate]
        IC[Irreversibility Classifier]
        AG[Authority Gate]
        MGV[Meta-Governor]
        OPT2[Optimizer]
    end

    subgraph "Phase B: Long-Horizon Autonomy"
        TAS[Truth Anchor Store]
        TR2[Truth Resolver]
        UL[Uncertainty Ledger]
        UA[Uncertainty Aggregator]
        TST[Temporal Store]
        TRE[Temporal Reasoner]
        CA[Capability Algebra]
    end

    subgraph "Phase C: Polish"
        AL[Artifact Ledger]
        MV[Manifest Validator]
    end

    TAS --> TR2
    UL --> UA
    TST --> TRE
    CS --> CG2
    OPT2 --> MGV
    EP2 --> PC
```

## Data Flow: Autopilot Loop

```mermaid
flowchart LR
    CLM[CLAUDE.md] --> COMP2[Compiler]
    CLL[CLAUDE.local.md] --> COMP2
    COMP2 --> RULES[Promotable Rules]
    RULES --> CANDIDATE[Build Candidate Root]
    CANDIDATE --> ANALYZE[analyze score]
    CLM --> BASELINE[Baseline Score]
    ANALYZE --> DELTA{delta >= threshold?}
    DELTA -->|No| PROPOSAL[Write proposal file]
    DELTA -->|Yes| AB{A/B enabled?}
    AB -->|No| APPLY[Write to CLAUDE.md<br/>+ backup + ADR]
    AB -->|Yes| BENCHMARK[A/B Benchmark]
    BENCHMARK --> GAIN{gain >= minGain?}
    GAIN -->|No| PROPOSAL
    GAIN -->|Yes| APPLY
```
