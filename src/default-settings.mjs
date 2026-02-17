export const GUIDANCE_ENV_DEFAULTS = {
  CLAUDE_FLOW_HOOKS_ENABLED: 'true',
  GUIDANCE_EVENT_WIRING_ENABLED: '1',
  GUIDANCE_EVENT_SYNC_TIMEOUT_MS: '8000',
  GUIDANCE_EVENT_FAIL_CLOSED: '0',
};

export const GUIDANCE_HOOKS_DEFAULTS = {
  PreToolUse: [
    {
      matcher: 'Write|Edit|MultiEdit',
      hooks: [
        {
          type: 'command',
          command: 'node "$CLAUDE_PROJECT_DIR"/.claude/helpers/hook-handler.cjs pre-edit',
        },
      ],
    },
    {
      matcher: 'Bash',
      hooks: [
        {
          type: 'command',
          command: 'node "$CLAUDE_PROJECT_DIR"/.claude/helpers/hook-handler.cjs pre-bash',
        },
      ],
    },
    {
      matcher: 'Task',
      hooks: [
        {
          type: 'command',
          command: 'node "$CLAUDE_PROJECT_DIR"/.claude/helpers/hook-handler.cjs pre-task',
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
        },
      ],
    },
    {
      matcher: 'Task',
      hooks: [
        {
          type: 'command',
          command: 'node "$CLAUDE_PROJECT_DIR"/.claude/helpers/hook-handler.cjs post-task',
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
        },
      ],
    },
  ],
};

export const GUIDANCE_PACKAGE_SCRIPTS = {
  'guidance:analyze': 'node scripts/analyze-guidance.js',
  'guidance:optimize': 'node scripts/guidance-autopilot.js --once --apply --source manual',
  'guidance:autopilot:once': 'node scripts/guidance-autopilot.js --once --source manual',
  'guidance:autopilot:daemon': 'node scripts/guidance-autopilot.js --daemon --apply --source daemon',
  'guidance:ab-benchmark': 'node scripts/guidance-ab-benchmark.js',
  'guidance:all': 'node scripts/guidance-integrations.js all',
  'guidance:status': 'node scripts/guidance-integrations.js status',
  'guidance:hooks': 'node scripts/guidance-integrations.js hooks',
  'guidance:trust': 'node scripts/guidance-integrations.js trust',
  'guidance:adversarial': 'node scripts/guidance-integrations.js adversarial',
  'guidance:proof': 'node scripts/guidance-integrations.js proof',
  'guidance:conformance': 'node scripts/guidance-integrations.js conformance',
  'guidance:evolution': 'node scripts/guidance-integrations.js evolution',
  'guidance:runtime': 'node scripts/guidance-runtime.js demo',
};

export const GUIDANCE_PACKAGE_DEPS = {
  '@claude-flow/guidance': '^3.0.0-alpha.1',
  '@claude-flow/hooks': '^3.0.0-alpha.7',
};
