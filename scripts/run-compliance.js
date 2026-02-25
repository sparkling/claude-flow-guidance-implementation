#!/usr/bin/env node

/**
 * Headless compliance test suite runner.
 *
 * Usage:
 *   node scripts/run-compliance.js [--tags tag1,tag2] [--json]
 *
 * Runs the built-in compliance suite from @claude-flow/guidance/headless
 * against the current guidance configuration, using the persistent ledger
 * if available.
 */

import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

const rootDir = process.cwd();
const args = process.argv.slice(2);
const jsonOutput = args.includes('--json');
const tagsArg = args.find((a, i) => args[i - 1] === '--tags');
const tags = tagsArg ? tagsArg.split(',') : undefined;

async function main() {
  let createHeadlessRunner, createComplianceSuite;
  try {
    ({ createHeadlessRunner, createComplianceSuite } = await import('@claude-flow/guidance/headless'));
  } catch (err) {
    console.error('[compliance] @claude-flow/guidance/headless not available:', err.message);
    process.exit(1);
  }

  // Try to use persistent ledger if available
  let ledger;
  try {
    const { createPersistentLedger } = await import('@claude-flow/guidance/persistence');
    ledger = createPersistentLedger({
      storagePath: resolve(rootDir, '.claude-flow/guidance'),
    });
    await ledger.init();
  } catch {
    const { createLedger } = await import('@claude-flow/guidance/ledger');
    ledger = createLedger();
  }

  // Read guidance hash
  let guidanceHash = 'unknown';
  try {
    const { createCompiler } = await import('@claude-flow/guidance/compiler');
    const { readFileSync } = await import('node:fs');
    const claudeMd = readFileSync(resolve(rootDir, 'CLAUDE.md'), 'utf-8');
    const compiler = createCompiler();
    const bundle = compiler.compile(claudeMd);
    guidanceHash = bundle.constitution?.hash ?? 'unknown';
  } catch {
    // Continue without guidance hash
  }

  const runner = createHeadlessRunner(undefined, ledger, guidanceHash);
  const suite = createComplianceSuite();
  const results = await runner.runSuite(suite, tags);

  if (jsonOutput) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log(`\n[compliance] Suite complete`);
    console.log(`  Total:   ${results.total}`);
    console.log(`  Passed:  ${results.passed_count ?? results.passed}`);
    console.log(`  Failed:  ${results.failed}`);
    console.log(`  Skipped: ${results.skipped}`);
    console.log(`  Result:  ${results.passed ? 'PASS' : 'FAIL'}\n`);

    if (results.failed > 0) {
      console.log('Failed tasks:');
      for (const r of results.results.filter(r => !r.passed && !r.skipped)) {
        console.log(`  - ${r.taskId}: ${r.reason ?? 'assertion failure'}`);
      }
    }
  }

  if (ledger.destroy) ledger.destroy();
  process.exit(results.passed ? 0 : 1);
}

main().catch((err) => {
  console.error('[compliance] Fatal:', err);
  process.exit(1);
});
