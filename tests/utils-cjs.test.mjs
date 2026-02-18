/**
 * Comprehensive unit tests for src/utils.cjs
 *
 * Validates all 8 CJS exports and verifies CJS/ESM parity
 * for the shared function surface.
 *
 * vitest globals are enabled — do NOT import from 'vitest'.
 */

import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as esmUtils from '../src/utils.mjs';

const require = createRequire(import.meta.url);
const utils = require('../src/utils.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDirs = [];

function makeTmp() {
  const dir = mkdtempSync(join(tmpdir(), 'utils-cjs-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const d of tmpDirs) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
  tmpDirs = [];
});

// ---------------------------------------------------------------------------
// CJS/ESM parity
// ---------------------------------------------------------------------------

describe('CJS/ESM parity', () => {
  const sharedNames = [
    'safeString',
    'toPositiveInteger',
    'readJson',
    'parseJson',
    'safeArray',
    'ensureDir',
    'writeJson',
    'nowIso',
  ];

  it('should export exactly the 8 expected functions', () => {
    const exportedKeys = Object.keys(utils).sort();
    expect(exportedKeys).toEqual([...sharedNames].sort());
  });

  it.each(sharedNames)(
    'should export %s as a function matching the ESM version',
    (name) => {
      expect(typeof utils[name]).toBe('function');
      expect(typeof esmUtils[name]).toBe('function');
      // Source parity: same function length (formal parameter count)
      expect(utils[name].length).toBe(esmUtils[name].length);
    },
  );
});

// ---------------------------------------------------------------------------
// safeString
// ---------------------------------------------------------------------------

describe('safeString', () => {
  it('should return the string representation of a string value', () => {
    expect(utils.safeString('hello')).toBe('hello');
  });

  it('should coerce numbers to strings', () => {
    expect(utils.safeString(42)).toBe('42');
    expect(utils.safeString(0)).toBe('0');
    expect(utils.safeString(-1)).toBe('-1');
    expect(utils.safeString(3.14)).toBe('3.14');
  });

  it('should coerce booleans to strings', () => {
    expect(utils.safeString(true)).toBe('true');
    expect(utils.safeString(false)).toBe('false');
  });

  it('should return fallback for null', () => {
    expect(utils.safeString(null)).toBe('');
    expect(utils.safeString(null, 'fb')).toBe('fb');
  });

  it('should return fallback for undefined', () => {
    expect(utils.safeString(undefined)).toBe('');
    expect(utils.safeString(undefined, 'fb')).toBe('fb');
  });

  it('should use empty string as the default fallback', () => {
    expect(utils.safeString(null)).toBe('');
  });

  it('should coerce NaN to string (NaN is not null/undefined)', () => {
    expect(utils.safeString(NaN)).toBe('NaN');
  });

  it('should coerce an empty string to itself (not treated as falsy)', () => {
    expect(utils.safeString('')).toBe('');
  });

  it('should coerce objects via String()', () => {
    expect(utils.safeString({})).toBe('[object Object]');
    expect(utils.safeString([])).toBe('');
  });
});

// ---------------------------------------------------------------------------
// toPositiveInteger
// ---------------------------------------------------------------------------

describe('toPositiveInteger', () => {
  it('should return a rounded positive integer for positive numbers', () => {
    expect(utils.toPositiveInteger(5)).toBe(5);
    expect(utils.toPositiveInteger(3.7)).toBe(4);
    expect(utils.toPositiveInteger(3.2)).toBe(3);
  });

  it('should parse numeric strings', () => {
    expect(utils.toPositiveInteger('10')).toBe(10);
    expect(utils.toPositiveInteger('2.6')).toBe(3);
  });

  it('should return fallback for zero', () => {
    expect(utils.toPositiveInteger(0)).toBe(0);
    expect(utils.toPositiveInteger(0, 99)).toBe(99);
  });

  it('should return fallback for negative numbers', () => {
    expect(utils.toPositiveInteger(-1)).toBe(0);
    expect(utils.toPositiveInteger(-100, 42)).toBe(42);
  });

  it('should return fallback for NaN', () => {
    expect(utils.toPositiveInteger(NaN)).toBe(0);
    expect(utils.toPositiveInteger(NaN, 7)).toBe(7);
  });

  it('should return fallback for Infinity', () => {
    expect(utils.toPositiveInteger(Infinity)).toBe(0);
    expect(utils.toPositiveInteger(-Infinity)).toBe(0);
  });

  it('should return fallback for null', () => {
    expect(utils.toPositiveInteger(null)).toBe(0);
    expect(utils.toPositiveInteger(null, 5)).toBe(5);
  });

  it('should return fallback for undefined', () => {
    expect(utils.toPositiveInteger(undefined)).toBe(0);
    expect(utils.toPositiveInteger(undefined, 5)).toBe(5);
  });

  it('should return fallback for non-numeric strings', () => {
    expect(utils.toPositiveInteger('abc')).toBe(0);
    expect(utils.toPositiveInteger('')).toBe(0);
    expect(utils.toPositiveInteger('not-a-number', 8)).toBe(8);
  });

  it('should return fallback for objects and arrays', () => {
    expect(utils.toPositiveInteger({})).toBe(0);
    expect(utils.toPositiveInteger([])).toBe(0);
  });

  it('should use 0 as the default fallback', () => {
    expect(utils.toPositiveInteger('bad')).toBe(0);
  });

  it('should round 0.5 boundaries correctly (Math.round)', () => {
    expect(utils.toPositiveInteger(1.5)).toBe(2);
    expect(utils.toPositiveInteger(2.5)).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// readJson
// ---------------------------------------------------------------------------

describe('readJson', () => {
  it('should read and parse a valid JSON file', () => {
    const dir = makeTmp();
    const fp = join(dir, 'data.json');
    writeFileSync(fp, JSON.stringify({ key: 'value' }));

    expect(utils.readJson(fp)).toEqual({ key: 'value' });
  });

  it('should return fallback for a non-existent file', () => {
    expect(utils.readJson('/no/such/file.json')).toEqual({});
    expect(utils.readJson('/no/such/file.json', null)).toBeNull();
  });

  it('should return fallback for a file containing malformed JSON', () => {
    const dir = makeTmp();
    const fp = join(dir, 'bad.json');
    writeFileSync(fp, '{not valid json!!!');

    expect(utils.readJson(fp)).toEqual({});
    expect(utils.readJson(fp, [])).toEqual([]);
  });

  it('should return fallback for an empty file', () => {
    const dir = makeTmp();
    const fp = join(dir, 'empty.json');
    writeFileSync(fp, '');

    expect(utils.readJson(fp)).toEqual({});
  });

  it('should use empty object as the default fallback', () => {
    const result = utils.readJson('/definitely/missing.json');
    expect(result).toEqual({});
    expect(typeof result).toBe('object');
  });

  it('should handle JSON arrays', () => {
    const dir = makeTmp();
    const fp = join(dir, 'arr.json');
    writeFileSync(fp, '[1,2,3]');

    expect(utils.readJson(fp)).toEqual([1, 2, 3]);
  });

  it('should handle JSON primitives (string, number, boolean, null)', () => {
    const dir = makeTmp();

    const fpStr = join(dir, 'str.json');
    writeFileSync(fpStr, '"hello"');
    expect(utils.readJson(fpStr)).toBe('hello');

    const fpNum = join(dir, 'num.json');
    writeFileSync(fpNum, '42');
    expect(utils.readJson(fpNum)).toBe(42);

    const fpBool = join(dir, 'bool.json');
    writeFileSync(fpBool, 'true');
    expect(utils.readJson(fpBool)).toBe(true);

    const fpNull = join(dir, 'null.json');
    writeFileSync(fpNull, 'null');
    expect(utils.readJson(fpNull)).toBeNull();
  });

  it('should handle nested JSON objects', () => {
    const dir = makeTmp();
    const fp = join(dir, 'nested.json');
    const data = { a: { b: { c: [1, 2, { d: true }] } } };
    writeFileSync(fp, JSON.stringify(data));

    expect(utils.readJson(fp)).toEqual(data);
  });
});

// ---------------------------------------------------------------------------
// parseJson
// ---------------------------------------------------------------------------

describe('parseJson', () => {
  it('should parse a valid JSON object string', () => {
    expect(utils.parseJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('should parse a valid JSON array string', () => {
    expect(utils.parseJson('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('should return fallback for a JSON string primitive', () => {
    // parsed is a string, typeof string !== 'object'
    expect(utils.parseJson('"hello"')).toEqual({});
    expect(utils.parseJson('"hello"', null)).toBeNull();
  });

  it('should return fallback for a JSON number primitive', () => {
    expect(utils.parseJson('42')).toEqual({});
  });

  it('should return fallback for a JSON boolean primitive', () => {
    expect(utils.parseJson('true')).toEqual({});
    expect(utils.parseJson('false')).toEqual({});
  });

  it('should return fallback for JSON null (typeof null === "object" but !null)', () => {
    // parsed = null, null && ... === null (falsy), so returns fallback
    expect(utils.parseJson('null')).toEqual({});
  });

  it('should return fallback for malformed JSON', () => {
    expect(utils.parseJson('{bad}')).toEqual({});
    expect(utils.parseJson('not json', [])).toEqual([]);
  });

  it('should return fallback for null input', () => {
    expect(utils.parseJson(null)).toEqual({});
    expect(utils.parseJson(null, 'fb')).toBe('fb');
  });

  it('should return fallback for undefined input', () => {
    expect(utils.parseJson(undefined)).toEqual({});
  });

  it('should return fallback for empty string (falsy)', () => {
    expect(utils.parseJson('')).toEqual({});
    expect(utils.parseJson('', [])).toEqual([]);
  });

  it('should return fallback for the number 0 (falsy)', () => {
    expect(utils.parseJson(0)).toEqual({});
  });

  it('should return fallback for false (falsy)', () => {
    expect(utils.parseJson(false)).toEqual({});
  });

  it('should use empty object as the default fallback', () => {
    const result = utils.parseJson('bad');
    expect(result).toEqual({});
  });

  it('should handle deeply nested JSON objects', () => {
    const deep = { a: { b: { c: { d: { e: 'deep' } } } } };
    expect(utils.parseJson(JSON.stringify(deep))).toEqual(deep);
  });
});

// ---------------------------------------------------------------------------
// safeArray
// ---------------------------------------------------------------------------

describe('safeArray', () => {
  it('should return the input when it is an array', () => {
    const arr = [1, 2, 3];
    expect(utils.safeArray(arr)).toBe(arr); // same reference
  });

  it('should return an empty array for null', () => {
    expect(utils.safeArray(null)).toEqual([]);
  });

  it('should return an empty array for undefined', () => {
    expect(utils.safeArray(undefined)).toEqual([]);
  });

  it('should return an empty array for a string', () => {
    expect(utils.safeArray('hello')).toEqual([]);
  });

  it('should return an empty array for a number', () => {
    expect(utils.safeArray(42)).toEqual([]);
  });

  it('should return an empty array for an object', () => {
    expect(utils.safeArray({ length: 2 })).toEqual([]);
  });

  it('should return an empty array for a boolean', () => {
    expect(utils.safeArray(true)).toEqual([]);
    expect(utils.safeArray(false)).toEqual([]);
  });

  it('should preserve an empty array', () => {
    const empty = [];
    expect(utils.safeArray(empty)).toBe(empty);
  });

  it('should return an empty array for NaN', () => {
    expect(utils.safeArray(NaN)).toEqual([]);
  });

  it('should return an empty array for no argument', () => {
    expect(utils.safeArray()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ensureDir
// ---------------------------------------------------------------------------

describe('ensureDir', () => {
  it('should create a single directory', () => {
    const dir = makeTmp();
    const target = join(dir, 'new-dir');

    utils.ensureDir(target);

    expect(existsSync(target)).toBe(true);
  });

  it('should create nested directories recursively', () => {
    const dir = makeTmp();
    const target = join(dir, 'a', 'b', 'c', 'd');

    utils.ensureDir(target);

    expect(existsSync(target)).toBe(true);
  });

  it('should not throw when the directory already exists', () => {
    const dir = makeTmp();

    expect(() => utils.ensureDir(dir)).not.toThrow();
  });

  it('should not throw when called twice on the same path', () => {
    const dir = makeTmp();
    const target = join(dir, 'twice');

    utils.ensureDir(target);
    expect(() => utils.ensureDir(target)).not.toThrow();
    expect(existsSync(target)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// writeJson
// ---------------------------------------------------------------------------

describe('writeJson', () => {
  it('should write JSON with 2-space indentation', () => {
    const dir = makeTmp();
    const fp = join(dir, 'out.json');

    utils.writeJson(fp, { hello: 'world' });

    const raw = readFileSync(fp, 'utf-8');
    expect(raw).toBe(JSON.stringify({ hello: 'world' }, null, 2));
  });

  it('should create parent directories that do not exist', () => {
    const dir = makeTmp();
    const fp = join(dir, 'deep', 'nested', 'dir', 'out.json');

    utils.writeJson(fp, { nested: true });

    expect(existsSync(fp)).toBe(true);
    const parsed = JSON.parse(readFileSync(fp, 'utf-8'));
    expect(parsed).toEqual({ nested: true });
  });

  it('should overwrite an existing file', () => {
    const dir = makeTmp();
    const fp = join(dir, 'overwrite.json');

    utils.writeJson(fp, { v: 1 });
    utils.writeJson(fp, { v: 2 });

    const parsed = JSON.parse(readFileSync(fp, 'utf-8'));
    expect(parsed).toEqual({ v: 2 });
  });

  it('should handle arrays as values', () => {
    const dir = makeTmp();
    const fp = join(dir, 'arr.json');

    utils.writeJson(fp, [1, 2, 3]);

    expect(JSON.parse(readFileSync(fp, 'utf-8'))).toEqual([1, 2, 3]);
  });

  it('should handle null as a value', () => {
    const dir = makeTmp();
    const fp = join(dir, 'null.json');

    utils.writeJson(fp, null);

    expect(readFileSync(fp, 'utf-8')).toBe('null');
  });

  it('should handle strings as values', () => {
    const dir = makeTmp();
    const fp = join(dir, 'str.json');

    utils.writeJson(fp, 'plain string');

    expect(readFileSync(fp, 'utf-8')).toBe('"plain string"');
  });

  it('should produce JSON that readJson can round-trip', () => {
    const dir = makeTmp();
    const fp = join(dir, 'roundtrip.json');
    const data = { users: [{ id: 1, name: 'Alice' }], count: 1 };

    utils.writeJson(fp, data);
    const result = utils.readJson(fp);

    expect(result).toEqual(data);
  });
});

// ---------------------------------------------------------------------------
// nowIso
// ---------------------------------------------------------------------------

describe('nowIso', () => {
  it('should return a string', () => {
    expect(typeof utils.nowIso()).toBe('string');
  });

  it('should return a valid ISO 8601 timestamp', () => {
    const iso = utils.nowIso();
    // ISO 8601 pattern: YYYY-MM-DDTHH:mm:ss.sssZ
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('should return a date close to Date.now()', () => {
    const before = Date.now();
    const iso = utils.nowIso();
    const after = Date.now();

    const ts = new Date(iso).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('should return a parseable date', () => {
    const iso = utils.nowIso();
    const parsed = new Date(iso);
    expect(parsed.toString()).not.toBe('Invalid Date');
  });

  it('should always end with Z (UTC)', () => {
    expect(utils.nowIso().endsWith('Z')).toBe(true);
  });

  it('should produce identical output to the ESM nowIso within a reasonable window', () => {
    const cjsResult = utils.nowIso();
    const esmResult = esmUtils.nowIso();
    // Both should be within 50ms of each other
    const diff = Math.abs(new Date(cjsResult).getTime() - new Date(esmResult).getTime());
    expect(diff).toBeLessThan(50);
  });
});

// ---------------------------------------------------------------------------
// CJS/ESM behavioral parity (spot checks)
// ---------------------------------------------------------------------------

describe('CJS/ESM behavioral parity', () => {
  it('safeString should produce identical output for both modules', () => {
    const inputs = [null, undefined, '', 0, 42, 'abc', true, NaN, {}, []];
    for (const input of inputs) {
      expect(utils.safeString(input)).toBe(esmUtils.safeString(input));
    }
  });

  it('toPositiveInteger should produce identical output for both modules', () => {
    const inputs = [null, undefined, '', 0, -1, 3.7, '10', NaN, Infinity, 'abc', 1.5];
    for (const input of inputs) {
      expect(utils.toPositiveInteger(input)).toBe(esmUtils.toPositiveInteger(input));
    }
  });

  it('parseJson should produce identical output for both modules', () => {
    const inputs = ['{"a":1}', '[1]', '"str"', '42', 'null', 'bad', '', null, undefined, 0];
    for (const input of inputs) {
      expect(utils.parseJson(input)).toEqual(esmUtils.parseJson(input));
    }
  });

  it('safeArray should produce identical output for both modules', () => {
    const inputs = [[], [1, 2], null, undefined, 'str', 42, {}, true];
    for (const input of inputs) {
      expect(utils.safeArray(input)).toEqual(esmUtils.safeArray(input));
    }
  });

  it('readJson should produce identical output for a valid file', () => {
    const dir = makeTmp();
    const fp = join(dir, 'parity.json');
    writeFileSync(fp, '{"parity":true}');

    expect(utils.readJson(fp)).toEqual(esmUtils.readJson(fp));
  });

  it('readJson should produce identical fallback for missing files', () => {
    const missing = '/tmp/no-such-file-parity-check.json';
    expect(utils.readJson(missing)).toEqual(esmUtils.readJson(missing));
  });

  it('writeJson should produce identical file content for both modules', () => {
    const dir = makeTmp();
    const fpCjs = join(dir, 'cjs.json');
    const fpEsm = join(dir, 'esm.json');
    const data = { test: [1, 2, 3], nested: { ok: true } };

    utils.writeJson(fpCjs, data);
    esmUtils.writeJson(fpEsm, data);

    expect(readFileSync(fpCjs, 'utf-8')).toBe(readFileSync(fpEsm, 'utf-8'));
  });
});
