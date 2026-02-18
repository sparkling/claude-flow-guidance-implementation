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
  'guidance:analyze': 'cf-guidance-analyze',
  'guidance:optimize': 'cf-guidance-autopilot --once --apply --source manual',
  'guidance:autopilot:once': 'cf-guidance-autopilot --once --source manual',
  'guidance:autopilot:daemon': 'cf-guidance-autopilot --daemon --apply --source daemon',
  'guidance:ab-benchmark': 'cf-guidance-benchmark',
  'guidance:scaffold': 'cf-guidance-scaffold',
  'guidance:all': 'cf-guidance all',
  'guidance:status': 'cf-guidance status',
  'guidance:hooks': 'cf-guidance hooks',
  'guidance:trust': 'cf-guidance trust',
  'guidance:adversarial': 'cf-guidance adversarial',
  'guidance:proof': 'cf-guidance proof',
  'guidance:conformance': 'cf-guidance conformance',
  'guidance:evolution': 'cf-guidance evolution',
  'guidance:runtime': 'cf-guidance-runtime demo',
  'guidance:codex:status': 'cf-guidance-codex status',
  'guidance:codex:pre-command': 'cf-guidance-codex pre-command',
  'guidance:codex:pre-edit': 'cf-guidance-codex pre-edit',
  'guidance:codex:pre-task': 'cf-guidance-codex pre-task',
  'guidance:codex:post-edit': 'cf-guidance-codex post-edit',
  'guidance:codex:post-task': 'cf-guidance-codex post-task',
  'guidance:codex:session-start': 'cf-guidance-codex session-start',
  'guidance:codex:session-end': 'cf-guidance-codex session-end',
};

export const GUIDANCE_PACKAGE_DEPS = {
  'claude-flow-guidance-implementation': '^0.2.0',
};
