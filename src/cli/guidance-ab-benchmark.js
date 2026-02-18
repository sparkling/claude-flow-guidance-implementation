#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { abBenchmark } from '@claude-flow/guidance/analyzer';
import { createSyntheticContentAwareExecutor } from '../guidance/content-aware-executor.js';
const rootDir = resolve(
  process.env.GUIDANCE_PROJECT_DIR || process.env.CLAUDE_PROJECT_DIR || process.cwd()
);
const guidanceDir = resolve(rootDir, '.claude-flow', 'guidance');
const reportPath = resolve(guidanceDir, 'ab-benchmark-report.json');

async function main() {
  const claudePath = resolve(rootDir, 'CLAUDE.md');
  const content = readFileSync(claudePath, 'utf-8');
  const proofKey = process.env.GUIDANCE_PROOF_KEY;
  const executor = createSyntheticContentAwareExecutor();

  const report = await abBenchmark(content, {
    proofKey,
    executor,
  });

  mkdirSync(guidanceDir, { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log('A/B benchmark complete.');
  console.log(`Composite delta: ${report.compositeDelta}`);
  console.log(`Category shift: ${report.categoryShift}`);
  console.log(`Baseline score: ${report.configA.metrics.compositeScore}`);
  console.log(`Guided score: ${report.configB.metrics.compositeScore}`);
  console.log(`Report saved: ${reportPath}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
