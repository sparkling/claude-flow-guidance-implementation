#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createGuidanceAdvancedRuntime } from '../guidance/advanced-runtime.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(
  process.env.GUIDANCE_PROJECT_DIR || process.env.CLAUDE_PROJECT_DIR || process.cwd()
);

function usage() {
  console.log(`Usage:
  node scripts/guidance-integrations.js status
  node scripts/guidance-integrations.js hooks [taskDescription]
  node scripts/guidance-integrations.js trust
  node scripts/guidance-integrations.js adversarial
  node scripts/guidance-integrations.js proof
  node scripts/guidance-integrations.js conformance
  node scripts/guidance-integrations.js evolution
  node scripts/guidance-integrations.js all
  node scripts/guidance-integrations.js event <pre-command|pre-edit|pre-task|post-task|post-edit|session-end> [jsonPayload]`);
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function readJson(path, fallback = {}) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return fallback;
  }
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
}

function parsePayload(input) {
  if (!input) return {};
  try {
    const parsed = JSON.parse(input);
    return typeof parsed === 'object' && parsed != null ? parsed : {};
  } catch {
    return {};
  }
}

function safeArray(input) {
  return Array.isArray(input) ? input : [];
}

function safeString(input, fallback = '') {
  if (input == null) return fallback;
  return String(input);
}

function sanitizeDiffLines(input) {
  const value = Number(input);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value);
}

function taskIdFromPayload(prefix, payload) {
  const fromPayload = safeString(payload.taskId, '').trim();
  if (fromPayload) return fromPayload;
  return `${prefix}-${Date.now()}`;
}

function outcomeFromHookResult(result) {
  if (!result) return 'warn';
  if (!result.success || result.aborted) return 'deny';
  if ((result.warnings?.length ?? 0) > 0) return 'warn';
  return 'allow';
}

function severityFromThreat(threat) {
  if ((threat?.severity ?? 0) >= 0.8) return 'high';
  if ((threat?.severity ?? 0) >= 0.5) return 'medium';
  return 'low';
}

function mapHookWarningsToViolations(result, baseRuleId) {
  const warnings = safeArray(result?.warnings);
  return warnings.map((warning, index) => ({
    ruleId: `${baseRuleId}-warning-${index + 1}`,
    description: safeString(warning, 'Guidance warning'),
    severity: 'medium',
    autoCorrected: false,
  }));
}

async function runEvent(runtime, eventName, payload) {
  await runtime.initialize();
  const agentId = safeString(payload.agentId, 'claude-main');
  const sessionId = safeString(payload.sessionId, `session-${Date.now()}`);
  const pendingRunsPath = resolve(runtime.dataDir, 'pending-runs.json');
  const pendingRuns = readJson(pendingRunsPath, {});

  switch (eventName) {
    case 'pre-command': {
      const command = safeString(payload.command, '');
      const taskId = taskIdFromPayload('pre-command', payload);

      if (!command.trim()) {
        return {
          event: 'pre-command',
          success: true,
          blocked: false,
          skipped: true,
          reason: 'empty-command',
        };
      }

      const startedAt = Date.now();
      const gateResult = await runtime.phase1.preCommand(command);
      const inputThreats = runtime.threatDetector.analyzeInput(command, {
        agentId,
        toolName: 'bash',
      });
      const severeThreats = inputThreats.filter((threat) => threat.severity >= 0.85);

      const gateBlocked = !gateResult.success || Boolean(gateResult.aborted);
      const threatBlocked = severeThreats.length > 0;
      const blocked = gateBlocked || threatBlocked;
      const outcome = blocked ? 'deny' : outcomeFromHookResult(gateResult);

      runtime.recordTrust(agentId, outcome, 'hook pre-command');

      const violations = [
        ...mapHookWarningsToViolations(gateResult, 'pre-command'),
        ...inputThreats.map((threat) => ({
          ruleId: `threat-${threat.category}`,
          description: threat.description,
          severity: severityFromThreat(threat),
          autoCorrected: false,
        })),
      ];

      if (blocked) {
        violations.push({
          ruleId: 'pre-command-blocked',
          description: threatBlocked
            ? 'Command blocked by adversarial threat detection'
            : 'Command blocked by guidance gates',
          severity: 'high',
          autoCorrected: true,
        });
      }

      const proofEnvelope = runtime.appendProof({
        taskId,
        agentId,
        toolsUsed: ['PreCommand', 'ThreatDetector'],
        violations,
        outcomeAccepted: !blocked,
        durationMs: Date.now() - startedAt,
        details: {
          sessionId,
          toolParams: {
            PreCommand: { command },
          },
          toolResults: {
            PreCommand: {
              success: gateResult.success,
              aborted: Boolean(gateResult.aborted),
            },
            ThreatDetector: {
              inputThreatCount: inputThreats.length,
              severeThreatCount: severeThreats.length,
            },
          },
        },
      });

      const summary = {
        event: 'pre-command',
        taskId,
        success: !blocked,
        blocked,
        blockedByGates: gateBlocked,
        blockedByThreat: threatBlocked,
        messages: safeArray(gateResult.messages),
        warnings: safeArray(gateResult.warnings),
        threatCount: inputThreats.length,
        severeThreatCount: severeThreats.length,
        trust: runtime.trustSystem.getSnapshot(agentId),
        proofEnvelope: {
          envelopeId: proofEnvelope.envelopeId,
          contentHash: proofEnvelope.contentHash,
        },
      };

      await runtime.persistState({ lastHookEvent: summary });
      return summary;
    }

    case 'pre-edit': {
      const filePath = safeString(payload.filePath, '');
      const content = safeString(payload.content, '');
      const operation = safeString(payload.operation, 'modify');
      const diffLines = sanitizeDiffLines(payload.diffLines);
      const taskId = taskIdFromPayload('pre-edit', payload);

      if (!filePath.trim()) {
        return {
          event: 'pre-edit',
          success: true,
          blocked: false,
          skipped: true,
          reason: 'missing-file-path',
        };
      }

      const startedAt = Date.now();
      const gateResult = await runtime.phase1.preEdit({
        filePath,
        operation,
        content,
        diffLines,
      });

      const blocked = !gateResult.success || Boolean(gateResult.aborted);
      const outcome = blocked ? 'deny' : outcomeFromHookResult(gateResult);
      runtime.recordTrust(agentId, outcome, 'hook pre-edit');

      const violations = mapHookWarningsToViolations(gateResult, 'pre-edit');
      if (blocked) {
        violations.push({
          ruleId: 'pre-edit-blocked',
          description: 'Edit blocked by guidance gates',
          severity: 'high',
          autoCorrected: true,
        });
      }

      const proofEnvelope = runtime.appendProof({
        taskId,
        agentId,
        toolsUsed: ['PreEdit'],
        violations,
        outcomeAccepted: !blocked,
        durationMs: Date.now() - startedAt,
        details: {
          sessionId,
          filesTouched: [filePath],
          toolParams: {
            PreEdit: { filePath, operation, diffLines },
          },
          toolResults: {
            PreEdit: {
              success: gateResult.success,
              aborted: Boolean(gateResult.aborted),
            },
          },
        },
      });

      const summary = {
        event: 'pre-edit',
        taskId,
        filePath,
        success: !blocked,
        blocked,
        messages: safeArray(gateResult.messages),
        warnings: safeArray(gateResult.warnings),
        trust: runtime.trustSystem.getSnapshot(agentId),
        proofEnvelope: {
          envelopeId: proofEnvelope.envelopeId,
          contentHash: proofEnvelope.contentHash,
        },
      };

      await runtime.persistState({ lastHookEvent: summary });
      return summary;
    }

    case 'pre-task': {
      const taskDescription = safeString(payload.taskDescription, '');
      const taskId = taskIdFromPayload('pre-task', payload);

      if (!taskDescription.trim()) {
        return {
          event: 'pre-task',
          success: true,
          blocked: false,
          skipped: true,
          reason: 'empty-task-description',
        };
      }

      const startedAt = Date.now();
      const result = await runtime.phase1.preTask({
        taskId,
        taskDescription,
      });

      const blocked = !result.success || Boolean(result.aborted);
      const outcome = blocked ? 'deny' : outcomeFromHookResult(result);
      runtime.recordTrust(agentId, outcome, 'hook pre-task');

      const violations = mapHookWarningsToViolations(result, 'pre-task');
      if (blocked) {
        violations.push({
          ruleId: 'pre-task-blocked',
          description: 'Task blocked by guidance gates',
          severity: 'high',
          autoCorrected: true,
        });
      }

      const policyText = runtime.phase1.extractPolicyText(result) || '';
      const proofEnvelope = runtime.appendProof({
        taskId,
        agentId,
        toolsUsed: ['PreTask'],
        violations,
        outcomeAccepted: !blocked,
        durationMs: Date.now() - startedAt,
        details: {
          sessionId,
          toolParams: {
            PreTask: {
              taskDescription,
            },
          },
          toolResults: {
            PreTask: {
              success: result.success,
              aborted: Boolean(result.aborted),
              policyTextLength: policyText.length,
            },
          },
        },
      });

      const summary = {
        event: 'pre-task',
        taskId,
        success: !blocked,
        blocked,
        messages: safeArray(result.messages),
        warnings: safeArray(result.warnings),
        policyTextLength: policyText.length,
        hooksExecuted: result.hooksExecuted,
        trust: runtime.trustSystem.getSnapshot(agentId),
        proofEnvelope: {
          envelopeId: proofEnvelope.envelopeId,
          contentHash: proofEnvelope.contentHash,
        },
      };

      pendingRuns[taskId] = {
        taskDescription,
        updatedAt: Date.now(),
      };
      writeJson(pendingRunsPath, pendingRuns);

      await runtime.persistState({ lastHookEvent: summary });
      return summary;
    }

    case 'post-task': {
      const taskId = taskIdFromPayload('post-task', payload);
      const status = safeString(payload.status, 'completed');
      const toolsUsed = safeArray(payload.toolsUsed);
      const filesTouched = safeArray(payload.filesTouched);
      const pending = pendingRuns[taskId];
      const restoredTaskDescription = safeString(
        payload.taskDescription || pending?.taskDescription,
        ''
      );

      if (restoredTaskDescription) {
        await runtime.phase1.preTask({
          taskId,
          taskDescription: restoredTaskDescription,
        });
      }

      const startedAt = Date.now();
      const result = await runtime.phase1.postTask({
        taskId,
        status,
        toolsUsed,
        filesTouched,
      });

      const outcome = outcomeFromHookResult(result);
      runtime.recordTrust(agentId, outcome, 'hook post-task');

      const violations = mapHookWarningsToViolations(result, 'post-task');
      const proofEnvelope = runtime.appendProof({
        taskId,
        agentId,
        toolsUsed: ['PostTask'],
        violations,
        outcomeAccepted: result.success && !result.aborted,
        durationMs: Date.now() - startedAt,
        details: {
          sessionId,
          filesTouched,
          toolParams: {
            PostTask: {
              status,
              toolsUsed,
              filesTouched,
            },
          },
          toolResults: {
            PostTask: {
              success: result.success,
              aborted: Boolean(result.aborted),
            },
          },
        },
      });

      const summary = {
        event: 'post-task',
        taskId,
        restoredRunContext: Boolean(restoredTaskDescription),
        success: result.success && !result.aborted,
        blocked: !result.success || Boolean(result.aborted),
        messages: safeArray(result.messages),
        warnings: safeArray(result.warnings),
        trust: runtime.trustSystem.getSnapshot(agentId),
        proofEnvelope: {
          envelopeId: proofEnvelope.envelopeId,
          contentHash: proofEnvelope.contentHash,
        },
      };

      delete pendingRuns[taskId];
      writeJson(pendingRunsPath, pendingRuns);

      await runtime.persistState({ lastHookEvent: summary });
      return summary;
    }

    case 'post-edit': {
      const filePath = safeString(payload.filePath, '');
      const taskId = taskIdFromPayload('post-edit', payload);

      const proofEnvelope = runtime.appendProof({
        taskId,
        agentId,
        toolsUsed: ['PostEdit'],
        outcomeAccepted: true,
        details: {
          sessionId,
          filesTouched: filePath ? [filePath] : [],
          toolResults: {
            PostEdit: { filePath: filePath || null },
          },
        },
      });

      runtime.recordTrust(agentId, 'allow', 'hook post-edit');
      const summary = {
        event: 'post-edit',
        taskId,
        success: true,
        blocked: false,
        trust: runtime.trustSystem.getSnapshot(agentId),
        proofEnvelope: {
          envelopeId: proofEnvelope.envelopeId,
          contentHash: proofEnvelope.contentHash,
        },
      };
      await runtime.persistState({ lastHookEvent: summary });
      return summary;
    }

    case 'session-end': {
      const conformance = await runtime.runConformanceIntegration();
      const evolution = await runtime.runEvolutionIntegration();
      const summary = {
        event: 'session-end',
        success: true,
        blocked: false,
        conformance: {
          passed: conformance.passed,
          failedChecks: conformance.failedChecks.length,
          durationMs: conformance.durationMs,
        },
        evolution: {
          proposalStatus: evolution.proposalStatus,
          approved: Boolean(evolution.comparison?.approved),
        },
      };
      await runtime.persistState({ lastHookEvent: summary });
      return summary;
    }

    default:
      throw new Error(`Unknown guidance event: ${eventName}`);
  }
}

async function main() {
  const [, , command, ...args] = process.argv;
  if (!command) {
    usage();
    process.exit(1);
  }

  const runtime = createGuidanceAdvancedRuntime({ rootDir });

  switch (command) {
    case 'status': {
      await runtime.initialize();
      printJson(runtime.getStatus());
      return;
    }

    case 'hooks': {
      const taskDescription = args[0];
      const result = await runtime.runHooksIntegration({
        taskDescription,
      });
      printJson(result);
      return;
    }

    case 'trust': {
      const result = await runtime.runTrustIntegration();
      printJson(result);
      return;
    }

    case 'adversarial': {
      const result = await runtime.runAdversarialIntegration();
      printJson(result);
      return;
    }

    case 'proof': {
      const result = await runtime.runProofIntegration();
      printJson(result);
      return;
    }

    case 'conformance': {
      const result = await runtime.runConformanceIntegration();
      printJson(result);
      return;
    }

    case 'evolution': {
      const result = await runtime.runEvolutionIntegration();
      printJson(result);
      return;
    }

    case 'all': {
      const result = await runtime.runAllIntegrations();
      printJson(result);
      return;
    }

    case 'event': {
      const eventName = safeString(args[0], '');
      if (!eventName) {
        usage();
        process.exit(1);
      }
      const payload = parsePayload(args[1]);
      const result = await runEvent(runtime, eventName, payload);
      printJson(result);
      return;
    }

    default:
      usage();
      process.exit(1);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
