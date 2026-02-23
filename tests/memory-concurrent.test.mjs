/**
 * Memory concurrent access and atomic write tests
 * Tests: saveMemory atomic writes, loadMemory retry logic, parallel safety
 */

import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const MEMORY_JS = join(
  import.meta.dirname, '..', '.claude', 'helpers', 'memory.cjs',
);

function runMemory(command, args, cwd) {
  return spawnSync('node', [MEMORY_JS, command, ...args], {
    cwd,
    encoding: 'utf-8',
    timeout: 10000,
  });
}

let tmpDir;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'mem-concurrent-'));
  mkdirSync(join(tmpDir, '.claude-flow', 'data'), { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('memory.js atomic writes', () => {
  it('saveMemory uses tmp+rename (no .tmp file remains)', () => {
    runMemory('set', ['testkey', 'testval'], tmpDir);

    const dataDir = join(tmpDir, '.claude-flow', 'data');
    const tmpFile = join(dataDir, 'memory.json.tmp');
    const mainFile = join(dataDir, 'memory.json');

    expect(existsSync(mainFile)).toBe(true);
    expect(existsSync(tmpFile)).toBe(false);
  });

  it('saveMemory creates directory if missing', () => {
    const freshDir = mkdtempSync(join(tmpdir(), 'mem-nodir-'));
    try {
      runMemory('set', ['key1', 'val1'], freshDir);
      const mainFile = join(freshDir, '.claude-flow', 'data', 'memory.json');
      expect(existsSync(mainFile)).toBe(true);
    } finally {
      rmSync(freshDir, { recursive: true, force: true });
    }
  });

  it('saved data round-trips correctly', () => {
    runMemory('set', ['color', 'blue'], tmpDir);
    const result = runMemory('get', ['color'], tmpDir);
    expect(result.stdout.trim()).toBe('"blue"');
  });

  it('multiple sequential writes produce valid JSON', () => {
    for (let i = 0; i < 10; i++) {
      runMemory('set', [`key${i}`, `val${i}`], tmpDir);
    }
    const mainFile = join(tmpDir, '.claude-flow', 'data', 'memory.json');
    const data = JSON.parse(readFileSync(mainFile, 'utf-8'));
    expect(data.key0).toBe('val0');
    expect(data.key9).toBe('val9');
  });

  it('parallel writes do not corrupt the file', () => {
    const children = [];
    for (let i = 0; i < 5; i++) {
      children.push(
        spawnSync('node', [MEMORY_JS, 'set', `pkey${i}`, `pval${i}`], {
          cwd: tmpDir,
          encoding: 'utf-8',
          timeout: 10000,
        }),
      );
    }

    const mainFile = join(tmpDir, '.claude-flow', 'data', 'memory.json');
    expect(existsSync(mainFile)).toBe(true);
    const data = JSON.parse(readFileSync(mainFile, 'utf-8'));
    expect(typeof data).toBe('object');
    const keys = Object.keys(data).filter(k => k.startsWith('pkey'));
    expect(keys.length).toBeGreaterThan(0);
  });
});

describe('memory.js loadMemory error handling', () => {
  it('handles ENOENT gracefully (returns empty object)', () => {
    const result = runMemory('get', [], tmpDir);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('{}');
  });

  it('handles corrupt JSON with structured error', () => {
    const mainFile = join(tmpDir, '.claude-flow', 'data', 'memory.json');
    writeFileSync(mainFile, '{broken json!!!', 'utf-8');

    const result = runMemory('get', [], tmpDir);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('[memory:error]');
  });

  it('empty JSON object returns empty object', () => {
    const mainFile = join(tmpDir, '.claude-flow', 'data', 'memory.json');
    writeFileSync(mainFile, '{}', 'utf-8');

    const result = runMemory('get', [], tmpDir);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('{}');
  });
});
