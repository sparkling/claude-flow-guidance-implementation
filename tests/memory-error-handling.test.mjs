/**
 * Structured error handling tests
 * Tests: readJSON backup, ENOENT silence, writeJSON dir creation, error message format
 */

import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const INTELLIGENCE_CJS = join(
  import.meta.dirname, '..', '.claude', 'helpers', 'intelligence.cjs',
);

const MEMORY_JS = join(
  import.meta.dirname, '..', '.claude', 'helpers', 'memory.cjs',
);

let tmpDir;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'mem-err-'));
  mkdirSync(join(tmpDir, '.claude-flow', 'data'), { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('intelligence.cjs readJSON error handling', () => {
  it('backs up corrupt JSON files', () => {
    const storePath = join(tmpDir, '.claude-flow', 'data', 'auto-memory-store.json');
    writeFileSync(storePath, '{"broken": tru', 'utf-8');

    spawnSync('node', [INTELLIGENCE_CJS, 'init'], {
      cwd: tmpDir, encoding: 'utf-8', timeout: 10000,
    });

    const dataDir = join(tmpDir, '.claude-flow', 'data');
    const files = readdirSync(dataDir);
    const backups = files.filter(f => f.startsWith('auto-memory-store.json.corrupt.'));
    expect(backups.length).toBe(1);
  });

  it('handles ENOENT silently (no error output)', () => {
    const result = spawnSync('node', [INTELLIGENCE_CJS, 'init'], {
      cwd: tmpDir, encoding: 'utf-8', timeout: 10000,
    });

    expect(result.stderr).not.toContain('[intelligence:error]');
    expect(result.status).toBe(0);
  });

  it('init creates data directory output files', () => {
    const freshDir = mkdtempSync(join(tmpdir(), 'mem-nodata-'));
    mkdirSync(join(freshDir, '.claude-flow', 'data'), { recursive: true });
    writeFileSync(
      join(freshDir, '.claude-flow', 'data', 'auto-memory-store.json'),
      JSON.stringify([{ id: 'e1', key: 'test', content: 'test', summary: 'T', namespace: 'core', type: 'semantic', metadata: {}, createdAt: Date.now() }]),
    );

    const result = spawnSync('node', [INTELLIGENCE_CJS, 'init'], {
      cwd: freshDir, encoding: 'utf-8', timeout: 10000,
    });

    expect(result.status).toBe(0);
    expect(existsSync(join(freshDir, '.claude-flow', 'data', 'graph-state.json'))).toBe(true);
    rmSync(freshDir, { recursive: true, force: true });
  });
});

describe('memory.js structured error messages', () => {
  it('error messages include operation name', () => {
    const mainFile = join(tmpDir, '.claude-flow', 'data', 'memory.json');
    writeFileSync(mainFile, 'not json', 'utf-8');

    const result = spawnSync('node', [MEMORY_JS, 'get'], {
      cwd: tmpDir, encoding: 'utf-8', timeout: 10000,
    });

    expect(result.stderr).toContain('[memory:error]');
    expect(result.stderr).toContain('loadMemory');
  });

  it('error messages include file path', () => {
    const mainFile = join(tmpDir, '.claude-flow', 'data', 'memory.json');
    writeFileSync(mainFile, '<<<invalid>>>', 'utf-8');

    const result = spawnSync('node', [MEMORY_JS, 'get'], {
      cwd: tmpDir, encoding: 'utf-8', timeout: 10000,
    });

    expect(result.stderr).toContain('memory.json');
  });
});

describe('intelligence.cjs sessionSet error handling', () => {
  it('sessionSet logs structured errors on failure', () => {
    const storePath = join(tmpDir, '.claude-flow', 'data', 'auto-memory-store.json');
    writeFileSync(storePath, JSON.stringify([
      { id: 'e1', key: 'test', content: 'test content for session set', summary: 'Session', namespace: 'core', type: 'semantic', metadata: {}, createdAt: Date.now() },
    ]));

    spawnSync('node', [INTELLIGENCE_CJS, 'init'], {
      cwd: tmpDir, encoding: 'utf-8', timeout: 10000,
    });

    // Create sessions path as a file (not directory) to force sessionSet error
    const sessionDir = join(tmpDir, '.claude-flow', 'sessions');
    writeFileSync(sessionDir, 'not a directory', 'utf-8');

    const result = spawnSync('node', ['-e', `
      process.chdir(${JSON.stringify(tmpDir)});
      const intel = require(${JSON.stringify(INTELLIGENCE_CJS)});
      const ctx = intel.getContext('test session error');
      console.log(ctx ? 'got context' : 'no context');
    `], { cwd: tmpDir, encoding: 'utf-8', timeout: 10000 });

    expect(result.status).toBe(0);
    expect(result.stderr).toContain('[intelligence:error]');
    expect(result.stderr).toContain('sessionSet');
  });
});
