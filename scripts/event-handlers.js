import { resolve } from 'node:path';
import {
  safeString,
  safeArray,
  readJson,
  writeJson,
  outcomeFromHookResult,
  severityFromThreat,
} from '../src/utils.mjs';

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

function mapHookWarningsToViolations(result, baseRuleId) {
  const warnings = safeArray(result?.warnings);
  return warnings.map((warning, index) => ({
    ruleId: `${baseRuleId}-warning-${index + 1}`,
    description: safeString(warning, 'Guidance warning'),
    severity: 'medium',
    autoCorrected: false,
  }));
}

function trackCoherence(runtime, violations, recentEvents) {
  try {
    const metrics = {
      violationRate: violations.length,
      reworkLines: 0,
    };
    const raw = runtime.coherenceScheduler.computeCoherence(metrics, recentEvents);
    const score = typeof raw === 'number' ? raw : (raw?.overall ?? 1.0);
    const recommendation = runtime.coherenceScheduler.getRecommendation();
    runtime.economicGovernor.recordToolCall('event-handler', 0);
    return { score, recommendation, shouldRestrict: runtime.coherenceScheduler.shouldRestrict() };
  } catch {
    return { score: 1.0, recommendation: 'continue', shouldRestrict: false };
  }
}

export async function runEvent(runtime, eventName, payload) {
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

      // Authority / irreversibility classification
      const classification = runtime.irreversibilityClassifier.classify(command);
      // Upstream classify() returns an object { classification: string, ... } or a string
      const classificationLevel = typeof classification === 'string'
        ? classification
        : classification?.classification ?? 'trivial';
      let authorityBlocked = false;
      if (classificationLevel === 'irreversible' || classificationLevel === 'costly-reversible') {
        const canProceed = runtime.authorityGate.canPerform('agent', command);
        if (!canProceed) {
          authorityBlocked = true;
        }
      }

      const blocked = gateBlocked || threatBlocked || authorityBlocked;
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

      if (authorityBlocked) {
        violations.push({
          ruleId: 'authority-blocked',
          description: `${classificationLevel} action requires higher authority than agent level`,
          severity: 'critical',
          autoCorrected: true,
        });
      }

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
        classification,
        authorityBlocked,
        coherence: trackCoherence(runtime, violations, []),
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
        coherence: trackCoherence(runtime, violations, []),
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

      // Continue-gate evaluation (infinite loop / budget slope prevention)
      let continueDecision = { action: 'continue', reason: 'default' };
      try {
        let rawCoherence = 1.0;
        try {
          const c = runtime.coherenceScheduler.computeCoherence({ violationRate: 0, reworkLines: 0 }, []);
          rawCoherence = typeof c === 'number' ? c : (c?.overall ?? 1.0);
        } catch {}
        continueDecision = runtime.continueGate.evaluate({
          stepNumber: runtime.stepCounter++,
          coherenceScore: rawCoherence,
          reworkRatio: 0,
          uncertaintyScore: 0,
          lastCheckpointStep: 0,
          budgetRemaining: { tokens: 10000, toolCalls: 100, timeMs: 60000 },
        });
      } catch {
        runtime.stepCounter++;
      }

      if ((continueDecision.decision ?? continueDecision.action) === 'stop') {
        return {
          event: 'pre-task',
          success: false,
          blocked: true,
          reason: `continue-gate-stop: ${continueDecision.reason}`,
          continueDecision,
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
        continueDecision: continueDecision ?? null,
        coherence: trackCoherence(runtime, violations, []),
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

      // Optimizer cycle — run if enough events accumulated
      let optimizerResult = null;
      try {
        if (runtime.phase1.ledger.eventCount >= (runtime.options.minEventsForOptimization ?? 50)) {
          const cycle = runtime.optimizer.runCycle(
            runtime.phase1.ledger,
            runtime.phase1.getBundle()
          );
          // Meta-governance check before applying promotions
          if (cycle.promotions && cycle.promotions.length > 0) {
            const valid = runtime.metaGovernor.validateOptimizerAction({
              type: 'promote',
              changes: cycle.promotions,
            });
            optimizerResult = {
              cycleNumber: cycle.cycleNumber,
              proposedChanges: cycle.proposedChanges?.length ?? 0,
              promotions: valid.allowed ? cycle.promotions.length : 0,
              blockedByMetaGovernance: !valid.allowed,
            };
          } else {
            optimizerResult = {
              cycleNumber: cycle.cycleNumber,
              skipped: cycle.skipped,
              reason: cycle.reason,
            };
          }
        }
      } catch {
        optimizerResult = { error: true, reason: 'optimizer-cycle-failed' };
      }

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
        optimizer: optimizerResult,
      };
      await runtime.persistState({ lastHookEvent: summary });
      return summary;
    }

    default:
      throw new Error(`Unknown guidance event: ${eventName}`);
  }
}
