import {
  createNullPersistentLedger,
  createNullArtifactLedger,
} from '../src/guidance/observation-layer.js';

// ---------------------------------------------------------------------------
// createNullPersistentLedger
// ---------------------------------------------------------------------------
describe('createNullPersistentLedger', () => {
  let ledger;
  beforeAll(() => { ledger = createNullPersistentLedger(); });

  it('init resolves (async no-op)', async () => {
    await expect(ledger.init()).resolves.toBeUndefined();
  });

  it('save resolves (async no-op)', async () => {
    await expect(ledger.save()).resolves.toBeUndefined();
  });

  it('load resolves (async no-op)', async () => {
    await expect(ledger.load()).resolves.toBeUndefined();
  });

  it('compact resolves (async no-op)', async () => {
    await expect(ledger.compact()).resolves.toBeUndefined();
  });

  it('destroy is a sync no-op', () => {
    expect(() => ledger.destroy()).not.toThrow();
  });

  it('getStorageStats returns expected shape', () => {
    const stats = ledger.getStorageStats();
    expect(stats).toEqual({
      eventCount: expect.any(Number),
      storageBytes: 0,
      lastCompaction: null,
      walEnabled: false,
    });
  });

  it('getEventStore returns null', () => {
    expect(ledger.getEventStore()).toBeNull();
  });

  it('has logEvent function from upstream ledger', () => {
    expect(typeof ledger.logEvent).toBe('function');
  });

  it('has eventCount property from upstream ledger', () => {
    expect(ledger.eventCount).toBeDefined();
    expect(typeof ledger.eventCount).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// createNullArtifactLedger
// ---------------------------------------------------------------------------
describe('createNullArtifactLedger', () => {
  let al;
  beforeAll(() => { al = createNullArtifactLedger(); });

  it('record returns an artifact stub with null-artifact-* id', () => {
    const result = al.record({});
    expect(result.artifactId).toMatch(/^null-artifact-/);
    expect(result.signature).toBeNull();
    expect(result.recorded).toBe(false);
  });

  it('verify returns valid with disabled reason', () => {
    expect(al.verify('x')).toEqual({ valid: true, reason: 'disabled' });
  });

  it('get returns null', () => {
    expect(al.get('x')).toBeNull();
  });

  it('getByRun returns empty array', () => {
    expect(al.getByRun('r')).toEqual([]);
  });

  it('getByKind returns empty array', () => {
    expect(al.getByKind('k')).toEqual([]);
  });

  it('getByCell returns empty array', () => {
    expect(al.getByCell('c')).toEqual([]);
  });

  it('getLineage returns empty parents and children', () => {
    expect(al.getLineage('a')).toEqual({ parents: [], children: [] });
  });

  it('search returns empty array', () => {
    expect(al.search({})).toEqual([]);
  });

  it('export returns empty artifacts with version 1', () => {
    expect(al.export()).toEqual({ artifacts: [], version: 1 });
  });

  it('import is a no-op', () => {
    expect(() => al.import({})).not.toThrow();
  });

  it('getStats returns zeroed stats', () => {
    expect(al.getStats()).toEqual({
      totalArtifacts: 0,
      byKind: {},
      storageBytes: 0,
    });
  });
});
