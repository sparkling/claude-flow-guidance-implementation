/**
 * Wave 1 null-object unit tests — Infrastructure Layer
 *
 * Validates that every null-object factory in infrastructure-layer.js
 * returns safe, inert implementations matching the full API surface.
 */

import {
  createNullCapabilityAlgebra,
  createNullManifestValidator,
  createNullConformanceSuite,
  createNullHeadlessRunner,
  createNullWasmKernel,
  createNullGenerators,
} from '../src/guidance/infrastructure-layer.js';

// ---------------------------------------------------------------------------
// createNullCapabilityAlgebra
// ---------------------------------------------------------------------------
describe('createNullCapabilityAlgebra', () => {
  let algebra;
  beforeEach(() => { algebra = createNullCapabilityAlgebra(); });

  it('grant() returns capabilityId matching null-cap-* with granted false', () => {
    const result = algebra.grant({ scope: 'tool' });
    expect(result.capabilityId).toMatch(/^null-cap-/);
    expect(result.granted).toBe(false);
  });

  it('restrict() returns the capability argument unchanged', () => {
    const cap = { capabilityId: 'test', granted: false };
    expect(algebra.restrict(cap, {})).toBe(cap);
  });

  it('delegate() returns the capability argument unchanged', () => {
    const cap = { capabilityId: 'test', granted: false };
    expect(algebra.delegate(cap, 'agent-2', {})).toBe(cap);
  });

  it('expire() is a no-op', () => {
    expect(() => algebra.expire('id')).not.toThrow();
  });

  it('revoke() is a no-op', () => {
    expect(() => algebra.revoke('id', 'reason')).not.toThrow();
  });

  it('attest() is a no-op', () => {
    expect(() => algebra.attest('id', {})).not.toThrow();
  });

  it('check() returns allowed true with reason capabilities-disabled', () => {
    expect(algebra.check('agent', 'tool', 'Bash', 'execute')).toEqual({
      allowed: true,
      reason: 'capabilities-disabled',
    });
  });

  it('getCapabilities() returns empty array', () => {
    expect(algebra.getCapabilities('agent')).toEqual([]);
  });

  it('getCapability() returns null', () => {
    expect(algebra.getCapability('id')).toBeNull();
  });

  it('getDelegationChain() returns empty array', () => {
    expect(algebra.getDelegationChain('id')).toEqual([]);
  });

  it('compose() returns the first capability', () => {
    const cap1 = { capabilityId: 'a' };
    const cap2 = { capabilityId: 'b' };
    expect(algebra.compose(cap1, cap2)).toBe(cap1);
  });

  it('isSubset() returns true', () => {
    expect(algebra.isSubset({}, {})).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createNullManifestValidator
// ---------------------------------------------------------------------------
describe('createNullManifestValidator', () => {
  let validator;
  beforeEach(() => { validator = createNullManifestValidator(); });

  it('validate() returns valid true with empty errors and warnings', () => {
    expect(validator.validate({})).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it('computeRiskScore() returns 0', () => {
    expect(validator.computeRiskScore({})).toBe(0);
  });

  it('selectLane() returns standard', () => {
    expect(validator.selectLane({}, 0)).toBe('standard');
  });

  it('validateBudgets() returns valid true', () => {
    expect(validator.validateBudgets({})).toEqual({ valid: true });
  });

  it('validateToolPolicy() returns valid true', () => {
    expect(validator.validateToolPolicy({})).toEqual({ valid: true });
  });

  it('validateDataPolicy() returns valid true', () => {
    expect(validator.validateDataPolicy({})).toEqual({ valid: true });
  });
});

// ---------------------------------------------------------------------------
// createNullConformanceSuite
// ---------------------------------------------------------------------------
describe('createNullConformanceSuite', () => {
  let suite;
  beforeEach(() => { suite = createNullConformanceSuite(); });

  it('addTrace() is a no-op', () => {
    expect(() => suite.addTrace({})).not.toThrow();
  });

  it('run() returns passed true with empty results and zero traces', () => {
    expect(suite.run({})).toEqual({ passed: true, results: [], traces: 0 });
  });

  it('getTraces() returns empty array', () => {
    expect(suite.getTraces()).toEqual([]);
  });

  it('createDefaultTraces() returns empty array', () => {
    expect(suite.createDefaultTraces()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// createNullHeadlessRunner
// ---------------------------------------------------------------------------
describe('createNullHeadlessRunner', () => {
  let runner;
  beforeEach(() => { runner = createNullHeadlessRunner(); });

  it('setLedger() is a no-op', () => {
    expect(() => runner.setLedger(null)).not.toThrow();
  });

  it('runTask() returns skipped result with the given task id', async () => {
    const result = await runner.runTask({ id: 'test' });
    expect(result).toEqual({
      taskId: 'test',
      passed: true,
      skipped: true,
      reason: 'headless-disabled',
      assertions: [],
      violations: [],
    });
  });

  it('runTask() without args defaults taskId to null', async () => {
    const result = await runner.runTask();
    expect(result.taskId).toBe('null');
  });

  it('runSuite() counts tasks as skipped', async () => {
    const result = await runner.runSuite([{}, {}], []);
    expect(result).toEqual({
      passed: true,
      total: 0,
      passed_count: 0,
      failed: 0,
      skipped: 2,
      results: [],
    });
  });

  it('runSuite() without args defaults skipped to 0', async () => {
    const result = await runner.runSuite();
    expect(result.skipped).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// createNullWasmKernel
// ---------------------------------------------------------------------------
describe('createNullWasmKernel', () => {
  let kernel;
  beforeEach(() => { kernel = createNullWasmKernel(); });

  it('available is false', () => {
    expect(kernel.available).toBe(false);
  });

  it('version is null-kernel', () => {
    expect(kernel.version).toBe('null-kernel');
  });

  it('sha256() returns a hex string of length 64', () => {
    const hash = kernel.sha256('hello');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('sha256() is deterministic', () => {
    expect(kernel.sha256('hello')).toBe(kernel.sha256('hello'));
  });

  it('sha256() produces different outputs for different inputs', () => {
    expect(kernel.sha256('hello')).not.toBe(kernel.sha256('world'));
  });

  it('hmacSha256() returns a hex string of length 64', () => {
    const mac = kernel.hmacSha256('key', 'hello');
    expect(mac).toMatch(/^[0-9a-f]{64}$/);
  });

  it('contentHash() returns a hex string of length 64', () => {
    const hash = kernel.contentHash('{"a":1}');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('signEnvelope() returns a hex string of length 64', () => {
    const sig = kernel.signEnvelope('key', '{}');
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it('verifyChain() returns true', () => {
    expect(kernel.verifyChain('{}', 'key')).toBe(true);
  });

  it('scanSecrets() returns empty array', () => {
    expect(kernel.scanSecrets('content')).toEqual([]);
  });

  it('detectDestructive() returns null', () => {
    expect(kernel.detectDestructive('rm -rf')).toBeNull();
  });

  it('batchProcess() returns ok true for each operation', () => {
    expect(kernel.batchProcess([{}, {}])).toEqual([{ ok: true }, { ok: true }]);
  });
});

// ---------------------------------------------------------------------------
// createNullGenerators
// ---------------------------------------------------------------------------
describe('createNullGenerators', () => {
  let gen;
  beforeEach(() => { gen = createNullGenerators(); });

  it('generateClaudeMd() returns string containing CLAUDE.md', () => {
    expect(gen.generateClaudeMd({})).toContain('CLAUDE.md');
  });

  it('generateClaudeLocalMd() returns string containing CLAUDE.local.md', () => {
    expect(gen.generateClaudeLocalMd({})).toContain('CLAUDE.local.md');
  });

  it('generateSkillMd() with name returns string containing that name', () => {
    expect(gen.generateSkillMd({ name: 'MySkill' })).toContain('MySkill');
  });

  it('generateSkillMd() without args returns string containing Skill', () => {
    expect(gen.generateSkillMd()).toContain('Skill');
  });

  it('generateAgentMd() with name returns string containing that name', () => {
    expect(gen.generateAgentMd({ name: 'Agent1' })).toContain('Agent1');
  });

  it('generateAgentIndex() returns string containing Agents', () => {
    expect(gen.generateAgentIndex([])).toContain('Agents');
  });

  it('scaffold() returns an object with a files Map', () => {
    const result = gen.scaffold({});
    expect(result).toHaveProperty('files');
    expect(result.files).toBeInstanceOf(Map);
  });
});
