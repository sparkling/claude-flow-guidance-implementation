import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function safeString(value, fallback = '') {
  if (value == null) return fallback;
  return String(value);
}

export function toPositiveInteger(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round(parsed);
}

export function readJson(filePath, fallback = {}) {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

export function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function safeArray(input) {
  return Array.isArray(input) ? input : [];
}

export function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

export function writeJson(filePath, value) {
  ensureDir(dirname(filePath));
  writeFileSync(filePath, JSON.stringify(value, null, 2));
}

export function nowIso() {
  return new Date().toISOString();
}

export function outcomeFromHookResult(result) {
  if (!result) return 'warn';
  if (!result.success || result.aborted) return 'deny';
  if ((result.warnings?.length ?? 0) > 0) return 'warn';
  return 'allow';
}

export function severityFromThreat(threat) {
  if ((threat?.severity ?? 0) >= 0.8) return 'high';
  if ((threat?.severity ?? 0) >= 0.5) return 'medium';
  return 'low';
}
