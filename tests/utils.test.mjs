import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  safeString,
  toPositiveInteger,
  readJson,
  parseJson,
  safeArray,
  ensureDir,
  writeJson,
  nowIso,
  outcomeFromHookResult,
  severityFromThreat,
} from '../src/utils.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tempDir;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'utils-test-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// ===========================================================================
// safeString
// ===========================================================================

describe('safeString', () => {
  it('returns fallback for null', () => {
    expect(safeString(null, 'fb')).toBe('fb');
  });

  it('returns fallback for undefined', () => {
    expect(safeString(undefined, 'fb')).toBe('fb');
  });

  it('returns default empty string fallback when no fallback given and value is null', () => {
    expect(safeString(null)).toBe('');
  });

  it('returns default empty string fallback when no fallback given and value is undefined', () => {
    expect(safeString(undefined)).toBe('');
  });

  it('stringifies a number', () => {
    expect(safeString(42)).toBe('42');
  });

  it('stringifies zero', () => {
    expect(safeString(0)).toBe('0');
  });

  it('stringifies false', () => {
    expect(safeString(false)).toBe('false');
  });

  it('returns empty string as-is (does not treat it as falsy)', () => {
    expect(safeString('', 'fb')).toBe('');
  });

  it('returns a regular string unchanged', () => {
    expect(safeString('hello')).toBe('hello');
  });

  it('stringifies NaN', () => {
    expect(safeString(NaN)).toBe('NaN');
  });

  it('stringifies an object', () => {
    expect(safeString({ a: 1 })).toBe('[object Object]');
  });

  it('stringifies an array', () => {
    expect(safeString([1, 2])).toBe('1,2');
  });

  it('stringifies Infinity', () => {
    expect(safeString(Infinity)).toBe('Infinity');
  });
});

// ===========================================================================
// toPositiveInteger
// ===========================================================================

describe('toPositiveInteger', () => {
  it('returns a positive integer as-is', () => {
    expect(toPositiveInteger(5)).toBe(5);
  });

  it('rounds a positive float', () => {
    expect(toPositiveInteger(3.7)).toBe(4);
  });

  it('rounds 3.2 down', () => {
    expect(toPositiveInteger(3.2)).toBe(3);
  });

  it('parses a numeric string', () => {
    expect(toPositiveInteger('10')).toBe(10);
  });

  it('parses a float string and rounds', () => {
    expect(toPositiveInteger('7.5')).toBe(8);
  });

  it('returns fallback for zero (not positive)', () => {
    expect(toPositiveInteger(0, 99)).toBe(99);
  });

  it('returns fallback for negative number', () => {
    expect(toPositiveInteger(-5, 99)).toBe(99);
  });

  it('returns fallback for NaN', () => {
    expect(toPositiveInteger(NaN, 42)).toBe(42);
  });

  it('returns fallback for Infinity', () => {
    expect(toPositiveInteger(Infinity, 42)).toBe(42);
  });

  it('returns fallback for -Infinity', () => {
    expect(toPositiveInteger(-Infinity, 42)).toBe(42);
  });

  it('returns fallback for null', () => {
    expect(toPositiveInteger(null, 42)).toBe(42);
  });

  it('returns fallback for undefined', () => {
    expect(toPositiveInteger(undefined, 42)).toBe(42);
  });

  it('returns fallback for empty string', () => {
    expect(toPositiveInteger('', 42)).toBe(42);
  });

  it('returns fallback for non-numeric string', () => {
    expect(toPositiveInteger('abc', 42)).toBe(42);
  });

  it('returns default fallback of 0 when no fallback provided', () => {
    expect(toPositiveInteger('not-a-number')).toBe(0);
  });

  it('handles very large positive numbers', () => {
    expect(toPositiveInteger(1e15)).toBe(1e15);
  });
});

// ===========================================================================
// readJson
// ===========================================================================

describe('readJson', () => {
  it('reads and parses a valid JSON file', () => {
    const filePath = join(tempDir, 'valid.json');
    writeFileSync(filePath, JSON.stringify({ key: 'value' }));

    expect(readJson(filePath)).toEqual({ key: 'value' });
  });

  it('returns fallback when file does not exist', () => {
    const filePath = join(tempDir, 'missing.json');
    expect(readJson(filePath, { def: true })).toEqual({ def: true });
  });

  it('returns default fallback (empty object) when file does not exist and no fallback given', () => {
    const filePath = join(tempDir, 'missing.json');
    expect(readJson(filePath)).toEqual({});
  });

  it('returns fallback when file contains invalid JSON', () => {
    const filePath = join(tempDir, 'bad.json');
    writeFileSync(filePath, '{ not valid json !!!');

    expect(readJson(filePath, { fallback: true })).toEqual({ fallback: true });
  });

  it('returns fallback when file is empty', () => {
    const filePath = join(tempDir, 'empty.json');
    writeFileSync(filePath, '');

    expect(readJson(filePath, 'nope')).toBe('nope');
  });

  it('reads a JSON array', () => {
    const filePath = join(tempDir, 'array.json');
    writeFileSync(filePath, JSON.stringify([1, 2, 3]));

    expect(readJson(filePath)).toEqual([1, 2, 3]);
  });

  it('reads a JSON string value', () => {
    const filePath = join(tempDir, 'string.json');
    writeFileSync(filePath, '"hello"');

    expect(readJson(filePath)).toBe('hello');
  });

  it('reads nested JSON', () => {
    const filePath = join(tempDir, 'nested.json');
    writeFileSync(filePath, JSON.stringify({ a: { b: { c: 1 } } }));

    expect(readJson(filePath)).toEqual({ a: { b: { c: 1 } } });
  });
});

// ===========================================================================
// parseJson
// ===========================================================================

describe('parseJson', () => {
  it('parses a valid JSON object string', () => {
    expect(parseJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses a valid JSON array string', () => {
    expect(parseJson('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('returns fallback for a JSON string primitive (not an object)', () => {
    expect(parseJson('"hello"', { fb: true })).toEqual({ fb: true });
  });

  it('returns fallback for a JSON number primitive', () => {
    expect(parseJson('42', { fb: true })).toEqual({ fb: true });
  });

  it('returns fallback for a JSON boolean primitive', () => {
    expect(parseJson('true', { fb: true })).toEqual({ fb: true });
  });

  it('returns fallback for JSON null', () => {
    expect(parseJson('null', { fb: true })).toEqual({ fb: true });
  });

  it('returns fallback for malformed JSON', () => {
    expect(parseJson('{bad', { fb: true })).toEqual({ fb: true });
  });

  it('returns fallback for empty string', () => {
    expect(parseJson('', { fb: true })).toEqual({ fb: true });
  });

  it('returns fallback for null input', () => {
    expect(parseJson(null, { fb: true })).toEqual({ fb: true });
  });

  it('returns fallback for undefined input', () => {
    expect(parseJson(undefined, { fb: true })).toEqual({ fb: true });
  });

  it('returns fallback for zero input', () => {
    expect(parseJson(0, { fb: true })).toEqual({ fb: true });
  });

  it('returns fallback for false input', () => {
    expect(parseJson(false, { fb: true })).toEqual({ fb: true });
  });

  it('returns default fallback (empty object) when no fallback given', () => {
    expect(parseJson(null)).toEqual({});
  });

  it('parses nested object', () => {
    expect(parseJson('{"a":{"b":2}}')).toEqual({ a: { b: 2 } });
  });
});

// ===========================================================================
// safeArray
// ===========================================================================

describe('safeArray', () => {
  it('returns an array unchanged', () => {
    const arr = [1, 2, 3];
    expect(safeArray(arr)).toBe(arr);
  });

  it('returns empty array for empty array input', () => {
    expect(safeArray([])).toEqual([]);
  });

  it('returns empty array for null', () => {
    expect(safeArray(null)).toEqual([]);
  });

  it('returns empty array for undefined', () => {
    expect(safeArray(undefined)).toEqual([]);
  });

  it('returns empty array for a string', () => {
    expect(safeArray('hello')).toEqual([]);
  });

  it('returns empty array for a number', () => {
    expect(safeArray(42)).toEqual([]);
  });

  it('returns empty array for an object', () => {
    expect(safeArray({ a: 1 })).toEqual([]);
  });

  it('returns empty array for a boolean', () => {
    expect(safeArray(true)).toEqual([]);
  });

  it('preserves array reference identity', () => {
    const arr = ['a', 'b'];
    expect(safeArray(arr)).toBe(arr);
  });
});

// ===========================================================================
// ensureDir
// ===========================================================================

describe('ensureDir', () => {
  it('creates a single directory', () => {
    const dir = join(tempDir, 'single');
    ensureDir(dir);
    expect(existsSync(dir)).toBe(true);
  });

  it('creates nested directories recursively', () => {
    const dir = join(tempDir, 'a', 'b', 'c');
    ensureDir(dir);
    expect(existsSync(dir)).toBe(true);
  });

  it('does not throw if directory already exists', () => {
    const dir = join(tempDir, 'existing');
    ensureDir(dir);
    expect(() => ensureDir(dir)).not.toThrow();
  });
});

// ===========================================================================
// writeJson
// ===========================================================================

describe('writeJson', () => {
  it('writes an object as pretty-printed JSON', () => {
    const filePath = join(tempDir, 'out.json');
    writeJson(filePath, { key: 'value' });

    const raw = readFileSync(filePath, 'utf-8');
    expect(JSON.parse(raw)).toEqual({ key: 'value' });
    expect(raw).toBe(JSON.stringify({ key: 'value' }, null, 2));
  });

  it('creates parent directories that do not exist', () => {
    const filePath = join(tempDir, 'deep', 'nested', 'file.json');
    writeJson(filePath, { nested: true });

    expect(existsSync(filePath)).toBe(true);
    expect(JSON.parse(readFileSync(filePath, 'utf-8'))).toEqual({ nested: true });
  });

  it('writes an array', () => {
    const filePath = join(tempDir, 'array.json');
    writeJson(filePath, [1, 2, 3]);

    expect(JSON.parse(readFileSync(filePath, 'utf-8'))).toEqual([1, 2, 3]);
  });

  it('writes null', () => {
    const filePath = join(tempDir, 'null.json');
    writeJson(filePath, null);

    expect(readFileSync(filePath, 'utf-8')).toBe('null');
  });

  it('overwrites an existing file', () => {
    const filePath = join(tempDir, 'overwrite.json');
    writeJson(filePath, { first: true });
    writeJson(filePath, { second: true });

    expect(JSON.parse(readFileSync(filePath, 'utf-8'))).toEqual({ second: true });
  });

  it('writes an empty object', () => {
    const filePath = join(tempDir, 'empty.json');
    writeJson(filePath, {});

    expect(JSON.parse(readFileSync(filePath, 'utf-8'))).toEqual({});
  });
});

// ===========================================================================
// nowIso
// ===========================================================================

describe('nowIso', () => {
  it('returns a string', () => {
    expect(typeof nowIso()).toBe('string');
  });

  it('returns a valid ISO 8601 date string', () => {
    const iso = nowIso();
    const parsed = new Date(iso);
    expect(parsed.toISOString()).toBe(iso);
  });

  it('returns a time close to the current time', () => {
    const before = Date.now();
    const iso = nowIso();
    const after = Date.now();
    const ts = new Date(iso).getTime();

    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('contains a T separator and Z suffix', () => {
    const iso = nowIso();
    expect(iso).toContain('T');
    expect(iso).toMatch(/Z$/);
  });
});

// ===========================================================================
// outcomeFromHookResult
// ===========================================================================

describe('outcomeFromHookResult', () => {
  it('returns "allow" for a successful result with no warnings', () => {
    expect(outcomeFromHookResult({ success: true })).toBe('allow');
  });

  it('returns "allow" for a successful result with empty warnings array', () => {
    expect(outcomeFromHookResult({ success: true, warnings: [] })).toBe('allow');
  });

  it('returns "warn" for null result', () => {
    expect(outcomeFromHookResult(null)).toBe('warn');
  });

  it('returns "warn" for undefined result', () => {
    expect(outcomeFromHookResult(undefined)).toBe('warn');
  });

  it('returns "warn" for false result', () => {
    expect(outcomeFromHookResult(false)).toBe('warn');
  });

  it('returns "warn" for zero result', () => {
    expect(outcomeFromHookResult(0)).toBe('warn');
  });

  it('returns "warn" for empty string result', () => {
    expect(outcomeFromHookResult('')).toBe('warn');
  });

  it('returns "deny" when success is false', () => {
    expect(outcomeFromHookResult({ success: false })).toBe('deny');
  });

  it('returns "deny" when success is missing (undefined)', () => {
    expect(outcomeFromHookResult({})).toBe('deny');
  });

  it('returns "deny" when aborted is true even if success is true', () => {
    expect(outcomeFromHookResult({ success: true, aborted: true })).toBe('deny');
  });

  it('returns "warn" when success is true and warnings array is non-empty', () => {
    expect(outcomeFromHookResult({ success: true, warnings: ['something'] })).toBe('warn');
  });

  it('returns "warn" when success is true and warnings has multiple entries', () => {
    expect(outcomeFromHookResult({ success: true, warnings: ['a', 'b'] })).toBe('warn');
  });

  it('returns "allow" when success is true and warnings is undefined', () => {
    expect(outcomeFromHookResult({ success: true, warnings: undefined })).toBe('allow');
  });

  it('returns "allow" when success is true and warnings is null', () => {
    expect(outcomeFromHookResult({ success: true, warnings: null })).toBe('allow');
  });

  it('returns "deny" when success is true but aborted is truthy (non-boolean)', () => {
    expect(outcomeFromHookResult({ success: true, aborted: 1 })).toBe('deny');
  });
});

// ===========================================================================
// severityFromThreat
// ===========================================================================

describe('severityFromThreat', () => {
  it('returns "high" for severity >= 0.8', () => {
    expect(severityFromThreat({ severity: 0.8 })).toBe('high');
  });

  it('returns "high" for severity = 1.0', () => {
    expect(severityFromThreat({ severity: 1.0 })).toBe('high');
  });

  it('returns "high" for severity = 0.95', () => {
    expect(severityFromThreat({ severity: 0.95 })).toBe('high');
  });

  it('returns "medium" for severity = 0.5', () => {
    expect(severityFromThreat({ severity: 0.5 })).toBe('medium');
  });

  it('returns "medium" for severity = 0.79', () => {
    expect(severityFromThreat({ severity: 0.79 })).toBe('medium');
  });

  it('returns "medium" for severity = 0.6', () => {
    expect(severityFromThreat({ severity: 0.6 })).toBe('medium');
  });

  it('returns "low" for severity = 0.49', () => {
    expect(severityFromThreat({ severity: 0.49 })).toBe('low');
  });

  it('returns "low" for severity = 0', () => {
    expect(severityFromThreat({ severity: 0 })).toBe('low');
  });

  it('returns "low" for severity = 0.1', () => {
    expect(severityFromThreat({ severity: 0.1 })).toBe('low');
  });

  it('returns "low" for negative severity', () => {
    expect(severityFromThreat({ severity: -1 })).toBe('low');
  });

  it('returns "low" for null threat', () => {
    expect(severityFromThreat(null)).toBe('low');
  });

  it('returns "low" for undefined threat', () => {
    expect(severityFromThreat(undefined)).toBe('low');
  });

  it('returns "low" for threat without severity property', () => {
    expect(severityFromThreat({})).toBe('low');
  });

  it('returns "low" for threat with severity undefined', () => {
    expect(severityFromThreat({ severity: undefined })).toBe('low');
  });

  it('returns "low" for threat with severity null', () => {
    expect(severityFromThreat({ severity: null })).toBe('low');
  });

  it('returns "high" for severity exactly at boundary (0.8)', () => {
    expect(severityFromThreat({ severity: 0.8 })).toBe('high');
  });

  it('returns "medium" for severity exactly at boundary (0.5)', () => {
    expect(severityFromThreat({ severity: 0.5 })).toBe('medium');
  });
});
