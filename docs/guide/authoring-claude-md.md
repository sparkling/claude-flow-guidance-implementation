# Authoring CLAUDE.md for the Guidance Control Plane

This guide explains how to write CLAUDE.md files that compile effectively into
the `@claude-flow/guidance` control plane. It covers the compilation model,
scoring dimensions, enforcement language, shard classification, and recommended
file structure.

## How compilation works

The `GuidanceCompiler` from `@claude-flow/guidance/compiler` reads your
CLAUDE.md and produces a **policy bundle** containing three parts:

1. **Constitution** -- The first 30-60 lines of your file. The constitution is
   injected into every task context regardless of intent. Place your most
   critical, universally applicable rules here.

2. **Shards** -- The remaining content, split by detected intent tags. Each
   shard is loaded on demand by the `ShardRetriever` when a task matches its
   intent classification.

3. **Manifest** -- Metadata including total rule counts, shard identifiers,
   compilation timestamp, and content hashes.

When an agent begins a task, the retriever loads the constitution plus only the
shards whose intent matches the task description. A bug-fix task loads the
`bug-fix` shard; a security audit loads the `security` shard. This keeps the
active policy surface small and relevant.

### Intent tags

Rules are classified into shards by intent. The compiler recognizes these
categories:

| Intent         | Typical content                                |
| -------------- | ---------------------------------------------- |
| `bug-fix`      | Debugging procedures, regression safeguards    |
| `feature`      | New feature implementation patterns            |
| `refactor`     | Code restructuring constraints                 |
| `security`     | Credential handling, input validation, CVEs    |
| `testing`      | Test requirements, coverage thresholds         |
| `deployment`   | Release procedures, environment configuration  |
| `documentation`| Documentation standards, comment policies      |
| `performance`  | Optimization constraints, profiling procedures |

The compiler infers intent from section headings, keywords, and surrounding
context. You do not need to add explicit tags, but clear headings improve
classification accuracy.

## Enforcement language

The compiler identifies **enforceable rules** by scanning for modal verbs with
binding force:

- **MUST** / **MUST NOT**
- **NEVER**
- **ALWAYS**
- **SHALL** / **SHALL NOT**

Rules that use these terms are treated as hard constraints. The guidance gates
can block operations that violate them. Rules using weaker language ("should",
"try to", "consider") are treated as advisory and do not trigger gate blocks.

### Before and after: enforcement examples

**Weak (advisory, not enforceable):**

```
Try to avoid committing secrets to the repository.
```

**Strong (enforceable):**

```
NEVER commit secrets, credentials, or .env files to the repository.
```

---

**Weak:**

```
It's a good idea to run tests after making changes.
```

**Strong:**

```
ALWAYS run the test suite after modifying source files. Tests MUST pass before
committing.
```

---

**Weak:**

```
Consider validating user input at API boundaries.
```

**Strong:**

```
All public API endpoints MUST validate input parameters. NEVER pass unsanitized
user input to database queries or shell commands.
```

---

**Weak:**

```
You should probably not use force push on the main branch.
```

**Strong:**

```
NEVER run `git push --force` against the main or production branches without
explicit written approval.
```

---

**Weak:**

```
Files should be reasonably sized.
```

**Strong:**

```
Source files MUST NOT exceed 500 lines. Split files that exceed this limit into
focused modules.
```

The ratio of enforceable rules to total rules determines your **enforceability
score**. Aim for a high ratio by stating rules in clear, binding terms.

## Analyzer scoring dimensions

The `cf-guidance-analyze` tool scores your CLAUDE.md across six dimensions.
Each dimension contributes to a composite score.

| Dimension       | What it measures                                          |
| --------------- | --------------------------------------------------------- |
| Structure       | Heading hierarchy and logical section organization        |
| Coverage        | Breadth of topics (security, testing, deployment, etc.)   |
| Enforceability  | Ratio of rules using MUST/NEVER/ALWAYS/SHALL language     |
| Compilability   | Whether the file compiles into a valid typed policy bundle |
| Clarity         | Readability and conciseness of individual rules           |
| Completeness    | Presence of all recommended sections                      |

Run the analyzer to see your scores:

```bash
npm run guidance:analyze
```

To score and auto-improve in one step:

```bash
npm run guidance:analyze -- --optimize
```

The `--optimize` flag rewrites weak rules into enforceable form and reorganizes
sections to improve structure. The optimized output is saved to
`.claude-flow/guidance/CLAUDE.optimized.md` for review before you adopt it.

## Recommended CLAUDE.md structure

The following template places the constitution in the first 30-60 lines and
organizes the remaining content into clearly headed sections that map to shard
intents.

```markdown
# Project Name

Brief one-line description of the project.

## Behavioral Rules (Always Enforced)

- NEVER commit secrets, credentials, or .env files
- ALWAYS read a file before editing it
- NEVER run destructive git commands without explicit approval
- Source files MUST NOT exceed 500 lines
- ALWAYS prefer editing existing files over creating new ones
- NEVER create documentation files unless explicitly requested

## File Organization

- Source code MUST reside in `/src`
- Tests MUST reside in `/tests`
- Documentation MUST reside in `/docs`
- Configuration MUST reside in `/config`
- NEVER save working files to the project root

## Build and Test

- Build: `npm run build`
- Test: `npm test`
- Lint: `npm run lint`
- ALWAYS run lint after modifying source files
- Tests MUST pass before any commit

## Security

- NEVER hardcode API keys or credentials in source files
- All public endpoints MUST validate input parameters
- NEVER pass unsanitized input to shell commands or database queries
- File paths MUST be sanitized to prevent directory traversal
- Dependencies MUST be audited before adding to the project

## Testing Requirements

- New features MUST include unit tests
- Bug fixes MUST include a regression test
- Test coverage MUST NOT drop below 80%
- ALWAYS mock external service dependencies in unit tests

## Deployment

- NEVER deploy directly to production without staging validation
- Release branches MUST pass the full CI pipeline
- Database migrations MUST be backward-compatible
- ALWAYS tag releases with semantic versioning

## Performance

- Database queries MUST use parameterized statements
- NEVER load unbounded result sets without pagination
- Background jobs MUST implement timeout and retry logic

## Documentation

- Public APIs MUST include JSDoc or TSDoc comments
- NEVER leave TODO comments in committed code without a linked issue
- Architecture decisions MUST be recorded in `/docs/adr`
```

### Why this structure works

- **Lines 1-30 form the constitution.** The "Behavioral Rules" and "File
  Organization" sections contain universal constraints that apply to every task.
  They are always loaded.

- **Remaining sections become shards.** The "Security" section maps to the
  `security` shard. "Testing Requirements" maps to `testing`. "Deployment" maps
  to `deployment`. The retriever loads only the relevant shard for each task.

- **Every rule uses enforcement language.** MUST, NEVER, and ALWAYS appear
  throughout. This maximizes the enforceability score.

- **Headings are clean and descriptive.** The compiler uses heading text to
  classify shards. Generic headings like "Miscellaneous" or "Other" reduce
  classification accuracy.

## Writing effective rules

### One rule per line

Each bullet point or line should express a single constraint. Compound rules
are harder to enforce and score.

**Before:**

```
Try to keep files small, run tests often, and make sure the code is clean
before pushing.
```

**After:**

```
- Source files MUST NOT exceed 500 lines
- ALWAYS run the test suite before committing
- Code MUST pass the configured linter with zero errors before push
```

### Be specific about scope

Rules that name tools, paths, or commands are easier for gates to enforce than
abstract guidance.

**Before:**

```
Be careful with git.
```

**After:**

```
NEVER run `git push --force`, `git reset --hard`, or `git checkout .` without
explicit approval.
```

### Put the most important rules first

The constitution is extracted from the top of the file. If your critical
security and safety rules appear on line 200, they will end up in a shard
instead of the constitution. Move them to the top.

### Use consistent formatting

- Use markdown bullet lists (`-`) for individual rules.
- Use headings (`##`) to define sections that map to intent shards.
- Avoid deeply nested headings. Two levels (`#` and `##`) are sufficient for
  most projects.

## CLAUDE.local.md

`CLAUDE.local.md` is a per-developer override file that MUST be gitignored. It
uses the same format as CLAUDE.md.

### Purpose

- Local experiments: try new rules without affecting the team.
- Developer preferences: editor settings, local URLs, debug flags.
- Environment overrides: local cluster endpoints, API keys for development.

### Promotion to shared CLAUDE.md

The autopilot tool (`cf-guidance-autopilot`) monitors local rules and promotes
high-performing ones into the shared CLAUDE.md. The promotion workflow:

1. The autopilot compiles both CLAUDE.md and CLAUDE.local.md.
2. It identifies local rules that are not present in the shared file.
3. It scores the shared file with and without the candidate rules.
4. If the composite score improves above a configurable threshold, the rules
   are promoted.
5. An ADR (Architecture Decision Record) is written to `/docs/adr` documenting
   the promotion.

Run a one-shot promotion check:

```bash
npm run guidance:autopilot:once
```

Run in daemon mode for continuous optimization:

```bash
npm run guidance:autopilot:daemon
```

### Example CLAUDE.local.md

```markdown
# Local Development Configuration

## Environment

- Local API: http://localhost:3000
- Debug logging: enabled

## Experimental Rules

- ALWAYS include performance benchmarks when modifying hot-path code
- NEVER merge PRs with unresolved review comments
```

If the autopilot determines that "ALWAYS include performance benchmarks when
modifying hot-path code" improves the composite score by more than the
configured threshold, it promotes that rule into the shared CLAUDE.md under a
clearly marked auto-promotion section.

## Scaffolding a new CLAUDE.md

For new projects, use the scaffolding tool to generate a recommended starting
file:

```bash
npx cf-guidance-scaffold
```

The scaffolder reads your `package.json`, detects frameworks and dependencies,
and generates a CLAUDE.md tailored to your project. Output is written to
`.claude-flow/guidance/scaffold/` for review before you copy it into your
project root.

You can also specify a custom output directory:

```bash
npx cf-guidance-scaffold --output ./my-output-dir
```

## Common mistakes

| Mistake                                 | Effect on scoring              | Fix                                                |
| --------------------------------------- | ------------------------------ | -------------------------------------------------- |
| Critical rules below line 60            | Excluded from constitution     | Move to the top of the file                        |
| Weak language ("try to", "consider")    | Low enforceability score       | Rewrite with MUST, NEVER, ALWAYS                   |
| Generic section headings                | Poor shard classification      | Use descriptive headings: "Security", "Testing"    |
| Compound rules in a single bullet       | Low clarity score              | Split into one rule per line                        |
| Missing sections (security, testing)    | Low coverage and completeness  | Add all recommended sections                       |
| No CLAUDE.local.md                      | Reduced autopilot benefit      | Create one for local experiments                   |
| Deeply nested heading structure         | Reduced structure score        | Keep to two heading levels                         |

## Quick reference

| Task                        | Command                                         |
| --------------------------- | ----------------------------------------------- |
| Analyze CLAUDE.md           | `npm run guidance:analyze`                      |
| Analyze and auto-improve    | `npm run guidance:analyze -- --optimize`         |
| Scaffold from scratch       | `npx cf-guidance-scaffold`                      |
| One-shot autopilot          | `npm run guidance:autopilot:once`               |
| Daemon autopilot            | `npm run guidance:autopilot:daemon`             |
| A/B benchmark               | `npm run guidance:ab-benchmark`                 |
| Run all integration suites  | `npm run guidance:all`                          |

## Further reading

- [Guidance Control Plane](../guidance-control-plane.md) -- Architecture of the
  policy enforcement pipeline.
- [Guidance Implementation Guide](../guidance-implementation-guide.md) --
  Integrating the guidance runtime into your repository.
- [User Manual](../user-manual.md) -- Full operational reference for all CLI
  tools.
