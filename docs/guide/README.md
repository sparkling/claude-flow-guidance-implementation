# Developer Guide

Documentation for `claude-flow-guidance-implementation` -- runtime
governance for AI coding agents.

## Guides

| Document | Description | Audience |
|---|---|---|
| [User Manual](../../README.md) | Complete reference covering all components, hook integration, environment variables, CLI, and programmatic API | All developers |
| [Quick Start](quick-start.md) | Hands-on tutorial: install, trigger a blocked command, inspect the proof chain | New users |
| [Authoring CLAUDE.md](authoring-claude-md.md) | How to write rules that compile well into the guidance control plane | Rule authors |
| [Trust System](trust-system.md) | Trust tiers, scoring, rate limiting, persistence, and inspection | Platform engineers |
| [Gate Configuration](gate-configuration.md) | The four enforcement gates, ContinueGate, threat detection, and tuning | Platform engineers |
| [Evolution Workflow](evolution-workflow.md) | Rule evolution lifecycle: propose, simulate, stage, rollout, autopilot, A/B benchmark | Rule authors, platform engineers |
| [Deployment](deployment.md) | Production setup, CI/CD integration, signing keys, monitoring, security hardening | DevOps, SREs |
| [Migration](migration.md) | Adding guidance to existing repos with or without prior hook wiring | All developers |
| [API Reference](api-reference.md) | Full API surface: exports, method signatures, types, CLI binaries, changelog | Integrators |

## Recommended Reading Order

1. **Quick Start** -- get a working installation in 10 minutes
2. **User Manual** (root [README.md](../../README.md)) -- understand the full system
3. **Authoring CLAUDE.md** -- write effective governance rules
4. **Gate Configuration** -- tune what gets blocked
5. **Trust System** -- understand per-agent scoring
6. **Evolution Workflow** -- automate rule improvement
7. **Deployment** -- go to production
8. **Migration** -- integrate into existing repos
9. **API Reference** -- build custom integrations

## Related Documentation

- [Architecture](../architecture.md) -- solutions architecture with diagrams
- [Guidance Control Plane](../guidance-control-plane.md) -- operational overview
- [Implementation Guide](../guidance-implementation-guide.md) -- authoritative implementation reference
