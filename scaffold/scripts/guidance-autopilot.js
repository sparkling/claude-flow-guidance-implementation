#!/usr/bin/env node
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { analyze, benchmark, abBenchmark } from '@claude-flow/guidance/analyzer';
import { createCompiler } from '@claude-flow/guidance/compiler';
import { createSyntheticContentAwareExecutor } from '../src/guidance/content-aware-executor.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

const DEFAULTS = {
  mode: 'once',
  apply: false,
  minDelta: 0.5,
  maxPromotions: 12,
  intervalMs: 30 * 60 * 1000,
  runAB: false,
  minABGain: 0.05,
  source: 'manual',
};

function parseArgs() {
  const options = { ...DEFAULTS };
  const args = process.argv.slice(2);

  const readNumber = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const readString = (value, fallback) => {
    if (value == null) return fallback;
    return String(value);
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case '--once':
        options.mode = 'once';
        break;
      case '--daemon':
        options.mode = 'daemon';
        break;
      case '--apply':
        options.apply = true;
        break;
      case '--ab':
        options.runAB = true;
        break;
      case '--no-ab':
        options.runAB = false;
        break;
      case '--min-delta':
        options.minDelta = readNumber(args[i + 1], options.minDelta);
        i += 1;
        break;
      case '--max-promotions':
        options.maxPromotions = readNumber(args[i + 1], options.maxPromotions);
        i += 1;
        break;
      case '--interval-ms':
        options.intervalMs = readNumber(args[i + 1], options.intervalMs);
        i += 1;
        break;
      case '--min-ab-gain':
        options.minABGain = readNumber(args[i + 1], options.minABGain);
        i += 1;
        break;
      case '--source':
        options.source = readString(args[i + 1], options.source);
        i += 1;
        break;
      default:
        break;
    }
  }
  return options;
}

function nowIso() {
  return new Date().toISOString();
}

function shortHash(input) {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function loadJson(path, fallback = {}) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return fallback;
  }
}

function writeJson(path, value) {
  ensureDir(dirname(path));
  writeFileSync(path, JSON.stringify(value, null, 2));
}

function loadGuidanceFiles() {
  const rootPath = resolve(rootDir, 'CLAUDE.md');
  const localPath = resolve(rootDir, 'CLAUDE.local.md');
  if (!existsSync(rootPath)) {
    throw new Error(`Missing root guidance file: ${rootPath}`);
  }
  const rootContent = readFileSync(rootPath, 'utf-8');
  const localContent = existsSync(localPath) ? readFileSync(localPath, 'utf-8') : null;
  return { rootPath, localPath, rootContent, localContent };
}

function getAllRules(bundle) {
  return [
    ...bundle.constitution.rules,
    ...bundle.shards.map((entry) => entry.rule),
  ];
}

function getPromotableLocalRules(rootContent, localContent) {
  if (!localContent) return [];
  const compiler = createCompiler();
  const rootBundle = compiler.compile(rootContent);
  const mergedBundle = compiler.compile(rootContent, localContent);

  const rootRules = new Map(getAllRules(rootBundle).map((rule) => [rule.id, rule]));
  const mergedRules = getAllRules(mergedBundle);
  const seen = new Set();
  const candidates = [];

  for (const rule of mergedRules) {
    if (rule.source !== 'local') continue;
    if (seen.has(rule.id)) continue;
    seen.add(rule.id);

    const rootRule = rootRules.get(rule.id);
    if (!rootRule) {
      candidates.push(rule);
      continue;
    }

    const changed =
      rootRule.text !== rule.text ||
      rootRule.riskClass !== rule.riskClass ||
      rootRule.priority !== rule.priority ||
      JSON.stringify(rootRule.intents) !== JSON.stringify(rule.intents) ||
      JSON.stringify(rootRule.domains) !== JSON.stringify(rule.domains) ||
      JSON.stringify(rootRule.toolClasses) !== JSON.stringify(rule.toolClasses);

    if (changed) candidates.push(rule);
  }

  return candidates.sort((a, b) => b.priority - a.priority);
}

function ruleToLine(rule) {
  const tags = [];
  if (rule.riskClass) tags.push(`(${rule.riskClass})`);
  for (const domain of rule.domains ?? []) tags.push(`@${domain}`);
  for (const intent of rule.intents ?? []) tags.push(`#${intent}`);
  for (const toolClass of rule.toolClasses ?? []) {
    if (toolClass !== 'all') tags.push(`[${toolClass}]`);
  }
  tags.push(`priority:${rule.priority}`);
  return `- [${rule.id}] ${rule.text} ${tags.join(' ')}`.replace(/\s+/g, ' ').trim();
}

function buildPromotionSection(rules, metadata) {
  const lines = rules.map(ruleToLine);
  return [
    '## Guidance Auto-Promotions',
    '',
    '<!-- guidance-autopilot:start -->',
    `<!-- source:${metadata.source} generated:${metadata.generatedAt} -->`,
    ...lines,
    '<!-- guidance-autopilot:end -->',
    '',
  ].join('\n');
}

function buildCandidateRoot(rootContent, rules, metadata) {
  const section = buildPromotionSection(rules, metadata);
  const markerPattern = /## Guidance Auto-Promotions[\s\S]*?<!-- guidance-autopilot:end -->\n?/m;
  if (markerPattern.test(rootContent)) {
    return rootContent.replace(markerPattern, section);
  }
  const trimmed = rootContent.trimEnd();
  return `${trimmed}\n\n${section}`;
}

function getNextAdrNumber(adrDir) {
  if (!existsSync(adrDir)) return 1;
  const files = readdirSync(adrDir);
  let max = 0;
  for (const file of files) {
    const match = file.match(/^ADR-(\d{3})-/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}

function formatAdrNumber(value) {
  return String(value).padStart(3, '0');
}

function writePromotionAdr({ promotedRules, metrics, benchmarkSummary, adrDir }) {
  ensureDir(adrDir);
  const number = getNextAdrNumber(adrDir);
  const id = `ADR-${formatAdrNumber(number)}`;
  const fileName = `${id}-guidance-local-rule-promotion.md`;
  const filePath = resolve(adrDir, fileName);

  const lines = [];
  lines.push(`# ${id}: Promote High-Value Local Guidance Rules`);
  lines.push('');
  lines.push(`- Date: ${new Date().toISOString().slice(0, 10)}`);
  lines.push('- Status: Accepted');
  lines.push('');
  lines.push('## Context');
  lines.push('Local guidance rules in `CLAUDE.local.md` are useful for experimentation, but successful patterns should move into shared `CLAUDE.md` to improve team-wide behavior.');
  lines.push('');
  lines.push('## Decision');
  lines.push(`Promote ${promotedRules.length} local rule(s) into the auto-promotion section in \`CLAUDE.md\`.`);
  lines.push('');
  lines.push('Promoted rules:');
  for (const rule of promotedRules) {
    lines.push(`- [${rule.id}] ${rule.text}`);
  }
  lines.push('');
  lines.push('## Measured Effect');
  lines.push(`- Composite score before: ${metrics.beforeComposite}`);
  lines.push(`- Composite score after: ${metrics.afterComposite}`);
  lines.push(`- Composite delta: ${metrics.delta}`);
  lines.push(`- Promotion threshold: ${metrics.threshold}`);
  if (benchmarkSummary) {
    lines.push(`- A/B delta gain: ${benchmarkSummary.deltaGain}`);
    lines.push(`- A/B baseline delta: ${benchmarkSummary.baseDelta}`);
    lines.push(`- A/B candidate delta: ${benchmarkSummary.candidateDelta}`);
  }
  lines.push('');
  lines.push('## Consequences');
  lines.push('- Shared guidance receives proven local improvements.');
  lines.push('- Future sessions apply these rules without requiring local overrides.');
  lines.push('- Further local experiments can be promoted by the same autopilot loop.');
  lines.push('');

  writeFileSync(filePath, lines.join('\n'));
  return filePath;
}

function acquireLock(lockPath) {
  ensureDir(dirname(lockPath));
  try {
    const fd = openSync(lockPath, 'wx');
    return fd;
  } catch {
    return null;
  }
}

function releaseLock(fd, lockPath) {
  if (fd != null) closeSync(fd);
  if (existsSync(lockPath)) unlinkSync(lockPath);
}

function appendLog(logPath, line) {
  ensureDir(dirname(logPath));
  appendFileSync(logPath, `[${nowIso()}] ${line}\n`);
}

async function runCycle(options) {
  const guidanceDir = resolve(rootDir, '.claude-flow', 'guidance');
  const backupDir = resolve(guidanceDir, 'backups');
  const proposalDir = resolve(guidanceDir, 'proposals');
  const reportPath = resolve(guidanceDir, 'autopilot-report.json');
  const statePath = resolve(guidanceDir, 'autopilot-state.json');
  const logPath = resolve(guidanceDir, 'autopilot.log');
  const lockPath = resolve(guidanceDir, 'autopilot.lock');
  const adrDir = resolve(rootDir, 'docs', 'adr');

  const lockFd = acquireLock(lockPath);
  if (lockFd == null) {
    appendLog(logPath, 'skip: another autopilot process is already active');
    return { skipped: true, reason: 'locked' };
  }

  try {
    const { rootPath, rootContent, localContent } = loadGuidanceFiles();
    const state = loadJson(statePath, {});
    const candidates = getPromotableLocalRules(rootContent, localContent).slice(0, options.maxPromotions);

    if (candidates.length === 0) {
      const report = {
        timestamp: nowIso(),
        source: options.source,
        applied: false,
        reason: 'no-promotable-local-rules',
      };
      writeJson(reportPath, report);
      writeJson(statePath, {
        ...state,
        lastRunAt: report.timestamp,
        lastDecision: report.reason,
      });
      appendLog(logPath, 'no promotable local rules found');
      return report;
    }

    const metadata = { source: options.source, generatedAt: nowIso() };
    const candidateContent = buildCandidateRoot(rootContent, candidates, metadata);
    const candidateHash = shortHash(candidateContent);

    if (state.lastCandidateHash === candidateHash && state.lastDecision === 'below-threshold') {
      const report = {
        timestamp: metadata.generatedAt,
        source: options.source,
        applied: false,
        reason: 'unchanged-below-threshold',
        candidateHash,
      };
      writeJson(reportPath, report);
      appendLog(logPath, `skip unchanged candidate hash=${candidateHash}`);
      return report;
    }

    const scoreBefore = analyze(rootContent);
    const scoreAfter = analyze(candidateContent);
    const bench = benchmark(rootContent, candidateContent);

    let abSummary = null;
    let abGatePass = true;
    if (options.runAB) {
      const baseAB = await abBenchmark(rootContent, {
        executor: createSyntheticContentAwareExecutor(),
      });
      const candidateAB = await abBenchmark(candidateContent, {
        executor: createSyntheticContentAwareExecutor(),
      });
      const deltaGain = candidateAB.compositeDelta - baseAB.compositeDelta;
      abSummary = {
        baseDelta: baseAB.compositeDelta,
        candidateDelta: candidateAB.compositeDelta,
        deltaGain: Number(deltaGain.toFixed(3)),
      };
      abGatePass = deltaGain >= options.minABGain;
    }

    const thresholdPass = bench.delta >= options.minDelta;
    const shouldApply = Boolean(options.apply && thresholdPass && abGatePass);

    const report = {
      timestamp: metadata.generatedAt,
      source: options.source,
      applied: shouldApply,
      candidateHash,
      promotedRuleCount: candidates.length,
      promotedRuleIds: candidates.map((rule) => rule.id),
      metrics: {
        beforeComposite: scoreBefore.compositeScore,
        afterComposite: scoreAfter.compositeScore,
        delta: bench.delta,
        threshold: options.minDelta,
      },
      ab: abSummary,
      reasons: {
        thresholdPass,
        abGatePass,
        applyFlag: options.apply,
      },
    };

    if (!shouldApply) {
      ensureDir(proposalDir);
      const proposalPath = resolve(proposalDir, `CLAUDE.promoted.${Date.now()}.md`);
      writeFileSync(proposalPath, candidateContent);
      report.proposalPath = proposalPath;
      report.decision = 'below-threshold';
      appendLog(
        logPath,
        `proposal only: delta=${bench.delta.toFixed(2)} threshold=${options.minDelta} file=${proposalPath}`
      );
    } else {
      ensureDir(backupDir);
      const backupPath = resolve(backupDir, `CLAUDE.md.${Date.now()}.bak`);
      writeFileSync(backupPath, rootContent);
      writeFileSync(rootPath, candidateContent);

      const adrPath = writePromotionAdr({
        promotedRules: candidates,
        metrics: {
          beforeComposite: scoreBefore.compositeScore,
          afterComposite: scoreAfter.compositeScore,
          delta: bench.delta,
          threshold: options.minDelta,
        },
        benchmarkSummary: abSummary,
        adrDir,
      });
      report.backupPath = backupPath;
      report.adrPath = adrPath;
      report.decision = 'applied';
      appendLog(
        logPath,
        `applied: promoted=${candidates.length} delta=${bench.delta.toFixed(2)} adr=${adrPath}`
      );
    }

    writeJson(reportPath, report);
    writeJson(statePath, {
      ...state,
      lastRunAt: report.timestamp,
      lastCandidateHash: candidateHash,
      lastDecision: report.decision,
      lastApplied: report.applied,
      lastDelta: report.metrics.delta,
    });

    return report;
  } finally {
    releaseLock(lockFd, lockPath);
  }
}

async function runDaemon(options) {
  const run = async () => {
    try {
      const report = await runCycle(options);
      if (!report?.skipped) {
        console.log(JSON.stringify(report, null, 2));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(message);
    }
  };

  await run();
  setInterval(run, options.intervalMs);
}

async function main() {
  const options = parseArgs();
  if (options.mode === 'daemon') {
    await runDaemon(options);
    return;
  }
  const report = await runCycle(options);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
