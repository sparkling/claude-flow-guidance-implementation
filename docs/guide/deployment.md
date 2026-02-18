# Production deployment guide

This guide covers deploying `claude-flow-guidance-implementation` in
production environments, including CI/CD pipelines, multi-agent setups, and
team workflows. It assumes you have completed the
[quick-start tutorial](quick-start.md) and have a working local installation.

## Prerequisites

Before proceeding, verify the following:

- Node.js >= 20
- npm >= 10
- Git initialized repository with a `CLAUDE.md` policy file

The package depends on:

| Dependency | Version |
|---|---|
| `@claude-flow/guidance` | ^3.0.0-alpha.1 |
| `@claude-flow/hooks` | ^3.0.0-alpha.7 |

Both are installed automatically by the `cf-guidance-impl init` command.

## Environment variables

Production deployments require explicit configuration for security-critical
settings that default to permissive values in development.

| Variable | Production value | Description |
|---|---|---|
| `GUIDANCE_PROOF_KEY` | `$(openssl rand -hex 32)` | HMAC signing key for proof chains. Without this, the runtime falls back to an insecure development key. |
| `GUIDANCE_EVENT_FAIL_CLOSED` | `1` | Block actions when guidance calls fail. Default is fail-open (`0`). |
| `GUIDANCE_EVENT_SYNC_TIMEOUT_MS` | `3000`-`5000` | Hook response timeout in milliseconds. Lower than the default `8000` for faster feedback in production. |
| `GUIDANCE_EVENT_WIRING_ENABLED` | `1` | Confirm guidance is active. This is the default, but setting it explicitly prevents accidental deactivation. |
| `GUIDANCE_AUTOPILOT_ENABLED` | `0` (CI) / `1` (dev) | Disable autopilot in CI to prevent `CLAUDE.md` modifications during builds. |
| `CLAUDE_AGENT_ID` | Per-agent unique ID | Required for multi-agent deployments. Each agent must have a distinct identifier. |

### Generate and store the signing key

Generate a cryptographically strong signing key:

```bash
openssl rand -hex 32
```

Store the output in your organization's secrets manager (Vault, AWS Secrets
Manager, GCP Secret Manager, or equivalent). Inject it as the
`GUIDANCE_PROOF_KEY` environment variable at runtime. Never commit this value
to source control.

## Fail-open vs. fail-closed

The `GUIDANCE_EVENT_FAIL_CLOSED` variable controls what happens when the
guidance runtime encounters an error or times out.

**Fail-open** (`GUIDANCE_EVENT_FAIL_CLOSED=0`, the default): If guidance
crashes or exceeds the sync timeout, actions proceed without policy
evaluation. This keeps development unblocked but reduces safety guarantees.

**Fail-closed** (`GUIDANCE_EVENT_FAIL_CLOSED=1`, recommended for production):
If guidance fails, actions are blocked. This provides stronger safety
guarantees but can halt agent execution if the guidance runtime has bugs.

Choose fail-closed for production environments where policy enforcement is
mandatory. Use fail-open only in development or in environments where
availability takes priority over policy compliance.

## Installation in CI/CD

Install guidance as a build step using `npx`. The `--skip-cf-init` flag
bypasses the `@claude-flow/cli init` step, which may not be available in
minimal CI environments.

```bash
npx --yes -p claude-flow-guidance-implementation \
  cf-guidance-impl init --target . --install-deps --skip-cf-init
```

### CI/CD integration pattern

Add the following steps to your pipeline after dependency installation:

1. **Install guidance wiring.**

   ```bash
   npx --yes -p claude-flow-guidance-implementation \
     cf-guidance-impl init --target . --install-deps --skip-cf-init
   ```

2. **Verify installation integrity.**

   ```bash
   npx cf-guidance-impl verify --target .
   ```

   Fail the build if the verification report contains `"passed": false`.

3. **Score the policy file.**

   ```bash
   npm run guidance:analyze
   ```

   Parse the output to extract dimension scores. Optionally, fail the build
   if any score drops below a threshold.

4. **Run integration tests.**

   ```bash
   npm run guidance:all
   ```

5. **Archive proof chain artifacts.**

   Copy `.claude-flow/guidance/advanced/proof-chain.json` to your artifact
   store for compliance auditing.

### Example GitHub Actions step

```yaml
- name: Install and verify guidance
  env:
    GUIDANCE_PROOF_KEY: ${{ secrets.GUIDANCE_PROOF_KEY }}
    GUIDANCE_EVENT_FAIL_CLOSED: "1"
    GUIDANCE_AUTOPILOT_ENABLED: "0"
  run: |
    npx --yes -p claude-flow-guidance-implementation \
      cf-guidance-impl init --target . --install-deps --skip-cf-init
    npx cf-guidance-impl verify --target .
    npm run guidance:analyze
    npm run guidance:all

- name: Archive proof chain
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: proof-chain
    path: .claude-flow/guidance/advanced/proof-chain.json
    if-no-files-found: ignore
```

## Proof chain management

The guidance runtime records every policy decision in an append-only,
cryptographically linked proof chain. Two files store runtime state:

| File | Contents |
|---|---|
| `.claude-flow/guidance/advanced/proof-chain.json` | Signed decision envelopes with action, timestamp, and metadata. |
| `.claude-flow/guidance/advanced/advanced-state.json` | Trust scores, trust ledger records, and session snapshots. |

### Gitignore these files

Both files contain machine-specific state, not source code. Add them to
`.gitignore`:

```gitignore
.claude-flow/guidance/
```

### Archive for compliance

For environments that require audit trails, archive proof chain files to
external storage (S3, GCS, or equivalent) on a regular schedule or as a
CI/CD post-step. Retain archives according to your organization's data
retention policy.

### Recovery from corruption

If the proof chain file becomes corrupted, delete it. The runtime creates a
fresh chain on the next startup. Previously recorded decisions are lost from
the local file, so ensure you have archived copies if auditability is
required.

```bash
rm .claude-flow/guidance/advanced/proof-chain.json
```

## Signing key rotation

The `GUIDANCE_PROOF_KEY` signs proof chain envelopes. When you rotate the
key, chains signed with the old key can no longer be verified with the new
key.

**Rotation procedure:**

1. Archive the current proof chain file to external storage.
2. Generate a new key: `openssl rand -hex 32`.
3. Update the key in your secrets manager.
4. Delete the local proof chain file (the runtime starts a fresh chain).
5. Deploy with the new key.

Do not rotate keys without archiving first. Old chains become unverifiable
once the signing key changes.

## Monitoring

Use the built-in status command to inspect runtime health:

```bash
npm run guidance:status
```

The output is JSON. Monitor the following fields:

| Field | What to check |
|---|---|
| `proofChainLength` | Non-zero and increasing. Confirms decisions are being recorded. |
| `trustAgents` | Count matches the expected number of active agents. |
| `threatSignals` | Review for unexpected adversarial detection activity. |

Integrate this output into your monitoring stack by parsing the JSON in a
scheduled job or sidecar process.

## Multi-agent deployment

In multi-agent environments, each agent must operate with a distinct
identity so that trust scoring, proof chains, and collusion detection work
correctly.

### Agent identity

Set the `CLAUDE_AGENT_ID` environment variable to a unique value for each
agent:

```bash
export CLAUDE_AGENT_ID=agent-coder-01
```

### Trust scoring

Trust scores are tracked per agent. The runtime maintains an independent
trust score for each `agentId`, updated after every decision. Agents that
repeatedly trigger policy violations see their trust score decrease, which
can affect routing decisions.

### Proof chain attribution

Every envelope in the proof chain records which agent made the decision.
This allows post-hoc auditing of which agent performed which action.

### Collusion detection

The adversarial subsystem monitors inter-agent interaction patterns. If
multiple agents coordinate to circumvent policy (for example, by splitting a
blocked command across separate tool calls), the collusion detector flags the
pattern in `threatSignals`.

## Team setup

### Shared rules in CLAUDE.md

`CLAUDE.md` is committed to the repository. It contains the team's shared
policy rules. All agents and developers operate under the same policy file.

### Local rules in CLAUDE.local.md

`CLAUDE.local.md` is gitignored. It contains per-developer preferences and
experimental rules. The autopilot system can promote winning local rules
into the shared `CLAUDE.md` via pull request.

### Autopilot workflow

1. A developer adds an experimental rule to `CLAUDE.local.md`.
2. The autopilot evaluates the rule's impact over multiple sessions.
3. If the rule improves scores, the autopilot promotes it to `CLAUDE.md`
   and opens a pull request for team review.
4. Disable autopilot in CI (`GUIDANCE_AUTOPILOT_ENABLED=0`) to prevent
   automated `CLAUDE.md` modifications during builds.

## Security hardening checklist

Complete every item before deploying to production.

- [ ] `GUIDANCE_PROOF_KEY` is set to a strong random value (32 bytes hex
  minimum).
- [ ] `GUIDANCE_EVENT_FAIL_CLOSED` is set to `1`.
- [ ] `.claude-flow/guidance/` is listed in `.gitignore`.
- [ ] `CLAUDE.local.md` is listed in `.gitignore`.
- [ ] Proof chain files are archived to external storage on a regular
  schedule.
- [ ] The signing key is stored in a secrets manager, not in source control
  or CI configuration files.
- [ ] Credential scanning (the secrets gate in `pre-bash` hooks) is active.
  Verify by testing a command that contains a token pattern.
- [ ] The threat detector is active for `pre-command` hooks. Verify by
  running `npm run guidance:adversarial`.

## Production setup checklist

Use this checklist for each new production deployment.

### 1. Generate secrets

```bash
openssl rand -hex 32
# Store the output in your secrets manager as GUIDANCE_PROOF_KEY.
```

### 2. Configure environment variables

Set all variables from the environment variables table above. At minimum:

```bash
export GUIDANCE_PROOF_KEY="<value-from-secrets-manager>"
export GUIDANCE_EVENT_FAIL_CLOSED=1
export GUIDANCE_EVENT_SYNC_TIMEOUT_MS=5000
export GUIDANCE_EVENT_WIRING_ENABLED=1
export GUIDANCE_AUTOPILOT_ENABLED=0
```

### 3. Install guidance

```bash
npx --yes -p claude-flow-guidance-implementation \
  cf-guidance-impl init --target . --install-deps --skip-cf-init
```

### 4. Verify installation

```bash
npx cf-guidance-impl verify --target .
```

Confirm the output contains `"passed": true`.

### 5. Update .gitignore

Ensure the following entries exist:

```gitignore
.claude-flow/guidance/
CLAUDE.local.md
```

### 6. Run the integration suite

```bash
npm run guidance:all
```

All suites should pass.

### 7. Score the policy file

```bash
npm run guidance:analyze
```

Review the dimension scores. Address any low-scoring areas before
deployment.

### 8. Configure monitoring

Set up a scheduled job or sidecar that runs `npm run guidance:status` and
parses the JSON output. Alert on:

- `proofChainLength` not increasing over a 24-hour period.
- `trustAgents` count dropping to zero.
- Any non-empty `threatSignals` array.

### 9. Configure CI/CD

Add verification, analysis, and integration test steps to your pipeline as
described in the CI/CD integration pattern section above.

### 10. Archive proof chains

Configure a post-build step or scheduled job to copy
`.claude-flow/guidance/advanced/proof-chain.json` to external storage.

### 11. Document key rotation schedule

Establish a key rotation schedule (quarterly is a reasonable default).
Document the procedure from the signing key rotation section in your
team's runbook.

### 12. Validate multi-agent identity (if applicable)

If running multiple agents, verify each has a unique `CLAUDE_AGENT_ID` and
that trust scores are being tracked independently:

```bash
npm run guidance:trust
```

## Troubleshooting

### Guidance hooks are not firing

Verify that `.claude/settings.json` contains the hook definitions. Re-run
the installer if hooks are missing:

```bash
npx --yes -p claude-flow-guidance-implementation \
  cf-guidance-impl init --target . --install-deps --skip-cf-init
```

### Proof chain is empty after running commands

Check that `GUIDANCE_PROOF_KEY` is set. Without it, the runtime may skip
proof chain writes depending on the configuration. Also verify that
`GUIDANCE_EVENT_WIRING_ENABLED` is `1` (the default).

### Actions are blocked unexpectedly

If `GUIDANCE_EVENT_FAIL_CLOSED=1` and the guidance runtime encounters an
error, all actions are blocked. Check the runtime logs for errors. As a
temporary measure, set `GUIDANCE_EVENT_FAIL_CLOSED=0` to restore fail-open
behavior while you investigate.

### Verification fails on hook-handler syntax

Ensure Node.js >= 20 is available in the environment. The hook handler uses
syntax features that require Node.js 20 or later.

### CI fails with "cf-guidance-impl not found"

Use the full `npx` invocation with the `-p` flag to ensure the package is
available:

```bash
npx --yes -p claude-flow-guidance-implementation cf-guidance-impl verify --target .
```
