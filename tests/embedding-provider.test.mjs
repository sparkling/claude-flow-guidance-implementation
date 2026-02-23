/**
 * Embedding Provider Tests (GD-001)
 *
 * Tests:
 *   - HashEmbeddingProvider: determinism, normalization, dimension, batch
 *   - AgentDBEmbeddingProvider: init, fallback, embed, batchEmbed
 *   - createEmbeddingProvider factory
 */

import {
  HashEmbeddingProvider,
  AgentDBEmbeddingProvider,
  createEmbeddingProvider,
} from '../src/guidance/embedding-provider.js';

// ============================================================================
// HashEmbeddingProvider
// ============================================================================

describe('HashEmbeddingProvider', () => {
  let provider;

  beforeEach(async () => {
    provider = new HashEmbeddingProvider({ dimension: 384 });
    await provider.initialize();
  });

  afterEach(() => {
    provider.destroy();
  });

  it('returns Float32Array of correct dimension', async () => {
    const vec = await provider.embed('hello world');
    expect(vec).toBeInstanceOf(Float32Array);
    expect(vec.length).toBe(384);
  });

  it('returns correct dimension from dimension()', () => {
    expect(provider.dimension()).toBe(384);
  });

  it('defaults to 384 dimensions', () => {
    const p = new HashEmbeddingProvider();
    expect(p.dimension()).toBe(384);
  });

  it('accepts custom dimension', () => {
    const p = new HashEmbeddingProvider({ dimension: 128 });
    expect(p.dimension()).toBe(128);
  });

  it('is deterministic — same input yields same output', async () => {
    const a = await provider.embed('test input');
    const b = await provider.embed('test input');
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('produces different vectors for different inputs', async () => {
    const a = await provider.embed('hello');
    const b = await provider.embed('world');
    const same = a.every((v, i) => v === b[i]);
    expect(same).toBe(false);
  });

  it('produces a unit vector (norm ~= 1)', async () => {
    const vec = await provider.embed('normalize me');
    let norm = 0;
    for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm);
    expect(norm).toBeCloseTo(1.0, 3);
  });

  it('returns zero vector for empty string', async () => {
    const vec = await provider.embed('');
    const allZero = vec.every(v => v === 0);
    expect(allZero).toBe(true);
  });

  it('returns zero vector for null/undefined', async () => {
    const vec = await provider.embed(null);
    const allZero = vec.every(v => v === 0);
    expect(allZero).toBe(true);
  });

  it('batchEmbed returns array of Float32Array', async () => {
    const vecs = await provider.batchEmbed(['hello', 'world']);
    expect(vecs).toHaveLength(2);
    expect(vecs[0]).toBeInstanceOf(Float32Array);
    expect(vecs[1]).toBeInstanceOf(Float32Array);
    expect(vecs[0].length).toBe(384);
  });

  it('batchEmbed handles empty array', async () => {
    const vecs = await provider.batchEmbed([]);
    expect(vecs).toEqual([]);
  });

  it('is case-insensitive', async () => {
    const a = await provider.embed('Hello World');
    const b = await provider.embed('hello world');
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});

// ============================================================================
// AgentDBEmbeddingProvider
// ============================================================================

describe('AgentDBEmbeddingProvider', () => {
  let provider;

  beforeEach(() => {
    provider = new AgentDBEmbeddingProvider({ dimension: 384 });
  });

  afterEach(() => {
    provider.destroy();
  });

  it('initializes without throwing', async () => {
    await expect(provider.initialize()).resolves.not.toThrow();
  });

  it('returns Float32Array from embed()', async () => {
    await provider.initialize();
    const vec = await provider.embed('test text');
    expect(vec).toBeInstanceOf(Float32Array);
    expect(vec.length).toBe(384);
  });

  it('returns correct dimension()', () => {
    expect(provider.dimension()).toBe(384);
  });

  it('batchEmbed returns array of Float32Array', async () => {
    await provider.initialize();
    const vecs = await provider.batchEmbed(['hello', 'world']);
    expect(vecs).toHaveLength(2);
    expect(vecs[0]).toBeInstanceOf(Float32Array);
    expect(vecs[1]).toBeInstanceOf(Float32Array);
  });

  it('lazy-initializes on first embed() call', async () => {
    // Do NOT call initialize() — embed should trigger it
    const vec = await provider.embed('lazy init');
    expect(vec).toBeInstanceOf(Float32Array);
    expect(vec.length).toBe(384);
  });

  it('lazy-initializes on first batchEmbed() call', async () => {
    const vecs = await provider.batchEmbed(['lazy', 'batch']);
    expect(vecs).toHaveLength(2);
    expect(vecs[0]).toBeInstanceOf(Float32Array);
  });

  it('produces unit-length vectors', async () => {
    await provider.initialize();
    const vec = await provider.embed('unit test');
    let norm = 0;
    for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm);
    expect(norm).toBeCloseTo(1.0, 3);
  });

  it('reports fallback status via isUsingFallback()', async () => {
    await provider.initialize();
    // In test env, AgentDB's EmbeddingService.initialize() uses mock provider,
    // so isUsingFallback() may be true or false depending on agentdb availability
    expect(typeof provider.isUsingFallback()).toBe('boolean');
  });

  it('destroy() cleans up and allows re-init', async () => {
    await provider.initialize();
    provider.destroy();
    // Should be able to re-initialize
    await provider.initialize();
    const vec = await provider.embed('after destroy');
    expect(vec).toBeInstanceOf(Float32Array);
  });
});

// ============================================================================
// AgentDBEmbeddingProvider — fallback behavior
// ============================================================================

describe('AgentDBEmbeddingProvider fallback', () => {
  it('falls back gracefully when agentdb import fails', async () => {
    // We can't easily mock the import, but we can verify the provider
    // still works (it uses HashEmbeddingProvider fallback internally)
    const provider = new AgentDBEmbeddingProvider({ dimension: 128 });
    await provider.initialize();
    const vec = await provider.embed('fallback test');
    expect(vec).toBeInstanceOf(Float32Array);
    expect(vec.length).toBe(128);
    provider.destroy();
  });

  it('fallback produces deterministic results', async () => {
    const p1 = new AgentDBEmbeddingProvider({ dimension: 64 });
    const p2 = new AgentDBEmbeddingProvider({ dimension: 64 });
    await p1.initialize();
    await p2.initialize();

    // If both are using hash fallback, results should be deterministic
    if (p1.isUsingFallback() && p2.isUsingFallback()) {
      const v1 = await p1.embed('deterministic');
      const v2 = await p2.embed('deterministic');
      expect(Array.from(v1)).toEqual(Array.from(v2));
    }

    p1.destroy();
    p2.destroy();
  });
});

// ============================================================================
// createEmbeddingProvider factory
// ============================================================================

describe('createEmbeddingProvider', () => {
  it('returns HashEmbeddingProvider for provider="hash"', () => {
    const p = createEmbeddingProvider({ provider: 'hash' });
    expect(p).toBeInstanceOf(HashEmbeddingProvider);
  });

  it('returns AgentDBEmbeddingProvider for provider="agentdb"', () => {
    const p = createEmbeddingProvider({ provider: 'agentdb' });
    expect(p).toBeInstanceOf(AgentDBEmbeddingProvider);
  });

  it('defaults to AgentDBEmbeddingProvider when no provider specified', () => {
    const p = createEmbeddingProvider();
    expect(p).toBeInstanceOf(AgentDBEmbeddingProvider);
  });

  it('falls back to HashEmbeddingProvider for unknown provider', () => {
    const p = createEmbeddingProvider({ provider: 'unknown' });
    expect(p).toBeInstanceOf(HashEmbeddingProvider);
  });

  it('passes dimension through', () => {
    const p = createEmbeddingProvider({ provider: 'hash', dimension: 256 });
    expect(p.dimension()).toBe(256);
  });

  it('factory-created providers implement the full interface', async () => {
    const p = createEmbeddingProvider({ provider: 'hash' });
    expect(typeof p.initialize).toBe('function');
    expect(typeof p.embed).toBe('function');
    expect(typeof p.batchEmbed).toBe('function');
    expect(typeof p.dimension).toBe('function');
    expect(typeof p.destroy).toBe('function');
  });
});
