/**
 * Wave 1 null-object unit tests — Knowledge Layer
 *
 * Validates that every null-object factory in knowledge-layer.js
 * returns safe, inert implementations matching the full API surface.
 */

import {
  createNullTruthAnchorStore,
  createNullTruthResolver,
  createNullUncertaintyLedger,
  createNullUncertaintyAggregator,
  createNullTemporalStore,
  createNullTemporalReasoner,
} from '../src/guidance/knowledge-layer.js';

// ---------------------------------------------------------------------------
// createNullTruthAnchorStore
// ---------------------------------------------------------------------------
describe('createNullTruthAnchorStore', () => {
  let store;
  beforeEach(() => { store = createNullTruthAnchorStore(); });

  it('anchor() returns an object with anchorId matching null-anchor-* and verified false', () => {
    const result = store.anchor({ kind: 'test' });
    expect(result.anchorId).toMatch(/^null-anchor-/);
    expect(result.verified).toBe(false);
  });

  it('get() returns null', () => {
    expect(store.get('x')).toBeNull();
  });

  it('getActive() returns empty array', () => {
    expect(store.getActive()).toEqual([]);
  });

  it('getCurrentTruth() returns empty array', () => {
    expect(store.getCurrentTruth('ns')).toEqual([]);
  });

  it('query() returns empty array', () => {
    expect(store.query({})).toEqual([]);
  });

  it('verify() returns valid true with reason disabled', () => {
    expect(store.verify('x')).toEqual({ valid: true, reason: 'disabled' });
  });

  it('verifyAll() returns valid true with empty invalid array', () => {
    expect(store.verifyAll()).toEqual({ valid: true, invalid: [] });
  });

  it('supersede() returns anchorId matching null-anchor-* with superseded field', () => {
    const result = store.supersede('old', {});
    expect(result.anchorId).toMatch(/^null-anchor-/);
    expect(result.superseded).toBe('old');
  });

  it('resolve() passes through confidence from internalBelief', () => {
    const result = store.resolve('claim', { confidence: 0.8 });
    expect(result).toEqual({ resolution: 'internal', confidence: 0.8 });
  });

  it('resolve() defaults confidence to 0.5 when internalBelief is null', () => {
    const result = store.resolve('claim', null);
    expect(result.confidence).toBe(0.5);
  });

  it('exportAnchors() returns empty anchors with version 1', () => {
    expect(store.exportAnchors()).toEqual({ anchors: [], version: 1 });
  });

  it('importAnchors() is a no-op (does not throw)', () => {
    expect(() => store.importAnchors({})).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// createNullTruthResolver
// ---------------------------------------------------------------------------
describe('createNullTruthResolver', () => {
  let resolver;
  beforeEach(() => { resolver = createNullTruthResolver(); });

  it('resolveMemoryConflict() returns resolved true with winner internal', () => {
    expect(resolver.resolveMemoryConflict('key', 'val', 'ns')).toEqual({
      resolved: true,
      winner: 'internal',
      reason: 'disabled',
    });
  });

  it('resolveDecisionConflict() passes through the action argument', () => {
    expect(resolver.resolveDecisionConflict('deploy', {})).toEqual({
      resolved: true,
      action: 'deploy',
      reason: 'disabled',
    });
  });

  it('getGroundTruth() returns null', () => {
    expect(resolver.getGroundTruth('topic')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createNullUncertaintyLedger
// ---------------------------------------------------------------------------
describe('createNullUncertaintyLedger', () => {
  let ledger;
  beforeEach(() => { ledger = createNullUncertaintyLedger(); });

  it('assert() returns beliefId matching null-belief-* with given confidence', () => {
    const result = ledger.assert('claim', 'ns', 'evidence', 0.9);
    expect(result.beliefId).toMatch(/^null-belief-/);
    expect(result.confidence).toBe(0.9);
  });

  it('assert() defaults confidence to 0.7 when not provided', () => {
    const result = ledger.assert('claim', 'ns', null);
    expect(result.confidence).toBe(0.7);
  });

  it('addEvidence() is a no-op', () => {
    expect(() => ledger.addEvidence('id', 'more')).not.toThrow();
  });

  it('getBelief() returns null', () => {
    expect(ledger.getBelief('id')).toBeNull();
  });

  it('query() returns empty array', () => {
    expect(ledger.query({})).toEqual([]);
  });

  it('getContested() returns empty array', () => {
    expect(ledger.getContested()).toEqual([]);
  });

  it('getUnresolved() returns empty array', () => {
    expect(ledger.getUnresolved()).toEqual([]);
  });

  it('computeConfidence() returns default interval', () => {
    expect(ledger.computeConfidence('id')).toEqual({ point: 0.7, lower: 0.5, upper: 0.9 });
  });

  it('propagateUncertainty() is a no-op', () => {
    expect(() => ledger.propagateUncertainty('p', 'c', 0.5)).not.toThrow();
  });

  it('decayAll() is a no-op', () => {
    expect(() => ledger.decayAll(Date.now())).not.toThrow();
  });

  it('resolve() is a no-op', () => {
    expect(() => ledger.resolve('id', 'confirmed', 'test')).not.toThrow();
  });

  it('isActionable() returns true', () => {
    expect(ledger.isActionable('id')).toBe(true);
  });

  it('getConfidenceChain() returns empty array', () => {
    expect(ledger.getConfidenceChain('id')).toEqual([]);
  });

  it('exportBeliefs() returns empty beliefs with version 1', () => {
    expect(ledger.exportBeliefs()).toEqual({ beliefs: [], version: 1 });
  });

  it('importBeliefs() is a no-op', () => {
    expect(() => ledger.importBeliefs({})).not.toThrow();
  });

  it('clear() is a no-op', () => {
    expect(() => ledger.clear()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// createNullUncertaintyAggregator
// ---------------------------------------------------------------------------
describe('createNullUncertaintyAggregator', () => {
  let agg;
  beforeEach(() => { agg = createNullUncertaintyAggregator(); });

  it('aggregate() returns default interval', () => {
    expect(agg.aggregate(['a', 'b'])).toEqual({ point: 0.7, lower: 0.5, upper: 0.9 });
  });

  it('worstCase() returns pessimistic interval', () => {
    expect(agg.worstCase(['a'])).toEqual({ point: 0.5, lower: 0.3, upper: 0.7 });
  });

  it('bestCase() returns optimistic interval', () => {
    expect(agg.bestCase(['a'])).toEqual({ point: 0.9, lower: 0.7, upper: 1.0 });
  });

  it('anyContested() returns false', () => {
    expect(agg.anyContested(['a'])).toBe(false);
  });

  it('allConfirmed() returns true', () => {
    expect(agg.allConfirmed(['a'])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createNullTemporalStore
// ---------------------------------------------------------------------------
describe('createNullTemporalStore', () => {
  let store;
  beforeEach(() => { store = createNullTemporalStore(); });

  it('assert() returns assertionId matching null-assertion-*', () => {
    const result = store.assert('claim', 'ns', {}, {});
    expect(result.assertionId).toMatch(/^null-assertion-/);
  });

  it('get() returns null', () => {
    expect(store.get('x')).toBeNull();
  });

  it('getActiveAt() returns empty array', () => {
    expect(store.getActiveAt(Date.now(), 'ns')).toEqual([]);
  });

  it('getCurrentTruth() returns empty array', () => {
    expect(store.getCurrentTruth('ns')).toEqual([]);
  });

  it('getHistory() returns empty array', () => {
    expect(store.getHistory('claim', 'ns')).toEqual([]);
  });

  it('query() returns empty array', () => {
    expect(store.query({})).toEqual([]);
  });

  it('supersede() returns assertionId matching null-assertion-*', () => {
    const result = store.supersede('old', 'new', {});
    expect(result.assertionId).toMatch(/^null-assertion-/);
  });

  it('retract() is a no-op', () => {
    expect(() => store.retract('id', 'reason')).not.toThrow();
  });

  it('getTimeline() returns empty array', () => {
    expect(store.getTimeline('id')).toEqual([]);
  });

  it('reconcile() returns empty conflicts and resolved', () => {
    expect(store.reconcile('ns', Date.now())).toEqual({ conflicts: [], resolved: [] });
  });

  it('exportAssertions() returns empty assertions with version 1', () => {
    expect(store.exportAssertions()).toEqual({ assertions: [], version: 1 });
  });

  it('importAssertions() is a no-op', () => {
    expect(() => store.importAssertions({})).not.toThrow();
  });

  it('pruneExpired() returns 0', () => {
    expect(store.pruneExpired(Date.now())).toBe(0);
  });

  it('clear() is a no-op', () => {
    expect(() => store.clear()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// createNullTemporalReasoner
// ---------------------------------------------------------------------------
describe('createNullTemporalReasoner', () => {
  let reasoner;
  beforeEach(() => { reasoner = createNullTemporalReasoner(); });

  it('whatWasTrue() returns empty array', () => {
    expect(reasoner.whatWasTrue('ns', Date.now())).toEqual([]);
  });

  it('whatIsTrue() returns empty array', () => {
    expect(reasoner.whatIsTrue('ns')).toEqual([]);
  });

  it('whatWillBeTrue() returns empty array', () => {
    expect(reasoner.whatWillBeTrue('ns', Date.now() + 100000)).toEqual([]);
  });

  it('hasChanged() returns false', () => {
    expect(reasoner.hasChanged('ns', Date.now() - 100000)).toBe(false);
  });

  it('conflictsAt() returns empty array', () => {
    expect(reasoner.conflictsAt('ns', Date.now())).toEqual([]);
  });

  it('projectForward() returns null', () => {
    expect(reasoner.projectForward('id', Date.now() + 100000)).toBeNull();
  });
});
