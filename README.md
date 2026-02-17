# claude-flow-guidance-implementation

Implementation kit for wiring `@claude-flow/guidance` into real repos with repeatable automation for Claude Code hooks, Codex lifecycle events, and guidance optimization workflows.

## What This Package Is

This package is an installer and scaffold, not just an API example.  
It creates a working guidance control plane in a target repo, including:

- hook event wiring (`pre-*` and `post-*`)
- guidance runtime scripts (`analyze`, `optimize`, `ab-benchmark`, modules)
- Codex bridge commands (optional)
- `CLAUDE.local.md` bootstrap for local-only experiments
- verification checks so setup can be validated immediately

## What `quickstart` is doing

The quickstart commands do two things:

- run `init` to install and wire scripts/config into your target repo
- run `verify` to confirm that required files, hooks, and syntax checks pass

It is meant to produce a runnable integration, not just generate documentation.

## Quickstart

Use directly from npm:

```bash
npx --yes -p claude-flow-guidance-implementation cf-guidance-impl init --target ~/source/my-project --install-deps
npx --yes -p claude-flow-guidance-implementation cf-guidance-impl verify --target ~/source/my-project
```

Or install as a dev dependency:

```bash
npm i -D claude-flow-guidance-implementation
npx cf-guidance-impl init --target ~/source/my-project --install-deps
npx cf-guidance-impl verify --target ~/source/my-project
```

## Integration Modes

| Mode | What gets wired |
|---|---|
| `both` (default) | Claude hooks + Codex bridge + guidance scripts |
| `claude` | Claude hooks + guidance scripts |
| `codex` | Codex bridge + guidance scripts |

Examples:

```bash
npx cf-guidance-impl init --target ~/source/my-project --target-mode both
npx cf-guidance-impl init --target ~/source/my-project --target-mode claude
npx cf-guidance-impl init --target ~/source/my-project --target-mode codex
```

## CLI Reference

```bash
cf-guidance-impl init --target <repoPath> [--target-mode both|claude|codex] [--force] [--install-deps] [--no-dual] [--skip-cf-init] [--no-verify]
cf-guidance-impl install --target <repoPath> [--target-mode both|claude|codex] [--force] [--install-deps]
cf-guidance-impl verify --target <repoPath> [--target-mode both|claude|codex]
```

## What `init` Changes In Your Target Repo

`cf-guidance-impl init` performs:

1. Runs `npx @claude-flow/cli@latest init` unless `--skip-cf-init`.
2. Adds CLI mode flags automatically:
   - `both` uses `--dual` unless `--no-dual`
   - `codex` uses `--codex`
   - `claude` uses standard init
3. Copies scaffold runtime files (`scripts/`, `src/guidance/`, docs, hook handler).
4. Merges guidance scripts and dependencies into `package.json`.
5. Merges `.claude/settings.json` env and hooks in Claude-enabled modes.
6. Appends Codex bridge sections to `.agents/config.toml` and `AGENTS.md` in Codex-enabled modes.
7. Creates `CLAUDE.local.md` (if missing) and appends `CLAUDE.local.md` to `.gitignore`.
8. Runs verification unless `--no-verify`.

## Installed Scripts (Target Repo)

Core:

- `guidance:analyze`
- `guidance:optimize`
- `guidance:autopilot:once`
- `guidance:autopilot:daemon`
- `guidance:ab-benchmark`
- `guidance:status`
- `guidance:all`
- `guidance:trust`
- `guidance:adversarial`
- `guidance:proof`
- `guidance:conformance`
- `guidance:evolution`

Codex lifecycle bridge:

- `guidance:codex:status`
- `guidance:codex:session-start`
- `guidance:codex:pre-command`
- `guidance:codex:pre-edit`
- `guidance:codex:pre-task`
- `guidance:codex:post-edit`
- `guidance:codex:post-task`
- `guidance:codex:session-end`

## Manual Runtime Mode (No Copied Runtime Files)

You can also execute scripts directly from `node_modules`:

```json
{
  "scripts": {
    "guidance:analyze": "node ./node_modules/claude-flow-guidance-implementation/scaffold/scripts/analyze-guidance.js",
    "guidance:optimize": "node ./node_modules/claude-flow-guidance-implementation/scaffold/scripts/guidance-autopilot.js --once --apply --source manual",
    "guidance:ab-benchmark": "node ./node_modules/claude-flow-guidance-implementation/scaffold/scripts/guidance-ab-benchmark.js",
    "guidance:codex:status": "node ./node_modules/claude-flow-guidance-implementation/scaffold/scripts/guidance-codex-bridge.js status"
  }
}
```

Project root resolution for scaffold scripts:

- `GUIDANCE_PROJECT_DIR` if set
- else `CLAUDE_PROJECT_DIR` if set
- else `process.cwd()`

## Verify + Smoke Test

```bash
npx cf-guidance-impl verify --target ~/source/my-project
cd ~/source/my-project
npm run guidance:status
npm run guidance:analyze
npm run guidance:codex:status
```

For Codex bridge smoke checks:

```bash
npm run guidance:codex:pre-task -- --task-id smoke-1 --description "smoke"
```

Expected success signals:

- `handler.ok: true` means local bridge path succeeded
- `claudeFlowHook.ok: true` means optional `@claude-flow/cli` hook call succeeded

## Installed Files (High-Level)

| Path | Purpose |
|---|---|
| `.claude/helpers/hook-handler.cjs` | Event entrypoint for hook dispatch |
| `scripts/guidance-integrations.js` | Unified guidance module runner |
| `scripts/guidance-codex-bridge.js` | Codex lifecycle adapter |
| `scripts/guidance-autopilot.js` | Local-rule optimization/promotion loop |
| `src/guidance/phase1-runtime.js` | Compile/retrieve/gates/ledger integration |
| `src/guidance/advanced-runtime.js` | Trust/adversarial/proof/conformance/evolution modules |
| `docs/guidance-control-plane.md` | Operational overview |
| `docs/guidance-implementation-guide.md` | Authoritative implementation guide |

## Links

- Package: https://www.npmjs.com/package/claude-flow-guidance-implementation
- GitHub: https://github.com/sparkling/claude-flow-guidance-implementation
- Issues: https://github.com/sparkling/claude-flow-guidance-implementation/issues
