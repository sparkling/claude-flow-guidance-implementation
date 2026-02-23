/**
 * Embedding Provider Interface & Implementations (GD-001)
 *
 * Defines IEmbeddingProvider — the contract for text-to-vector embeddings
 * used by the guidance runtime and memory subsystem.
 *
 * Implementations:
 *   - HashEmbeddingProvider:    Deterministic hash-based (384D, zero deps, test-only)
 *   - AgentDBEmbeddingProvider: Wraps AgentDB EmbeddingService (real or mock)
 *
 * Usage:
 *   import { createEmbeddingProvider } from './embedding-provider.js';
 *   const provider = createEmbeddingProvider({ provider: 'agentdb' });
 *   await provider.initialize();
 *   const vec = await provider.embed('hello world');  // Float32Array(384)
 */

// ============================================================================
// IEmbeddingProvider — interface contract (enforced by duck-typing)
// ============================================================================

/**
 * @typedef {Object} IEmbeddingProvider
 * @property {() => Promise<void>} initialize - One-time async init
 * @property {(text: string) => Promise<Float32Array>} embed - Single text -> vector
 * @property {(texts: string[]) => Promise<Float32Array[]>} batchEmbed - Batch text -> vectors
 * @property {() => number} dimension - Returns embedding dimension
 * @property {() => void} destroy - Cleanup resources
 */

// ============================================================================
// HashEmbeddingProvider — deterministic, zero-dependency, test-friendly
// ============================================================================

export class HashEmbeddingProvider {
  /**
   * @param {{ dimension?: number }} [options]
   */
  constructor(options = {}) {
    this._dimension = options.dimension ?? 384;
    this._initialized = false;
  }

  async initialize() {
    this._initialized = true;
  }

  /**
   * Generate a deterministic hash-based embedding for text.
   * @param {string} text
   * @returns {Promise<Float32Array>}
   */
  async embed(text) {
    const embedding = new Float32Array(this._dimension);
    const normalized = (text ?? '').toLowerCase().trim();

    if (normalized.length === 0) {
      return embedding; // zero vector for empty input
    }

    // Seed with text hash
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      hash = ((hash << 5) - hash + normalized.charCodeAt(i)) | 0;
    }

    // Generate pseudo-random values
    for (let i = 0; i < this._dimension; i++) {
      const seed = hash + i * 2654435761;
      const x = Math.sin(seed) * 10000;
      embedding[i] = x - Math.floor(x);
    }

    // Normalize to unit vector
    let norm = 0;
    for (let i = 0; i < this._dimension; i++) {
      norm += embedding[i] * embedding[i];
    }
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < this._dimension; i++) {
        embedding[i] /= norm;
      }
    }

    return embedding;
  }

  /**
   * @param {string[]} texts
   * @returns {Promise<Float32Array[]>}
   */
  async batchEmbed(texts) {
    return Promise.all(texts.map(t => this.embed(t)));
  }

  /** @returns {number} */
  dimension() {
    return this._dimension;
  }

  destroy() {
    this._initialized = false;
  }
}

// ============================================================================
// AgentDBEmbeddingProvider — wraps AgentDB's EmbeddingService controller
// ============================================================================

export class AgentDBEmbeddingProvider {
  /**
   * @param {{ dimension?: number, model?: string, provider?: string, dbPath?: string }} [options]
   */
  constructor(options = {}) {
    this._dimension = options.dimension ?? 384;
    this._model = options.model ?? 'Xenova/all-MiniLM-L6-v2';
    this._agentdbProvider = options.provider ?? 'mock';
    this._dbPath = options.dbPath ?? null;
    this._embeddingService = null;
    this._fallback = new HashEmbeddingProvider({ dimension: this._dimension });
    this._initialized = false;
    this._usingFallback = false;
  }

  async initialize() {
    if (this._initialized) return;

    try {
      // Try to import AgentDB's EmbeddingService
      const agentdb = await import('agentdb');

      if (agentdb.EmbeddingService) {
        this._embeddingService = new agentdb.EmbeddingService({
          provider: this._agentdbProvider,
          model: this._model,
          dimension: this._dimension,
        });
        await this._embeddingService.initialize();
        this._usingFallback = false;
      } else {
        this._usingFallback = true;
        await this._fallback.initialize();
      }
    } catch {
      // AgentDB not available — fall back to hash provider
      this._usingFallback = true;
      await this._fallback.initialize();
    }

    this._initialized = true;
  }

  /**
   * @param {string} text
   * @returns {Promise<Float32Array>}
   */
  async embed(text) {
    if (!this._initialized) await this.initialize();

    if (this._usingFallback) {
      return this._fallback.embed(text);
    }

    try {
      const result = await this._embeddingService.embed(text);
      // AgentDB returns Float32Array or number[] depending on the provider
      if (result instanceof Float32Array) {
        return result;
      }
      return new Float32Array(result);
    } catch {
      // On embed failure, fall back for this call
      return this._fallback.embed(text);
    }
  }

  /**
   * @param {string[]} texts
   * @returns {Promise<Float32Array[]>}
   */
  async batchEmbed(texts) {
    if (!this._initialized) await this.initialize();

    if (this._usingFallback) {
      return this._fallback.batchEmbed(texts);
    }

    try {
      const results = await this._embeddingService.embedBatch(texts);
      return results.map(r =>
        r instanceof Float32Array ? r : new Float32Array(r)
      );
    } catch {
      // Fall back for the entire batch
      return this._fallback.batchEmbed(texts);
    }
  }

  /** @returns {number} */
  dimension() {
    return this._dimension;
  }

  /** @returns {boolean} */
  isUsingFallback() {
    return this._usingFallback;
  }

  destroy() {
    if (this._embeddingService?.clearCache) {
      this._embeddingService.clearCache();
    }
    this._fallback.destroy();
    this._embeddingService = null;
    this._initialized = false;
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create an embedding provider by name.
 *
 * @param {{ provider?: 'hash' | 'agentdb', dimension?: number, model?: string, dbPath?: string }} [options]
 * @returns {IEmbeddingProvider}
 */
export function createEmbeddingProvider(options = {}) {
  const name = options.provider ?? 'agentdb';

  switch (name) {
    case 'hash':
      return new HashEmbeddingProvider(options);
    case 'agentdb':
      return new AgentDBEmbeddingProvider(options);
    default:
      return new HashEmbeddingProvider(options);
  }
}
