# claude-flow-guidance-implementation

NPM-first implementation kit for wiring `@claude-flow/guidance` into any repository.

It installs a reusable guidance control plane with:
- Claude Code hook bridge
- Codex lifecycle bridge
- guidance runtime scripts
- autopilot promotion loop (`CLAUDE.local.md` -> `CLAUDE.md`)
- verification tooling

## Install and run

Use directly from npm (no clone required):

```bash
npx --yes -p claude-flow-guidance-implementation cf-guidance-impl init --target ~/source/my-project --install-deps
```

Or install as a dev dependency:

```bash
npm i -D claude-flow-guidance-implementation
npx cf-guidance-impl init --target ~/source/my-project --install-deps
```

## Quickstart

```bash
# 1) initialize and wire a target repo
npx --yes -p claude-flow-guidance-implementation cf-guidance-impl init --target ~/source/my-project --install-deps

# 2) verify wiring
npx --yes -p claude-flow-guidance-implementation cf-guidance-impl verify --target ~/source/my-project
```

## CLI commands

```bash
cf-guidance-impl init --target <repoPath> [--force] [--install-deps] [--no-dual] [--skip-cf-init] [--no-verify]
cf-guidance-impl install --target <repoPath> [--force] [--install-deps]
cf-guidance-impl verify --target <repoPath>
```

## What `init` does

`cf-guidance-impl init` performs:
1. `npx @claude-flow/cli@latest init --dual` in target repo (unless `--skip-cf-init`)
2. installs scaffold runtime files (`scripts/`, `src/guidance/`, `.claude/helpers/hook-handler.cjs`, docs)
3. merges target `package.json` scripts + guidance deps
4. merges `.claude/settings.json` env and hook blocks
5. appends Codex bridge sections to `.agents/config.toml` and `AGENTS.md`
6. creates `CLAUDE.local.md` stub and updates `.gitignore`
7. verifies wiring (unless `--no-verify`)

## Codex lifecycle integration

After installation, these scripts are available in the target repo:

```bash
npm run guidance:codex:session-start
npm run guidance:codex:pre-task -- --task-id task-123 --description "Implement feature X"
npm run guidance:codex:pre-command -- --task-id task-123 --command "git status"
npm run guidance:codex:pre-edit -- --task-id task-123 --file src/example.ts --operation modify
npm run guidance:codex:post-edit -- --task-id task-123 --file src/example.ts
npm run guidance:codex:post-task -- --task-id task-123 --status completed --description "Implement feature X"
npm run guidance:codex:session-end -- --task-id task-123
```

Validation smoke check:

```bash
npm run guidance:codex:status
npm run guidance:codex:pre-task -- --task-id smoke-1 --description "smoke" --skip-cf-hooks
```

Expected JSON output:
- `handler.ok: true` -> local bridge + hook-handler path succeeded
- `claudeFlowHook.ok: true` -> secondary `@claude-flow/cli` hook invocation succeeded

## Notes

- Target repo config is merged, not replaced.
- Default local guidance file is `CLAUDE.local.md` (gitignored).
- Advanced reference docs are installed into target `docs/`.

## Links

- GitHub: https://github.com/sparkling/claude-flow-guidance-implementation
- Issues: https://github.com/sparkling/claude-flow-guidance-implementation/issues
- Package: https://www.npmjs.com/package/claude-flow-guidance-implementation
