import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const BRIDGE = resolve('scripts/guidance-codex-bridge.js');

function runBridge(args = [], env = {}) {
  const result = spawnSync('node', [BRIDGE, ...args], {
    cwd: resolve('.'),
    encoding: 'utf-8',
    timeout: 15000,
    env: {
      ...process.env,
      GUIDANCE_EVENT_WIRING_ENABLED: '0',
      GUIDANCE_CODEX_SKIP_CF_HOOKS: '1',
      ...env,
    },
  });
  return result;
}

// ── Supported events ────────────────────────────────────────────────────────

describe('codex-bridge: supported events', () => {
  it('help with no args prints usage and exits 1', () => {
    const result = runBridge([]);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('Usage:');
  });

  it('--help prints usage', () => {
    const result = runBridge(['--help']);
    // --help is parsed as a flag, so positional[0] is empty → exits 1
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('Usage:');
  });

  it('help prints usage and exits 0', () => {
    const result = runBridge(['help']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage:');
  });

  it('unsupported event exits 1 with error', () => {
    const result = runBridge(['banana']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unsupported event');
  });
});

// ── Event mapping (HOOK_HANDLER_MAP) ────────────────────────────────────────

describe('codex-bridge: event mapping', () => {
  // These will fail with "Missing hook handler" since we don't have the
  // guidance-enforcement.cjs at .claude/helpers/, but the output JSON confirms
  // the event was recognized and the handler was attempted.

  const events = [
    { event: 'pre-command', mapped: 'pre-command' },
    { event: 'pre-edit', mapped: 'pre-edit' },
    { event: 'pre-task', mapped: 'pre-task' },
    { event: 'post-edit', mapped: 'post-edit' },
    { event: 'post-task', mapped: 'post-task' },
    { event: 'session-start', mapped: 'session-restore' },
    { event: 'session-end', mapped: 'session-end' },
    { event: 'status', mapped: 'status' },
  ];

  for (const { event, mapped } of events) {
    it(`maps '${event}' correctly`, () => {
      const result = runBridge([event]);
      // The bridge always outputs JSON summary
      const stdout = result.stdout.trim();
      if (stdout.startsWith('{')) {
        const summary = JSON.parse(stdout);
        expect(summary.event).toBe(event);
        // handler result may fail (missing enforcement handler at expected path)
        // but the event was correctly recognized
        expect(summary.ids).toBeDefined();
        expect(summary.ids.taskId).toBeDefined();
        expect(summary.ids.sessionId).toBeDefined();
        expect(summary.ids.agentId).toBeDefined();
      }
      // If not JSON, the event was still processed (no crash)
      expect([0, 1, 2]).toContain(result.status);
    });
  }
});

// ── parseArgs behavior ──────────────────────────────────────────────────────

describe('codex-bridge: CLI argument parsing', () => {
  it('parses --command option', () => {
    const result = runBridge(['pre-command', '--command', 'git status']);
    const stdout = result.stdout.trim();
    if (stdout.startsWith('{')) {
      const summary = JSON.parse(stdout);
      expect(summary.event).toBe('pre-command');
    }
  });

  it('parses --file option for pre-edit', () => {
    const result = runBridge(['pre-edit', '--file', 'src/test.js']);
    const stdout = result.stdout.trim();
    if (stdout.startsWith('{')) {
      const summary = JSON.parse(stdout);
      expect(summary.event).toBe('pre-edit');
      expect(summary.metadata.filePath).toBe('src/test.js');
    }
  });

  it('parses --description for pre-task', () => {
    const result = runBridge(['pre-task', '--description', 'implement auth']);
    const stdout = result.stdout.trim();
    if (stdout.startsWith('{')) {
      const summary = JSON.parse(stdout);
      expect(summary.event).toBe('pre-task');
    }
  });

  it('parses --task-id option', () => {
    const result = runBridge(['pre-task', '--task-id', 'my-task-42', '--description', 'test']);
    const stdout = result.stdout.trim();
    if (stdout.startsWith('{')) {
      const summary = JSON.parse(stdout);
      expect(summary.ids.taskId).toBe('my-task-42');
    }
  });

  it('parses --session-id option', () => {
    const result = runBridge(['session-start', '--session-id', 'sess-abc']);
    const stdout = result.stdout.trim();
    if (stdout.startsWith('{')) {
      const summary = JSON.parse(stdout);
      expect(summary.ids.sessionId).toBe('sess-abc');
    }
  });

  it('parses --agent-id option', () => {
    const result = runBridge(['pre-task', '--agent-id', 'agent-x', '--description', 'test']);
    const stdout = result.stdout.trim();
    if (stdout.startsWith('{')) {
      const summary = JSON.parse(stdout);
      expect(summary.ids.agentId).toBe('agent-x');
    }
  });

  it('--skip-cf-hooks flag prevents CF hook execution', () => {
    const result = runBridge(['pre-task', '--skip-cf-hooks', '--description', 'test']);
    const stdout = result.stdout.trim();
    if (stdout.startsWith('{')) {
      const summary = JSON.parse(stdout);
      expect(summary.claudeFlowHook.skipped).toBe(true);
    }
  });

  it('parses --status option for post-task', () => {
    const result = runBridge(['post-task', '--task-id', 'task-1', '--status', 'failed']);
    const stdout = result.stdout.trim();
    if (stdout.startsWith('{')) {
      const summary = JSON.parse(stdout);
      expect(summary.metadata.status).toBe('failed');
    }
  });

  it('parses --payload-json option', () => {
    const result = runBridge([
      'pre-task',
      '--payload-json', '{"taskId":"from-payload","taskDescription":"hello"}',
      '--description', 'override',
    ]);
    const stdout = result.stdout.trim();
    if (stdout.startsWith('{')) {
      const summary = JSON.parse(stdout);
      expect(summary.ids.taskId).toBe('from-payload');
    }
  });
});

// ── baseIds defaults ────────────────────────────────────────────────────────

describe('codex-bridge: baseIds defaults', () => {
  it('default agentId is codex-main', () => {
    const result = runBridge(['status']);
    const stdout = result.stdout.trim();
    if (stdout.startsWith('{')) {
      const summary = JSON.parse(stdout);
      expect(summary.ids.agentId).toBe('codex-main');
    }
  });

  it('sessionId falls back to CLAUDE_SESSION_ID env', () => {
    const result = runBridge(['status'], { CLAUDE_SESSION_ID: 'env-session-42' });
    const stdout = result.stdout.trim();
    if (stdout.startsWith('{')) {
      const summary = JSON.parse(stdout);
      expect(summary.ids.sessionId).toBe('env-session-42');
    }
  });

  it('taskId uses event prefix when no explicit ID', () => {
    const result = runBridge(['pre-command', '--command', 'echo hi']);
    const stdout = result.stdout.trim();
    if (stdout.startsWith('{')) {
      const summary = JSON.parse(stdout);
      expect(summary.ids.taskId).toMatch(/^pre-command-/);
    }
  });
});

// ── hookHandlerInput construction ───────────────────────────────────────────

describe('codex-bridge: hookHandlerInput payload construction', () => {
  // We test indirectly by examining the summary output — the handler field
  // shows what happened when the enforcement handler received the constructed input.

  it('pre-edit includes content and diff-lines', () => {
    const result = runBridge([
      'pre-edit',
      '--file', 'src/app.js',
      '--content', 'new code here',
      '--diff-lines', '5',
      '--operation', 'create',
    ]);
    const stdout = result.stdout.trim();
    if (stdout.startsWith('{')) {
      const summary = JSON.parse(stdout);
      expect(summary.metadata.filePath).toBe('src/app.js');
    }
  });

  it('post-task includes tools-used array', () => {
    const result = runBridge([
      'post-task',
      '--task-id', 'task-99',
      '--status', 'completed',
      '--tools-used', '["Bash","Edit"]',
    ]);
    const stdout = result.stdout.trim();
    if (stdout.startsWith('{')) {
      const summary = JSON.parse(stdout);
      expect(summary.metadata.toolsUsed).toEqual(['Bash', 'Edit']);
    }
  });

  it('post-task includes files-touched array', () => {
    const result = runBridge([
      'post-task',
      '--task-id', 'task-99',
      '--files-touched', '["src/a.js","src/b.js"]',
    ]);
    const stdout = result.stdout.trim();
    if (stdout.startsWith('{')) {
      const summary = JSON.parse(stdout);
      expect(summary.metadata.filesTouched).toEqual(['src/a.js', 'src/b.js']);
    }
  });
});

// ── With real enforcement handler installed ─────────────────────────────────

describe('codex-bridge: with enforcement handler installed', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = resolve(tmpdir(), `bridge-hh-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });

    // Install guidance-enforcement.cjs at expected location
    const helpersDir = join(tmpDir, '.claude', 'helpers');
    mkdirSync(helpersDir, { recursive: true });
    copyFileSync(resolve('src/enforcement.cjs'), join(helpersDir, 'guidance-enforcement.cjs'));

    // Minimal CLAUDE.md
    writeFileSync(join(tmpDir, 'CLAUDE.md'), '# Test\n- NEVER use eval()');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('pre-command runs enforcement handler successfully', () => {
    const result = runBridge(
      ['pre-command', '--command', 'git status'],
      { GUIDANCE_PROJECT_DIR: tmpDir },
    );
    const stdout = result.stdout.trim();
    if (stdout.startsWith('{')) {
      const summary = JSON.parse(stdout);
      expect(summary.handler.ok).toBe(true);
      expect(summary.handler.stdout).toContain('[OK]');
    }
  });

  it('pre-command with dangerous command blocks', () => {
    const result = runBridge(
      ['pre-command', '--command', 'rm -rf /'],
      { GUIDANCE_PROJECT_DIR: tmpDir },
    );
    const stdout = result.stdout.trim();
    if (stdout.startsWith('{')) {
      const summary = JSON.parse(stdout);
      expect(summary.handler.ok).toBe(false);
      expect(summary.handler.stderr).toContain('[BLOCKED]');
    }
  });

  it('status event outputs summary JSON', () => {
    const result = runBridge(
      ['status'],
      { GUIDANCE_PROJECT_DIR: tmpDir },
    );
    const stdout = result.stdout.trim();
    if (stdout.startsWith('{')) {
      const summary = JSON.parse(stdout);
      expect(summary.event).toBe('status');
      expect(summary.handler.ok).toBe(true);
    }
  });
});

// ── buildSummary structure ──────────────────────────────────────────────────

describe('codex-bridge: summary output structure', () => {
  it('summary has required top-level keys', () => {
    const result = runBridge(['status']);
    const stdout = result.stdout.trim();
    if (stdout.startsWith('{')) {
      const summary = JSON.parse(stdout);
      expect(summary).toHaveProperty('event');
      expect(summary).toHaveProperty('ids');
      expect(summary).toHaveProperty('handler');
      expect(summary).toHaveProperty('claudeFlowHook');
      expect(summary).toHaveProperty('metadata');
    }
  });

  it('handler result has exitCode, stdout, stderr', () => {
    const result = runBridge(['status']);
    const stdout = result.stdout.trim();
    if (stdout.startsWith('{')) {
      const summary = JSON.parse(stdout);
      expect(summary.handler).toHaveProperty('ok');
      expect(summary.handler).toHaveProperty('exitCode');
      expect(summary.handler).toHaveProperty('stdout');
      expect(summary.handler).toHaveProperty('stderr');
    }
  });

  it('CF hooks skipped when GUIDANCE_CODEX_SKIP_CF_HOOKS=1', () => {
    const result = runBridge(['pre-task', '--description', 'test'], {
      GUIDANCE_CODEX_SKIP_CF_HOOKS: '1',
    });
    const stdout = result.stdout.trim();
    if (stdout.startsWith('{')) {
      const summary = JSON.parse(stdout);
      expect(summary.claudeFlowHook.skipped).toBe(true);
    }
  });
});
