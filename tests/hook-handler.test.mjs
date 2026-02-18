import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const HANDLER = resolve('/home/claude/src/claude-flow-guidance-implementation/src/hook-handler.cjs');
const CWD = resolve('/home/claude/src/claude-flow-guidance-implementation');

function runHandler(command, stdinJson = null, env = {}) {
  const args = command ? [HANDLER, command] : [HANDLER];
  const opts = {
    cwd: CWD,
    encoding: 'utf-8',
    timeout: 10000,
    env: {
      ...process.env,
      GUIDANCE_EVENT_WIRING_ENABLED: '0', // disable external wiring for tests
      ...env,
    },
  };
  if (stdinJson) {
    opts.input = typeof stdinJson === 'string' ? stdinJson : JSON.stringify(stdinJson);
  }
  return spawnSync('node', args, opts);
}

describe('hook-handler.cjs', () => {
  it('no command prints usage and exits 0', () => {
    const result = runHandler(null);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('hook-handler.cjs');
  });

  it('status prints [OK] Status check', () => {
    const result = runHandler('status');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[OK] Status check');
  });

  it('pre-bash with safe command (git status) prints [OK] Command validated', () => {
    const result = runHandler('pre-bash', {
      tool_input: { command: 'git status' },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[OK] Command validated');
  });

  it('pre-bash with rm -rf / exits 1 with BLOCKED', () => {
    const result = runHandler('pre-bash', {
      tool_input: { command: 'rm -rf /' },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[BLOCKED]');
  });

  it('pre-edit with empty stdin prints [OK] Edit validation skipped', () => {
    const result = runHandler('pre-edit');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[OK] Edit validation skipped');
  });

  it('pre-edit with file_path prints [OK] Edit validated', () => {
    const result = runHandler('pre-edit', {
      tool_input: { file_path: 'src/foo.js' },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[OK] Edit validated');
  });

  it('post-edit prints [OK] Edit recorded', () => {
    const result = runHandler('post-edit');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[OK] Edit recorded');
  });

  it('pre-task prints OK or routing info', () => {
    const result = runHandler('pre-task', {
      tool_input: { description: 'test task' },
    });

    expect(result.status).toBe(0);
    // Should print either routing info or OK
    const out = result.stdout;
    const hasOk = out.includes('[OK]');
    const hasRouting = out.includes('[INFO]');
    expect(hasOk || hasRouting).toBe(true);
  });

  it('post-task prints [OK] Task completed', () => {
    const result = runHandler('post-task');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[OK] Task completed');
  });

  it('compact-manual prints guidance text', () => {
    const result = runHandler('compact-manual');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('PreCompact Guidance');
    expect(result.stdout).toContain('CLAUDE.md');
  });

  it('compact-auto prints guidance text', () => {
    const result = runHandler('compact-auto');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Auto-Compact Guidance');
    expect(result.stdout).toContain('GOLDEN RULE');
  });

  it('unknown command prints [OK] Hook:', () => {
    const result = runHandler('some-unknown-hook');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[OK] Hook: some-unknown-hook');
  });
});
