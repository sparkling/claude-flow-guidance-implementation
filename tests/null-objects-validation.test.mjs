import {
  createNullCoherenceScheduler,
  createNullEconomicGovernor,
  createNullOptimizer,
} from '../src/guidance/validation-layer.js';

// ---------------------------------------------------------------------------
// createNullCoherenceScheduler
// ---------------------------------------------------------------------------
describe('createNullCoherenceScheduler', () => {
  let cs;
  beforeAll(() => { cs = createNullCoherenceScheduler(); });

  it('computeCoherence returns 1.0', () => {
    expect(cs.computeCoherence({}, [])).toBe(1.0);
  });

  it('getPrivilegeLevel returns full', () => {
    expect(cs.getPrivilegeLevel(0.8)).toBe('full');
  });

  it('getScoreHistory returns empty array', () => {
    expect(cs.getScoreHistory()).toEqual([]);
  });

  it('isHealthy returns true', () => {
    expect(cs.isHealthy()).toBe(true);
  });

  it('isDrifting returns false', () => {
    expect(cs.isDrifting()).toBe(false);
  });

  it('shouldRestrict returns false', () => {
    expect(cs.shouldRestrict()).toBe(false);
  });

  it('getRecommendation returns continue', () => {
    expect(cs.getRecommendation()).toBe('continue');
  });
});

// ---------------------------------------------------------------------------
// createNullEconomicGovernor
// ---------------------------------------------------------------------------
describe('createNullEconomicGovernor', () => {
  let eg;
  beforeAll(() => { eg = createNullEconomicGovernor(); });

  it('recordTokenUsage is a no-op', () => {
    expect(() => eg.recordTokenUsage(100)).not.toThrow();
  });

  it('recordToolCall is a no-op', () => {
    expect(() => eg.recordToolCall('Bash', 50)).not.toThrow();
  });

  it('recordStorageUsage is a no-op', () => {
    expect(() => eg.recordStorageUsage(1024)).not.toThrow();
  });

  it('checkBudget returns withinBudget true with empty budgets', () => {
    expect(eg.checkBudget()).toEqual({ withinBudget: true, budgets: {} });
  });

  it('getUsageSummary returns 5 categories with Infinity limits', () => {
    const summary = eg.getUsageSummary();
    expect(summary.tokens).toEqual({ used: 0, limit: Infinity });
    expect(summary.toolCalls).toEqual({ used: 0, limit: Infinity });
    expect(summary.storage).toEqual({ usedBytes: 0, limitBytes: Infinity });
    expect(summary.time).toEqual({ usedMs: 0, limitMs: Infinity });
    expect(summary.cost).toEqual({ usedUsd: 0, limitUsd: Infinity });
  });

  it('resetPeriod is a no-op', () => {
    expect(() => eg.resetPeriod()).not.toThrow();
  });

  it('estimateRemainingCapacity returns Infinity', () => {
    expect(eg.estimateRemainingCapacity()).toBe(Infinity);
  });

  it('getCostEstimate returns 0', () => {
    expect(eg.getCostEstimate()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// createNullOptimizer
// ---------------------------------------------------------------------------
describe('createNullOptimizer', () => {
  let opt;
  beforeAll(() => { opt = createNullOptimizer(); });

  it('runCycle returns skipped result with all expected fields', () => {
    const result = opt.runCycle(null, null);
    expect(result).toEqual({
      skipped: true,
      reason: 'optimizer-disabled',
      cycleNumber: 0,
      violations: [],
      proposedChanges: [],
      promotions: [],
      demotions: [],
    });
  });

  it('proposeChanges returns empty array', () => {
    expect(opt.proposeChanges([], null)).toEqual([]);
  });

  it('evaluateChange returns not improved with zero delta', () => {
    expect(opt.evaluateChange({}, null, null)).toEqual({ improved: false, delta: 0 });
  });

  it('applyPromotions returns the first argument unchanged', () => {
    const bundle = { rules: [] };
    expect(opt.applyPromotions(bundle, [], [])).toBe(bundle);
  });

  it('applyPromotions returns null when given null', () => {
    expect(opt.applyPromotions(null, [], [])).toBeNull();
  });

  it('getADRs returns empty array', () => {
    expect(opt.getADRs()).toEqual([]);
  });

  it('getProposedChanges returns empty array', () => {
    expect(opt.getProposedChanges()).toEqual([]);
  });

  it('getTestResults returns empty array', () => {
    expect(opt.getTestResults()).toEqual([]);
  });

  it('getPromotionTracker returns empty Map', () => {
    const tracker = opt.getPromotionTracker();
    expect(tracker).toBeInstanceOf(Map);
    expect(tracker.size).toBe(0);
  });

  it('lastRun is null', () => {
    expect(opt.lastRun).toBeNull();
  });
});
