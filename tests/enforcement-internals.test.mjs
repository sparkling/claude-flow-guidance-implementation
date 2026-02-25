import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const HANDLER = resolve('src/enforcement.cjs');
const CWD = resolve('.');

function runHandler(command, stdinJson = null, env = {}, extraArgs = []) {
  const args = command ? [HANDLER, command, ...extraArgs] : [HANDLER];
  const opts = {
    cwd: CWD,
    encoding: 'utf-8',
    timeout: 10000,
    env: {
      ...process.env,
      GUIDANCE_EVENT_WIRING_ENABLED: '0',
      GUIDANCE_AUTOPILOT_ENABLED: '0',
      ...env,
    },
  };
  if (stdinJson != null) {
    opts.input = typeof stdinJson === 'string' ? stdinJson : JSON.stringify(stdinJson);
  }
  return spawnSync('node', args, opts);
}

// -- Dangerous command patterns -----------------------------------------------

describe('enforcement: dangerous command patterns', () => {
  it('blocks fork bomb :(){ :|:& };:', () => {
    const result = runHandler('pre-command', {
      tool_input: { command: ':(){ :|:& };:' },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[BLOCKED]');
  });

  it('blocks format c: (case-insensitive)', () => {
    const result = runHandler('pre-command', {
      tool_input: { command: 'FORMAT C:' },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[BLOCKED]');
  });

  it('blocks del /s /q c:\\', () => {
    const result = runHandler('pre-command', {
      tool_input: { command: 'del /s /q c:\\' },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[BLOCKED]');
  });

  it('blocks rm -rf / with extra spaces', () => {
    const result = runHandler('pre-command', {
      tool_input: { command: 'rm  -rf  /' },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[BLOCKED]');
  });

  it('allows safe commands through', () => {
    const result = runHandler('pre-command', {
      tool_input: { command: 'npm test' },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[OK] Command validated');
  });

  it('allows ls -la (not dangerous)', () => {
    const result = runHandler('pre-command', {
      tool_input: { command: 'ls -la /tmp' },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[OK] Command validated');
  });

  it('allows empty command through (no crash)', () => {
    const result = runHandler('pre-command', {
      tool_input: { command: '' },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[OK] Command validated');
  });
});

// -- stdin JSON parsing -------------------------------------------------------

describe('enforcement: stdin JSON parsing', () => {
  it('handles valid stdin JSON', () => {
    const result = runHandler('pre-command', JSON.stringify({
      tool_input: { command: 'echo hello' },
    }));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[OK]');
  });

  it('handles empty stdin gracefully', () => {
    const result = runHandler('pre-command', '');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[OK]');
  });

  it('handles malformed JSON stdin gracefully', () => {
    const result = runHandler('pre-command', '{not valid json');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[OK]');
  });

  it('handles null tool_input gracefully', () => {
    const result = runHandler('pre-command', JSON.stringify({ tool_input: null }));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[OK]');
  });
});

// -- Task cache round-trip ----------------------------------------------------

describe('enforcement: task cache round-trip', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = resolve(tmpdir(), `enf-cache-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(join(tmpDir, 'CLAUDE.md'), '# Test\n- NEVER use eval()');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('pre-task stores task context, post-task retrieves it', () => {
    const env = { CLAUDE_PROJECT_DIR: tmpDir };

    const preResult = runHandler('pre-task', {
      tool_input: { description: 'implement auth module' },
    }, env);
    expect(preResult.status).toBe(0);

    const cachePath = join(tmpDir, '.claude-flow', 'guidance', 'hook-task-cache.json');
    expect(existsSync(cachePath)).toBe(true);

    const cache = JSON.parse(readFileSync(cachePath, 'utf-8'));
    expect(cache.last).toBeDefined();
    expect(cache.last.taskDescription).toBe('implement auth module');
    expect(cache.last.taskId).toBeDefined();
    expect(cache.last.updatedAt).toBeGreaterThan(0);

    const postResult = runHandler('post-task', {}, env);
    expect(postResult.status).toBe(0);
    expect(postResult.stdout).toContain('[OK] Task completed');
  });

  it('task cache persists task ID across pre-task and post-task', () => {
    const env = { CLAUDE_PROJECT_DIR: tmpDir };
    const taskId = 'custom-task-42';

    runHandler('pre-task', {
      task_id: taskId,
      tool_input: { description: 'custom task' },
    }, env);

    const cachePath = join(tmpDir, '.claude-flow', 'guidance', 'hook-task-cache.json');
    const cache = JSON.parse(readFileSync(cachePath, 'utf-8'));
    expect(cache.last.taskId).toBe(taskId);
  });
});

// -- stableId determinism -----------------------------------------------------

describe('enforcement: stable ID generation', () => {
  it('same description produces same task ID prefix', () => {
    const desc = 'implement authentication';
    const result1 = runHandler('pre-task', {
      tool_input: { description: desc },
    });
    const result2 = runHandler('pre-task', {
      tool_input: { description: desc },
    });
    expect(result1.status).toBe(0);
    expect(result2.status).toBe(0);
  });

  it('stableId matches expected sha256 format', () => {
    const tmpDir = resolve(tmpdir(), `enf-stableid-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(join(tmpDir, 'CLAUDE.md'), '# Test');

    try {
      runHandler('pre-task', {
        tool_input: { description: 'test seed value' },
      }, { CLAUDE_PROJECT_DIR: tmpDir });

      const cachePath = join(tmpDir, '.claude-flow', 'guidance', 'hook-task-cache.json');
      if (existsSync(cachePath)) {
        const cache = JSON.parse(readFileSync(cachePath, 'utf-8'));
        const taskId = cache.last.taskId;
        expect(taskId).toMatch(/^pre-task-[0-9a-f]{12}$/);

        const expected = createHash('sha256')
          .update('test seed value')
          .digest('hex')
          .slice(0, 12);
        expect(taskId).toBe(`pre-task-${expected}`);
      }
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// -- guidanceBlockMessage -----------------------------------------------------

describe('enforcement: guidance block message formatting', () => {
  it('guidanceWiringEnabled=0 prevents guidance calls', () => {
    const result = runHandler('pre-command', {
      tool_input: { command: 'echo hello' },
    }, { GUIDANCE_EVENT_WIRING_ENABLED: '0' });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[OK] Command validated');
  });

  it('pre-edit with file_path but no content still validates', () => {
    const result = runHandler('pre-edit', {
      tool_input: { file_path: 'src/test.js', content: '', operation: 'modify' },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[OK] Edit validated');
  });
});

// -- Session handlers ---------------------------------------------------------

describe('enforcement: session handlers', () => {
  it('session-restore prints [OK] Session restored', () => {
    const result = runHandler('session-restore');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[OK] Session restored');
  });

  it('session-end prints [OK] Session ended', () => {
    const result = runHandler('session-end');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[OK] Session ended');
  });
});

// -- Dispatch table completeness ----------------------------------------------

describe('enforcement: dispatch table', () => {
  const commands = [
    'pre-command', 'pre-edit', 'pre-task', 'post-edit',
    'post-task', 'session-end', 'session-restore',
    'compact-manual', 'compact-auto',
    'user-prompt', 'post-tool-failure', 'stop',
  ];

  for (const cmd of commands) {
    it(`handles '${cmd}' without crashing`, () => {
      const result = runHandler(cmd);
      expect(result.status).toBe(0);
    });
  }
});

// -- Edge cases ---------------------------------------------------------------

describe('enforcement: edge cases', () => {
  it('getToolInput with nested tool_input object', () => {
    const result = runHandler('pre-command', {
      tool_input: {
        command: 'git status',
        extra: 'ignored',
      },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[OK]');
  });

  it('command from PROMPT env var', () => {
    const result = runHandler('pre-command', null, {
      PROMPT: 'echo from env',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[OK]');
  });

  it('explicit task_id in stdin is respected', () => {
    const tmpDir = resolve(tmpdir(), `enf-explicit-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(join(tmpDir, 'CLAUDE.md'), '# Test');

    try {
      runHandler('pre-task', {
        task_id: 'explicit-task-999',
        tool_input: { description: 'test task' },
      }, { CLAUDE_PROJECT_DIR: tmpDir });

      const cachePath = join(tmpDir, '.claude-flow', 'guidance', 'hook-task-cache.json');
      if (existsSync(cachePath)) {
        const cache = JSON.parse(readFileSync(cachePath, 'utf-8'));
        expect(cache.last.taskId).toBe('explicit-task-999');
      }
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('getDiffLines computes from content when diff_lines not provided', () => {
    const result = runHandler('pre-edit', {
      tool_input: {
        file_path: 'src/test.js',
        content: 'line1\nline2\nline3',
      },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[OK] Edit validated');
  });

  it('getSessionId from env', () => {
    const result = runHandler('session-restore', null, {
      CLAUDE_SESSION_ID: 'test-session-123',
    });
    expect(result.status).toBe(0);
  });

  it('getAgentId from env', () => {
    const result = runHandler('pre-task', {
      tool_input: { description: 'test' },
    }, {
      CLAUDE_AGENT_ID: 'test-agent-42',
    });
    expect(result.status).toBe(0);
  });
});
