# Architecture: claude-flow-guidance-implementation

This document provides a visual guide to the system architecture, data flows, and key processes.

---

## 1. System Architecture Overview

How Claude Code and Codex lifecycle events flow through the hook-handler to the guidance control plane.

![system-architecture-overview](diagrams/architecture/system-architecture-overview.svg)

<details>
<summary>Mermaid Source</summary>

```mermaid
---
config:
  layout: elk
  elk:
    mergeEdges: false
    nodePlacementStrategy: BRANDES_KOEPF
---
%%{init: {
  "theme": "base",
  "themeVariables": {
    "primaryColor": "#E3F2FD",
    "primaryTextColor": "#0D47A1",
    "primaryBorderColor": "#1565C0",
    "lineColor": "#37474F"
  }
}}%%
flowchart TB
    accTitle: System Architecture Overview
    accDescr: Shows how Claude Code and Codex events flow through the hook dispatcher to the guidance control plane for policy enforcement

    classDef user fill:#F3E5F5,stroke:#7B1FA2,stroke-width:2px,color:#4A148C
    classDef interface fill:#E1F5FE,stroke:#0277BD,stroke-width:2px,color:#01579B
    classDef service fill:#E8F5E9,stroke:#2E7D32,stroke-width:2px,color:#1B5E20
    classDef data fill:#FFF8E1,stroke:#F57F17,stroke-width:2px,color:#E65100
    classDef security fill:#E0F2F1,stroke:#00695C,stroke-width:2px,color:#004D40
    classDef external fill:#ECEFF1,stroke:#455A64,stroke-width:2px,color:#263238

    subgraph Agents["Agent Layer"]
        direction LR
        CC["Claude Code"]:::user
        CX["Codex"]:::user
    end

    subgraph EventCapture["Event Capture Layer"]
        direction LR
        Settings[".claude/settings.json<br/>PreToolUse / PostToolUse<br/>SessionStart / SessionEnd"]:::interface
        Bridge["guidance-codex-bridge.js<br/>Lifecycle CLI commands"]:::interface
    end

    subgraph Dispatcher["Hook Dispatcher"]
        HookHandler["hook-handler.cjs<br/>CJS dispatcher<br/>stdin JSON + argv routing"]:::service
    end

    subgraph Helpers["Helper Modules"]
        direction LR
        Router["router.cjs<br/>Task routing"]:::service
        Session["session.cjs<br/>Session state"]:::service
        Intel["intelligence.cjs<br/>Pattern learning"]:::service
    end

    subgraph ControlPlane["Guidance Control Plane"]
        direction LR
        Phase1["Phase 1 Runtime<br/>Compiler + Retriever<br/>Gates + Ledger"]:::security
        Advanced["Advanced Runtime<br/>Trust + Threat + Proof<br/>Conformance + Evolution"]:::security
    end

    subgraph PolicySource["Policy Source"]
        direction LR
        ClaudeMD["CLAUDE.md<br/>Shared rules"]:::data
        LocalMD["CLAUDE.local.md<br/>Local experiments"]:::data
    end

    CC -->|"tool events<br/>(stdin JSON)"| Settings
    CX -->|"CLI commands"| Bridge
    Settings -->|"node hook-handler.cjs<br/>pre-bash / pre-edit / ..."| HookHandler
    Bridge -->|"delegates to"| HookHandler
    HookHandler -->|"lazy load"| Helpers
    HookHandler -->|"spawnSync"| Phase1
    Phase1 -->|"layers on"| Advanced
    Phase1 -->|"compiles"| PolicySource
    Advanced -->|"compiles"| PolicySource
    HookHandler -->|"exit 0 = allow<br/>exit 1 = block"| Agents
```

</details>

---

## 2. Hook-Handler Dispatch Flow

All 12 commands supported by `hook-handler.cjs` and their routing paths.

![hook-handler-dispatch-flow](diagrams/architecture/hook-handler-dispatch-flow.svg)

<details>
<summary>Mermaid Source</summary>

```mermaid
---
config:
  layout: elk
---
%%{init: {
  "theme": "base",
  "themeVariables": {
    "primaryColor": "#E3F2FD",
    "primaryTextColor": "#0D47A1",
    "primaryBorderColor": "#1565C0",
    "lineColor": "#37474F"
  }
}}%%
flowchart LR
    accTitle: Hook-Handler Dispatch Flow
    accDescr: Shows all 12 hook commands and how they route through the dispatcher to different handler functions

    classDef input fill:#F3E5F5,stroke:#7B1FA2,stroke-width:2px,color:#4A148C
    classDef dispatch fill:#E1F5FE,stroke:#0277BD,stroke-width:2px,color:#01579B
    classDef sync fill:#E8F5E9,stroke:#2E7D32,stroke-width:2px,color:#1B5E20
    classDef async fill:#FFF8E1,stroke:#F57F17,stroke-width:2px,color:#E65100
    classDef info fill:#ECEFF1,stroke:#455A64,stroke-width:2px,color:#263238
    classDef security fill:#FFCDD2,stroke:#C62828,stroke-width:2px,color:#B71C1C

    Stdin["stdin JSON<br/>+ argv command"]:::input

    Stdin --> Dispatch["handlers dispatch table"]:::dispatch

    subgraph Blocking["Synchronous - Can Block (exit 1)"]
        direction TB
        PreBash["pre-bash<br/>Dangerous pattern regex<br/>+ guidance gate"]:::security
        PreEdit["pre-edit<br/>File path validation<br/>+ guidance gate"]:::security
        PreTask["pre-task<br/>Task routing<br/>+ guidance gate"]:::security
    end

    subgraph Async["Asynchronous - Fire and Forget"]
        direction TB
        PostEdit["post-edit<br/>Record edit metric<br/>+ intelligence feedback"]:::async
        PostTask["post-task<br/>Record completion<br/>+ launch autopilot"]:::async
        SessionEnd["session-end<br/>Consolidate intelligence<br/>+ persist session"]:::async
    end

    subgraph Session["Session Management"]
        direction TB
        SessionRestore["session-restore<br/>Restore or start session<br/>+ init intelligence"]:::sync
    end

    subgraph InfoOnly["Informational (no side effects)"]
        direction TB
        Route["route<br/>Route task to agent"]:::info
        CompactManual["compact-manual<br/>Pre-compact guidance"]:::info
        CompactAuto["compact-auto<br/>Auto-compact guidance"]:::info
        Status["status<br/>Health check"]:::info
        Stats["stats<br/>Intelligence metrics"]:::info
    end

    Dispatch --> PreBash
    Dispatch --> PreEdit
    Dispatch --> PreTask
    Dispatch --> PostEdit
    Dispatch --> PostTask
    Dispatch --> SessionEnd
    Dispatch --> SessionRestore
    Dispatch --> Route
    Dispatch --> CompactManual
    Dispatch --> CompactAuto
    Dispatch --> Status
    Dispatch --> Stats
```

</details>

---

## 3. Guidance Control Plane Internals

The two-tier runtime: Phase 1 (lightweight policy enforcement) and Advanced (trust, adversarial, proof chain).

![guidance-control-plane-internals](diagrams/architecture/guidance-control-plane-internals.svg)

<details>
<summary>Mermaid Source</summary>

```mermaid
---
config:
  layout: elk
  elk:
    mergeEdges: false
    nodePlacementStrategy: BRANDES_KOEPF
---
%%{init: {
  "theme": "base",
  "themeVariables": {
    "primaryColor": "#E3F2FD",
    "primaryTextColor": "#0D47A1",
    "primaryBorderColor": "#1565C0",
    "lineColor": "#37474F"
  }
}}%%
flowchart TB
    accTitle: Guidance Control Plane Internals
    accDescr: Shows the Phase 1 compilation pipeline and the Advanced runtime layers for trust, adversarial detection, proof, conformance, and evolution

    classDef source fill:#F3E5F5,stroke:#7B1FA2,stroke-width:2px,color:#4A148C
    classDef compiler fill:#E1F5FE,stroke:#0277BD,stroke-width:2px,color:#01579B
    classDef engine fill:#E8F5E9,stroke:#2E7D32,stroke-width:2px,color:#1B5E20
    classDef data fill:#FFF8E1,stroke:#F57F17,stroke-width:2px,color:#E65100
    classDef security fill:#E0F2F1,stroke:#00695C,stroke-width:2px,color:#004D40
    classDef advanced fill:#FCE4EC,stroke:#AD1457,stroke-width:2px,color:#880E4F
    classDef output fill:#C8E6C9,stroke:#2E7D32,stroke-width:2px,color:#1B5E20

    subgraph Sources["Policy Sources"]
        direction LR
        CMD["CLAUDE.md"]:::source
        LOCAL["CLAUDE.local.md"]:::source
    end

    subgraph Phase1["Phase 1 Runtime (phase1-runtime.js)"]
        Compiler["Compiler<br/>Parse rules into<br/>constitution + shards"]:::compiler
        Bundle["Policy Bundle<br/>constitution.rules[]<br/>shards[].rule"]:::data

        Retriever["Retriever<br/>Semantic shard matching<br/>by task description"]:::engine
        Gates["Gates<br/>Rule enforcement<br/>allow / warn / block"]:::engine
        Ledger["Ledger<br/>Decision audit log"]:::data
        HookRegistry["Hook Registry<br/>Pre/Post Task/Edit/Command"]:::engine
        Executor["Hook Executor<br/>Runs registered hooks"]:::engine
    end

    subgraph AdvRuntime["Advanced Runtime (advanced-runtime.js)"]
        subgraph TrustLayer["Trust Layer"]
            TrustSystem["Trust System<br/>Score accumulator<br/>+ trust-based rate limiting"]:::security
            TrustLedger["Trust Ledger<br/>Per-agent outcome history"]:::data
        end

        subgraph AdversarialLayer["Adversarial Layer"]
            Threat["Threat Detector<br/>Input analysis<br/>+ memory write analysis"]:::advanced
            Collusion["Collusion Detector<br/>Agent interaction rings<br/>ringMinLength: 3"]:::advanced
            Quorum["Memory Quorum<br/>2/3 vote threshold<br/>for critical writes"]:::advanced
        end

        subgraph ProofLayer["Proof Layer"]
            ProofChain["Proof Chain<br/>HMAC-SHA256 signed<br/>append-only log"]:::security
        end

        subgraph QualityLayer["Quality Layer"]
            Conformance["Conformance Runner<br/>Replay determinism<br/>verification"]:::engine
            Evolution["Evolution Pipeline<br/>Propose + simulate<br/>+ stage rollouts"]:::engine
        end
    end

    subgraph Decisions["Decision Output"]
        Allow["Allow"]:::output
        Warn["Warn"]:::output
        Block["Block"]:::output
    end

    Sources -->|"read + merge"| Compiler
    Compiler --> Bundle
    Bundle --> Retriever
    Bundle --> Gates
    Retriever -->|"matched shards"| Gates
    Gates -->|"record"| Ledger
    Gates --> HookRegistry
    HookRegistry --> Executor

    Executor --> TrustSystem
    TrustSystem --> TrustLedger
    Executor --> Threat
    Threat --> Collusion
    Collusion --> Quorum
    Executor --> ProofChain
    Conformance --> ProofChain
    Evolution -->|"golden trace<br/>simulation"| Conformance

    Gates --> Decisions
    Threat -->|"severe threat"| Block
```

</details>

---

## 4. Installer Workflow

What `cf-guidance-impl init` does when wiring guidance into a target repository.

![installer-workflow](diagrams/architecture/installer-workflow.svg)

<details>
<summary>Mermaid Source</summary>

```mermaid
%%{init: {
  "theme": "base",
  "themeVariables": {
    "primaryColor": "#E3F2FD",
    "primaryTextColor": "#0D47A1",
    "primaryBorderColor": "#1565C0",
    "lineColor": "#37474F"
  }
}}%%
flowchart TB
    accTitle: Installer Workflow
    accDescr: Shows the step-by-step process of cf-guidance-impl init wiring guidance hooks into a target repository

    classDef start fill:#F3E5F5,stroke:#7B1FA2,stroke-width:2px,color:#4A148C
    classDef process fill:#E1F5FE,stroke:#0277BD,stroke-width:2px,color:#01579B
    classDef file fill:#E8F5E9,stroke:#2E7D32,stroke-width:2px,color:#1B5E20
    classDef decision fill:#FFF8E1,stroke:#F57F17,stroke-width:2px,color:#E65100
    classDef verify fill:#E0F2F1,stroke:#00695C,stroke-width:2px,color:#004D40
    classDef error fill:#FFCDD2,stroke:#C62828,stroke-width:2px,color:#B71C1C

    Start["cf-guidance-impl init<br/>--target /path/to/repo"]:::start

    Start --> CfInit{"--skip-cf-init?"}:::decision
    CfInit -->|"No"| RunCfInit["npx @claude-flow/cli init<br/>--dual / --codex"]:::process
    CfInit -->|"Yes"| Install
    RunCfInit --> Install

    Install["installIntoRepo()"]:::process

    Install --> Shim["Write hook-handler shim<br/>.claude/helpers/hook-handler.cjs<br/>(3-line delegator)"]:::file
    Install --> Compat["Ensure .cjs/.js compat pairs<br/>router, session, memory, statusline"]:::file

    Install --> ModeCheck{"targetMode?"}:::decision

    ModeCheck -->|"claude / both"| SettingsJson["Merge .claude/settings.json<br/>+ hooks (PreToolUse, PostToolUse,<br/>SessionStart, SessionEnd)<br/>+ env vars"]:::file

    ModeCheck -->|"codex / both"| CodexConfig["Append .agents/config.toml<br/>[guidance_codex] block<br/>+ AGENTS.md documentation"]:::file

    Install --> PkgJson["Merge package.json<br/>+ 20 guidance:* npm scripts<br/>+ implementation dependency"]:::file
    Install --> LocalMd["Create CLAUDE.local.md stub<br/>+ add to .gitignore"]:::file

    Shim --> Verify
    Compat --> Verify
    SettingsJson --> Verify
    CodexConfig --> Verify
    PkgJson --> Verify
    LocalMd --> Verify

    Verify{"--verify?"}:::decision
    Verify -->|"Yes"| RunVerify["verifyRepo()"]:::verify
    Verify -->|"No"| Done["Done"]:::start

    RunVerify --> CheckFiles["Check required files exist"]:::verify
    RunVerify --> SyntaxCheck["node --check hook-handler.cjs"]:::verify
    RunVerify --> SmokeTest["Smoke test: pipe JSON to hook-handler<br/>+ dynamic import for Codex"]:::verify
    RunVerify --> CompatCheck["Verify .cjs/.js compat pairs"]:::verify

    CheckFiles --> PassFail{"All pass?"}:::decision
    SyntaxCheck --> PassFail
    SmokeTest --> PassFail
    CompatCheck --> PassFail

    PassFail -->|"Yes"| Done
    PassFail -->|"No"| Fail["Throw Error<br/>Verification failed"]:::error
```

</details>

---

## 5. Autopilot Optimization Loop

How `guidance-autopilot.js` continuously promotes high-impact local rules into shared `CLAUDE.md`.

![autopilot-optimization-loop](diagrams/architecture/autopilot-optimization-loop.svg)

<details>
<summary>Mermaid Source</summary>

```mermaid
%%{init: {
  "theme": "base",
  "themeVariables": {
    "primaryColor": "#E3F2FD",
    "primaryTextColor": "#0D47A1",
    "primaryBorderColor": "#1565C0",
    "lineColor": "#37474F"
  }
}}%%
flowchart TB
    accTitle: Autopilot Optimization Loop
    accDescr: Shows how the autopilot identifies promotable local rules, scores them, optionally runs A/B benchmarks, and applies or proposes changes

    classDef start fill:#F3E5F5,stroke:#7B1FA2,stroke-width:2px,color:#4A148C
    classDef process fill:#E1F5FE,stroke:#0277BD,stroke-width:2px,color:#01579B
    classDef decision fill:#FFF8E1,stroke:#F57F17,stroke-width:2px,color:#E65100
    classDef data fill:#E8F5E9,stroke:#2E7D32,stroke-width:2px,color:#1B5E20
    classDef output fill:#C8E6C9,stroke:#2E7D32,stroke-width:2px,color:#1B5E20
    classDef skip fill:#ECEFF1,stroke:#455A64,stroke-width:2px,color:#263238
    classDef apply fill:#E0F2F1,stroke:#00695C,stroke-width:2px,color:#004D40

    Trigger["Trigger<br/>--once / --daemon (30 min)<br/>/ session-end hook"]:::start

    Trigger --> Lock{"Acquire file lock<br/>(PID-based staleness)"}:::decision
    Lock -->|"Locked by<br/>another process"| Skip["Skip cycle"]:::skip
    Lock -->|"Acquired"| Load

    Load["Load CLAUDE.md<br/>+ CLAUDE.local.md"]:::process

    Load --> FindCandidates["Find promotable local rules<br/>Rules in local not in root,<br/>or with changed properties"]:::process

    FindCandidates --> HasCandidates{"Candidates<br/>found?"}:::decision
    HasCandidates -->|"None"| NoOp["Log: no promotable rules"]:::skip

    HasCandidates -->|"Yes"| BuildCandidate["Build candidate CLAUDE.md<br/>Insert auto-promotion section<br/>with rule metadata"]:::process

    BuildCandidate --> HashCheck{"Same hash as<br/>last below-threshold<br/>candidate?"}:::decision
    HashCheck -->|"Yes"| Unchanged["Skip: unchanged candidate"]:::skip

    HashCheck -->|"No"| Score["Score both versions<br/>analyze(root) vs analyze(candidate)<br/>benchmark(root, candidate)"]:::process

    Score --> ABCheck{"--ab flag?"}:::decision
    ABCheck -->|"Yes"| ABBench["A/B Benchmark<br/>Synthetic executor<br/>baseline vs guided"]:::process
    ABCheck -->|"No"| ThresholdCheck

    ABBench --> ABGate{"deltaGain >=<br/>--min-ab-gain?"}:::decision
    ABGate -->|"No"| Proposal
    ABGate -->|"Yes"| ThresholdCheck

    ThresholdCheck{"delta >=<br/>--min-delta?<br/>AND --apply?"}:::decision

    ThresholdCheck -->|"No"| Proposal["Save proposal file<br/>proposals/CLAUDE.promoted.*.md"]:::data

    ThresholdCheck -->|"Yes"| Apply["Apply promotion"]:::apply
    Apply --> Backup["Backup CLAUDE.md<br/>backups/CLAUDE.md.*.bak"]:::data
    Apply --> Write["Write updated CLAUDE.md<br/>with auto-promotion section"]:::data
    Apply --> ADR["Write ADR<br/>docs/adr/ADR-NNN-*.md<br/>with metrics + rationale"]:::data

    Proposal --> Report["Write autopilot-report.json<br/>+ update autopilot-state.json<br/>+ append autopilot.log"]:::output
    Apply --> Report

    Report --> Release["Release lock"]:::process
    NoOp --> Release
    Unchanged --> Release
    Skip --> Done["Done"]:::start
    Release --> Daemon{"--daemon?"}:::decision
    Daemon -->|"Yes"| Wait["Wait 30 min<br/>then repeat"]:::process
    Wait --> Trigger
    Daemon -->|"No"| Done
```

</details>

---

## 6. File Map

Quick reference to key source files and their roles.

![project-file-map](diagrams/architecture/project-file-map.svg)

<details>
<summary>Mermaid Source</summary>

```mermaid
%%{init: {
  "theme": "base",
  "themeVariables": {
    "primaryColor": "#E3F2FD",
    "primaryTextColor": "#0D47A1",
    "primaryBorderColor": "#1565C0",
    "lineColor": "#37474F"
  }
}}%%
flowchart LR
    accTitle: Project File Map
    accDescr: Shows the key source files organized by layer and their relationships

    classDef cli fill:#E1F5FE,stroke:#0277BD,stroke-width:2px,color:#01579B
    classDef core fill:#E8F5E9,stroke:#2E7D32,stroke-width:2px,color:#1B5E20
    classDef guidance fill:#E0F2F1,stroke:#00695C,stroke-width:2px,color:#004D40
    classDef shared fill:#FFF8E1,stroke:#F57F17,stroke-width:2px,color:#E65100
    classDef config fill:#ECEFF1,stroke:#455A64,stroke-width:2px,color:#263238

    subgraph CLI["src/cli/ - CLI Entry Points"]
        direction TB
        Analyze["analyze-guidance.js<br/>Score CLAUDE.md"]:::cli
        Autopilot["guidance-autopilot.js<br/>Rule optimization"]:::cli
        ABBench["guidance-ab-benchmark.js<br/>A/B comparison"]:::cli
        Integrations["guidance-integrations.js<br/>Integration suites"]:::cli
        EventH["event-handlers.js<br/>Event dispatch"]:::cli
        Runtime["guidance-runtime.js<br/>Runtime demo"]:::cli
        Codex["guidance-codex-bridge.js<br/>Codex lifecycle"]:::cli
        Scaffold["scaffold-guidance.js<br/>Project scaffold"]:::cli
    end

    subgraph Core["src/ - Core Modules"]
        direction TB
        Handler["hook-handler.cjs<br/>CJS dispatcher"]:::core
        Installer["installer.mjs<br/>Init / install / verify"]:::core
        Settings["default-settings.mjs<br/>Hook + env defaults"]:::core
    end

    subgraph Guidance["src/guidance/ - Runtime"]
        direction TB
        P1["phase1-runtime.js<br/>Lightweight enforcement"]:::guidance
        Adv["advanced-runtime.js<br/>Trust + threat + proof"]:::guidance
        IntRunners["integration-runners.js<br/>6 integration suites"]:::guidance
        Executor["content-aware-executor.js<br/>Synthetic benchmark"]:::guidance
    end

    subgraph Shared["src/ - Shared Utilities"]
        direction TB
        UtilsESM["utils.mjs<br/>10 shared functions (ESM)"]:::shared
        UtilsCJS["utils.cjs<br/>8 shared functions (CJS)"]:::shared
    end

    Handler -->|"spawnSync"| Integrations
    Integrations -->|"delegates"| EventH
    EventH -->|"uses"| Adv
    Adv -->|"wraps"| P1
    Adv -->|"binds"| IntRunners
    Autopilot -->|"uses"| Executor
    ABBench -->|"uses"| Executor
    Installer -->|"writes shim for"| Handler
    Installer -->|"reads"| Settings
    Handler -->|"local copy"| UtilsCJS
    EventH -->|"imports"| UtilsESM
    Adv -->|"imports"| UtilsESM
    Autopilot -->|"imports"| UtilsESM
```

</details>
