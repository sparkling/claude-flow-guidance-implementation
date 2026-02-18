# Solutions Architecture: claude-flow-guidance-implementation

## 1. Executive Summary

The Guidance Implementation Kit is a turnkey integration layer that enforces `CLAUDE.md` policy rules on every tool use by AI coding agents. It sits between the agent runtime (Claude Code or OpenAI Codex) and the `@claude-flow/guidance` policy engine. When an agent is about to execute a command, edit a file, or spawn a task, the kit intercepts the event, evaluates it against compiled policy rules, and returns an allow or block decision within the agent's hook timeout window.

The kit provides: a one-command installer (`cf-guidance-impl init`) that wires hooks into any repository; a CommonJS hook dispatcher that handles 12 lifecycle events; a two-tier policy runtime (lightweight gates plus enterprise security layers); and continuous policy optimisation via an autopilot that promotes high-performing local rules with full scoring and A/B benchmarking.

---

## 2. Solution Architecture

This diagram shows the complete system: agents on the left, the kit's processing layers in the centre, and external dependencies on the right.

![Solution Architecture Overview](diagrams/architecture/solution-architecture-overview.svg)

<details>
<summary>Mermaid source</summary>

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
    accTitle: Solution Architecture Overview
    accDescr: Shows agents, the hook dispatcher, guidance runtime, and external dependencies

    classDef agent fill:#F3E5F5,stroke:#7B1FA2,stroke-width:2px,color:#4A148C
    classDef iface fill:#E1F5FE,stroke:#0277BD,stroke-width:2px,color:#01579B
    classDef core fill:#E8F5E9,stroke:#2E7D32,stroke-width:2px,color:#1B5E20
    classDef data fill:#FFF8E1,stroke:#F57F17,stroke-width:2px,color:#E65100
    classDef security fill:#E0F2F1,stroke:#00695C,stroke-width:2px,color:#004D40
    classDef ext fill:#ECEFF1,stroke:#455A64,stroke-width:2px,color:#263238

    CC["Claude Code"]:::agent
    CX["Codex"]:::agent
    Dev["Developer"]:::agent

    subgraph Kit["Guidance Implementation Kit"]
        direction TB
        Settings[".claude/settings.json\nHook definitions + env vars"]:::iface
        Bridge["guidance-codex-bridge.js\nCLI lifecycle adapter"]:::iface
        Handler["hook-handler.cjs\nCJS dispatcher\n12 commands"]:::core
        Helpers["Helper modules\nrouter / session / intelligence"]:::core

        subgraph Runtime["Guidance Runtime"]
            direction LR
            P1["Phase 1\nCompiler + Retriever\nGates + Ledger"]:::core
            Adv["Advanced\nTrust + Threat\nProof + Evolution"]:::security
        end

        CLI["8 CLI tools\nanalyze / autopilot / benchmark\nintegrations / scaffold / codex"]:::core
        Installer["cf-guidance-impl\ninit / install / verify"]:::core
    end

    subgraph State["Persistent State"]
        direction LR
        Policy["CLAUDE.md\nCLAUDE.local.md"]:::data
        Store[".claude-flow/guidance/\ntrust / proof / cache"]:::data
    end

    subgraph Deps["External Packages"]
        direction LR
        GuidancePkg["@claude-flow/guidance\nPolicy engine"]:::ext
        HooksPkg["@claude-flow/hooks\nHook registry"]:::ext
    end

    CC -->|"stdin JSON\n+ hook command"| Settings
    CX -->|"CLI commands"| Bridge
    Dev -->|"cf-guidance-impl init"| Installer

    Settings --> Handler
    Bridge --> Handler
    Handler --> Helpers
    Handler -->|"spawnSync\n(blocking)"| Runtime
    P1 --> Adv

    Runtime --> Policy
    Runtime --> Store
    Runtime --> GuidancePkg
    Runtime --> HooksPkg

    Installer -->|"writes shim"| Handler
    Installer -->|"merges config"| Settings
    CLI --> Runtime
```

</details>

---

## 3. Integration Architecture

The kit supports two integration paths. Claude Code has a native hook system; Codex does not. The bridge adapter normalises Codex events into the same format so both agents share identical policy enforcement.

![Integration Paths](diagrams/architecture/integration-paths.svg)

<details>
<summary>Mermaid source</summary>

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
    accTitle: Integration Paths
    accDescr: Shows the two integration paths for Claude Code and Codex into the shared hook dispatcher

    classDef agent fill:#F3E5F5,stroke:#7B1FA2,stroke-width:2px,color:#4A148C
    classDef hook fill:#E1F5FE,stroke:#0277BD,stroke-width:2px,color:#01579B
    classDef core fill:#E8F5E9,stroke:#2E7D32,stroke-width:2px,color:#1B5E20
    classDef decision fill:#FFF8E1,stroke:#F57F17,stroke-width:2px,color:#E65100

    subgraph ClaudePath["Claude Code Path"]
        direction TB
        CC["Claude Code\nagent"]:::agent
        CCHook["settings.json\nPreToolUse / PostToolUse\nSessionStart / SessionEnd"]:::hook
        CC -->|"tool event\nstdin JSON"| CCHook
    end

    subgraph CodexPath["Codex Path"]
        direction TB
        CX["Codex\nagent"]:::agent
        CXBridge["guidance-codex-bridge.js\n8 lifecycle commands"]:::hook
        CX -->|"CLI invocation\n--command / --file / --description"| CXBridge
    end

    Handler["hook-handler.cjs\nUnified dispatcher"]:::core

    CCHook -->|"node hook-handler.cjs\npre-bash / pre-edit / ..."| Handler
    CXBridge -->|"spawnSync\nnormalised stdin JSON"| Handler

    subgraph Dispatch["Handler Dispatch"]
        direction TB
        Blocking["Blocking (sync)\npre-bash / pre-edit / pre-task\nexit 0 = allow, exit 1 = block"]:::decision
        Async["Fire-and-forget (async)\npost-edit / post-task / session-end\ndetached child process"]:::core
        Info["Informational\nroute / status / stats / compact"]:::core
    end

    Handler --> Blocking
    Handler --> Async
    Handler --> Info
```

</details>

### Hook Event Mapping

| Claude Code Hook | Handler Command | Guidance Event | Sync | Can Block |
|---|---|---|---|---|
| `PreToolUse` Bash | `pre-bash` | `pre-command` | Yes | Yes |
| `PreToolUse` Write/Edit/MultiEdit | `pre-edit` | `pre-edit` | Yes | Yes |
| `PreToolUse` Task | `pre-task` | `pre-task` | Yes | Yes |
| `PostToolUse` Write/Edit/MultiEdit | `post-edit` | `post-edit` | No | No |
| `PostToolUse` Task | `post-task` | `post-task` | No | No |
| `SessionStart` | `session-restore` | session init | No | No |
| `SessionEnd` | `session-end` | session persist | No | No |

---

## 4. Request Flow: Blocking Hooks

When Claude Code is about to execute a tool, it fires a `PreToolUse` event. The hook handler must return before the agent proceeds. Exit code 0 allows the operation; exit code 1 blocks it.

![Blocking Hook Sequence](diagrams/architecture/blocking-hook-sequence.svg)

<details>
<summary>Mermaid source</summary>

```mermaid
%%{init: {
  "theme": "base",
  "themeVariables": {
    "primaryColor": "#E3F2FD",
    "primaryTextColor": "#0D47A1",
    "primaryBorderColor": "#1565C0",
    "lineColor": "#37474F",
    "actorBkg": "#F3E5F5",
    "actorBorder": "#7B1FA2",
    "actorTextColor": "#4A148C"
  }
}}%%
sequenceDiagram
    accTitle: Blocking Hook Sequence
    accDescr: Shows the synchronous flow of a pre-bash hook from Claude Code through policy gates to an allow or block decision

    participant CC as Claude Code
    participant HH as hook-handler.cjs
    participant GI as guidance-integrations.js
    participant RT as Guidance Runtime
    participant G as Gates

    CC->>+HH: PreToolUse Bash<br/>stdin: {"tool_input":{"command":"rm -rf /"}}
    Note over HH: Parse stdin JSON<br/>Extract command text

    HH->>HH: Check hardcoded<br/>dangerous patterns
    Note over HH: Match: rm -rf /

    alt Dangerous pattern matched
        HH-->>CC: exit 1 (BLOCK)
    else No pattern match
        HH->>+GI: spawnSync<br/>event pre-command {command}
        GI->>+RT: initialize()
        RT->>RT: Compile CLAUDE.md<br/>into policy bundle
        RT-->>-GI: ready
        GI->>+G: preCommand(command)
        G->>G: Retrieve relevant shards<br/>Evaluate rules
        G-->>-GI: {blocked: false, messages, warnings}
        GI-->>-HH: JSON result
        alt blocked: true
            HH-->>CC: exit 1 (BLOCK)
        else blocked: false
            HH-->>-CC: exit 0 (ALLOW)
        end
    end
```

</details>

The three blocking hooks (`pre-bash`, `pre-edit`, `pre-task`) all follow this pattern. Two layers of defence apply:

1. **Hardcoded patterns** (hook handler) — regex checks for `rm -rf /`, `format c:`, `del /s /q c:\`, and fork bombs. Fast, zero-dependency, always-on.
2. **Policy gates** (guidance runtime) — compiled CLAUDE.md rules evaluated against the specific operation. Configurable, auditable, evolvable.

Timeout behaviour is configurable: `GUIDANCE_EVENT_SYNC_TIMEOUT_MS` (default 8000ms) controls how long the handler waits for the guidance runtime. `GUIDANCE_EVENT_FAIL_CLOSED=0` (default) means a timeout allows the operation rather than blocking it.

---

## 5. Request Flow: Async Hooks

Post-event hooks must not slow down the agent. They spawn detached child processes and return immediately.

![Async Hook Sequence](diagrams/architecture/async-hook-sequence.svg)

<details>
<summary>Mermaid source</summary>

```mermaid
%%{init: {
  "theme": "base",
  "themeVariables": {
    "primaryColor": "#E3F2FD",
    "primaryTextColor": "#0D47A1",
    "primaryBorderColor": "#1565C0",
    "lineColor": "#37474F",
    "actorBkg": "#F3E5F5",
    "actorBorder": "#7B1FA2",
    "actorTextColor": "#4A148C"
  }
}}%%
sequenceDiagram
    accTitle: Async Hook Sequence
    accDescr: Shows the fire-and-forget flow of post-task and session-end hooks

    participant CC as Claude Code
    participant HH as hook-handler.cjs
    participant BG as Background Process
    participant RT as Guidance Runtime
    participant AP as Autopilot

    CC->>+HH: PostToolUse Task<br/>stdin: {"tool_input":{"status":"completed"}}
    Note over HH: Parse stdin<br/>Look up cached task context

    HH->>BG: spawn(detached: true)<br/>event post-task {payload}
    Note over HH: child.unref()<br/>Handler returns immediately
    HH-->>-CC: exit 0 (always allows)

    activate BG
    BG->>RT: Record trust outcome
    BG->>RT: Append proof envelope
    BG->>RT: Send intelligence feedback
    deactivate BG

    Note over CC,AP: Later: SessionEnd event

    CC->>+HH: SessionEnd
    HH->>BG: spawn(detached: true)<br/>event session-end
    HH->>AP: spawn(detached: true)<br/>autopilot --once
    Note over HH: Both detached, handler exits
    HH-->>-CC: exit 0

    activate BG
    BG->>RT: Consolidate intelligence<br/>PageRank recomputation
    BG->>RT: Run conformance check
    BG->>RT: Trigger evolution pipeline
    deactivate BG

    activate AP
    AP->>AP: Find promotable local rules<br/>Score and benchmark<br/>Apply or propose
    deactivate AP
```

</details>

---

## 6. Policy Compilation Pipeline

All policy rules originate from Markdown files. The compiler transforms them into structured, enforceable gates.

![Policy Pipeline](diagrams/architecture/policy-pipeline.svg)

<details>
<summary>Mermaid source</summary>

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
    accTitle: Policy Compilation Pipeline
    accDescr: Shows how CLAUDE.md is compiled into enforceable policy gates

    classDef source fill:#F3E5F5,stroke:#7B1FA2,stroke-width:2px,color:#4A148C
    classDef process fill:#E1F5FE,stroke:#0277BD,stroke-width:2px,color:#01579B
    classDef data fill:#FFF8E1,stroke:#F57F17,stroke-width:2px,color:#E65100
    classDef enforce fill:#E8F5E9,stroke:#2E7D32,stroke-width:2px,color:#1B5E20
    classDef output fill:#E0F2F1,stroke:#00695C,stroke-width:2px,color:#004D40

    CMD["CLAUDE.md\n(shared rules)"]:::source
    LOCAL["CLAUDE.local.md\n(local experiments)"]:::source

    Compiler["Compiler\nParse Markdown into\ntyped rule objects"]:::process

    Bundle["Policy Bundle"]:::data
    Constitution["Constitution\nHigh-level rules\n+ content hash"]:::data
    Shards["Shards\nid, text, riskClass\npriority, intents\ndomains, toolClasses"]:::data

    Retriever["Retriever\nSemantic shard matching\nby task description"]:::process

    Gates["Gates\nRule enforcement\nEvaluate conditions"]:::enforce

    Decision["allow / warn / block\n+ messages + warnings"]:::output

    Ledger["Ledger\nAppend-only audit log\ntaskId, rules, decision, timestamp"]:::output

    CMD --> Compiler
    LOCAL --> Compiler
    Compiler --> Bundle
    Bundle --> Constitution
    Bundle --> Shards
    Shards --> Retriever
    Retriever -->|"matched shards\nfor current operation"| Gates
    Gates --> Decision
    Gates --> Ledger
```

</details>

### Policy sources

- **`CLAUDE.md`** — shared rules checked into the repository. Visible to all contributors. Contains the project's authoritative behavioural policy.
- **`CLAUDE.local.md`** — local-only experiments (gitignored). Developers test rule changes here before promoting them via the autopilot.

### Shard properties

Each compiled shard carries metadata used for matching and enforcement:

| Property | Example | Purpose |
|---|---|---|
| `riskClass` | `high` | Determines gate strictness |
| `priority` | `90` | Ordering when multiple rules match |
| `intents` | `#security, #implementation` | Semantic matching to task context |
| `domains` | `@engineering` | Scope limitation |
| `toolClasses` | `[bash], [edit]` | Tool-specific rule application |

---

## 7. Security Architecture

The Advanced Runtime layers four security capabilities on top of the Phase 1 policy pipeline.

![Security Architecture](diagrams/architecture/security-architecture.svg)

<details>
<summary>Mermaid source</summary>

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
    accTitle: Security Architecture
    accDescr: Shows the four security layers of the Advanced Runtime

    classDef core fill:#E8F5E9,stroke:#2E7D32,stroke-width:2px,color:#1B5E20
    classDef trust fill:#E1F5FE,stroke:#0277BD,stroke-width:2px,color:#01579B
    classDef adversarial fill:#FCE4EC,stroke:#AD1457,stroke-width:2px,color:#880E4F
    classDef proof fill:#E0F2F1,stroke:#00695C,stroke-width:2px,color:#004D40
    classDef quality fill:#FFF8E1,stroke:#F57F17,stroke-width:2px,color:#E65100
    classDef data fill:#ECEFF1,stroke:#455A64,stroke-width:2px,color:#263238

    P1["Phase 1 Runtime\nCompiler + Retriever + Gates + Ledger"]:::core

    subgraph TrustLayer["Trust Layer"]
        direction LR
        TA["Trust Accumulator\nPer-agent score\ninitial: 0.5\nallow: +0.01 / deny: -0.05"]:::trust
        TL["Trust Ledger\nOutcome history\nper agent"]:::trust
        RL["Rate Limiter\ntrusted: 2x / standard: 1x\nprobation: 0.5x / untrusted: 0.1x"]:::trust
        TA --> TL
        TA --> RL
    end

    subgraph AdversarialLayer["Adversarial Layer"]
        direction LR
        TD["Threat Detector\nPrompt injection\nPrivilege escalation\n6 threat categories"]:::adversarial
        CD["Collusion Detector\nAgent interaction rings\nFrequency + timing analysis"]:::adversarial
        MQ["Memory Quorum\n2/3 vote threshold\nfor critical writes"]:::adversarial
    end

    subgraph ProofLayer["Proof Layer"]
        PC["Proof Chain\nHMAC-SHA256 signed\nappend-only log\nExport / import / verify"]:::proof
    end

    subgraph QualityLayer["Quality Layer"]
        direction LR
        CR["Conformance Runner\nReplay determinism\nverification"]:::quality
        EP["Evolution Pipeline\nPropose → simulate → compare\n→ stage → promote / rollback"]:::quality
    end

    State[".claude-flow/guidance/advanced/\nTrust snapshots, proof chain,\nthreat history, evolution state"]:::data

    P1 --> TrustLayer
    P1 --> AdversarialLayer
    P1 --> ProofLayer
    P1 --> QualityLayer

    TrustLayer --> State
    ProofLayer --> State
    QualityLayer --> State
```

</details>

### Trust tiers

| Tier | Score Range | Rate Multiplier | Meaning |
|---|---|---|---|
| Trusted | >= 0.8 | 2.0x | Consistently follows policy |
| Standard | >= 0.5 | 1.0x | Normal operation |
| Probation | >= 0.3 | 0.5x | Recent violations |
| Untrusted | < 0.3 | 0.1x | Repeated violations, heavily throttled |

### Threat categories

The threat detector analyses inputs against 6 categories: prompt injection, memory poisoning, shard manipulation, malicious delegation, privilege escalation, and data exfiltration. Severe threats (score >= 0.85) trigger an immediate block independent of gate results.

### Proof chain

Every significant operation produces an HMAC-SHA256 signed envelope containing: the event details, tool call records, memory operations, agent ID, detected violations, and the previous envelope's hash. The chain is verifiable end-to-end and exportable for external audit.

---

## 8. Installer and Deployment

The installer (`cf-guidance-impl init`) wires hooks into any target repository in three phases.

![Installer Workflow](diagrams/architecture/installer-workflow.svg)

<details>
<summary>Mermaid source</summary>

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
    accDescr: Shows the three phases of cf-guidance-impl init

    classDef start fill:#F3E5F5,stroke:#7B1FA2,stroke-width:2px,color:#4A148C
    classDef process fill:#E1F5FE,stroke:#0277BD,stroke-width:2px,color:#01579B
    classDef file fill:#E8F5E9,stroke:#2E7D32,stroke-width:2px,color:#1B5E20
    classDef decision fill:#FFF8E1,stroke:#F57F17,stroke-width:2px,color:#E65100
    classDef verify fill:#E0F2F1,stroke:#00695C,stroke-width:2px,color:#004D40
    classDef error fill:#FFCDD2,stroke:#C62828,stroke-width:2px,color:#B71C1C

    Start["cf-guidance-impl init\n--target /path/to/repo"]:::start

    Start --> Phase1

    subgraph Phase1["Phase 1: Claude Flow Init"]
        CfInit{"--skip-cf-init?"}:::decision
        CfInit -->|"No"| RunInit["npx @claude-flow/cli init\n--dual / --codex"]:::process
        CfInit -->|"Yes"| Skip1["Skip"]:::process
    end

    Phase1 --> Phase2

    subgraph Phase2["Phase 2: Guidance Wiring"]
        Shim["Write hook-handler shim\n.claude/helpers/hook-handler.cjs\n3-line CJS delegator"]:::file
        Compat["Ensure .cjs/.js compat pairs\nrouter, session, memory, statusline"]:::file
        MergeSettings["Merge .claude/settings.json\n4 event types + env vars"]:::file
        CodexConfig["Append .agents/config.toml\n+ AGENTS.md documentation"]:::file
        MergePkg["Merge package.json\n20+ guidance:* scripts + dependency"]:::file
        LocalMd["Create CLAUDE.local.md stub\n+ add to .gitignore"]:::file
    end

    Phase2 --> Phase3

    subgraph Phase3["Phase 3: Verification"]
        VerifyCheck{"--no-verify?"}:::decision
        VerifyCheck -->|"No"| Verify["verifyRepo()"]:::verify
        VerifyCheck -->|"Yes"| Done["Done"]:::start
        Verify --> FileCheck["Check required files exist"]:::verify
        Verify --> SyntaxCheck["node --check hook-handler.cjs"]:::verify
        Verify --> SmokeTest["Smoke test: pipe JSON\nto hook-handler"]:::verify
        Verify --> CompatCheck["Verify .cjs/.js pairs"]:::verify
        FileCheck --> Result{"All pass?"}:::decision
        SyntaxCheck --> Result
        SmokeTest --> Result
        CompatCheck --> Result
        Result -->|"Yes"| Done
        Result -->|"No"| Fail["Error: verification failed"]:::error
    end
```

</details>

### What gets installed

| File | Purpose |
|---|---|
| `.claude/helpers/hook-handler.cjs` | 3-line shim that `require()`s the full handler from `node_modules` |
| `.claude/settings.json` (merged) | Hook definitions for PreToolUse, PostToolUse, SessionStart, SessionEnd |
| `package.json` (merged) | 20+ `guidance:*` npm scripts + implementation dependency |
| `.agents/config.toml` (Codex mode) | Bridge command mapping |
| `CLAUDE.local.md` | Stub for local rule experiments |

The thin shim architecture means the hook-handler logic lives in `node_modules` and updates automatically via `npm update` without re-running the installer.

---

## 9. Autopilot Optimisation

The autopilot continuously improves `CLAUDE.md` by promoting high-performing rules from `CLAUDE.local.md`.

![Autopilot Optimisation Loop](diagrams/architecture/autopilot-optimisation-loop.svg)

<details>
<summary>Mermaid source</summary>

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
    accTitle: Autopilot Optimisation Loop
    accDescr: Shows how local rules are evaluated, scored, and promoted into CLAUDE.md

    classDef start fill:#F3E5F5,stroke:#7B1FA2,stroke-width:2px,color:#4A148C
    classDef process fill:#E1F5FE,stroke:#0277BD,stroke-width:2px,color:#01579B
    classDef decision fill:#FFF8E1,stroke:#F57F17,stroke-width:2px,color:#E65100
    classDef data fill:#E8F5E9,stroke:#2E7D32,stroke-width:2px,color:#1B5E20
    classDef apply fill:#E0F2F1,stroke:#00695C,stroke-width:2px,color:#004D40
    classDef skip fill:#ECEFF1,stroke:#455A64,stroke-width:2px,color:#263238

    Trigger["Trigger\n--once / --daemon (30 min)\n/ session-end hook"]:::start

    Trigger --> Lock{"Acquire file lock\n(PID-based)"}:::decision
    Lock -->|"Locked"| SkipCycle["Skip cycle"]:::skip
    Lock -->|"Acquired"| Load

    Load["Load CLAUDE.md\n+ CLAUDE.local.md"]:::process
    Load --> Find["Find promotable local rules\nNew or changed vs root"]:::process

    Find --> HasRules{"Candidates\nfound?"}:::decision
    HasRules -->|"None"| NoOp["No promotable rules"]:::skip
    HasRules -->|"Yes"| Build

    Build["Build candidate CLAUDE.md\nInsert auto-promotion section"]:::process
    Build --> Score["Score both versions\nanalyze() + benchmark()"]:::process

    Score --> ABCheck{"--ab flag?"}:::decision
    ABCheck -->|"Yes"| AB["A/B Benchmark\nSynthetic executor\nbaseline vs guided"]:::process
    ABCheck -->|"No"| Gate

    AB --> ABGate{"deltaGain >=\n--min-ab-gain?"}:::decision
    ABGate -->|"No"| Propose
    ABGate -->|"Yes"| Gate

    Gate{"delta >= --min-delta\nAND --apply?"}:::decision
    Gate -->|"No"| Propose["Save proposal\nproposals/CLAUDE.promoted.*.md"]:::data
    Gate -->|"Yes"| Apply["Apply promotion"]:::apply

    Apply --> Backup["Backup CLAUDE.md"]:::data
    Apply --> Write["Write updated CLAUDE.md"]:::data
    Apply --> ADR["Generate ADR\ndocs/adr/ADR-NNN-*.md"]:::data

    Propose --> Report["Write report + state + log"]:::data
    Apply --> Report

    Report --> Release["Release lock"]:::process
    NoOp --> Release
    SkipCycle --> Done["Done"]:::start
    Release --> Daemon{"--daemon?"}:::decision
    Daemon -->|"Yes"| Wait["Wait 30 min"]:::process
    Wait --> Trigger
    Daemon -->|"No"| Done
```

</details>

### Autopilot triggers

| Trigger | Mode | Description |
|---|---|---|
| `session-end` hook | Automatic | Spawned as detached background process at end of every Claude Code session |
| `--once` | Manual | Single optimisation cycle via `npm run guidance:autopilot:once` |
| `--daemon` | Continuous | Repeating cycle every 30 minutes via `npm run guidance:autopilot:daemon` |

### Environment controls

| Variable | Default | Purpose |
|---|---|---|
| `GUIDANCE_AUTOPILOT_ENABLED` | `1` | Disable with `0` to suppress session-end autopilot |
| `GUIDANCE_AUTOPILOT_MIN_DELTA` | `0.5` | Minimum score improvement for promotion |
| `GUIDANCE_AUTOPILOT_AB` | `0` | Enable A/B gate with `1` |
| `GUIDANCE_AUTOPILOT_MIN_AB_GAIN` | `0.05` | Minimum A/B delta gain |

---

## 10. Key Design Decisions

### ADR-001: CommonJS for the hook handler

**Context**: Claude Code executes hooks by running `node <path>`. The handler is in the critical path of every tool use.

**Decision**: Use CommonJS (`.cjs`) with lazy `require()` loading, not ESM.

**Rationale**: CJS avoids ESM resolution overhead and supports synchronous `require()` calls that only load modules when actually needed. Helper modules (router, session, intelligence) are loaded on first use, not at startup.

### ADR-002: Synchronous guidance calls for blocking hooks

**Context**: Pre-bash, pre-edit, and pre-task handlers must return a decision before the agent proceeds.

**Decision**: Use `spawnSync` to invoke the guidance runtime as a child process.

**Rationale**: Claude Code expects the hook process to exit before continuing. The exit code determines allow/block. Timeout and fail-open/fail-closed behaviour are configurable.

### ADR-003: Detached async processes for post-hooks

**Context**: Post-edit, post-task, and session-end perform governance work (trust recording, proof chain, intelligence consolidation) that should not delay the agent.

**Decision**: Use `spawn` with `detached: true` and `child.unref()`.

**Rationale**: The handler process exits immediately. The background process runs independently, persisting state without blocking agent execution.

### ADR-004: Thin shim architecture

**Context**: The installer writes a hook-handler file into the target repository.

**Decision**: Write a 3-line CJS shim that `require()`s the full handler from `node_modules`, rather than copying the full handler source.

**Rationale**: Updates to handler logic are picked up automatically via `npm update`. No need to re-run the installer after package updates.

### ADR-005: Dual module system support

**Context**: The hook handler must be CJS (for startup speed); CLI tools and runtime use ESM (for modern syntax and tree-shaking).

**Decision**: Maintain both `.mjs` (ESM) and `.cjs` (CJS) variants of shared utilities. The installer creates `.js`/`.cjs` compatibility pairs for all helper modules.

**Rationale**: Both module systems are required and cannot be avoided. The compatibility pair mechanism ensures `require()` and `import` both resolve to the same logic.

### ADR-006: Fail-open by default

**Context**: If the guidance runtime times out or crashes during a blocking hook, the agent is stuck.

**Decision**: Default to fail-open (`GUIDANCE_EVENT_FAIL_CLOSED=0`). The agent proceeds if guidance is unavailable.

**Rationale**: An unresponsive guidance system should degrade gracefully rather than halt all agent operations. Operators can set `GUIDANCE_EVENT_FAIL_CLOSED=1` for high-security environments.

---

## 11. Module Map

| Layer | File | Role |
|---|---|---|
| **Entry** | `bin/cf-guidance-impl.mjs` | CLI entry point for installer |
| **Installer** | `src/installer.mjs` | `initRepo()`, `installIntoRepo()`, `verifyRepo()` |
| **Config** | `src/default-settings.mjs` | Hook definitions, env vars, npm scripts, dependency declarations |
| **Dispatcher** | `src/hook-handler.cjs` | CJS hook handler: 12 commands, stdin JSON parsing, dispatch |
| **Utilities** | `src/utils.mjs` / `src/utils.cjs` | Shared helpers (ESM + CJS variants) |
| **Runtime** | `src/guidance/phase1-runtime.js` | Compiler + Retriever + Gates + Ledger + Hook Registry |
| **Runtime** | `src/guidance/advanced-runtime.js` | Trust + Adversarial + Proof + Conformance + Evolution |
| **Runtime** | `src/guidance/integration-runners.js` | 6 integration test suites |
| **Runtime** | `src/guidance/content-aware-executor.js` | Synthetic executor for A/B benchmarking |
| **CLI** | `src/cli/guidance-integrations.js` | Event dispatch + integration suite orchestration |
| **CLI** | `src/cli/event-handlers.js` | Per-event policy enforcement logic |
| **CLI** | `src/cli/guidance-autopilot.js` | Rule optimisation and promotion |
| **CLI** | `src/cli/guidance-ab-benchmark.js` | A/B benchmark runner |
| **CLI** | `src/cli/analyze-guidance.js` | Policy bundle scoring (6 dimensions) |
| **CLI** | `src/cli/guidance-runtime.js` | Runtime demo and interactive testing |
| **CLI** | `src/cli/guidance-codex-bridge.js` | Codex lifecycle adapter (8 events) |
| **CLI** | `src/cli/scaffold-guidance.js` | Project scaffolding generator |

### External dependencies

| Package | Purpose |
|---|---|
| `@claude-flow/guidance` | Policy engine: compiler, retriever, gates, ledger, trust, adversarial, proof, conformance, evolution, analyzer |
| `@claude-flow/hooks` | Hook registry and executor framework |
