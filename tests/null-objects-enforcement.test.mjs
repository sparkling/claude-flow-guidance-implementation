import {
  createNullToolGateway,
  createNullAuthorityGate,
  createNullIrreversibilityClassifier,
  createNullContinueGate,
  createNullMetaGovernor,
} from '../src/guidance/enforcement-layer.js';

// ---------------------------------------------------------------------------
// createNullToolGateway
// ---------------------------------------------------------------------------
describe('createNullToolGateway', () => {
  let gw;
  beforeAll(() => { gw = createNullToolGateway(); });

  it('evaluate returns allowed with gateway-disabled reason', () => {
    expect(gw.evaluate('Bash', { command: 'rm -rf /' })).toEqual({
      allowed: true,
      reason: 'gateway-disabled',
      cached: false,
    });
  });

  it('recordCall is a no-op (does not throw)', () => {
    expect(() => gw.recordCall('Bash', { command: 'ls' }, {}, 50, 10)).not.toThrow();
  });

  it('validateSchema returns valid with empty errors', () => {
    expect(gw.validateSchema('Bash', { command: 'ls' })).toEqual({
      valid: true,
      errors: [],
    });
  });

  it('checkBudget returns withinBudget true', () => {
    expect(gw.checkBudget()).toEqual({ withinBudget: true, remaining: {} });
  });

  it('getIdempotencyKey returns null', () => {
    expect(gw.getIdempotencyKey('Bash', { command: 'ls' })).toBeNull();
  });

  it('resetBudget is a no-op', () => {
    expect(() => gw.resetBudget()).not.toThrow();
  });

  it('getBudget returns all 5 budget types with Infinity limits and zero usage', () => {
    const budget = gw.getBudget();
    expect(budget.tokenBudget).toEqual({ used: 0, limit: Infinity });
    expect(budget.toolCallBudget).toEqual({ used: 0, limit: Infinity });
    expect(budget.storageBudget).toEqual({ usedBytes: 0, limitBytes: Infinity });
    expect(budget.timeBudget).toEqual({ usedMs: 0, limitMs: Infinity });
    expect(budget.costBudget).toEqual({ usedUsd: 0, limitUsd: Infinity });
  });

  it('getCallHistory returns empty array', () => {
    expect(gw.getCallHistory()).toEqual([]);
  });

  it('getGates returns null', () => {
    expect(gw.getGates()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createNullAuthorityGate
// ---------------------------------------------------------------------------
describe('createNullAuthorityGate', () => {
  let auth;
  beforeAll(() => { auth = createNullAuthorityGate(); });

  it('canPerform returns true for any action', () => {
    expect(auth.canPerform('agent', 'rm -rf /')).toBe(true);
  });

  it('requiresEscalation returns false', () => {
    expect(auth.requiresEscalation('anything')).toBe(false);
  });

  it('getMinimumAuthority returns agent', () => {
    expect(auth.getMinimumAuthority('anything')).toBe('agent');
  });

  it('recordIntervention is a no-op', () => {
    expect(() => auth.recordIntervention({ type: 'test', reason: 'test' })).not.toThrow();
  });

  it('getInterventions returns empty array', () => {
    expect(auth.getInterventions()).toEqual([]);
  });

  it('verifyIntervention returns true', () => {
    expect(auth.verifyIntervention('any')).toBe(true);
  });

  it('registerScope is a no-op', () => {
    expect(() => auth.registerScope({})).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// createNullIrreversibilityClassifier
// ---------------------------------------------------------------------------
describe('createNullIrreversibilityClassifier', () => {
  let cls;
  beforeAll(() => { cls = createNullIrreversibilityClassifier(); });

  it('classify returns reversible for any action', () => {
    expect(cls.classify('rm -rf /')).toBe('reversible');
  });

  it('getRequiredProofLevel returns standard', () => {
    expect(cls.getRequiredProofLevel('anything')).toBe('standard');
  });

  it('requiresPreCommitSimulation returns false', () => {
    expect(cls.requiresPreCommitSimulation('anything')).toBe(false);
  });

  it('getPatterns returns empty array', () => {
    expect(cls.getPatterns('irreversible')).toEqual([]);
  });

  it('addPattern is a no-op', () => {
    expect(() => cls.addPattern('irreversible', /rm/)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// createNullContinueGate
// ---------------------------------------------------------------------------
describe('createNullContinueGate', () => {
  let gate;
  beforeAll(() => { gate = createNullContinueGate(); });

  it('evaluate returns continue with gate-disabled reason', () => {
    const result = gate.evaluate({});
    expect(result.action).toBe('continue');
    expect(result.decision).toBe('continue');
    expect(result.reason).toBe('gate-disabled');
  });

  it('evaluateWithHistory returns continue with gate-disabled reason', () => {
    const result = gate.evaluateWithHistory({});
    expect(result.action).toBe('continue');
    expect(result.decision).toBe('continue');
    expect(result.reason).toBe('gate-disabled');
  });

  it('getHistory returns empty array', () => {
    expect(gate.getHistory()).toEqual([]);
  });

  it('getStats returns all-zero counters', () => {
    expect(gate.getStats()).toEqual({
      totalEvaluations: 0,
      stops: 0,
      pauses: 0,
      throttles: 0,
    });
  });

  it('reset is a no-op', () => {
    expect(() => gate.reset()).not.toThrow();
  });

  it('getConfig returns empty object', () => {
    expect(gate.getConfig()).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// createNullMetaGovernor
// ---------------------------------------------------------------------------
describe('createNullMetaGovernor', () => {
  let gov;
  beforeAll(() => { gov = createNullMetaGovernor(); });

  it('addInvariant is a no-op', () => {
    expect(() => gov.addInvariant({ id: 'test' })).not.toThrow();
  });

  it('removeInvariant is a no-op', () => {
    expect(() => gov.removeInvariant('test')).not.toThrow();
  });

  it('checkAllInvariants returns allPassed with empty results', () => {
    expect(gov.checkAllInvariants({})).toEqual({ allPassed: true, results: [] });
  });

  it('proposeAmendment returns null-amendment with disabled status', () => {
    expect(gov.proposeAmendment({})).toEqual({ id: 'null-amendment', status: 'disabled' });
  });

  it('voteOnAmendment is a no-op', () => {
    expect(() => gov.voteOnAmendment('id', 'voter', true)).not.toThrow();
  });

  it('resolveAmendment returns enacted false with disabled reason', () => {
    expect(gov.resolveAmendment('test')).toEqual({ enacted: false, reason: 'disabled' });
  });

  it('enactAmendment is a no-op', () => {
    expect(() => gov.enactAmendment('test')).not.toThrow();
  });

  it('vetoAmendment is a no-op', () => {
    expect(() => gov.vetoAmendment('test', 'reason')).not.toThrow();
  });

  it('getAmendmentHistory returns empty array', () => {
    expect(gov.getAmendmentHistory()).toEqual([]);
  });

  it('validateOptimizerAction returns allowed', () => {
    expect(gov.validateOptimizerAction({})).toEqual({ allowed: true });
  });

  it('getConstraints returns empty array', () => {
    expect(gov.getConstraints()).toEqual([]);
  });

  it('resetOptimizerTracking is a no-op', () => {
    expect(() => gov.resetOptimizerTracking()).not.toThrow();
  });

  it('getInvariants returns empty array', () => {
    expect(gov.getInvariants()).toEqual([]);
  });

  it('getPendingAmendments returns empty array', () => {
    expect(gov.getPendingAmendments()).toEqual([]);
  });
});
