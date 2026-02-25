/**
 * Knowledge Layer — null-object factories and helpers for:
 *   truth-anchors, uncertainty, temporal
 *
 * These modules enable multi-agent memory conflict resolution,
 * formal confidence scoring, and bitemporal assertion tracking.
 */

// ============================================================================
// Truth Anchors (ground truth attestations with HMAC signatures)
// ============================================================================

export function createNullTruthAnchorStore() {
  return {
    anchor(params) {
      return { id: `null-anchor-${Date.now()}`, anchorId: `null-anchor-${Date.now()}`, verified: false };
    },
    get(id) { return null; },
    getActive(timestamp) { return []; },
    getCurrentTruth(namespace) { return []; },
    query(opts) { return []; },
    verify(id) { return { valid: true, reason: 'disabled' }; },
    verifyAll() { return { valid: true, invalid: [] }; },
    supersede(oldId, params) {
      return { id: `null-anchor-${Date.now()}`, anchorId: `null-anchor-${Date.now()}`, superseded: oldId };
    },
    resolve(claim, internalBelief) {
      return { resolution: 'internal', confidence: internalBelief?.confidence ?? 0.5 };
    },
    exportAnchors() { return { anchors: [], version: 1 }; },
    importAnchors(data) {},
  };
}

export function createNullTruthResolver() {
  return {
    resolveMemoryConflict(key, value, namespace) {
      return { resolved: true, winner: 'internal', reason: 'disabled' };
    },
    resolveDecisionConflict(action, context) {
      return { resolved: true, action, reason: 'disabled' };
    },
    getGroundTruth(topic) { return null; },
  };
}

// ============================================================================
// Uncertainty (formal confidence intervals with time decay)
// ============================================================================

export function createNullUncertaintyLedger() {
  return {
    assert(claim, namespace, evidence, confidence) {
      return { id: `null-belief-${Date.now()}`, beliefId: `null-belief-${Date.now()}`, confidence: confidence ?? 0.7 };
    },
    addEvidence(beliefId, evidence) {},
    getBelief(id) { return null; },
    query(opts) { return []; },
    getContested() { return []; },
    getUnresolved() { return []; },
    computeConfidence(beliefId) {
      return { point: 0.7, lower: 0.5, upper: 0.9 };
    },
    propagateUncertainty(parentId, childId, weight) {},
    decayAll(currentTime) {},
    resolve(beliefId, status, reason) {},
    isActionable(beliefId) { return true; },
    getConfidenceChain(beliefId) { return []; },
    exportBeliefs() { return { beliefs: [], version: 1 }; },
    importBeliefs(data) {},
    clear() {},
  };
}

export function createNullUncertaintyAggregator() {
  return {
    aggregate(beliefIds) { return { point: 0.7, lower: 0.5, upper: 0.9 }; },
    worstCase(beliefIds) { return { point: 0.5, lower: 0.3, upper: 0.7 }; },
    bestCase(beliefIds) { return { point: 0.9, lower: 0.7, upper: 1.0 }; },
    anyContested(beliefIds) { return false; },
    allConfirmed(beliefIds) { return true; },
  };
}

// ============================================================================
// Temporal (bitemporal assertion store)
// ============================================================================

export function createNullTemporalStore() {
  return {
    assert(claim, namespace, window, opts) {
      return { id: `null-assertion-${Date.now()}`, assertionId: `null-assertion-${Date.now()}` };
    },
    get(id) { return null; },
    getActiveAt(pointInTime, namespace) { return []; },
    getCurrentTruth(namespace) { return []; },
    getHistory(claim, namespace) { return []; },
    query(opts) { return []; },
    supersede(oldId, newClaim, newWindow, opts) {
      return { id: `null-assertion-${Date.now()}`, assertionId: `null-assertion-${Date.now()}` };
    },
    retract(id, reason) {},
    getTimeline(id) { return []; },
    reconcile(namespace, pointInTime) { return { conflicts: [], resolved: [] }; },
    exportAssertions() { return { assertions: [], version: 1 }; },
    importAssertions(data) {},
    pruneExpired(beforeTimestamp) { return 0; },
    clear() {},
  };
}

export function createNullTemporalReasoner() {
  return {
    whatWasTrue(namespace, pointInTime) { return []; },
    whatIsTrue(namespace) { return []; },
    whatWillBeTrue(namespace, futureTime) { return []; },
    hasChanged(namespace, sinceTimestamp) { return false; },
    conflictsAt(namespace, pointInTime) { return []; },
    projectForward(assertionId, futureTimestamp) { return null; },
  };
}
