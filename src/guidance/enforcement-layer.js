/**
 * Enforcement Layer — null-object factories and helpers for:
 *   gateway, authority, continue-gate, meta-governance
 *
 * Each createNullXxx() returns an object with the same method signatures as the
 * real upstream module but with no-op implementations returning safe defaults.
 * The advanced-runtime uses these when a component is disabled in components.json.
 */

// ============================================================================
// Gateway (wraps gates with idempotency + schema validation + budget metering)
// ============================================================================

export function createNullToolGateway() {
  return {
    evaluate(toolName, params, context) {
      return { allowed: true, reason: 'gateway-disabled', cached: false };
    },
    recordCall(toolName, params, result, durationMs, tokenCount) {},
    validateSchema(toolName, params) { return { valid: true, errors: [] }; },
    checkBudget() { return { withinBudget: true, remaining: {} }; },
    getIdempotencyKey(toolName, params) { return null; },
    resetBudget() {},
    getBudget() {
      return {
        tokenBudget: { used: 0, limit: Infinity },
        toolCallBudget: { used: 0, limit: Infinity },
        storageBudget: { usedBytes: 0, limitBytes: Infinity },
        timeBudget: { usedMs: 0, limitMs: Infinity },
        costBudget: { usedUsd: 0, limitUsd: Infinity },
      };
    },
    getCallHistory() { return []; },
    getGates() { return null; },
  };
}

// ============================================================================
// Authority (irreversibility classification + escalation hierarchy)
// ============================================================================

export function createNullAuthorityGate() {
  return {
    canPerform(level, action) { return true; },
    requiresEscalation(action) { return false; },
    getMinimumAuthority(action) { return 'agent'; },
    recordIntervention(intervention) {},
    getInterventions() { return []; },
    verifyIntervention(id) { return true; },
    registerScope(scope) {},
  };
}

export function createNullIrreversibilityClassifier() {
  return {
    classify(action) { return 'reversible'; },
    getRequiredProofLevel(action) { return 'standard'; },
    requiresPreCommitSimulation(action) { return false; },
    getPatterns(classification) { return []; },
    addPattern(classification, pattern) {},
  };
}

// ============================================================================
// Continue Gate (budget slope detection + infinite loop prevention)
// ============================================================================

export function createNullContinueGate() {
  return {
    evaluate(context) { return { decision: 'continue', action: 'continue', reason: 'gate-disabled', reasons: [] }; },
    evaluateWithHistory(context) { return { decision: 'continue', action: 'continue', reason: 'gate-disabled', reasons: [] }; },
    getHistory() { return []; },
    getStats() { return { totalEvaluations: 0, stops: 0, pauses: 0, throttles: 0 }; },
    reset() {},
    getConfig() { return {}; },
  };
}

// ============================================================================
// Meta-Governance (constitutional invariants + amendment supermajority)
// ============================================================================

export function createNullMetaGovernor() {
  return {
    addInvariant(invariant) {},
    removeInvariant(id) {},
    checkAllInvariants(state) { return { allPassed: true, results: [] }; },
    proposeAmendment(amendment) { return { id: 'null-amendment', status: 'disabled' }; },
    voteOnAmendment(id, voterId, approve) {},
    resolveAmendment(id) { return { enacted: false, reason: 'disabled' }; },
    enactAmendment(id) {},
    vetoAmendment(id, reason) {},
    getAmendmentHistory() { return []; },
    validateOptimizerAction(action) { return { allowed: true }; },
    getConstraints() { return []; },
    resetOptimizerTracking() {},
    getInvariants() { return []; },
    getPendingAmendments() { return []; },
  };
}
