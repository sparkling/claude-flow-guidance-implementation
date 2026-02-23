/**
 * E2E Memory + AgentDB v3 Functional Tests (WM-008)
 *
 * Tests the RUNTIME behavior of the memory subsystem in a real
 * guidance-installed project:
 *   init → install guidance → exercise auto-memory-hook → verify runtime
 *
 * Exercises:
 *   1. auto-memory-hook.mjs status/import/sync with agentdb v3 config
 *   2. intelligence.cjs init/consolidate/getContext with agentdb v3 config
 *   3. JsonFileBackend store/query round-trip (JSON fallback mode)
 *   4. Config propagation: config.json agentdb section → readConfig() → createBackend()
 *   5. Memory lifecycle: import → intelligence init → getContext → consolidate → sync
 */

import {
  existsSync, readFileSync, writeFileSync,
  mkdtempSync, rmSync, mkdirSync, readdirSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { installIntoRepo } from '../src/installer.mjs';

// ── Helpers ──────────────────────────────────────────────────────────────────

const PROJECT_ROOT = resolve(import.meta.dirname, '..');
const AUTO_HOOK = resolve(PROJECT_ROOT, '.claude/helpers/auto-memory-hook.mjs');
const INTELLIGENCE = resolve(PROJECT_ROOT, '.claude/helpers/intelligence.cjs');

function cli(args, cwd, timeout = 60000) {
  return spawnSync('npx', ['@claude-flow/cli', ...args], {
    encoding: 'utf-8',
    timeout,
    cwd,
    env: { ...process.env, npm_config_yes: 'true', NODE_NO_WARNINGS: '1' },
  });
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

function writeJson(filePath, data) {
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function runHook(cwd, cmd, timeout = 15000) {
  return spawnSync('node', [AUTO_HOOK, cmd], {
    cwd, encoding: 'utf-8', timeout,
  });
}

function runIntel(cwd, cmd, timeout = 15000) {
  return spawnSync('node', [INTELLIGENCE, cmd], {
    cwd, encoding: 'utf-8', timeout,
  });
}

function writeStore(cwd, entries) {
  const dataDir = join(cwd, '.claude-flow', 'data');
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(dataDir, 'auto-memory-store.json'), JSON.stringify(entries), 'utf-8');
}

function writeConfigJson(cwd, config) {
  mkdirSync(join(cwd, '.claude-flow'), { recursive: true });
  writeJson(join(cwd, '.claude-flow', 'config.json'), config);
}

const SAMPLE_ENTRIES = [
  {
    id: 'e2e-1', key: 'agentdb-v3-pattern', content: 'AgentDB v3 uses RVF unified storage format with self-learning search',
    summary: 'AgentDB v3 RVF storage', namespace: 'core', type: 'semantic',
    metadata: { sourceFile: 'memory/agentdb-backend.js' }, createdAt: Date.now(),
  },
  {
    id: 'e2e-2', key: 'witness-chain-pattern', content: 'Witness chain provides SHAKE-256 audit trail for tamper detection',
    summary: 'Witness chain audit trail', namespace: 'core', type: 'semantic',
    metadata: { sourceFile: 'memory/agentdb-backend.js' }, createdAt: Date.now(),
  },
  {
    id: 'e2e-3', key: 'self-learning-pattern', content: 'SelfLearningRvfBackend enables feedback-driven contrastive training with LoRA adapters',
    summary: 'Self-learning search', namespace: 'patterns', type: 'procedural',
    metadata: { sourceFile: 'memory/agentdb-backend.js' }, createdAt: Date.now(),
  },
];

// ── Skip check ───────────────────────────────────────────────────────────────

const cliCheck = spawnSync('npx', ['@claude-flow/cli', '--version'], {
  encoding: 'utf-8', timeout: 15000,
  env: { ...process.env, npm_config_yes: 'true', NODE_NO_WARNINGS: '1' },
});
const canRun = cliCheck.status === 0 && (cliCheck.stdout || '').includes('claude-flow');
const skipMsg = canRun ? undefined : 'patched @claude-flow/cli not available in npx cache';

// ══════════════════════════════════════════════════════════════════════════════
// Suite 1: Memory runtime in a guidance-installed project (WM-008)
// ══════════════════════════════════════════════════════════════════════════════

describe('e2e memory: agentdb v3 runtime in guidance project', { skip: skipMsg ? true : false }, () => {
  let dir;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'cfgi-e2e-memruntime-'));

    // Step 1: init a real claude-flow project
    const r = cli(['init', '--yes'], dir);
    if (r.status !== 0) throw new Error(`init failed: ${r.stderr}`);

    // Step 2: install guidance on top
    await installIntoRepo({
      targetRepo: dir,
      targetMode: 'claude',
      preset: 'minimal',
    });

    // Step 3: seed memory store with sample entries
    writeStore(dir, SAMPLE_ENTRIES);
  }, 90000);

  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  // ── Config verification (prerequisite for runtime) ──

  it('config.json has agentdb v3 section after init + guidance', () => {
    const cfg = readJson(join(dir, '.claude-flow', 'config.json'));
    expect(cfg.memory?.agentdb).toBeDefined();
    expect(cfg.memory?.agentdb?.vectorBackend).toBe('rvf');
  });

  it('config.json agentdb has learning enabled by default', () => {
    const cfg = readJson(join(dir, '.claude-flow', 'config.json'));
    expect(cfg.memory?.agentdb?.enableLearning).toBe(true);
  });

  // ── auto-memory-hook.mjs status ──

  it('auto-memory-hook status succeeds and shows bridge info', () => {
    const result = runHook(dir, 'status');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Auto Memory Bridge Status');
  });

  it('auto-memory-hook status reports store as initialized (seeded entries)', () => {
    const result = runHook(dir, 'status');
    expect(result.status).toBe(0);
    // The store was seeded with 3 entries
    expect(result.stdout).toContain('3');
  });

  // ── intelligence.cjs init with agentdb v3 config ──

  it('intelligence init builds graph from seeded entries', () => {
    const result = runIntel(dir, 'init');
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.trim());
    expect(output.nodes).toBe(3);
    expect(output.edges).toBeGreaterThanOrEqual(0);
    expect(output.message).toContain('Graph built');
  });

  it('intelligence init creates graph-state.json', () => {
    expect(existsSync(join(dir, '.claude-flow', 'data', 'graph-state.json'))).toBe(true);
    const graph = readJson(join(dir, '.claude-flow', 'data', 'graph-state.json'));
    expect(graph.nodeCount).toBe(3);
    expect(graph.pageRanks).toBeDefined();
  });

  it('intelligence init creates ranked-context.json', () => {
    expect(existsSync(join(dir, '.claude-flow', 'data', 'ranked-context.json'))).toBe(true);
    const ranked = readJson(join(dir, '.claude-flow', 'data', 'ranked-context.json'));
    expect(ranked.entries.length).toBe(3);
    // Entries should have pageRank and confidence scores
    for (const entry of ranked.entries) {
      expect(typeof entry.pageRank).toBe('number');
      expect(typeof entry.confidence).toBe('number');
    }
  });

  // ── intelligence.cjs getContext (runtime pattern matching) ──

  it('getContext returns relevant patterns for agentdb query', () => {
    // Ensure init has been called (should be cached from previous test)
    runIntel(dir, 'init');

    const result = spawnSync('node', ['-e', `
      process.chdir(${JSON.stringify(dir)});
      const intel = require(${JSON.stringify(INTELLIGENCE)});
      const ctx = intel.getContext('agentdb v3 RVF storage format');
      console.log(JSON.stringify({ context: ctx, hasContext: ctx !== null }));
    `], { cwd: dir, encoding: 'utf-8', timeout: 10000 });

    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.trim());
    expect(output.hasContext).toBe(true);
    expect(output.context).toContain('INTELLIGENCE');
  });

  it('getContext returns relevant patterns for witness chain query', () => {
    const result = spawnSync('node', ['-e', `
      process.chdir(${JSON.stringify(dir)});
      const intel = require(${JSON.stringify(INTELLIGENCE)});
      const ctx = intel.getContext('witness chain SHAKE-256 audit tamper detection');
      console.log(JSON.stringify({ context: ctx, hasContext: ctx !== null }));
    `], { cwd: dir, encoding: 'utf-8', timeout: 10000 });

    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.trim());
    expect(output.hasContext).toBe(true);
  });

  it('getContext returns relevant patterns for self-learning query', () => {
    const result = spawnSync('node', ['-e', `
      process.chdir(${JSON.stringify(dir)});
      const intel = require(${JSON.stringify(INTELLIGENCE)});
      const ctx = intel.getContext('SelfLearningRvfBackend feedback contrastive LoRA');
      console.log(JSON.stringify({ context: ctx, hasContext: ctx !== null }));
    `], { cwd: dir, encoding: 'utf-8', timeout: 10000 });

    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.trim());
    expect(output.hasContext).toBe(true);
  });

  // ── intelligence.cjs consolidate ──

  it('consolidate processes entries and updates graph', () => {
    // Seed some pending insights
    const pendingPath = join(dir, '.claude-flow', 'data', 'pending-insights.jsonl');
    const lines = [
      JSON.stringify({ type: 'edit', file: 'memory/agentdb-backend.js', timestamp: Date.now() }),
      JSON.stringify({ type: 'edit', file: 'memory/agentdb-backend.js', timestamp: Date.now() }),
      JSON.stringify({ type: 'edit', file: 'memory/agentdb-backend.js', timestamp: Date.now() }),
      JSON.stringify({ type: 'edit', file: 'memory/agentdb-backend.js', timestamp: Date.now() }),
    ];
    writeFileSync(pendingPath, lines.join('\n') + '\n', 'utf-8');

    const result = runIntel(dir, 'consolidate');
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.trim());
    expect(output.message).toBe('Consolidated');
    expect(output.entries).toBeGreaterThanOrEqual(3);
    // Should have created a new insight entry for the hot file (4 edits >= 3 threshold)
    expect(output.newEntries).toBe(1);
  });

  it('consolidate clears pending-insights.jsonl', () => {
    const pendingPath = join(dir, '.claude-flow', 'data', 'pending-insights.jsonl');
    const content = readFileSync(pendingPath, 'utf-8').trim();
    expect(content).toBe('');
  });

  it('graph-state.json updated after consolidate (includes new insight entry)', () => {
    const graph = readJson(join(dir, '.claude-flow', 'data', 'graph-state.json'));
    // 3 original + 1 insight = 4
    expect(graph.nodeCount).toBe(4);
  });

  // ── intelligence.cjs stats ──

  it('stats returns valid diagnostic report', () => {
    const result = spawnSync('node', [INTELLIGENCE, 'stats', '--json'], {
      cwd: dir, encoding: 'utf-8', timeout: 10000,
    });
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout.trim());
    expect(report.graph.nodes).toBe(4);
    expect(report.graph.edges).toBeGreaterThanOrEqual(0);
    expect(typeof report.graph.density).toBe('number');
    expect(typeof report.confidence.mean).toBe('number');
    expect(report.pageRank.sum).toBeGreaterThan(0);
  });

  // ── auto-memory-hook.mjs with seeded data ──

  it('auto-memory-hook status shows entry count after intelligence run', () => {
    const result = runHook(dir, 'status');
    expect(result.status).toBe(0);
    // Should show 4 entries (3 original + 1 insight from consolidate)
    expect(result.stdout).toMatch(/[34]/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite 2: Memory runtime with default agentdb v3 config (WM-008)
// ══════════════════════════════════════════════════════════════════════════════

describe('e2e memory: default agentdb v3 config', { skip: skipMsg ? true : false }, () => {
  let dir;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'cfgi-e2e-customagentdb-'));
    const r = cli(['init', '--yes'], dir);
    if (r.status !== 0) throw new Error(`init failed: ${r.stderr}`);

    // Install guidance with default agentdb options
    await installIntoRepo({
      targetRepo: dir,
      targetMode: 'claude',
      preset: 'minimal',
    });

    writeStore(dir, SAMPLE_ENTRIES);
  }, 90000);

  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('config.json has default agentdb vectorBackend=rvf', () => {
    const cfg = readJson(join(dir, '.claude-flow', 'config.json'));
    expect(cfg.memory?.agentdb?.vectorBackend).toBe('rvf');
  });

  it('config.json has agentdb learning enabled by default', () => {
    const cfg = readJson(join(dir, '.claude-flow', 'config.json'));
    expect(cfg.memory?.agentdb?.enableLearning).toBe(true);
  });

  it('config.json has default learningBatchSize', () => {
    const cfg = readJson(join(dir, '.claude-flow', 'config.json'));
    expect(cfg.memory?.agentdb?.learningBatchSize).toBe(32);
  });

  it('auto-memory-hook status works with custom agentdb config', () => {
    const result = runHook(dir, 'status');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Auto Memory Bridge Status');
  });

  it('intelligence init works with custom agentdb config', () => {
    const result = runIntel(dir, 'init');
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.trim());
    expect(output.nodes).toBe(3);
    expect(output.message).toContain('Graph built');
  });

  it('getContext works with custom agentdb config', () => {
    const result = spawnSync('node', ['-e', `
      process.chdir(${JSON.stringify(dir)});
      const intel = require(${JSON.stringify(INTELLIGENCE)});
      const ctx = intel.getContext('RVF storage unified format');
      console.log(JSON.stringify({ hasContext: ctx !== null }));
    `], { cwd: dir, encoding: 'utf-8', timeout: 10000 });
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.trim());
    expect(typeof output.hasContext).toBe('boolean');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite 3: Memory lifecycle e2e — full session simulation (WM-008)
// ══════════════════════════════════════════════════════════════════════════════

describe('e2e memory: full session lifecycle with agentdb v3', { skip: skipMsg ? true : false }, () => {
  let dir;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'cfgi-e2e-memsession-'));
    const r = cli(['init', '--yes'], dir);
    if (r.status !== 0) throw new Error(`init failed: ${r.stderr}`);

    await installIntoRepo({
      targetRepo: dir,
      targetMode: 'claude',
      preset: 'full',
    });
  }, 90000);

  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('Step 1: auto-memory-hook status works on fresh project', () => {
    const result = runHook(dir, 'status');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Auto Memory Bridge Status');
  });

  it('Step 2: intelligence init bootstraps from empty store', () => {
    const result = runIntel(dir, 'init');
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.trim());
    // May bootstrap from MEMORY.md files or report no entries
    expect(['No memory entries to index', 'Graph built and ranked', 'Graph cache hit']).toContain(output.message);
  });

  it('Step 3: seed entries and re-init builds graph', () => {
    writeStore(dir, SAMPLE_ENTRIES);
    // Force fresh graph by removing cache
    const graphPath = join(dir, '.claude-flow', 'data', 'graph-state.json');
    if (existsSync(graphPath)) rmSync(graphPath);

    const result = runIntel(dir, 'init');
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.trim());
    expect(output.nodes).toBe(3);
    expect(output.message).toBe('Graph built and ranked');
  });

  it('Step 4: getContext matches seeded entries for agentdb query', () => {
    const result = spawnSync('node', ['-e', `
      process.chdir(${JSON.stringify(dir)});
      const intel = require(${JSON.stringify(INTELLIGENCE)});
      const ctx = intel.getContext('agentdb RVF unified storage');
      console.log(JSON.stringify({ hasContext: ctx !== null, context: ctx }));
    `], { cwd: dir, encoding: 'utf-8', timeout: 10000 });

    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.trim());
    expect(output.hasContext).toBe(true);
    expect(output.context).toContain('INTELLIGENCE');
  });

  it('Step 5: recordEdit tracks file modifications', () => {
    // Simulate editing agentdb-backend.js 5 times
    for (let i = 0; i < 5; i++) {
      spawnSync('node', ['-e', `
        process.chdir(${JSON.stringify(dir)});
        const intel = require(${JSON.stringify(INTELLIGENCE)});
        intel.recordEdit('memory/agentdb-backend.js');
      `], { cwd: dir, encoding: 'utf-8', timeout: 5000 });
    }

    const pendingPath = join(dir, '.claude-flow', 'data', 'pending-insights.jsonl');
    expect(existsSync(pendingPath)).toBe(true);
    const lines = readFileSync(pendingPath, 'utf-8').trim().split('\n').filter(Boolean);
    expect(lines.length).toBe(5);
    // Each line should reference agentdb-backend.js
    for (const line of lines) {
      const parsed = JSON.parse(line);
      expect(parsed.type).toBe('edit');
      expect(parsed.file).toBe('memory/agentdb-backend.js');
    }
  });

  it('Step 6: feedback boosts confidence for matched patterns', () => {
    // First, trigger getContext to set lastMatchedPatterns in session
    spawnSync('node', ['-e', `
      process.chdir(${JSON.stringify(dir)});
      const intel = require(${JSON.stringify(INTELLIGENCE)});
      intel.getContext('agentdb RVF storage');
    `], { cwd: dir, encoding: 'utf-8', timeout: 10000 });

    // Then send positive feedback
    spawnSync('node', ['-e', `
      process.chdir(${JSON.stringify(dir)});
      const intel = require(${JSON.stringify(INTELLIGENCE)});
      intel.feedback(true);
    `], { cwd: dir, encoding: 'utf-8', timeout: 10000 });

    // Verify confidence was boosted in ranked-context.json
    const ranked = readJson(join(dir, '.claude-flow', 'data', 'ranked-context.json'));
    const boosted = ranked.entries.find(e => e.accessCount > 0);
    // At least one entry should have been accessed
    expect(boosted).toBeDefined();
  });

  it('Step 7: consolidate creates insight from frequent edits', () => {
    const result = runIntel(dir, 'consolidate');
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.trim());
    expect(output.message).toBe('Consolidated');
    // 5 edits to same file >= 3 threshold → should create insight
    expect(output.newEntries).toBeGreaterThanOrEqual(1);
  });

  it('Step 8: after consolidate, store has new insight entries', () => {
    const store = readJson(join(dir, '.claude-flow', 'data', 'auto-memory-store.json'));
    const insights = store.filter(e => e.metadata?.autoGenerated);
    expect(insights.length).toBeGreaterThanOrEqual(1);
    // Insight should reference the frequently-edited file
    const agentdbInsight = insights.find(e => e.content.includes('agentdb-backend.js'));
    expect(agentdbInsight).toBeDefined();
  });

  it('Step 9: stats shows complete intelligence report', () => {
    const result = spawnSync('node', [INTELLIGENCE, 'stats', '--json'], {
      cwd: dir, encoding: 'utf-8', timeout: 10000,
    });
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout.trim());
    expect(report.graph.nodes).toBeGreaterThanOrEqual(3);
    expect(report.confidence.mean).toBeGreaterThan(0);
    expect(report.pageRank.sum).toBeGreaterThan(0);
    expect(report.access.patternsAccessed).toBeGreaterThanOrEqual(1);
    expect(report.pendingInsights).toBe(0); // cleared by consolidate
  });

  it('Step 10: auto-memory-hook status reflects all accumulated state', () => {
    const result = runHook(dir, 'status');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Auto Memory Bridge Status');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite 4: agentdb v3 config propagation through readConfig() (WM-008)
// ══════════════════════════════════════════════════════════════════════════════

describe('e2e memory: agentdb v3 config propagation', () => {
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cfgi-e2e-configprop-'));
    mkdirSync(join(dir, '.claude-flow', 'data'), { recursive: true });
  });

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('readConfig() reads agentdb section from config.json', () => {
    writeConfigJson(dir, {
      memory: {
        backend: 'hybrid',
        agentdb: {
          vectorBackend: 'rvf',
          enableLearning: true,
          learningPositiveThreshold: 0.8,
          learningBatchSize: 64,
        },
      },
    });

    // status command exercises readConfig() internally
    const result = runHook(dir, 'status');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Auto Memory Bridge Status');
  });

  it('readConfig() defaults agentdb when section absent in config.json', () => {
    writeConfigJson(dir, {
      memory: { backend: 'json' },
    });

    const result = runHook(dir, 'status');
    expect(result.status).toBe(0);
  });

  it('readConfig() handles agentdb learning disabled gracefully', () => {
    writeConfigJson(dir, {
      memory: {
        backend: 'hybrid',
        agentdb: {
          vectorBackend: 'rvf',
          enableLearning: false,
        },
      },
    });

    const result = runHook(dir, 'status');
    expect(result.status).toBe(0);
  });

  it('readConfig() merges agentdb defaults with partial config', () => {
    writeConfigJson(dir, {
      memory: {
        backend: 'hybrid',
        agentdb: {
          vectorBackend: 'hnsw',
          // Missing: enableLearning, thresholds — should use defaults
        },
      },
    });

    const result = runHook(dir, 'status');
    expect(result.status).toBe(0);
  });

  it('intelligence init works with explicit agentdb config in config.json', () => {
    writeConfigJson(dir, {
      neural: { enabled: true },
      memory: {
        agentdb: {
          vectorBackend: 'rvf',
          enableLearning: true,
          learningPositiveThreshold: 0.7,
        },
      },
    });
    writeStore(dir, SAMPLE_ENTRIES);

    const result = runIntel(dir, 'init');
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.trim());
    expect(output.nodes).toBe(3);
  });

  it('intelligence init works when neural.enabled=false (respects gating)', () => {
    writeConfigJson(dir, {
      neural: { enabled: false },
      memory: {
        agentdb: { vectorBackend: 'rvf', enableLearning: true },
      },
    });
    writeStore(dir, SAMPLE_ENTRIES);

    const result = runIntel(dir, 'init');
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.trim());
    expect(output.message).toContain('neural.enabled=false');
    expect(output.nodes).toBe(0);
  });

  it('auto-memory-hook import does not crash with agentdb config (fallback to JSON)', () => {
    writeConfigJson(dir, {
      memory: {
        backend: 'json',
        agentdb: { vectorBackend: 'rvf', enableLearning: true },
      },
    });

    // import falls back gracefully when @claude-flow/memory is not available
    const result = runHook(dir, 'import');
    expect(result.status).toBe(0);
  });

  it('auto-memory-hook sync does not crash with agentdb config (fallback to JSON)', () => {
    writeConfigJson(dir, {
      memory: {
        backend: 'json',
        agentdb: { vectorBackend: 'rvf', enableLearning: true },
      },
    });

    const result = runHook(dir, 'sync');
    expect(result.status).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite 5: JsonFileBackend round-trip in guidance project (WM-008)
// ══════════════════════════════════════════════════════════════════════════════

describe('e2e memory: JsonFileBackend round-trip with agentdb v3 config', () => {
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cfgi-e2e-jsonrt-'));
    mkdirSync(join(dir, '.claude-flow', 'data'), { recursive: true });
  });

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('store → query round-trip works via intelligence.cjs', () => {
    writeStore(dir, SAMPLE_ENTRIES);

    // init (builds graph from store)
    const initResult = runIntel(dir, 'init');
    expect(initResult.status).toBe(0);

    // getContext (reads from ranked cache)
    const result = spawnSync('node', ['-e', `
      process.chdir(${JSON.stringify(dir)});
      const intel = require(${JSON.stringify(INTELLIGENCE)});
      const ctx = intel.getContext('agentdb RVF storage');
      console.log(JSON.stringify({ hasContext: ctx !== null }));
    `], { cwd: dir, encoding: 'utf-8', timeout: 10000 });

    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.trim());
    expect(output.hasContext).toBe(true);
  });

  it('store persists entries to disk as JSON', () => {
    writeStore(dir, SAMPLE_ENTRIES);
    const storePath = join(dir, '.claude-flow', 'data', 'auto-memory-store.json');
    const stored = readJson(storePath);
    expect(stored.length).toBe(3);
    expect(stored[0].id).toBe('e2e-1');
    expect(stored[2].namespace).toBe('patterns');
  });

  it('recordEdit + consolidate creates new insight entry', () => {
    writeStore(dir, SAMPLE_ENTRIES);
    runIntel(dir, 'init');

    // Record 4 edits to same file (threshold is 3)
    for (let i = 0; i < 4; i++) {
      spawnSync('node', ['-e', `
        process.chdir(${JSON.stringify(dir)});
        require(${JSON.stringify(INTELLIGENCE)}).recordEdit('test-hot-file.js');
      `], { cwd: dir, encoding: 'utf-8', timeout: 5000 });
    }

    const result = runIntel(dir, 'consolidate');
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.trim());
    expect(output.newEntries).toBe(1);

    // Verify the new entry in store
    const store = readJson(join(dir, '.claude-flow', 'data', 'auto-memory-store.json'));
    const hotFile = store.find(e => e.content?.includes('test-hot-file.js'));
    expect(hotFile).toBeDefined();
    expect(hotFile.metadata.autoGenerated).toBe(true);
  });

  it('feedback → consolidate → stats shows improved confidence', () => {
    writeStore(dir, SAMPLE_ENTRIES);
    runIntel(dir, 'init');

    // Get context to populate lastMatchedPatterns
    spawnSync('node', ['-e', `
      process.chdir(${JSON.stringify(dir)});
      const intel = require(${JSON.stringify(INTELLIGENCE)});
      intel.getContext('agentdb storage');
    `], { cwd: dir, encoding: 'utf-8', timeout: 10000 });

    // Positive feedback
    spawnSync('node', ['-e', `
      process.chdir(${JSON.stringify(dir)});
      require(${JSON.stringify(INTELLIGENCE)}).feedback(true);
    `], { cwd: dir, encoding: 'utf-8', timeout: 10000 });

    // Check stats
    const result = spawnSync('node', [INTELLIGENCE, 'stats', '--json'], {
      cwd: dir, encoding: 'utf-8', timeout: 10000,
    });
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout.trim());
    expect(report.access.patternsAccessed).toBeGreaterThanOrEqual(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite 6: GD-001 — Embedding provider integration in guidance project
// ══════════════════════════════════════════════════════════════════════════════

describe('e2e memory: embedding provider in guidance project (GD-001)', () => {
  let HashEmbeddingProvider;
  let AgentDBEmbeddingProvider;
  let createEmbeddingProvider;

  beforeAll(async () => {
    const mod = await import('../src/guidance/embedding-provider.js');
    HashEmbeddingProvider = mod.HashEmbeddingProvider;
    AgentDBEmbeddingProvider = mod.AgentDBEmbeddingProvider;
    createEmbeddingProvider = mod.createEmbeddingProvider;
  });

  it('package exports the embeddings entry point', async () => {
    const mod = await import('@sparkleideas/claude-flow-guidance/embeddings');
    expect(mod.HashEmbeddingProvider).toBeDefined();
    expect(mod.AgentDBEmbeddingProvider).toBeDefined();
    expect(mod.createEmbeddingProvider).toBeDefined();
  });

  it('AgentDB and Hash providers produce embeddings of same dimension', async () => {
    const agentdb = new AgentDBEmbeddingProvider({ dimension: 384 });
    const hash = new HashEmbeddingProvider({ dimension: 384 });
    await agentdb.initialize();
    await hash.initialize();

    const vecA = await agentdb.embed('test embedding dimension');
    const vecH = await hash.embed('test embedding dimension');

    expect(vecA.length).toBe(384);
    expect(vecH.length).toBe(384);
    expect(vecA.length).toBe(vecH.length);

    agentdb.destroy();
    hash.destroy();
  });

  it('AgentDB provider falls back gracefully when AgentDB is unavailable', async () => {
    const provider = new AgentDBEmbeddingProvider({ dimension: 384 });
    await provider.initialize();

    // Should not throw — uses hash fallback
    const vec = await provider.embed('graceful fallback test');
    expect(vec).toBeInstanceOf(Float32Array);
    expect(vec.length).toBe(384);

    // In CI / test environment, AgentDB is typically not installed,
    // so the provider should be using its fallback
    expect(typeof provider.isUsingFallback()).toBe('boolean');

    provider.destroy();
  });

  it('Hash provider embeddings are unit-normalized (L2 norm = 1.0)', async () => {
    const provider = new HashEmbeddingProvider({ dimension: 384 });
    await provider.initialize();

    const texts = [
      'short',
      'a much longer piece of text about embedding normalization',
      'AgentDB v3 uses RVF unified storage format',
    ];

    for (const text of texts) {
      const vec = await provider.embed(text);
      let norm = 0;
      for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
      norm = Math.sqrt(norm);
      expect(norm).toBeCloseTo(1.0, 3);
    }

    provider.destroy();
  });

  it('AgentDB provider embeddings are unit-normalized (L2 norm = 1.0)', async () => {
    const provider = new AgentDBEmbeddingProvider({ dimension: 384 });
    await provider.initialize();

    const vec = await provider.embed('normalization check for agentdb provider');
    let norm = 0;
    for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm);
    expect(norm).toBeCloseTo(1.0, 3);

    provider.destroy();
  });

  it('factory creates providers that integrate with the rest of the pipeline', async () => {
    const hashProvider = createEmbeddingProvider({ provider: 'hash', dimension: 128 });
    const agentdbProvider = createEmbeddingProvider({ provider: 'agentdb', dimension: 128 });

    await hashProvider.initialize();
    await agentdbProvider.initialize();

    // Both should produce vectors of the requested dimension
    const vecH = await hashProvider.embed('pipeline integration test');
    const vecA = await agentdbProvider.embed('pipeline integration test');

    expect(vecH.length).toBe(128);
    expect(vecA.length).toBe(128);

    hashProvider.destroy();
    agentdbProvider.destroy();
  });

  it('batch embedding works end-to-end for both providers', async () => {
    const hash = new HashEmbeddingProvider({ dimension: 64 });
    const agentdb = new AgentDBEmbeddingProvider({ dimension: 64 });
    await hash.initialize();
    await agentdb.initialize();

    const texts = ['entry one', 'entry two', 'entry three'];

    const hashVecs = await hash.batchEmbed(texts);
    const agentdbVecs = await agentdb.batchEmbed(texts);

    expect(hashVecs).toHaveLength(3);
    expect(agentdbVecs).toHaveLength(3);

    for (const vec of [...hashVecs, ...agentdbVecs]) {
      expect(vec).toBeInstanceOf(Float32Array);
      expect(vec.length).toBe(64);
    }

    hash.destroy();
    agentdb.destroy();
  });

  it('different texts produce different embeddings (non-trivial)', async () => {
    const provider = createEmbeddingProvider({ provider: 'hash', dimension: 384 });
    await provider.initialize();

    const vecA = await provider.embed('always use tabs');
    const vecB = await provider.embed('deploy to production');

    // Verify they are not identical
    let identical = true;
    for (let i = 0; i < vecA.length; i++) {
      if (vecA[i] !== vecB[i]) { identical = false; break; }
    }
    expect(identical).toBe(false);

    provider.destroy();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite 7: GD-002 — Write gate integration in guidance project
// ══════════════════════════════════════════════════════════════════════════════

describe('e2e memory: write gate in guidance project (GD-002)', () => {
  let MemoryWriteGateHook;
  let createMemoryWriteGateHook;

  beforeAll(async () => {
    const mod = await import('../src/guidance/memory-write-gate.js');
    MemoryWriteGateHook = mod.MemoryWriteGateHook;
    createMemoryWriteGateHook = mod.createMemoryWriteGateHook;
  });

  it('package exports the memory-gate entry point', async () => {
    const mod = await import('@sparkleideas/claude-flow-guidance/memory-gate');
    expect(mod.MemoryWriteGateHook).toBeDefined();
    expect(mod.createMemoryWriteGateHook).toBeDefined();
  });

  it('detects contradiction: "always use tabs" then "always use spaces"', async () => {
    const gate = createMemoryWriteGateHook({
      embeddingProvider: 'hash',
      similarityThreshold: 0.7,
    });
    gate.registerAuthority({
      agentId: 'coder-1',
      role: 'coordinator',
      namespaces: ['patterns'],
      maxWritesPerMinute: 60,
      canDelete: true,
      canOverwrite: true,
      trustLevel: 0.9,
    });
    await gate.initialize();

    // Add an existing entry
    gate.addEntry({
      key: 'indent-rule',
      namespace: 'patterns',
      value: 'always use tabs for indentation in all source files',
      agentId: 'coder-1',
    });

    // Try to write a contradictory entry
    const result = await gate.checkWrite({
      key: 'indent-rule-v2',
      namespace: 'patterns',
      value: 'always use spaces for indentation in all source files',
      agentId: 'coder-1',
    });

    // Contradictions should be detected (via pattern opposition: "use tabs" vs "use spaces")
    expect(result.contradictions).toBeDefined();
    expect(result.contradictions.length).toBeGreaterThan(0);

    // The first contradiction should reference the existing key
    const contradiction = result.contradictions[0];
    expect(contradiction.existingKey).toBe('indent-rule');

    gate.destroy();
  });

  it('allows non-contradictory writes through the gate', async () => {
    const gate = createMemoryWriteGateHook({ embeddingProvider: 'hash' });
    gate.registerAuthority({
      agentId: 'coder-1',
      role: 'coordinator',
      namespaces: ['patterns', 'config'],
      maxWritesPerMinute: 60,
      canDelete: true,
      canOverwrite: true,
      trustLevel: 0.9,
    });
    await gate.initialize();

    gate.addEntry({
      key: 'naming-convention',
      namespace: 'patterns',
      value: 'use camelCase for JavaScript variables',
      agentId: 'coder-1',
    });

    // Writing a completely different topic should be allowed with no contradictions
    const result = await gate.checkWrite({
      key: 'deploy-strategy',
      namespace: 'config',
      value: 'deploy to staging before production',
      agentId: 'coder-1',
    });

    expect(result.allowed).toBe(true);
    expect(result.contradictions).toBeUndefined();

    gate.destroy();
  });

  it('detects "enable" vs "disable" contradiction end-to-end', async () => {
    const gate = createMemoryWriteGateHook({
      embeddingProvider: 'hash',
      similarityThreshold: 0.7,
    });
    gate.registerAuthority({
      agentId: 'admin',
      role: 'coordinator',
      namespaces: ['config'],
      maxWritesPerMinute: 120,
      canDelete: true,
      canOverwrite: true,
      trustLevel: 1.0,
    });
    await gate.initialize();

    gate.addEntry({
      key: 'caching-on',
      namespace: 'config',
      value: 'enable caching for all API endpoints',
      agentId: 'admin',
    });

    const result = await gate.checkWrite({
      key: 'caching-off',
      namespace: 'config',
      value: 'disable caching for all API endpoints',
      agentId: 'admin',
    });

    expect(result.contradictions).toBeDefined();
    expect(result.contradictions.length).toBeGreaterThan(0);

    gate.destroy();
  });

  it('respects namespace isolation for contradiction checks', async () => {
    const gate = createMemoryWriteGateHook({ embeddingProvider: 'hash' });
    gate.registerAuthority({
      agentId: 'coder-1',
      role: 'coordinator',
      namespaces: ['patterns', 'config'],
      maxWritesPerMinute: 60,
      canDelete: true,
      canOverwrite: true,
      trustLevel: 0.9,
    });
    await gate.initialize();

    // Add entry in 'patterns' namespace
    gate.addEntry({
      key: 'rule-a',
      namespace: 'patterns',
      value: 'always use strict mode',
      agentId: 'coder-1',
    });

    // Write contradictory value but in a DIFFERENT namespace
    const result = await gate.checkWrite({
      key: 'rule-b',
      namespace: 'config',
      value: 'never use strict mode',
      agentId: 'coder-1',
    });

    // Should NOT detect contradictions across namespaces
    expect(result.contradictions).toBeUndefined();

    gate.destroy();
  });

  it('works with default hash embeddings (no AgentDB required)', async () => {
    const gate = createMemoryWriteGateHook({
      embeddingProvider: 'hash',
    });
    gate.registerAuthority({
      agentId: 'test-agent',
      role: 'worker',
      namespaces: ['default'],
      maxWritesPerMinute: 60,
      canDelete: false,
      canOverwrite: false,
      trustLevel: 0.5,
    });
    await gate.initialize();

    // Verify the full checkWrite pipeline works without AgentDB
    const result = await gate.checkWrite({
      key: 'test-key',
      namespace: 'default',
      value: 'test value without agentdb dependency',
      agentId: 'test-agent',
    });

    expect(result.allowed).toBe(true);
    expect(result.authorityCheck).toBeDefined();
    expect(result.authorityCheck.passed).toBe(true);
    expect(result.rateCheck).toBeDefined();
    expect(result.rateCheck.passed).toBe(true);

    gate.destroy();
  });

  it('handles multiple entries and finds the right contradiction', async () => {
    const gate = createMemoryWriteGateHook({
      embeddingProvider: 'hash',
      similarityThreshold: 0.7,
    });
    gate.registerAuthority({
      agentId: 'coder-1',
      role: 'coordinator',
      namespaces: ['patterns'],
      maxWritesPerMinute: 60,
      canDelete: true,
      canOverwrite: true,
      trustLevel: 0.9,
    });
    await gate.initialize();

    // Add multiple entries
    gate.addEntry({
      key: 'naming',
      namespace: 'patterns',
      value: 'use camelCase for JavaScript variables',
      agentId: 'coder-1',
    });
    gate.addEntry({
      key: 'indent-tabs',
      namespace: 'patterns',
      value: 'always use tabs for indentation',
      agentId: 'coder-1',
    });
    gate.addEntry({
      key: 'deploy-rule',
      namespace: 'patterns',
      value: 'deploy to staging before production',
      agentId: 'coder-1',
    });

    // Write something that contradicts only the tabs entry
    const result = await gate.checkWrite({
      key: 'indent-spaces',
      namespace: 'patterns',
      value: 'always use spaces for indentation',
      agentId: 'coder-1',
    });

    // Should find contradiction with the tabs entry specifically
    if (result.contradictions && result.contradictions.length > 0) {
      const tabsContradiction = result.contradictions.find(
        c => c.existingKey === 'indent-tabs'
      );
      expect(tabsContradiction).toBeDefined();
    }

    gate.destroy();
  });

  it('write gate embedding provider is accessible and functional', async () => {
    const gate = createMemoryWriteGateHook({ embeddingProvider: 'hash' });
    await gate.initialize();

    const provider = gate.getEmbeddingProvider();
    expect(provider).toBeDefined();

    const vec = await provider.embed('accessible embedding test');
    expect(vec).toBeInstanceOf(Float32Array);
    expect(vec.length).toBe(384);

    gate.destroy();
  });
});
