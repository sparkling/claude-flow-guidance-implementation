# Guidance Implementation Guide (Authoritative)

Status date: 2026-02-17

This is the authoritative implementation guide for using `@claude-flow/guidance` in this repo.

It answers four things precisely:
- What the upstream package/README actually provides
- What we implemented in this repo
- How hooks and background automation are wired
- What is automated vs what still needs manual input

---

## 1) Quick Reality Check

`@claude-flow/guidance` is a library + CLI surface, not a single turnkey mode.

To get the full behavior described in the post/README, you need:
1. Guidance runtime APIs (compile/retrieve/gates/ledger)
2. Continuous event wiring (pre/post hooks)
3. Ongoing optimization/promotion loop (`CLAUDE.local.md` -> `CLAUDE.md`)

All three are now present in this repo.

---

## 2) What Quickstart and "Tutorials" Mean

## Quickstart section purpose
The README Quickstart shows the control-plane API sequence:
- initialize control plane
- retrieve task-scoped guidance
- evaluate gates
- finalize run

It is an embedding example, not "run this one script and everything is wired automatically."

## Tutorial sections purpose
The README "Tutorial: Wiring into Claude Code hooks", "Trust", "Adversarial", etc. are integration recipes.

They are examples of how to wire modules into your runtime/hook system. They are not separate built-in CLI commands you must run one-by-one as setup.

---

## 3) Post Claims -> Concrete Implementation Mapping

The post language maps to concrete components as follows:

| Post claim | Concrete mechanism |
|---|---|
| "CLAUDE.md compiled into typed constitution + shards" | `createCompiler()` + `createRetriever()` in `src/guidance/phase1-runtime.js` |
| "CLAUDE.local.md overlays private context" | `compiler.compile(root, local)` in phase-1 runtime and autopilot |
| "Local wins can be promoted with ADR" | `scripts/guidance-autopilot.js` promotion flow + ADR generation in `docs/adr/` |
| "Rules enforced, loops reduce" | pre-event gates + runtime gating in hook wiring |
| "Replayable/auditable decisions" | proof chain + advanced state in `.claude-flow/guidance/advanced/` |

Important: those outcomes only happen continuously when runtime/hook wiring exists. The library alone does not enforce itself.

---

## 4) What Is Implemented in This Repo

This repo now has manual command-bridge wiring from Claude hooks into guidance runtime:

| Area | File(s) | Status |
|---|---|---|
| Phase-1 runtime (compiler/retriever/gates/ledger/hooks provider) | `src/guidance/phase1-runtime.js` | Implemented |
| Advanced runtime (trust/adversarial/proof/conformance/evolution) | `src/guidance/advanced-runtime.js` | Implemented |
| Event bridge entrypoint | `scripts/guidance-integrations.js` | Implemented |
| Hook bridge and event dispatch | `.claude/helpers/hook-handler.cjs` | Implemented |
| Codex lifecycle bridge | `scripts/guidance-codex-bridge.js` | Implemented |
| Claude hook config | `.claude/settings.json` | Wired |
| Codex lifecycle command map | `.agents/config.toml`, `AGENTS.md` | Wired |
| Analysis / benchmark / autopilot scripts | `scripts/analyze-guidance.js`, `scripts/guidance-ab-benchmark.js`, `scripts/guidance-autopilot.js` | Implemented |
| Implementation docs | `docs/guidance-control-plane.md`, this document | Updated |

---

## 5) Hook Wiring Architecture (Current)

Execution chain:

1. Claude hook triggers command in `.claude/settings.json`
2. `.claude/helpers/hook-handler.cjs` parses hook payload
3. Hook handler calls `node scripts/guidance-integrations.js event <event> <json>`
4. `scripts/guidance-integrations.js` runs phase-1/advanced logic
5. Pre-events can block, post-events persist governance state

This is used because Claude Code hooks here are command-based, not direct in-process `HookRegistry` injection.

Codex path in this repo:
1. Run lifecycle command via `scripts/guidance-codex-bridge.js`
2. Bridge forwards to `.claude/helpers/hook-handler.cjs` with normalized payload
3. Hook handler dispatches into `scripts/guidance-integrations.js event ...`
4. Optional best-effort `npx @claude-flow/cli@latest hooks ...` telemetry runs

## Event mapping

| Claude hook path | Guidance event | Sync/Async | Can block |
|---|---|---|---|
| `PreToolUse Bash` -> `pre-bash` | `pre-command` | Sync | Yes |
| `PreToolUse Write|Edit|MultiEdit` -> `pre-edit` | `pre-edit` | Sync | Yes |
| `PreToolUse Task` -> `pre-task` | `pre-task` | Sync | Yes |
| `PostToolUse Write|Edit|MultiEdit` -> `post-edit` | `post-edit` | Async | No |
| `PostToolUse Task` -> `post-task` | `post-task` | Async | No |
| `SessionEnd` -> `session-end` | `session-end` | Async | No |

## Block semantics
- `blocked: true` from sync event causes hook failure (non-zero exit)
- Fail-open/fail-closed on event execution errors is controlled by env:
  - `GUIDANCE_EVENT_FAIL_CLOSED=0` (current default): fail open
  - `GUIDANCE_EVENT_FAIL_CLOSED=1`: fail closed

## Codex lifecycle runbook

Codex integration is command-driven in this repo. Run bridge commands in this order:

1. Session start:
```bash
npm run guidance:codex:session-start
```

2. Before task execution:
```bash
npm run guidance:codex:pre-task -- --task-id task-123 --description "Implement feature X"
```

3. Before risky command/edit operations:
```bash
npm run guidance:codex:pre-command -- --task-id task-123 --command "git status"
npm run guidance:codex:pre-edit -- --task-id task-123 --file src/example.ts --operation modify
```

4. After edits/task completion:
```bash
npm run guidance:codex:post-edit -- --task-id task-123 --file src/example.ts
npm run guidance:codex:post-task -- --task-id task-123 --status completed --description "Implement feature X"
```

5. Session end:
```bash
npm run guidance:codex:session-end -- --task-id task-123
```

Verification expectations:
- Bridge output is JSON with `handler.ok: true` when local enforcement path succeeds.
- `claudeFlowHook.ok: true` indicates secondary `@claude-flow/cli` hook telemetry succeeded.
- Use `--skip-cf-hooks` for local smoke tests if you only want bridge/handler validation.

---

## 6) Command Surface You Should Use

## Upstream CLI (verified in this repo)

```bash
npx claude-flow guidance compile
npx claude-flow guidance retrieve -t "Fix auth bug"
npx claude-flow guidance gates -c "git push --force origin main"
npx claude-flow guidance status
npx claude-flow guidance optimize
npx claude-flow guidance ab-test
```

Notes:
- `claude-flow analyze` is a different command family (code/diff analysis), not guidance scoring.
- Post/marketing snippets using `ab-benchmark` map to `guidance ab-test` in current CLI.

## Repo npm wrappers

```bash
npm run guidance:status
npm run guidance:analyze
npm run guidance:runtime
npm run guidance:hooks
npm run guidance:trust
npm run guidance:adversarial
npm run guidance:proof
npm run guidance:conformance
npm run guidance:evolution
npm run guidance:all
npm run guidance:ab-benchmark
npm run guidance:optimize
npm run guidance:autopilot:once
npm run guidance:autopilot:daemon
npm run guidance:codex:status
npm run guidance:codex:pre-command -- --command "git status"
npm run guidance:codex:pre-edit -- --file src/example.ts
npm run guidance:codex:pre-task -- --description "Implement feature X"
npm run guidance:codex:post-edit -- --file src/example.ts
npm run guidance:codex:post-task -- --task-id task-123 --status completed
npm run guidance:codex:session-start
npm run guidance:codex:session-end
```

Use upstream CLI for baseline guidance operations.
Use repo wrappers for wired runtime checks, advanced module exercises, autopilot promotion flow, and Codex lifecycle dispatch.

---

## 7) `createGuidanceHooks` API Clarification

README tutorial snippet shows object-style usage:

```ts
createGuidanceHooks({ gates, retriever, ledger })
```

Installed API type signature is positional:

```ts
createGuidanceHooks(gates, retriever, ledger, registry?)
```

Example:

```ts
import { createGuidanceHooks } from '@claude-flow/guidance';

const { provider, hookIds } = createGuidanceHooks(gates, retriever, ledger, hookRegistry);
// or:
// const { provider } = createGuidanceHooks(gates, retriever, ledger);
// provider.registerAll(hookRegistry);
```

In this repo, this is already used inside `src/guidance/phase1-runtime.js`. External Claude hook wiring is done through shell commands, not direct provider registry injection.

---

## 8) Advanced Modules: What They Do and How They Run Here

| Module | Purpose | Live in hook path? | Trigger in this repo |
|---|---|---|---|
| Hooks integration | Phase-1 pre/post task and command flow exercise | Partially | `event` pre/post paths + `npm run guidance:hooks` |
| Trust | Agent trust score/tier/rate logic | Yes | Recorded on pre/post events |
| Adversarial | Injection/exfil/poisoning/collusion/quorum detection | Partially | Threat detection active on `pre-command`; full suite via `npm run guidance:adversarial` |
| Proof | Hash-chained proof envelopes | Yes | Appended on hook events |
| Conformance | Replay/integrity checks | Yes | `session-end` event |
| Evolution | Propose/simulate/stage governance changes | Yes | `session-end` event |

Key nuance:
- Full adversarial collusion/quorum workflow is exercised in module runs.
- Live hook path currently applies adversarial threat detection primarily on command input.

---

## 9) Background Automation and Autopilot

## What runs automatically
- Pre-command/edit/task guidance checks on matching hooks
- Post-edit/post-task governance writes (async)
- Session-end conformance/evolution event (async)
- Session-end autopilot launch (detached process) unless disabled

## Where autopilot is launched
- `.claude/helpers/hook-handler.cjs` -> `launchGuidanceAutopilot('session-end')`

## Autopilot controls
- `GUIDANCE_AUTOPILOT_ENABLED=0` disables launch
- `GUIDANCE_AUTOPILOT_MIN_DELTA` sets promotion threshold
- `GUIDANCE_AUTOPILOT_AB=1` enables AB gate
- `GUIDANCE_AUTOPILOT_MIN_AB_GAIN` sets AB minimum gain

Current `.claude/settings.json` includes guidance event controls by default:
- `GUIDANCE_EVENT_WIRING_ENABLED=1`
- `GUIDANCE_EVENT_SYNC_TIMEOUT_MS=8000`
- `GUIDANCE_EVENT_FAIL_CLOSED=0`

---

## 10) CLAUDE.local.md: Manual vs Automated Responsibilities

## Manual (you still do this)
- Add local experimental rules to `CLAUDE.local.md` in parseable guidance style.
- Keep purely personal notes there as needed.

## Automated (system does this)
- Detect promotable local rules
- Build candidate promotion section in `CLAUDE.md`
- Score/benchmark candidate
- Apply if thresholds pass (`--apply`) and generate ADR
- Otherwise write proposal only

Important:
- If `CLAUDE.local.md` has no parseable local rules, autopilot reports `no-promotable-local-rules`.
- It does not invent good rules from free-form notes automatically.

---

## 11) From Clean Clone: Recommended Setup

1. Install deps.
```bash
npm install
```

2. Initialize Claude Flow base config if needed.
```bash
npx claude-flow init
```

3. Verify guidance command surface.
```bash
npx claude-flow guidance --help
```

4. Verify repo wiring files exist and are referenced.
- `.claude/settings.json`
- `.claude/helpers/hook-handler.cjs`
- `scripts/guidance-integrations.js`
- `scripts/guidance-codex-bridge.js`

5. Run baseline checks.
```bash
npm run guidance:status
npm run guidance:analyze
npm run guidance:ab-benchmark
```

6. Run advanced suite.
```bash
npm run guidance:all
```

7. Run autopilot manually.
```bash
npm run guidance:autopilot:once
```

8. Optional continuous autopilot loop.
```bash
npm run guidance:autopilot:daemon
```

---

## 12) Verification Runbook (Hook Path)

## Pre-command allow
```bash
printf '%s' '{"tool_input":{"command":"git status"}}' \
  | node .claude/helpers/hook-handler.cjs pre-bash
```

## Pre-command block
```bash
printf '%s' '{"tool_input":{"command":"git push --force origin main"}}' \
  | node .claude/helpers/hook-handler.cjs pre-bash
```

## Pre-task + post-task correlation
```bash
printf '%s' '{"tool_input":{"description":"Implement x"}}' \
  | node .claude/helpers/hook-handler.cjs pre-task

printf '%s' '{"tool_input":{"status":"completed"}}' \
  | node .claude/helpers/hook-handler.cjs post-task
```

Inspect:
- `.claude-flow/guidance/advanced/advanced-state.json`
- `.claude-flow/guidance/advanced/pending-runs.json`
- `.claude-flow/guidance/hook-task-cache.json`

---

## 13) What `init` Does vs What It Does Not Do

`npx claude-flow init` sets up Claude Flow baseline scaffolding and hook framework.

It does not guarantee your repo-specific guidance bridge scripts are wired exactly the way this repo now uses them.

This repo's authoritative wiring is the combination of:
- `.claude/settings.json` hook commands
- `.claude/helpers/hook-handler.cjs` bridge logic
- `scripts/guidance-integrations.js event ...` handlers

---

## 14) FAQ (Most Common Confusions)

## "Do I need to manually add content to CLAUDE.local.md?"
Yes, for local experimental rules you want considered for promotion. Automation evaluates and promotes; it does not create high-quality local policy out of nothing.

## "Does this run in the background to improve CLAUDE.md?"
Yes, session-end can launch autopilot in background. You can also run continuous daemon mode with `npm run guidance:autopilot:daemon`.

## "Do tutorials mean extra setup scripts are required?"
No. Tutorials are implementation recipes. We already implemented the wiring here.

## "Are hooks/daemon/automation configured?"
Yes in this repo. Guidance event wiring is enabled and session-end autopilot launch is present.

---

## 15) Known Limitations

- Hook payload metadata can be sparse, so some event details may default.
- `post-task` currently supplies empty `toolsUsed/filesTouched` unless provided.
- Live adversarial path is strongest on command input; collusion/quorum are mainly exercised in advanced module runs.
- Default sync error policy is fail-open (`GUIDANCE_EVENT_FAIL_CLOSED=0`).

---

## 16) Source References

Repository implementation:
- `src/guidance/phase1-runtime.js`
- `src/guidance/advanced-runtime.js`
- `scripts/guidance-integrations.js`
- `scripts/guidance-runtime.js`
- `scripts/guidance-autopilot.js`
- `scripts/guidance-ab-benchmark.js`
- `scripts/analyze-guidance.js`
- `.claude/helpers/hook-handler.cjs`
- `.claude/settings.json`
- `package.json`

Upstream/package docs and API:
- `node_modules/@claude-flow/guidance/README.md`
- `node_modules/@claude-flow/guidance/dist/hooks.d.ts`
- `https://github.com/ruvnet/claude-flow/blob/main/v3/%40claude-flow/guidance/README.md`
- `https://github.com/ruvnet/claude-flow/blob/main/v3/%40claude-flow/guidance/docs/reference/api-quick-reference.md`
