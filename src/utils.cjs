'use strict';

const { existsSync, readFileSync, mkdirSync, writeFileSync } = require('node:fs');
const { dirname } = require('node:path');

function safeString(value, fallback = '') {
  if (value == null) return fallback;
  return String(value);
}

function toPositiveInteger(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round(parsed);
}

function readJson(filePath, fallback = {}) {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function safeArray(input) {
  return Array.isArray(input) ? input : [];
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function writeJson(filePath, value) {
  ensureDir(dirname(filePath));
  writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function nowIso() {
  return new Date().toISOString();
}

module.exports = {
  safeString,
  toPositiveInteger,
  readJson,
  parseJson,
  safeArray,
  ensureDir,
  writeJson,
  nowIso,
};
