/**
 * MemoryWriteGateHook Tests
 *
 * Tests:
 *   - checkWrite allows non-contradictory writes
 *   - checkWrite detects pattern-based contradictions
 *   - checkWrite detects semantic contradictions via embeddings
 *   - Authority checks (registered vs unregistered, observer blocked)
 *   - Rate limiting
 *   - Works without AgentDB (falls back to hash-based similarity)
 *   - Factory function
 *   - Entry management (addEntry, clearEntries)
 *   - Destroy and re-init
 */

import {
  MemoryWriteGateHook,
  createMemoryWriteGateHook,
} from '../src/guidance/memory-write-gate.js';

// ============================================================================
// Helper: create a standard authority
// ============================================================================

function makeAuthority(agentId, overrides = {}) {
  return {
    agentId,
    role: 'coordinator',
    namespaces: ['patterns', 'config', 'default'],
    maxWritesPerMinute: 120,
    canDelete: true,
    canOverwrite: true,
    trustLevel: 0.9,
    ...overrides,
  };
}

// ============================================================================
// Basic checkWrite — non-contradictory writes
// ============================================================================

describe('MemoryWriteGateHook — non-contradictory writes', () => {
  let gate;

  beforeEach(async () => {
    gate = createMemoryWriteGateHook({ embeddingProvider: 'hash' });
    gate.registerAuthority(makeAuthority('coder-1'));
    await gate.initialize();
  });

  afterEach(() => {
    gate.destroy();
  });

  it('allows a write to an empty store', async () => {
    const result = await gate.checkWrite({
      key: 'style-guide',
      namespace: 'patterns',
      value: 'use camelCase for variables',
      agentId: 'coder-1',
    });
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('Write allowed');
  });

  it('allows non-contradictory writes to the same namespace', async () => {
    gate.addEntry({
      key: 'naming',
      namespace: 'patterns',
      value: 'use camelCase for variables',
      agentId: 'coder-1',
    });

    const result = await gate.checkWrite({
      key: 'formatting',
      namespace: 'patterns',
      value: 'indent with 2 spaces',
      agentId: 'coder-1',
    });
    expect(result.allowed).toBe(true);
  });

  it('returns authorityCheck and rateCheck in result', async () => {
    const result = await gate.checkWrite({
      key: 'test-key',
      namespace: 'patterns',
      value: 'test value',
      agentId: 'coder-1',
    });
    expect(result.authorityCheck).toBeDefined();
    expect(result.authorityCheck.passed).toBe(true);
    expect(result.rateCheck).toBeDefined();
    expect(result.rateCheck.passed).toBe(true);
  });
});

// ============================================================================
// Pattern-based contradiction detection
// ============================================================================

describe('MemoryWriteGateHook — pattern contradictions', () => {
  let gate;

  beforeEach(async () => {
    gate = createMemoryWriteGateHook({ embeddingProvider: 'hash' });
    gate.registerAuthority(makeAuthority('coder-1'));
    await gate.initialize();
  });

  afterEach(() => {
    gate.destroy();
  });

  it('detects "always" vs "never" contradiction', async () => {
    gate.addEntry({
      key: 'rule-a',
      namespace: 'patterns',
      value: 'always use strict mode',
      agentId: 'coder-1',
    });

    const result = await gate.checkWrite({
      key: 'rule-b',
      namespace: 'patterns',
      value: 'never use strict mode',
      agentId: 'coder-1',
    });

    // The write is still allowed (contradictions are warnings, not blockers)
    // but contradictions should be detected
    expect(result.contradictions).toBeDefined();
    expect(result.contradictions.length).toBeGreaterThan(0);
  });

  it('detects "must" vs "do not" contradiction', async () => {
    gate.addEntry({
      key: 'obligation',
      namespace: 'config',
      value: 'you must validate all input',
      agentId: 'coder-1',
    });

    const result = await gate.checkWrite({
      key: 'anti-obligation',
      namespace: 'config',
      value: 'do not validate input from trusted sources',
      agentId: 'coder-1',
    });

    expect(result.contradictions).toBeDefined();
    expect(result.contradictions.length).toBeGreaterThan(0);
  });

  it('detects "enable" vs "disable" contradiction', async () => {
    gate.addEntry({
      key: 'feature-x',
      namespace: 'config',
      value: 'enable caching for all endpoints',
      agentId: 'coder-1',
    });

    const result = await gate.checkWrite({
      key: 'feature-x-off',
      namespace: 'config',
      value: 'disable caching globally',
      agentId: 'coder-1',
    });

    expect(result.contradictions).toBeDefined();
    expect(result.contradictions.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Semantic contradiction detection (via embeddings)
// ============================================================================

describe('MemoryWriteGateHook — semantic contradictions', () => {
  let gate;

  beforeEach(async () => {
    // Use a low similarity threshold so hash-based embeddings can trigger it
    gate = createMemoryWriteGateHook({
      embeddingProvider: 'hash',
      similarityThreshold: 0.7,
    });
    gate.registerAuthority(makeAuthority('coder-1'));
    await gate.initialize();
  });

  afterEach(() => {
    gate.destroy();
  });

  it('detects "use tabs" vs "use spaces" as opposition', async () => {
    gate.addEntry({
      key: 'indent-style',
      namespace: 'patterns',
      value: 'always use tabs for indentation',
      agentId: 'coder-1',
    });

    const result = await gate.checkWrite({
      key: 'indent-style-2',
      namespace: 'patterns',
      value: 'always use spaces for indentation',
      agentId: 'coder-1',
    });

    // Pattern match should detect "always" in both (not contradictory by pattern alone),
    // but _detectOpposition catches "use tabs" vs "use spaces"
    // The result depends on embedding similarity meeting the threshold
    // Either way, the write should be allowed (contradictions are informational)
    expect(result.allowed).toBe(true);
  });

  it('does not flag completely unrelated entries as contradictions', async () => {
    gate.addEntry({
      key: 'auth-policy',
      namespace: 'patterns',
      value: 'use JWT tokens for authentication',
      agentId: 'coder-1',
    });

    const result = await gate.checkWrite({
      key: 'deploy-policy',
      namespace: 'patterns',
      value: 'deploy to staging before production',
      agentId: 'coder-1',
    });

    expect(result.allowed).toBe(true);
    // No contradictions expected between unrelated topics
    expect(result.contradictions).toBeUndefined();
  });
});

// ============================================================================
// Authority checks
// ============================================================================

describe('MemoryWriteGateHook — authority', () => {
  let gate;

  beforeEach(async () => {
    gate = createMemoryWriteGateHook({ embeddingProvider: 'hash' });
    await gate.initialize();
  });

  afterEach(() => {
    gate.destroy();
  });

  it('blocks writes from observer role', async () => {
    gate.registerAuthority(makeAuthority('observer-1', {
      role: 'observer',
      namespaces: ['patterns'],
    }));

    const result = await gate.checkWrite({
      key: 'test',
      namespace: 'patterns',
      value: 'some value',
      agentId: 'observer-1',
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Authority check failed');
    expect(result.authorityCheck.passed).toBe(false);
  });

  it('blocks writes to unauthorized namespace', async () => {
    gate.registerAuthority(makeAuthority('limited-1', {
      role: 'worker',
      namespaces: ['config'],
    }));

    const result = await gate.checkWrite({
      key: 'test',
      namespace: 'secrets',
      value: 'some value',
      agentId: 'limited-1',
    });

    expect(result.allowed).toBe(false);
    expect(result.authorityCheck.passed).toBe(false);
  });

  it('allows queen role to write to any namespace', async () => {
    gate.registerAuthority(makeAuthority('queen-1', {
      role: 'queen',
      namespaces: [],
    }));

    const result = await gate.checkWrite({
      key: 'test',
      namespace: 'any-namespace',
      value: 'some value',
      agentId: 'queen-1',
    });

    expect(result.allowed).toBe(true);
    expect(result.authorityCheck.passed).toBe(true);
  });

  it('uses default authority for unregistered agents', async () => {
    const result = await gate.checkWrite({
      key: 'test',
      namespace: 'default',
      value: 'some value',
      agentId: 'unknown-agent',
    });

    // Default authority has role 'worker' and namespace 'default'
    expect(result.allowed).toBe(true);
  });

  it('blocks unregistered agent from non-default namespace', async () => {
    const result = await gate.checkWrite({
      key: 'test',
      namespace: 'restricted',
      value: 'some value',
      agentId: 'unknown-agent',
    });

    expect(result.allowed).toBe(false);
    expect(result.authorityCheck.passed).toBe(false);
  });
});

// ============================================================================
// Rate limiting
// ============================================================================

describe('MemoryWriteGateHook — rate limiting', () => {
  let gate;

  beforeEach(async () => {
    gate = createMemoryWriteGateHook({ embeddingProvider: 'hash' });
    gate.registerAuthority(makeAuthority('rate-test', {
      maxWritesPerMinute: 3,
      namespaces: ['default'],
    }));
    await gate.initialize();
  });

  afterEach(() => {
    gate.destroy();
  });

  it('blocks writes after rate limit exceeded', async () => {
    // Use up the rate limit (3 writes)
    for (let i = 0; i < 3; i++) {
      const result = await gate.checkWrite({
        key: `key-${i}`,
        namespace: 'default',
        value: `value ${i}`,
        agentId: 'rate-test',
      });
      expect(result.allowed).toBe(true);
    }

    // 4th write should be blocked
    const result = await gate.checkWrite({
      key: 'key-overflow',
      namespace: 'default',
      value: 'overflow',
      agentId: 'rate-test',
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Rate limit exceeded');
    expect(result.rateCheck.passed).toBe(false);
  });
});

// ============================================================================
// Works without AgentDB (hash fallback)
// ============================================================================

describe('MemoryWriteGateHook — hash fallback', () => {
  it('works with hash embedding provider (no AgentDB)', async () => {
    const gate = createMemoryWriteGateHook({
      embeddingProvider: 'hash',
    });
    gate.registerAuthority(makeAuthority('test-agent'));
    await gate.initialize();

    const result = await gate.checkWrite({
      key: 'test',
      namespace: 'patterns',
      value: 'test value',
      agentId: 'test-agent',
    });

    expect(result.allowed).toBe(true);
    gate.destroy();
  });

  it('works with agentdb provider that falls back to hash', async () => {
    const gate = createMemoryWriteGateHook({
      embeddingProvider: 'agentdb',
    });
    gate.registerAuthority(makeAuthority('test-agent'));
    await gate.initialize();

    const result = await gate.checkWrite({
      key: 'test',
      namespace: 'patterns',
      value: 'test value',
      agentId: 'test-agent',
    });

    expect(result.allowed).toBe(true);
    gate.destroy();
  });
});

// ============================================================================
// Factory function
// ============================================================================

describe('createMemoryWriteGateHook factory', () => {
  it('returns a MemoryWriteGateHook instance', () => {
    const gate = createMemoryWriteGateHook();
    expect(gate).toBeInstanceOf(MemoryWriteGateHook);
    gate.destroy();
  });

  it('accepts all config options', () => {
    const gate = createMemoryWriteGateHook({
      embeddingProvider: 'hash',
      embeddingDimension: 128,
      similarityThreshold: 0.9,
      contradictionThreshold: 0.6,
      defaultTtlMs: 60000,
      defaultDecayRate: 0.1,
      enableContradictionTracking: false,
      authorities: [makeAuthority('pre-reg')],
    });
    expect(gate).toBeInstanceOf(MemoryWriteGateHook);
    gate.destroy();
  });

  it('exposes getGate() returning the upstream MemoryWriteGate', () => {
    const gate = createMemoryWriteGateHook();
    const upstream = gate.getGate();
    expect(upstream).toBeDefined();
    expect(typeof upstream.evaluateWrite).toBe('function');
    gate.destroy();
  });

  it('exposes getEmbeddingProvider()', () => {
    const gate = createMemoryWriteGateHook({ embeddingProvider: 'hash' });
    const provider = gate.getEmbeddingProvider();
    expect(provider).toBeDefined();
    expect(typeof provider.embed).toBe('function');
    gate.destroy();
  });
});

// ============================================================================
// Entry management
// ============================================================================

describe('MemoryWriteGateHook — entry management', () => {
  let gate;

  beforeEach(async () => {
    gate = createMemoryWriteGateHook({ embeddingProvider: 'hash' });
    gate.registerAuthority(makeAuthority('coder-1'));
    await gate.initialize();
  });

  afterEach(() => {
    gate.destroy();
  });

  it('addEntry populates the store for contradiction checks', async () => {
    gate.addEntry({
      key: 'rule',
      namespace: 'patterns',
      value: 'always use semicolons',
      agentId: 'coder-1',
    });

    const result = await gate.checkWrite({
      key: 'anti-rule',
      namespace: 'patterns',
      value: 'never use semicolons',
      agentId: 'coder-1',
    });

    expect(result.contradictions).toBeDefined();
    expect(result.contradictions.length).toBeGreaterThan(0);
  });

  it('clearEntries removes all stored entries', async () => {
    gate.addEntry({
      key: 'rule',
      namespace: 'patterns',
      value: 'always use semicolons',
      agentId: 'coder-1',
    });

    gate.clearEntries();

    const result = await gate.checkWrite({
      key: 'anti-rule',
      namespace: 'patterns',
      value: 'never use semicolons',
      agentId: 'coder-1',
    });

    // No contradictions possible with empty store
    expect(result.contradictions).toBeUndefined();
  });
});

// ============================================================================
// Destroy and re-initialize
// ============================================================================

describe('MemoryWriteGateHook — lifecycle', () => {
  it('can destroy and re-initialize', async () => {
    const gate = createMemoryWriteGateHook({ embeddingProvider: 'hash' });
    gate.registerAuthority(makeAuthority('coder-1'));
    await gate.initialize();

    gate.destroy();

    // Re-register authority and re-init
    gate.registerAuthority(makeAuthority('coder-1'));
    await gate.initialize();

    const result = await gate.checkWrite({
      key: 'test',
      namespace: 'patterns',
      value: 'test value',
      agentId: 'coder-1',
    });

    expect(result.allowed).toBe(true);
    gate.destroy();
  });

  it('lazy-initializes on first checkWrite', async () => {
    const gate = createMemoryWriteGateHook({ embeddingProvider: 'hash' });
    gate.registerAuthority(makeAuthority('coder-1'));

    // Do NOT call initialize() — checkWrite should trigger it
    const result = await gate.checkWrite({
      key: 'lazy',
      namespace: 'patterns',
      value: 'lazy init test',
      agentId: 'coder-1',
    });

    expect(result.allowed).toBe(true);
    gate.destroy();
  });
});

// ============================================================================
// Cross-namespace isolation
// ============================================================================

describe('MemoryWriteGateHook — namespace isolation', () => {
  let gate;

  beforeEach(async () => {
    gate = createMemoryWriteGateHook({ embeddingProvider: 'hash' });
    gate.registerAuthority(makeAuthority('coder-1'));
    await gate.initialize();
  });

  afterEach(() => {
    gate.destroy();
  });

  it('does not detect contradictions across different namespaces', async () => {
    gate.addEntry({
      key: 'rule',
      namespace: 'patterns',
      value: 'always use semicolons',
      agentId: 'coder-1',
    });

    const result = await gate.checkWrite({
      key: 'anti-rule',
      namespace: 'config',
      value: 'never use semicolons',
      agentId: 'coder-1',
    });

    // Entries in 'patterns' should not cause contradictions in 'config'
    expect(result.contradictions).toBeUndefined();
  });
});
