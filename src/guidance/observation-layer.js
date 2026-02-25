/**
 * Observation Layer — null-object factories and helpers for:
 *   persistence, artifacts
 *
 * persistence's null-object falls back to the in-memory createLedger() from upstream,
 * preserving existing behavior when disabled.
 */

import { createLedger } from '@claude-flow/guidance/ledger';

// ============================================================================
// Persistence (NDJSON event store with compaction + WAL)
// ============================================================================

/**
 * When persistence is disabled, fall back to the standard in-memory ledger.
 * This preserves the exact existing behavior.
 */
export function createNullPersistentLedger() {
  const ledger = createLedger();
  // Add no-op methods that PersistentLedger exposes but RunLedger does not
  ledger.init = async () => {};
  ledger.save = async () => {};
  ledger.load = async () => {};
  ledger.compact = async () => {};
  ledger.destroy = () => {};
  ledger.getStorageStats = () => ({
    eventCount: ledger.eventCount ?? 0,
    storageBytes: 0,
    lastCompaction: null,
    walEnabled: false,
  });
  ledger.getEventStore = () => null;
  return ledger;
}

// ============================================================================
// Artifacts (signed artifact records + lineage tracking)
// ============================================================================

export function createNullArtifactLedger() {
  return {
    record(params) {
      return {
        artifactId: `null-artifact-${Date.now()}`,
        signature: null,
        recorded: false,
      };
    },
    verify(artifactId) { return { valid: true, reason: 'disabled' }; },
    get(artifactId) { return null; },
    getByRun(runId) { return []; },
    getByKind(kind) { return []; },
    getByCell(cellId) { return []; },
    getLineage(artifactId) { return { parents: [], children: [] }; },
    search(query) { return []; },
    export() { return { artifacts: [], version: 1 }; },
    import(data) {},
    getStats() {
      return { totalArtifacts: 0, byKind: {}, storageBytes: 0 };
    },
  };
}
