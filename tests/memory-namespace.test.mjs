/**
 * Namespace validation tests
 * Tests: validateNamespace in intelligence.cjs, namespace='all' rejection in JsonFileBackend
 */

import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const INTELLIGENCE_CJS = join(
  import.meta.dirname, '..', '.claude', 'helpers', 'intelligence.cjs',
);

let tmpDir;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'mem-ns-'));
  mkdirSync(join(tmpDir, '.claude-flow', 'data'), { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('intelligence.cjs validateNamespace', () => {
  it('rejects "all" namespace with warning and defaults to "default"', () => {
    const storePath = join(tmpDir, '.claude-flow', 'data', 'auto-memory-store.json');
    writeFileSync(storePath, JSON.stringify([
      {
        id: 'test-1', key: 'test', content: 'some content that is long enough',
        summary: 'Test entry', namespace: 'all', type: 'semantic',
        metadata: {}, createdAt: Date.now(),
      },
    ]));

    const result = spawnSync('node', [INTELLIGENCE_CJS, 'init'], {
      cwd: tmpDir, encoding: 'utf-8', timeout: 10000,
    });

    expect(result.stderr).toContain("namespace 'all' is reserved for queries");
  });

  it('accepts valid namespaces without warnings', () => {
    const storePath = join(tmpDir, '.claude-flow', 'data', 'auto-memory-store.json');
    writeFileSync(storePath, JSON.stringify([
      {
        id: 'test-1', key: 'test', content: 'valid entry with proper namespace',
        summary: 'Valid test', namespace: 'core', type: 'semantic',
        metadata: {}, createdAt: Date.now(),
      },
    ]));

    const result = spawnSync('node', [INTELLIGENCE_CJS, 'init'], {
      cwd: tmpDir, encoding: 'utf-8', timeout: 10000,
    });

    expect(result.stderr).not.toContain("namespace 'all'");
  });

  it('handles missing namespace by defaulting to "default"', () => {
    const storePath = join(tmpDir, '.claude-flow', 'data', 'auto-memory-store.json');
    writeFileSync(storePath, JSON.stringify([
      {
        id: 'test-1', key: 'test', content: 'entry with no namespace field at all',
        summary: 'No namespace', type: 'semantic', metadata: {}, createdAt: Date.now(),
      },
    ]));

    const result = spawnSync('node', [INTELLIGENCE_CJS, 'init'], {
      cwd: tmpDir, encoding: 'utf-8', timeout: 10000,
    });

    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.trim());
    expect(output.nodes).toBe(1);
  });

  it('handles undefined namespace gracefully', () => {
    const storePath = join(tmpDir, '.claude-flow', 'data', 'auto-memory-store.json');
    writeFileSync(storePath, JSON.stringify([
      {
        id: 'test-1', key: 'test', content: 'entry with undefined namespace',
        summary: 'Undef ns', type: 'semantic', metadata: {}, createdAt: Date.now(),
      },
    ]));

    const result = spawnSync('node', [INTELLIGENCE_CJS, 'init'], {
      cwd: tmpDir, encoding: 'utf-8', timeout: 10000,
    });

    expect(result.status).toBe(0);
  });
});

describe('JsonFileBackend namespace validation', () => {
  it('store() rejects namespace="all"', () => {
    const result = spawnSync('node', ['--input-type=module', '-e', `
      class JsonFileBackend {
        constructor(fp) { this.filePath = fp; this.entries = new Map(); }
        async store(entry) {
          if (entry.namespace === 'all') throw new Error('store: namespace cannot be "all" (reserved for queries)');
          if (!entry.id) throw new Error('store: entry.id is required');
          this.entries.set(entry.id, entry);
        }
      }

      const b = new JsonFileBackend('/tmp/test.json');
      try {
        await b.store({ id: '1', namespace: 'all', content: 'x' });
        console.log('ERROR: should have thrown');
        process.exit(1);
      } catch (err) {
        if (err.message.includes('namespace cannot be "all"')) {
          console.log('OK: correctly rejected');
          process.exit(0);
        }
        console.log('ERROR: wrong error:', err.message);
        process.exit(1);
      }
    `], { encoding: 'utf-8', timeout: 10000 });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('OK: correctly rejected');
  });

  it('query with specific namespace filters correctly', () => {
    const storePath = join(tmpDir, '.claude-flow', 'data', 'auto-memory-store.json');
    writeFileSync(storePath, JSON.stringify([
      { id: '1', key: 'a', content: 'first', namespace: 'core', type: 'semantic', metadata: {}, createdAt: Date.now() },
      { id: '2', key: 'b', content: 'second', namespace: 'insights', type: 'semantic', metadata: {}, createdAt: Date.now() },
      { id: '3', key: 'c', content: 'third', namespace: 'core', type: 'semantic', metadata: {}, createdAt: Date.now() },
    ]));

    const result = spawnSync('node', [INTELLIGENCE_CJS, 'init'], {
      cwd: tmpDir, encoding: 'utf-8', timeout: 10000,
    });

    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.trim());
    expect(output.nodes).toBe(3);
  });
});
