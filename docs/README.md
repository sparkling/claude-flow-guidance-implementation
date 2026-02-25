# Claude Flow Guidance Implementation

> Implementation kit for wiring `@claude-flow/guidance` into Claude Code and Codex repositories with hook automation, memory gating, and self-optimising rule evolution.

## What This Project Does

This package (`@sparkleideas/claude-flow-guidance`) bridges the upstream **`@claude-flow/guidance`** control plane into any Claude Code or OpenAI Codex project. It provides:

1. **One-command installer** that wires Claude Code hooks, Codex bridge config, env vars, and enforcement shims into a target repo.
2. **Layered runtime** that instantiates the full guidance pipeline (compile, retrieve, enforce, trust, adversarial, proof, evolution) with per-component toggling.
3. **Memory write gate** with semantic contradiction detection via embedding-backed cosine similarity.
4. **Autopilot loop** that analyses `CLAUDE.local.md` experiments, benchmarks them, and auto-promotes winning rules into `CLAUDE.md` with ADR documentation.
5. **33 test files** covering unit, integration, null-object, and end-to-end scenarios.

## Quick Start

```bash
# Install the package into a target repo
npx @sparkleideas/claude-flow-guidance init --target ./my-project

# Verify wiring
npx @sparkleideas/claude-flow-guidance verify --target ./my-project

# Run all integration suites
npm run guidance:all

# Analyse CLAUDE.md policy quality
npm run guidance:analyze

# One-shot autopilot (promote local rules)
npm run guidance:autopilot:once
```

## Package Exports

| Export Path | Module | Description |
|---|---|---|
| `.` / `./installer` | `src/installer.mjs` | Init, install, verify functions |
| `./settings` | `src/default-settings.mjs` | Hook defaults, env vars, presets |
| `./runtime` | `src/guidance/advanced-runtime.js` | Full 23-subsystem runtime |
| `./phase1` | `src/guidance/phase1-runtime.js` | Core compile-retrieve-gate pipeline |
| `./executor` | `src/guidance/content-aware-executor.js` | Synthetic executor for benchmarks |
| `./enforcement` | `src/enforcement.cjs` | Claude Code hook handler (CJS) |
| `./enforcement-layer` | `src/guidance/enforcement-layer.js` | Null objects for enforcement subsystems |
| `./embeddings` | `src/guidance/embedding-provider.js` | Embedding provider (hash / AgentDB) |
| `./memory-gate` | `src/guidance/memory-write-gate.js` | Memory write gate with semantic checks |
| `./observation` | `src/guidance/observation-layer.js` | Null objects for persistence, artifacts |
| `./validation` | `src/guidance/validation-layer.js` | Null objects for coherence, optimizer |
| `./knowledge` | `src/guidance/knowledge-layer.js` | Null objects for truth, uncertainty, temporal |
| `./infrastructure` | `src/guidance/infrastructure-layer.js` | Null objects for capabilities, WASM, generators |

## Documentation Index

| Document | Description |
|---|---|
| [Architecture](./architecture.md) | System architecture with Mermaid diagrams |
| [Upstream Guidance](./upstream-guidance-architecture.md) | Analysis of `@claude-flow/guidance` package |
| [Module Reference](./module-reference.md) | All modules categorised and documented |
| [Memory & Learning](./memory-learning-system.md) | Memory gate, embeddings, and learning pipeline |
| [Implementation Mapping](./implementation-mapping.md) | How this repo maps to upstream modules |

## Project Structure

```
claude-flow-guidance-implementation/
├── bin/                          # CLI entry points
│   ├── guidance.mjs              # Main CLI dispatcher
│   └── cf-guidance-impl.mjs      # Init/install/verify implementation
├── src/
│   ├── installer.mjs             # Repo installation logic
│   ├── default-settings.mjs      # Defaults, hooks, components, presets
│   ├── utils.mjs                 # Shared utilities
│   ├── enforcement.cjs           # Claude Code hook handler
│   └── guidance/                 # Guidance runtime modules
│       ├── phase1-runtime.js     # Core pipeline (compile→retrieve→gate)
│       ├── advanced-runtime.js   # Full 23-subsystem runtime
│       ├── integration-runners.js # Integration test runners
│       ├── content-aware-executor.js # Synthetic executor for benchmarks
│       ├── enforcement-layer.js  # Null objects: gateway, authority, etc.
│       ├── observation-layer.js  # Null objects: persistence, artifacts
│       ├── validation-layer.js   # Null objects: coherence, optimizer
│       ├── knowledge-layer.js    # Null objects: truth, uncertainty, temporal
│       ├── infrastructure-layer.js # Null objects: capabilities, WASM, etc.
│       ├── embedding-provider.js # IEmbeddingProvider + implementations
│       └── memory-write-gate.js  # Memory write gate with semantic checks
├── scripts/                      # Operational scripts
│   ├── event-handlers.js         # Hook event dispatch
│   ├── guidance-autopilot.js     # Autopilot rule promotion
│   ├── guidance-integrations.js  # Integration runner
│   ├── guidance-runtime.js       # Runtime demo
│   ├── guidance-ab-benchmark.js  # A/B benchmarking
│   ├── analyze-guidance.js       # CLAUDE.md policy analysis
│   ├── scaffold-guidance.js      # Project scaffolding
│   ├── guidance-codex-bridge.js  # Codex lifecycle bridge
│   └── run-compliance.js         # Compliance checking
├── tests/                        # 33 test files
├── hooks/                        # Git hooks
└── docs/                         # Documentation (this directory)
```

## Dependencies

| Package | Role |
|---|---|
| `@claude-flow/guidance` ^3.0.0-alpha.1 | Upstream guidance control plane |
| `@claude-flow/hooks` ^3.0.0-alpha.7 | Hook registry and executor |

## License

MIT
