/**
 * Validation Layer — null-object factories and helpers for:
 *   coherence (scheduler + economic governor), optimizer
 */

// ============================================================================
// Coherence Scheduler (session degradation detection)
// ============================================================================

export function createNullCoherenceScheduler() {
  return {
    computeCoherence(metrics, recentEvents) { return 1.0; },
    getPrivilegeLevel(score) { return 'full'; },
    getScoreHistory() { return []; },
    isHealthy() { return true; },
    isDrifting() { return false; },
    shouldRestrict() { return false; },
    getRecommendation() { return 'continue'; },
  };
}

// ============================================================================
// Economic Governor (budget tracking across 5 resource types)
// ============================================================================

export function createNullEconomicGovernor() {
  return {
    recordTokenUsage(count) {},
    recordToolCall(toolName, durationMs) {},
    recordStorageUsage(bytes) {},
    checkBudget() { return { withinBudget: true, budgets: {} }; },
    getUsageSummary() {
      return {
        tokens: { used: 0, limit: Infinity },
        toolCalls: { used: 0, limit: Infinity },
        storage: { usedBytes: 0, limitBytes: Infinity },
        time: { usedMs: 0, limitMs: Infinity },
        cost: { usedUsd: 0, limitUsd: Infinity },
      };
    },
    resetPeriod() {},
    estimateRemainingCapacity() { return Infinity; },
    getCostEstimate() { return 0; },
  };
}

// ============================================================================
// Optimizer (violation-driven rule evolution — "win twice to promote")
// ============================================================================

export function createNullOptimizer() {
  return {
    runCycle(ledger, currentBundle) {
      return {
        violations: [],
        proposedChanges: [],
        promotions: [],
        demotions: [],
        cycleNumber: 0,
        skipped: true,
        reason: 'optimizer-disabled',
      };
    },
    proposeChanges(violations, bundle) { return []; },
    evaluateChange(change, baseline, ledger) {
      return { improved: false, delta: 0 };
    },
    applyPromotions(bundle, promoted, changes) { return bundle; },
    getADRs() { return []; },
    getProposedChanges() { return []; },
    getTestResults() { return []; },
    getPromotionTracker() { return new Map(); },
    lastRun: null,
  };
}
