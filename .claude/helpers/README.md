# Claude Flow V3 Helpers

This directory contains helper scripts and utilities for V3 development.

## Directory Layout

```
.claude/helpers/
├── hook-handler.cjs      — Hook dispatcher (Claude Code lifecycle)
├── router.cjs            — Agent routing
├── session.cjs           — Session lifecycle
├── memory.cjs            — Key-value store
├── intelligence.cjs      — Pattern graph + PageRank
├── auto-memory-hook.mjs  — Session-boundary memory sync
├── github-safe.js        — Git safety checker
├── README.md             — This file
├── v3-ops/               — 27 V3 operational shell scripts
│   ├── v3.sh             — Master CLI for V3 dev tools
│   ├── update-v3-progress.sh
│   ├── validate-v3-config.sh
│   ├── v3-quick-status.sh
│   └── ...
└── v3-subsystems/        — V3 infrastructure services
    ├── statusline.cjs    — V3 progress dashboard
    ├── learning-service.mjs — SONA/LoRA learning service
    └── metrics-db.mjs    — Metrics persistence layer
```

## Quick Start

```bash
# Initialize V3 development environment
.claude/helpers/v3-ops/v3.sh init

# Quick status check
.claude/helpers/v3-ops/v3.sh status

# Update progress metrics
.claude/helpers/v3-ops/v3.sh update domain 3
.claude/helpers/v3-ops/v3.sh update agent 8
.claude/helpers/v3-ops/v3.sh update security 2
```

## Available Helpers

### V3 Master Tool
- **`v3-ops/v3.sh`** - Main command-line interface for all V3 operations
  ```bash
  .claude/helpers/v3-ops/v3.sh help           # Show all commands
  .claude/helpers/v3-ops/v3.sh status         # Quick development status
  .claude/helpers/v3-ops/v3.sh update domain 3 # Update specific metrics
  .claude/helpers/v3-ops/v3.sh validate       # Validate configuration
  .claude/helpers/v3-ops/v3.sh full-status    # Complete status overview
  ```

### V3 Progress Management
- **`v3-ops/update-v3-progress.sh`** - Update V3 development metrics
  ```bash
  .claude/helpers/v3-ops/update-v3-progress.sh domain 3      # Mark 3 domains complete
  .claude/helpers/v3-ops/update-v3-progress.sh agent 8       # 8 agents active
  .claude/helpers/v3-ops/update-v3-progress.sh security 2    # 2 CVEs fixed
  .claude/helpers/v3-ops/update-v3-progress.sh performance 2.5x # Performance boost
  .claude/helpers/v3-ops/update-v3-progress.sh status        # Show current status
  ```

### Configuration Validation
- **`v3-ops/validate-v3-config.sh`** - Comprehensive environment validation
  - Checks all required directories and files
  - Validates JSON configuration files
  - Verifies Node.js and development tools
  - Confirms Git repository status
  - Validates file permissions

### Quick Status
- **`v3-ops/v3-quick-status.sh`** - Compact development progress overview
  - Shows domain, agent, and DDD progress
  - Displays security and performance metrics
  - Color-coded status indicators
  - Current Git branch information

## Helper Script Standards

### File Naming
- Use kebab-case: `update-v3-progress.sh`
- Include version prefix: `v3-*` for V3-specific helpers
- Use descriptive names that indicate purpose

### Script Requirements
- Must be executable (`chmod +x`)
- Include proper error handling (`set -e`)
- Provide usage help when called without arguments
- Use consistent exit codes (0 = success, non-zero = error)

### Configuration Integration
Helpers are configured in `.claude/settings.json`:
```json
{
  "helpers": {
    "directory": ".claude/helpers",
    "enabled": true,
    "v3ProgressUpdater": ".claude/helpers/v3-ops/update-v3-progress.sh"
  }
}
```

## Development Guidelines

1. **Security First**: All helpers must validate inputs
2. **Idempotent**: Scripts should be safe to run multiple times
3. **Fast Execution**: Keep helper execution under 1 second when possible
4. **Clear Output**: Provide clear success/error messages
5. **JSON Safe**: When updating JSON files, use `jq` for safety

## Adding New Helpers

1. Create script in `.claude/helpers/v3-ops/` (shell scripts) or `.claude/helpers/` (JS runtime)
2. Make executable: `chmod +x script-name.sh`
3. Add to settings.json helpers section if needed
4. Test thoroughly before committing
5. Update this README with usage documentation
