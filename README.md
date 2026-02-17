# claude-flow-guidance-implementation

Reusable implementation kit for wiring `@claude-flow/guidance` into any repo with:
- guidance runtime scripts
- Claude Code hook bridge
- autopilot promotion loop (`CLAUDE.local.md` -> `CLAUDE.md`)
- verification runbook and docs

## What this repo provides

- A reusable scaffold under `scaffold/`:
  - `.claude/helpers/hook-handler.cjs`
  - `scripts/guidance-*.js`
  - `src/guidance/*.js`
  - docs
- An installer CLI:
  - `cf-guidance-impl install --target <repo>`
  - `cf-guidance-impl verify --target <repo>`
- JSON merge logic for:
  - `package.json` scripts + dependencies
  - `.claude/settings.json` env + hooks
  - `.agents/config.toml` Codex bridge section
  - `AGENTS.md` Codex lifecycle usage section

## Quickstart

```bash
# clone this toolkit
cd ~/source
git clone https://github.com/sparkling/claude-flow-guidance-implementation.git
cd claude-flow-guidance-implementation

# install into another repo
node bin/cf-guidance-impl.mjs install --target ~/source/my-project --install-deps

# verify the wiring
node bin/cf-guidance-impl.mjs verify --target ~/source/my-project
```

## Integration modes for other repos

## 1) Central toolkit mode (recommended)
Keep this repo as a shared toolkit and run installer into target repos:

```bash
node ~/source/claude-flow-guidance-implementation/bin/cf-guidance-impl.mjs install --target ~/source/repo-a --install-deps
node ~/source/claude-flow-guidance-implementation/bin/cf-guidance-impl.mjs install --target ~/source/repo-b --install-deps
```

## 2) Submodule mode
Add this repo as a submodule in each project and invoke the installer from there.

## 3) Copy mode
Copy `scaffold/` manually and merge settings/scripts manually.

## What gets wired in the target repo

- Hook flow: `PreToolUse`/`PostToolUse`/`SessionStart`/`SessionEnd`
- Guidance events: `pre-command`, `pre-edit`, `pre-task`, `post-edit`, `post-task`, `session-end`
- Codex lifecycle bridge: `scripts/guidance-codex-bridge.js`
- Background session-end autopilot launch
- NPM wrappers:
  - `guidance:analyze`, `guidance:status`, `guidance:all`
  - `guidance:optimize`, `guidance:ab-benchmark`
  - `guidance:scaffold`
  - `guidance:autopilot:once`, `guidance:autopilot:daemon`
  - `guidance:codex:status`
  - `guidance:codex:pre-command`, `guidance:codex:pre-edit`, `guidance:codex:pre-task`
  - `guidance:codex:post-edit`, `guidance:codex:post-task`
  - `guidance:codex:session-start`, `guidance:codex:session-end`

## Codex integration runbook

```bash
# initialize lifecycle context
npm run guidance:codex:session-start

# gate the task and operations
npm run guidance:codex:pre-task -- --task-id task-123 --description "Implement feature X"
npm run guidance:codex:pre-command -- --task-id task-123 --command "git status"
npm run guidance:codex:pre-edit -- --task-id task-123 --file src/example.ts --operation modify

# record completion
npm run guidance:codex:post-edit -- --task-id task-123 --file src/example.ts
npm run guidance:codex:post-task -- --task-id task-123 --status completed --description "Implement feature X"
npm run guidance:codex:session-end -- --task-id task-123
```

Validation:
```bash
npm run guidance:codex:status
npm run guidance:codex:pre-task -- --task-id smoke-1 --description "smoke" --skip-cf-hooks
```

Expected output is JSON:
- `handler.ok: true` means local bridge + hook-handler path passed.
- `claudeFlowHook.ok: true` means secondary `@claude-flow/cli` hook invocation passed.

## Swarm commands

```bash
npm run swarm:init
npm run swarm:route
```

## Notes

- Existing target repo config is merged, not replaced.
- `CLAUDE.local.md` is created if missing and added to `.gitignore`.
- The scaffold includes docs that explain operational details.
