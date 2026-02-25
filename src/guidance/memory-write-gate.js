/**
 * MemoryWriteGate Pre-Write Hook
 *
 * Wraps @claude-flow/guidance's MemoryWriteGate with a simpler checkWrite()
 * interface that CLI memory can call before storing entries. Adds semantic
 * similarity via the EmbeddingProvider for richer contradiction
 * detection beyond the upstream pattern matching.
 *
 * Usage:
 *   import { createMemoryWriteGateHook } from './memory-write-gate.js';
 *   const gate = createMemoryWriteGateHook({ embeddingProvider: 'hash' });
 *   await gate.initialize();
 *   const result = await gate.checkWrite({
 *     key: 'style-rule',
 *     namespace: 'patterns',
 *     value: 'always use tabs',
 *     agentId: 'coder-1',
 *   });
 *   if (!result.allowed) console.log(result.reason, result.contradictions);
 */

import {
  MemoryWriteGate,
  createMemoryWriteGate,
  createMemoryEntry,
} from '@claude-flow/guidance/memory-gate';

import { createEmbeddingProvider } from './embedding-provider.js';

// ============================================================================
// Constants
// ============================================================================

/** Cosine similarity threshold above which two entries are semantically similar */
const DEFAULT_SIMILARITY_THRESHOLD = 0.85;

/** Default authority for unregistered agents */
const DEFAULT_AUTHORITY = {
  agentId: 'anonymous',
  role: 'worker',
  namespaces: ['default'],
  maxWritesPerMinute: 60,
  canDelete: false,
  canOverwrite: false,
  trustLevel: 0.5,
};

// ============================================================================
// Cosine Similarity
// ============================================================================

/**
 * Compute cosine similarity between two Float32Array vectors.
 * Returns a value between -1 and 1 (1 = identical direction).
 */
function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

// ============================================================================
// MemoryWriteGateHook
// ============================================================================

export class MemoryWriteGateHook {
  /**
   * @param {{
   *   embeddingProvider?: 'hash' | 'agentdb',
   *   embeddingDimension?: number,
   *   similarityThreshold?: number,
   *   contradictionThreshold?: number,
   *   defaultTtlMs?: number | null,
   *   defaultDecayRate?: number,
   *   enableContradictionTracking?: boolean,
   *   authorities?: Array<import('@claude-flow/guidance/memory-gate').MemoryAuthority>,
   * }} [options]
   */
  constructor(options = {}) {
    this._similarityThreshold = options.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;

    // Upstream MemoryWriteGate for authority, rate-limit, pattern contradictions
    this._gate = createMemoryWriteGate({
      contradictionThreshold: options.contradictionThreshold,
      defaultTtlMs: options.defaultTtlMs ?? null,
      defaultDecayRate: options.defaultDecayRate ?? 0,
      enableContradictionTracking: options.enableContradictionTracking ?? true,
      authorities: options.authorities,
    });

    // Embedding provider for semantic similarity
    this._embeddingProvider = createEmbeddingProvider({
      provider: options.embeddingProvider ?? 'hash',
      dimension: options.embeddingDimension ?? 384,
    });

    // In-memory store of existing entries (callers can populate via addEntry)
    this._entries = [];

    this._initialized = false;
  }

  async initialize() {
    if (this._initialized) return;
    await this._embeddingProvider.initialize();
    this._initialized = true;
  }

  /**
   * Register an authority for an agent.
   * @param {import('@claude-flow/guidance/memory-gate').MemoryAuthority} authority
   */
  registerAuthority(authority) {
    this._gate.registerAuthority(authority);
  }

  /**
   * Add an existing entry to the gate's entry store, so future checkWrite
   * calls can detect contradictions against it.
   *
   * @param {{ key: string, namespace: string, value: unknown, agentId?: string }} entry
   */
  addEntry(entry) {
    const authority = this._gate.getAuthorityFor(entry.agentId ?? 'anonymous') ?? DEFAULT_AUTHORITY;
    const memEntry = createMemoryEntry(
      entry.key,
      entry.namespace,
      entry.value,
      authority,
    );
    this._entries.push(memEntry);
  }

  /**
   * Clear all stored entries.
   */
  clearEntries() {
    this._entries = [];
  }

  /**
   * Check whether a write should be allowed.
   *
   * @param {{
   *   key: string,
   *   namespace: string,
   *   value: unknown,
   *   agentId: string,
   * }} entry
   * @returns {Promise<{
   *   allowed: boolean,
   *   reason?: string,
   *   contradictions?: Array<{ existingKey: string, description: string, similarity?: number }>,
   *   authorityCheck?: { passed: boolean, requiredRole: string, actualRole: string },
   *   rateCheck?: { passed: boolean, writesInWindow: number, limit: number },
   * }>}
   */
  async checkWrite(entry) {
    if (!this._initialized) await this.initialize();

    const { key, namespace, value, agentId } = entry;

    // Look up the authority for this agent (or use default)
    const authority = this._gate.getAuthorityFor(agentId) ?? {
      ...DEFAULT_AUTHORITY,
      agentId,
    };

    // Filter entries in the same namespace for contradiction check
    const namespaceEntries = this._entries.filter(e => e.namespace === namespace);

    // Step 1: Run upstream evaluateWrite (authority, rate limit, pattern contradictions)
    const decision = this._gate.evaluateWrite(
      authority,
      key,
      namespace,
      value,
      namespaceEntries,
    );

    // Step 2: Semantic similarity contradiction check
    const semanticContradictions = await this._findSemanticContradictions(
      value,
      namespaceEntries,
    );

    // Merge upstream pattern contradictions with semantic contradictions
    const allContradictions = [
      ...decision.contradictions,
      ...semanticContradictions.filter(sc =>
        !decision.contradictions.some(dc => dc.existingKey === sc.existingKey)
      ),
    ];

    return {
      allowed: decision.allowed,
      reason: decision.reason,
      contradictions: allContradictions.length > 0 ? allContradictions : undefined,
      authorityCheck: decision.authorityCheck,
      rateCheck: decision.rateCheck,
    };
  }

  /**
   * Get the underlying MemoryWriteGate instance.
   * @returns {MemoryWriteGate}
   */
  getGate() {
    return this._gate;
  }

  /**
   * Get the embedding provider instance.
   */
  getEmbeddingProvider() {
    return this._embeddingProvider;
  }

  /**
   * Destroy resources.
   */
  destroy() {
    this._embeddingProvider.destroy();
    this._entries = [];
    this._initialized = false;
  }

  // ===== Private =====

  /**
   * Find entries that are semantically similar but potentially contradictory.
   * Uses embedding cosine similarity to find entries with high overlap,
   * then applies pattern-based contradiction detection on those pairs.
   */
  async _findSemanticContradictions(newValue, existingEntries) {
    if (existingEntries.length === 0) return [];

    const newText = typeof newValue === 'string' ? newValue : JSON.stringify(newValue);
    const newVec = await this._embeddingProvider.embed(newText);

    const contradictions = [];

    for (const entry of existingEntries) {
      const existingText = typeof entry.value === 'string'
        ? entry.value
        : JSON.stringify(entry.value);

      const existingVec = await this._embeddingProvider.embed(existingText);
      const similarity = cosineSimilarity(newVec, existingVec);

      if (similarity >= this._similarityThreshold) {
        // High similarity — check if the texts are actually contradictory
        // (topically related but with opposing directives)
        const isContradiction = this._detectOpposition(newText, existingText);
        if (isContradiction) {
          contradictions.push({
            existingKey: entry.key,
            description: `Semantic contradiction (similarity: ${similarity.toFixed(3)}): new value opposes existing entry`,
            similarity,
          });
        }
      }
    }

    return contradictions;
  }

  /**
   * Detect if two texts express opposing directives.
   * Checks for opposing keywords and negation patterns.
   */
  _detectOpposition(textA, textB) {
    const oppositionPairs = [
      [/\balways\b/i, /\bnever\b/i],
      [/\bmust\b/i, /\bnever\b|\bdo\s+not\b|\bdon'?t\b/i],
      [/\brequire\b/i, /\bforbid\b|\bprohibit\b/i],
      [/\benable\b/i, /\bdisable\b/i],
      [/\btrue\b/i, /\bfalse\b/i],
      [/\buse\s+tabs\b/i, /\buse\s+spaces\b/i],
      [/\buse\s+spaces\b/i, /\buse\s+tabs\b/i],
    ];

    for (const [patA, patB] of oppositionPairs) {
      if ((patA.test(textA) && patB.test(textB)) ||
          (patB.test(textA) && patA.test(textB))) {
        return true;
      }
    }

    return false;
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a MemoryWriteGateHook instance.
 *
 * @param {{
 *   embeddingProvider?: 'hash' | 'agentdb',
 *   embeddingDimension?: number,
 *   similarityThreshold?: number,
 *   contradictionThreshold?: number,
 *   defaultTtlMs?: number | null,
 *   defaultDecayRate?: number,
 *   enableContradictionTracking?: boolean,
 *   authorities?: Array<import('@claude-flow/guidance/memory-gate').MemoryAuthority>,
 * }} [options]
 * @returns {MemoryWriteGateHook}
 */
export function createMemoryWriteGateHook(options = {}) {
  return new MemoryWriteGateHook(options);
}
