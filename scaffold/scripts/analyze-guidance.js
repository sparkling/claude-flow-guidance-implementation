#!/usr/bin/env node
/**
 * Analyze CLAUDE.md files with @claude-flow/guidance
 *
 * Compiles the project's CLAUDE.md into a policy bundle,
 * scores it across 6 dimensions, and reports the results.
 *
 * Usage: node scripts/analyze-guidance.js [--optimize]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// Import guidance modules
const { analyze, autoOptimize, formatReport, formatBenchmark } = await import('@claude-flow/guidance/analyzer');
const { createGuidanceControlPlane } = await import('@claude-flow/guidance');
const { createGuidancePhase1Runtime } = await import('../src/guidance/phase1-runtime.js');

const DATA_DIR = resolve(root, '.claude-flow/guidance');
const CLAUDE_MD = resolve(root, 'CLAUDE.md');
const PARENT_CLAUDE_MD = resolve(root, '..', 'CLAUDE.md');
const CLAUDE_LOCAL_MD = resolve(root, 'CLAUDE.local.md');

// Ensure data dir exists
mkdirSync(DATA_DIR, { recursive: true });

// --- 1. Read CLAUDE.md files ---
console.log('=== @claude-flow/guidance - CLAUDE.md Analysis ===\n');

let content;
try {
  content = readFileSync(CLAUDE_MD, 'utf-8');
  console.log(`Loaded: ${CLAUDE_MD} (${content.split('\n').length} lines)`);
} catch {
  console.error(`ERROR: Cannot read ${CLAUDE_MD}`);
  process.exit(1);
}

let parentContent = null;
try {
  parentContent = readFileSync(PARENT_CLAUDE_MD, 'utf-8');
  console.log(`Loaded: ${PARENT_CLAUDE_MD} (${parentContent.split('\n').length} lines)`);
} catch {
  // Parent CLAUDE.md is optional
}

let localContent = null;
try {
  localContent = readFileSync(CLAUDE_LOCAL_MD, 'utf-8');
  console.log(`Loaded: ${CLAUDE_LOCAL_MD} (${localContent.split('\n').length} lines)`);
} catch {
  // Local CLAUDE.local.md is optional
}

// --- 2. Analyze ---
console.log('\n--- Analysis Results ---\n');
const result = analyze(content, localContent ?? undefined);

console.log(formatReport(result));

// --- 3. Initialize Control Plane ---
console.log('\n--- Policy Bundle Compilation ---\n');

try {
  const plane = createGuidanceControlPlane({
    rootGuidancePath: CLAUDE_MD,
    localGuidancePath: localContent ? CLAUDE_LOCAL_MD : undefined,
    dataDir: DATA_DIR,
  });
  await plane.initialize();

  const status = plane.getStatus();
  console.log(`Constitution loaded: ${status.constitutionLoaded}`);
  console.log(`Shards compiled:     ${status.shardCount}`);
  console.log(`Active gates:        ${status.activeGates}`);
  console.log(`Initialized:         ${status.initialized}`);

  // Save bundle for inspection
  const bundle = plane.getBundle();
  if (bundle) {
    const bundleSummary = {
      constitutionHash: bundle.constitution.hash,
      constitutionRuleCount: bundle.constitution.rules.length,
      shardCount: bundle.shards.length,
      shards: bundle.shards.map(s => ({
        id: s.rule.id,
        riskClass: s.rule.riskClass,
        intents: s.rule.intents,
        domains: s.rule.domains,
        text: s.rule.text.slice(0, 120) + (s.rule.text.length > 120 ? '...' : ''),
      })),
      compiledAt: new Date().toISOString(),
    };
    writeFileSync(
      resolve(DATA_DIR, 'bundle-summary.json'),
      JSON.stringify(bundleSummary, null, 2)
    );
    console.log(`\nBundle saved to: .claude-flow/guidance/bundle-summary.json`);
  }

  // Test retrieval for a sample task
  console.log('\n--- Sample Shard Retrieval ---\n');
  const tasks = [
    'Apply for a graph database specialist role',
    'Update LinkedIn profile with HSBC experience',
    'Build consulting website with portfolio',
    'Fix a bug in the automation scripts',
  ];

  for (const task of tasks) {
    try {
      const guidance = await plane.retrieveForTask({ taskDescription: task, maxShards: 3 });
      console.log(`Task: "${task}"`);
      console.log(`  Intent: ${guidance.detectedIntent}, Shards: ${guidance.shards.length}, Latency: ${guidance.latencyMs.toFixed(2)}ms`);
      console.log(`  Policy text: ${guidance.policyText.length} chars`);
      if (guidance.shards.length > 0) {
        for (const s of guidance.shards.slice(0, 2)) {
          const similarity = typeof s.similarity === 'number' ? s.similarity.toFixed(2) : '?';
          const text = s.shard?.rule?.text ?? JSON.stringify(s).slice(0, 80);
          console.log(`    - [${similarity}] ${String(text).slice(0, 90)}`);
        }
      }
      console.log();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.log(`Task: "${task}" -> retrieval error: ${message}\n`);
    }
  }

  // Hook pipeline smoke-check
  console.log('--- Phase-1 Hook Runtime Smoke Check ---\n');
  const runtime = createGuidancePhase1Runtime({
    rootDir: root,
    rootGuidancePath: 'CLAUDE.md',
    localGuidancePath: localContent ? 'CLAUDE.local.md' : null,
  });
  await runtime.initialize();

  const hookTaskId = `analysis-${Date.now()}`;
  const preTask = await runtime.preTask({
    taskId: hookTaskId,
    taskDescription: 'Analyze guidance and wire runtime hooks',
  });
  console.log(`PreTask: success=${preTask.success}, aborted=${Boolean(preTask.aborted)}`);

  const destructive = await runtime.preCommand('git push origin main --force');
  console.log(`PreCommand(destructive): success=${destructive.success}, aborted=${Boolean(destructive.aborted)}`);

  const safe = await runtime.preCommand('git status');
  console.log(`PreCommand(safe): success=${safe.success}, aborted=${Boolean(safe.aborted)}`);

  await runtime.postTask({ taskId: hookTaskId, status: 'completed' });

} catch (e) {
  const message = e instanceof Error ? e.message : String(e);
  console.error(`Control plane error: ${message}`);
}

// --- 4. Optimize (optional) ---
if (process.argv.includes('--optimize')) {
  console.log('\n--- Auto-Optimization ---\n');
  const optimized = autoOptimize(content, localContent ?? undefined);
  console.log(`Applied ${optimized.appliedSuggestions.length} suggestions`);
  console.log(formatBenchmark(optimized.benchmark));

  writeFileSync(
    resolve(DATA_DIR, 'CLAUDE.optimized.md'),
    optimized.optimized
  );
  console.log(`\nOptimized version saved to: .claude-flow/guidance/CLAUDE.optimized.md`);
}

console.log('\n=== Guidance analysis complete ===');
