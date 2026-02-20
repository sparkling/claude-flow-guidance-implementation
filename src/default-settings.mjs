export const GUIDANCE_ENV_DEFAULTS = {
  CLAUDE_FLOW_HOOKS_ENABLED: 'true',
  GUIDANCE_EVENT_WIRING_ENABLED: '1',
  GUIDANCE_EVENT_SYNC_TIMEOUT_MS: '8000',
  GUIDANCE_EVENT_FAIL_CLOSED: '0',
  GUIDANCE_AUTOPILOT_ENABLED: '1',
  GUIDANCE_AUTOPILOT_MIN_DELTA: '0.5',
  GUIDANCE_AUTOPILOT_AB: '0',
  GUIDANCE_AUTOPILOT_MIN_AB_GAIN: '0.05',
  GUIDANCE_CODEX_SKIP_CF_HOOKS: '0',
};

export function buildHookDefaults(hookTimeout = 5000) {
  return {
    PreToolUse: [
      {
        matcher: 'Write|Edit|MultiEdit',
        hooks: [
          {
            type: 'command',
            command: 'node "$CLAUDE_PROJECT_DIR"/.claude/helpers/hook-handler.cjs pre-edit',
            timeout: hookTimeout,
          },
        ],
      },
      {
        matcher: 'Bash',
        hooks: [
          {
            type: 'command',
            command: 'node "$CLAUDE_PROJECT_DIR"/.claude/helpers/hook-handler.cjs pre-bash',
            timeout: hookTimeout,
          },
        ],
      },
      {
        matcher: 'Task',
        hooks: [
          {
            type: 'command',
            command: 'node "$CLAUDE_PROJECT_DIR"/.claude/helpers/hook-handler.cjs pre-task',
            timeout: hookTimeout,
          },
        ],
      },
    ],
    PostToolUse: [
      {
        matcher: 'Write|Edit|MultiEdit',
        hooks: [
          {
            type: 'command',
            command: 'node "$CLAUDE_PROJECT_DIR"/.claude/helpers/hook-handler.cjs post-edit',
            timeout: hookTimeout,
          },
        ],
      },
      {
        matcher: 'Task',
        hooks: [
          {
            type: 'command',
            command: 'node "$CLAUDE_PROJECT_DIR"/.claude/helpers/hook-handler.cjs post-task',
            timeout: hookTimeout,
          },
        ],
      },
    ],
    SessionStart: [
      {
        matcher: '',
        hooks: [
          {
            type: 'command',
            command: 'node "$CLAUDE_PROJECT_DIR"/.claude/helpers/hook-handler.cjs session-restore',
            timeout: hookTimeout,
          },
        ],
      },
    ],
    SessionEnd: [
      {
        matcher: '',
        hooks: [
          {
            type: 'command',
            command: 'node "$CLAUDE_PROJECT_DIR"/.claude/helpers/hook-handler.cjs session-end',
            timeout: hookTimeout,
          },
        ],
      },
    ],
  };
}

export const GUIDANCE_HOOKS_DEFAULTS = buildHookDefaults();

export const GUIDANCE_PACKAGE_SCRIPTS = {
  'guidance:analyze': 'cf-guidance analyze',
  'guidance:optimize': 'cf-guidance autopilot --once --apply --source manual',
  'guidance:autopilot:once': 'cf-guidance autopilot --once --source manual',
  'guidance:autopilot:daemon': 'cf-guidance autopilot --daemon --apply --source daemon',
  'guidance:ab-benchmark': 'cf-guidance benchmark',
  'guidance:scaffold': 'cf-guidance scaffold',
  'guidance:all': 'cf-guidance run all',
  'guidance:status': 'cf-guidance run status',
  'guidance:hooks': 'cf-guidance run hooks',
  'guidance:trust': 'cf-guidance run trust',
  'guidance:adversarial': 'cf-guidance run adversarial',
  'guidance:proof': 'cf-guidance run proof',
  'guidance:conformance': 'cf-guidance run conformance',
  'guidance:evolution': 'cf-guidance run evolution',
  'guidance:runtime': 'cf-guidance runtime demo',
  'guidance:codex:status': 'cf-guidance codex status',
  'guidance:codex:pre-command': 'cf-guidance codex pre-command',
  'guidance:codex:pre-edit': 'cf-guidance codex pre-edit',
  'guidance:codex:pre-task': 'cf-guidance codex pre-task',
  'guidance:codex:post-edit': 'cf-guidance codex post-edit',
  'guidance:codex:post-task': 'cf-guidance codex post-task',
  'guidance:codex:session-start': 'cf-guidance codex session-start',
  'guidance:codex:session-end': 'cf-guidance codex session-end',
};

export const GUIDANCE_PACKAGE_DEPS = {
  '@sparkleideas/claude-flow-guidance': '^3.0.0-alpha.1',
};

export const GUIDANCE_COMPONENTS = {
  trust: {
    label: 'Trust System',
    description: 'Per-agent trust scoring with privilege tiers',
    scripts: ['guidance:trust'],
    runtimeSubsystems: ['trustSystem'],
  },
  adversarial: {
    label: 'Adversarial Detection',
    description: 'Prompt injection detection, collusion detection, and memory quorum',
    scripts: ['guidance:adversarial'],
    runtimeSubsystems: ['threatDetector', 'collusionDetector', 'memoryQuorum'],
  },
  proof: {
    label: 'Proof Chain',
    description: 'HMAC-SHA256 hash-chained cryptographic proof chain',
    scripts: ['guidance:proof'],
    runtimeSubsystems: ['proofChain'],
  },
  conformance: {
    label: 'Conformance Testing',
    description: 'Memory Clerk acceptance testing with replay verification',
    scripts: ['guidance:conformance'],
    runtimeSubsystems: ['conformanceRunner'],
  },
  evolution: {
    label: 'Rule Evolution',
    description: 'Propose, simulate, stage, and rollout rule changes',
    scripts: ['guidance:evolution'],
    runtimeSubsystems: ['evolutionPipeline'],
  },
  autopilot: {
    label: 'Autopilot & Benchmarking',
    description: 'One-shot and daemon-mode CLAUDE.md rule optimization with A/B benchmarking',
    scripts: ['guidance:optimize', 'guidance:autopilot:once', 'guidance:autopilot:daemon', 'guidance:ab-benchmark'],
    runtimeSubsystems: [],
  },
  analysis: {
    label: 'Analysis & Scaffolding',
    description: 'Policy analysis scoring and project scaffolding',
    scripts: ['guidance:analyze', 'guidance:scaffold'],
    runtimeSubsystems: [],
  },
  codex: {
    label: 'Codex Bridge',
    description: 'OpenAI Codex lifecycle bridge for equivalent guidance enforcement',
    scripts: [
      'guidance:codex:status',
      'guidance:codex:pre-command',
      'guidance:codex:pre-edit',
      'guidance:codex:pre-task',
      'guidance:codex:post-edit',
      'guidance:codex:post-task',
      'guidance:codex:session-start',
      'guidance:codex:session-end',
    ],
    runtimeSubsystems: [],
  },
};

export const GUIDANCE_CORE_SCRIPTS = [
  'guidance:status',
  'guidance:all',
  'guidance:hooks',
  'guidance:runtime',
];

export const GUIDANCE_PRESETS = {
  minimal: [],
  standard: ['trust', 'proof', 'analysis'],
  full: ['trust', 'adversarial', 'proof', 'conformance', 'evolution', 'autopilot', 'analysis', 'codex'],
};

export function resolveComponents({ components, exclude, preset } = {}) {
  const validNames = Object.keys(GUIDANCE_COMPONENTS);

  let resolved;
  if (Array.isArray(components)) {
    for (const name of components) {
      if (!validNames.includes(name)) {
        throw new Error(`Unknown component: ${name}. Valid components: ${validNames.join(', ')}`);
      }
    }
    resolved = [...components];
  } else {
    const presetName = preset || 'standard';
    if (!(presetName in GUIDANCE_PRESETS)) {
      throw new Error(`Unknown preset: ${presetName}. Valid presets: ${Object.keys(GUIDANCE_PRESETS).join(', ')}`);
    }
    resolved = [...GUIDANCE_PRESETS[presetName]];
  }

  if (Array.isArray(exclude)) {
    for (const name of exclude) {
      if (!validNames.includes(name)) {
        throw new Error(`Unknown component in exclude list: ${name}. Valid components: ${validNames.join(', ')}`);
      }
    }
    resolved = resolved.filter((name) => !exclude.includes(name));
  }

  return resolved.sort();
}
