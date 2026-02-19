# Migration guide

This guide describes how to add `claude-flow-guidance-implementation` to an
existing repository. It covers four migration scenarios, from fresh
repositories with no prior hook configuration to repositories already using
`@claude-flow/cli` hooks or Codex.

## Before you begin

Ensure your environment meets the following requirements:

- Node.js 20 or later
- npm 10 or later
- A Git-initialized repository with a `package.json`

Verify your versions:

```bash
node --version   # v20.x or later
npm --version    # 10.x or later
```

Back up your current configuration before proceeding. The installer is
designed to be non-destructive, but having a clean commit to revert to is
good practice:

```bash
git add -A && git commit -m "checkpoint before guidance migration"
```

## Scenario 1: Fresh repository with no existing hooks

This is the simplest migration path. The repository has no
`.claude/settings.json` and no existing hook handlers.

### Steps

1. Run the installer from your repository root:

    ```bash
    npx --yes -p claude-flow-guidance-implementation \
      cf-guidance-impl init --target . --install-deps
    ```

2. The installer performs the following actions in order:

    - Runs `npx @claude-flow/cli init` to scaffold the base Claude Flow
      configuration.
    - Creates `.claude/helpers/hook-handler.cjs`, a thin CommonJS shim that
      delegates to the full hook handler in the installed npm package.
    - Creates `.claude/settings.json` with hook entries for `PreToolUse`,
      `PostToolUse`, `SessionStart`, and `SessionEnd`.
    - Adds guidance npm scripts and the `claude-flow-guidance-implementation`
      dependency to `package.json`.
    - Runs `npm install`.
    - Runs a verification pass.

3. Confirm the installer output includes `"passed": true` in the `verify`
   section.

4. Verify the installation independently:

    ```bash
    npx cf-guidance-impl verify --target .
    ```

### What was created

| File | Purpose |
|---|---|
| `.claude/helpers/hook-handler.cjs` | CommonJS dispatcher that routes Claude Code lifecycle events through the guidance control plane. |
| `.claude/settings.json` | Claude Code settings with hook entries for pre-edit, pre-bash, pre-task, post-edit, post-task, session-restore, and session-end. |
| `CLAUDE.local.md` | Local-only guidance experiments file, added to `.gitignore`. |
| `package.json` | Updated with guidance npm scripts and the package dependency. |

## Scenario 2: Repository already using @claude-flow/cli hooks

This scenario applies when the repository already has `.claude/settings.json`
with hook definitions and `.claude/helpers/` with handler files such as
`router.cjs`, `session.cjs`, or `intelligence.cjs`.

### How the installer merges hooks

The installer merges configuration. It does not overwrite.

**Hook blocks.** The `mergeHookBlocks()` function (defined in
`src/installer.mjs`, lines 116-137) compares incoming hook blocks against
existing blocks by their `matcher` field:

- If no existing block has the same matcher, the new block is appended.
- If a block with the same matcher already exists, incoming hooks are appended
  to that block. Hooks are deduplicated by the combination of `type` and
  `command`, so running the installer twice produces no duplicates.

**Environment variables.** Variables are merged into `settings.env` only when
the key does not already exist. Your existing environment configuration is
preserved.

**npm scripts.** Scripts are merged into `package.json` only when the script
name does not already exist, unless you pass `--force`.

### Compatibility pairs

The installer checks four helper modules -- `router`, `session`, `memory`,
and `statusline` -- and ensures that both `.cjs` and `.js` variants exist for
each. Different parts of the hook system require different module extensions:

- If only `router.cjs` exists, the installer copies it to `router.js`.
- If only `router.js` exists, the installer copies it to `router.cjs`.
- If both exist, no action is taken.

This applies to all four modules. The verification step later checks that
these compatibility pairs are complete.

### The hook handler shim

The installer writes a thin shim at `.claude/helpers/hook-handler.cjs`:

```javascript
#!/usr/bin/env node
process.env.__GUIDANCE_HELPERS_DIR =
  process.env.__GUIDANCE_HELPERS_DIR || __dirname;
require('claude-flow-guidance-implementation/hook-handler');
```

This shim delegates to the full handler in `node_modules` while preserving a
reference to the helpers directory. Your existing helper modules (`router.cjs`,
`session.cjs`, `intelligence.cjs`, and others) remain in place. The hook
handler loads them at runtime through `safeRequire()`, which means failures
in individual helpers do not crash the handler.

### Steps

1. Run the installer:

    ```bash
    npx --yes -p claude-flow-guidance-implementation \
      cf-guidance-impl init --target . --install-deps
    ```

2. Review the JSON summary output. Check the `compatActions` field to see
   which compatibility copies were created.

3. Verify:

    ```bash
    npx cf-guidance-impl verify --target .
    ```

4. Open `.claude/settings.json` and confirm that your existing hooks are
   intact alongside the new guidance hooks. The guidance hooks call
   `hook-handler.cjs` with event arguments (`pre-bash`, `pre-edit`,
   `pre-task`, `post-edit`, `post-task`, `session-restore`, `session-end`).

5. Test that your existing hooks still run by triggering a normal Claude Code
   session or by piping a simulated event:

    ```bash
    echo '{"tool_input":{"command":"git status"}}' \
      | node .claude/helpers/hook-handler.cjs pre-bash
    ```

    Expected output: `[OK] Command validated` with exit code 0.

### Understanding hook coexistence

When your repository already has hooks for the same lifecycle event (for
example, a `PreToolUse` block matching `Bash`), the installer adds the
guidance hook alongside the existing one. Both hooks run during execution.

If both an existing hook and a guidance hook attempt to block the same tool
call, the first hook to exit with code 1 wins. Claude Code respects the first
non-zero exit code and aborts the tool call.

## Scenario 3: Codex repository without Claude Code

This scenario applies to repositories using OpenAI Codex that do not use
Claude Code's native hook system.

### Steps

1. Run the installer with the `--target-mode codex` flag:

    ```bash
    npx --yes -p claude-flow-guidance-implementation \
      cf-guidance-impl init --target . --target-mode codex --install-deps
    ```

2. The installer performs the following Codex-specific actions:

    - Skips `.claude/settings.json` hook wiring entirely.
    - Appends a `[guidance_codex]` configuration block to
      `.agents/config.toml`. If the file does not exist, it creates one.
    - Appends a documentation section to `AGENTS.md` describing the bridge
      commands.
    - Adds `guidance:codex:*` npm scripts to `package.json`.
    - Still creates `.claude/helpers/hook-handler.cjs` (the Codex bridge
      delegates to it).

3. Verify:

    ```bash
    npx cf-guidance-impl verify --target . --target-mode codex
    ```

### Codex bridge commands

The Codex bridge maps lifecycle events to the same hook handler that Claude
Code uses. Invoke events explicitly through npm scripts:

```bash
npm run guidance:codex:session-start
npm run guidance:codex:pre-task -- --description "Implement feature X"
npm run guidance:codex:pre-command -- --command "git status"
npm run guidance:codex:pre-edit -- --file src/example.ts
npm run guidance:codex:post-edit -- --file src/example.ts
npm run guidance:codex:post-task -- --task-id task-123 --status completed
npm run guidance:codex:session-end
```

To skip the secondary `@claude-flow/cli` hook invocations, pass
`--skip-cf-hooks` to any bridge command or set the environment variable:

```bash
export GUIDANCE_CODEX_SKIP_CF_HOOKS=1
```

## Scenario 4: Adding Codex support to an existing Claude Code installation

If you have already installed guidance for Claude Code and want to add Codex
support, re-run the installer with `--target-mode both`. Use the `install`
subcommand (not `init`) to skip the `@claude-flow/cli init` step and merge
only the additional Codex wiring:

```bash
npx --yes -p claude-flow-guidance-implementation \
  cf-guidance-impl install --target . --target-mode both
```

This adds:

- The `[guidance_codex]` block to `.agents/config.toml`.
- The Codex documentation section to `AGENTS.md`.
- The `guidance:codex:*` npm scripts to `package.json`.

Your existing Claude Code hooks and settings remain untouched.

## Verification

After any migration scenario, run the verification command:

```bash
npx cf-guidance-impl verify --target .
```

The verifier performs five categories of checks:

1. **File existence.** Confirms that all required files are present
   (`.claude/helpers/hook-handler.cjs`, `package.json`,
   `.claude/settings.json` for Claude mode, `.agents/config.toml` and
   `AGENTS.md` for Codex mode).

2. **Dependency declaration.** Confirms that
   `claude-flow-guidance-implementation` is listed in the `dependencies`
   field of `package.json`.

3. **Syntax validation.** Runs `node --check` on `.claude/helpers/hook-handler.cjs`
   to confirm it parses without errors.

4. **Smoke test.** Pipes a simulated `pre-bash` event with `git status` into
   the hook handler and confirms it exits with code 0. For Codex mode,
   confirms the hook handler module resolves via dynamic import.

5. **Compatibility pairs.** Checks that all four helper modules (`router`,
   `session`, `memory`, `statusline`) have both `.cjs` and `.js` variants
   if either variant exists.

A successful verification produces a JSON report with `"passed": true`. If
verification fails, review the individual check results in the output to
identify the issue.

## Installed hook definitions

The installer adds the following hooks to `.claude/settings.json`. These are
the default definitions; the merge logic preserves any existing hooks.

### PreToolUse

| Matcher | Event | Timeout |
|---|---|---|
| `Write\|Edit\|MultiEdit` | `pre-edit` | 5000 ms |
| `Bash` | `pre-bash` | 5000 ms |
| `Task` | `pre-task` | 5000 ms |

### PostToolUse

| Matcher | Event | Timeout |
|---|---|---|
| `Write\|Edit\|MultiEdit` | `post-edit` | 5000 ms |
| `Task` | `post-task` | 5000 ms |

### SessionStart and SessionEnd

| Lifecycle event | Hook event | Timeout |
|---|---|---|
| `SessionStart` | `session-restore` | 5000 ms |
| `SessionEnd` | `session-end` | 5000 ms |

### Environment variables

The installer merges the following default environment variables into
`settings.env`. Existing values take precedence.

| Variable | Default | Description |
|---|---|---|
| `CLAUDE_FLOW_HOOKS_ENABLED` | `true` | Master switch for all Claude Flow hooks. |
| `GUIDANCE_EVENT_WIRING_ENABLED` | `1` | Enables the guidance event pipeline. Set to `0` to disable without removing hooks. |
| `GUIDANCE_EVENT_SYNC_TIMEOUT_MS` | `8000` | Maximum wait time for synchronous hook execution. |
| `GUIDANCE_EVENT_FAIL_CLOSED` | `0` | When `1`, hook failures block the tool call. When `0`, hook failures are logged but the tool call proceeds. |

## Rollback

If the migration causes issues, you have two options.

### Option A: Remove guidance entirely

1. Open `.claude/settings.json` and remove the hook entries that reference
   `hook-handler.cjs`. These are the `PreToolUse`, `PostToolUse`,
   `SessionStart`, and `SessionEnd` blocks added by the installer.

2. Remove the guidance npm scripts from `package.json` (all scripts prefixed
   with `guidance:`).

3. Delete the hook handler shim:

    ```bash
    rm .claude/helpers/hook-handler.cjs
    ```

4. Remove the dependency from `package.json`:

    ```bash
    npm uninstall claude-flow-guidance-implementation
    ```

### Option B: Disable without removing

Set the environment variable to disable the event pipeline. Hook entries
remain in configuration but produce no effect:

```bash
export GUIDANCE_EVENT_WIRING_ENABLED=0
```

You can set this in `.claude/settings.json` under the `env` key for
persistent disablement:

```json
{
  "env": {
    "GUIDANCE_EVENT_WIRING_ENABLED": "0"
  }
}
```

## Troubleshooting

### Hook handler fails with MODULE_NOT_FOUND

The shim at `.claude/helpers/hook-handler.cjs` requires the
`claude-flow-guidance-implementation` package from `node_modules`. If
`node_modules` is missing or incomplete, the shim fails.

**Fix:** Run `npm install` in the repository root.

### Existing pre-bash hooks conflict with guidance hooks

When both an existing hook and a guidance hook match the same tool call, both
execute. If both attempt to block, the first `exit(1)` wins.

**Fix:** Review the hooks in `.claude/settings.json` to confirm they are
compatible. If an existing hook already handles the same policy concern as a
guidance hook, you can remove the duplicate.

### CLAUDE.md not found

The guidance runtime expects a `CLAUDE.md` file at the repository root. If
your repository uses a different filename for its policy document, configure
the runtime by setting `rootGuidancePath` in the runtime constructor options.

**Fix:** Either rename your policy file to `CLAUDE.md` or configure the path:

```javascript
const runtime = createGuidanceAdvancedRuntime({
  rootGuidancePath: 'path/to/your-policy-file.md',
});
```

### Compatibility pair warnings during verification

The verifier reports a failure if a helper module exists with one extension
but not the other. For example, `router.cjs` exists but `router.js` does not.

**Fix:** Re-run the installer, which creates missing compatibility copies
automatically:

```bash
npx cf-guidance-impl install --target .
```

### Codex bridge cannot find hook handler

The Codex bridge script (`guidance-codex-bridge.js`) delegates to
`.claude/helpers/hook-handler.cjs`. If this file is missing, bridge commands
fail.

**Fix:** Ensure the hook handler shim exists. Re-run the installer if
necessary:

```bash
npx cf-guidance-impl install --target . --target-mode codex
```

## Force reinstallation

To overwrite all installer-managed files regardless of existing content,
pass the `--force` flag:

```bash
npx cf-guidance-impl init --target . --install-deps --force
```

With `--force`:

- The hook handler shim is overwritten even if it already exists.
- npm scripts in `package.json` are overwritten even if the script name
  already exists.

Environment variables and hook blocks still follow merge semantics. The
`--force` flag does not delete your existing hooks or environment values.

## Component selection for existing repositories

Existing repositories that were installed before the component system was
added will not have a `.claude-flow/guidance/components.json` file. In this
case, all subsystems default to enabled, which matches the previous
behaviour. No action is needed.

To explicitly pin the full set of components, re-run the installer with
`--preset full`:

```bash
npx cf-guidance-impl install --target . --preset full
```

This writes `components.json` and ensures future re-runs preserve the full
selection.

## Next steps

After migration, consult these resources:

- [Quick start](quick-start.md) -- Walk through the full test suite and
  runtime demo.
- [Authoring CLAUDE.md](authoring-claude-md.md) -- Learn how to write policy
  rules that compile into the guidance control plane.
- [Trust system](trust-system.md) -- Understand how the trust system tracks
  agent behavior and adjusts privileges.
