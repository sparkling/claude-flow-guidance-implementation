/**
 * Memory lifecycle tests
 * Tests: shutdown handlers, persist on exit, corrupt file backup, fresh init
 */

import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const INTELLIGENCE_CJS = join(
  import.meta.dirname, '..', '.claude', 'helpers', 'intelligence.cjs',
);

let tmpDir;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'mem-lifecycle-'));
  mkdirSync(join(tmpDir, '.claude-flow', 'data'), { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('intelligence.cjs lifecycle', () => {
  it('init() creates graph-state.json and ranked-context.json', () => {
    const storePath = join(tmpDir, '.claude-flow', 'data', 'auto-memory-store.json');
    writeFileSync(storePath, JSON.stringify([
      { id: 'e1', key: 'test', content: 'enough content for matching', summary: 'Test', namespace: 'core', type: 'semantic', metadata: {}, createdAt: Date.now() },
    ]));

    const result = spawnSync('node', [INTELLIGENCE_CJS, 'init'], {
      cwd: tmpDir, encoding: 'utf-8', timeout: 10000,
    });

    expect(result.status).toBe(0);
    expect(existsSync(join(tmpDir, '.claude-flow', 'data', 'graph-state.json'))).toBe(true);
    expect(existsSync(join(tmpDir, '.claude-flow', 'data', 'ranked-context.json'))).toBe(true);
  });

  it('corrupt store file is backed up on load', () => {
    const storePath = join(tmpDir, '.claude-flow', 'data', 'auto-memory-store.json');
    writeFileSync(storePath, '{not valid json at all!!!', 'utf-8');

    const result = spawnSync('node', [INTELLIGENCE_CJS, 'init'], {
      cwd: tmpDir, encoding: 'utf-8', timeout: 10000,
    });

    const dataDir = join(tmpDir, '.claude-flow', 'data');
    const files = readdirSync(dataDir);
    const backupFiles = files.filter(f => f.includes('.corrupt.'));
    expect(backupFiles.length).toBe(1);
    expect(result.stderr).toContain('[intelligence:error]');
    expect(result.stderr).toContain('Corrupt file backed up');
  });

  it('init() handles missing store file without crashing', () => {
    // When no store exists, init() either reports "No memory entries" or
    // bootstraps from ~/.claude/projects/*/memory/ MEMORY.md files.
    // Both are valid outcomes depending on what's on disk.
    const result = spawnSync('node', [INTELLIGENCE_CJS, 'init'], {
      cwd: tmpDir, encoding: 'utf-8', timeout: 10000,
    });

    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.trim());
    expect(['No memory entries to index', 'Graph built and ranked', 'Graph cache hit']).toContain(output.message);
  });

  it('multiple init calls are idempotent', () => {
    const storePath = join(tmpDir, '.claude-flow', 'data', 'auto-memory-store.json');
    writeFileSync(storePath, JSON.stringify([
      { id: 'e1', key: 'test', content: 'test content for idempotency', summary: 'Idem', namespace: 'core', type: 'semantic', metadata: {}, createdAt: Date.now() },
    ]));

    const result1 = spawnSync('node', [INTELLIGENCE_CJS, 'init'], {
      cwd: tmpDir, encoding: 'utf-8', timeout: 10000,
    });
    const result2 = spawnSync('node', [INTELLIGENCE_CJS, 'init'], {
      cwd: tmpDir, encoding: 'utf-8', timeout: 10000,
    });

    expect(result1.status).toBe(0);
    expect(result2.status).toBe(0);
    const out1 = JSON.parse(result1.stdout.trim());
    const out2 = JSON.parse(result2.stdout.trim());
    expect(out1.nodes).toBe(out2.nodes);
  });

  it('consolidate processes pending insights and clears pending file', () => {
    const storePath = join(tmpDir, '.claude-flow', 'data', 'auto-memory-store.json');
    writeFileSync(storePath, JSON.stringify([
      { id: 'e1', key: 'test', content: 'content for consolidation', summary: 'Consolidate', namespace: 'core', type: 'semantic', metadata: {}, createdAt: Date.now() },
    ]));

    spawnSync('node', [INTELLIGENCE_CJS, 'init'], {
      cwd: tmpDir, encoding: 'utf-8', timeout: 10000,
    });

    const pendingPath = join(tmpDir, '.claude-flow', 'data', 'pending-insights.jsonl');
    const lines = [];
    for (let i = 0; i < 5; i++) {
      lines.push(JSON.stringify({ type: 'edit', file: '/test/hot-file.js', timestamp: Date.now() }));
    }
    writeFileSync(pendingPath, lines.join('\n') + '\n', 'utf-8');

    const result = spawnSync('node', [INTELLIGENCE_CJS, 'consolidate'], {
      cwd: tmpDir, encoding: 'utf-8', timeout: 10000,
    });

    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.trim());
    expect(output.message).toBe('Consolidated');
    expect(readFileSync(pendingPath, 'utf-8').trim()).toBe('');
  });

  it('auto-memory-hook status does not crash', () => {
    const AUTO_HOOK = join(
      import.meta.dirname, '..', '.claude', 'helpers', 'auto-memory-hook.mjs',
    );

    const result = spawnSync('node', [AUTO_HOOK, 'status'], {
      cwd: tmpDir, encoding: 'utf-8', timeout: 10000,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Auto Memory Bridge Status');
  });
});
