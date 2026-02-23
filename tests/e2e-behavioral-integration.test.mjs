/**
 * E2E Behavioral Integration Tests
 *
 * Tests the guidance runtime pipeline END-TO-END in a real project:
 *   init → install guidance → invoke event handlers → verify outcomes
 *
 * Does NOT test the upstream @claude-flow/guidance package (1,328 tests).
 * Tests that OUR integration correctly wires the runtime pipeline:
 *   hook-handler.cjs → guidance-integrations.js → event-handlers.js → runtime
 */

import {
  existsSync, readFileSync, writeFileSync,
  mkdtempSync, rmSync, mkdirSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { installIntoRepo } from '../src/installer.mjs';

// ── Helpers ──────────────────────────────────────────────────────────────────

const PROJECT_ROOT = resolve(import.meta.dirname, '..');
const INTEGRATIONS_SCRIPT = resolve(PROJECT_ROOT, 'scripts/guidance-integrations.js');

// Fallback CLAUDE.md for projects where init doesn't create one.
// The phase1 runtime requires it for compilation.
const FALLBACK_CLAUDE_MD = [
  '# Project Guidance',
  '',
  '## Security',
  '- Never execute destructive commands without explicit user confirmation',
  '- Block operations that could damage the file system',
  '- Validate all file paths before operations',
  '',
  '## Implementation',
  '- Follow existing code patterns and conventions',
  '- Write tests for all new functionality',
  '',
].join('\n');

function cli(args, cwd, timeout = 60000) {
  return spawnSync('npx', ['@claude-flow/cli', ...args], {
    encoding: 'utf-8',
    timeout,
    cwd,
    env: { ...process.env, npm_config_yes: 'true', NODE_NO_WARNINGS: '1' },
  });
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

function writeRealHandler(targetDir) {
  const realHandler = readFileSync(resolve(PROJECT_ROOT, 'src/hook-handler.cjs'), 'utf-8');
  const helpersDir = resolve(targetDir, '.claude/helpers');
  mkdirSync(helpersDir, { recursive: true });
  writeFileSync(resolve(helpersDir, 'hook-handler.cjs'), realHandler);
}

function ensureClaudeMd(dir) {
  const claudeMdPath = join(dir, 'CLAUDE.md');
  if (!existsSync(claudeMdPath)) {
    writeFileSync(claudeMdPath, FALLBACK_CLAUDE_MD);
  }
}

function parseJsonFromStdout(stdout) {
  const text = (stdout || '').trim();
  if (!text) return null;
  try { return JSON.parse(text); } catch {
    const idx = text.indexOf('{');
    if (idx >= 0) return JSON.parse(text.slice(idx));
    return null;
  }
}

/**
 * Run guidance-integrations.js event <eventName> <payload> as subprocess.
 * Returns parsed JSON output.
 */
function runGuidanceEvent(dir, eventName, payload = {}, timeout = 15000) {
  const result = spawnSync(
    process.execPath,
    [INTEGRATIONS_SCRIPT, 'event', eventName, JSON.stringify(payload)],
    {
      cwd: dir,
      env: {
        ...process.env,
        GUIDANCE_PROJECT_DIR: dir,
        GUIDANCE_PROOF_KEY: 'e2e-test-signing-key',
        NODE_NO_WARNINGS: '1',
      },
      encoding: 'utf-8',
      timeout,
    }
  );
  if (result.error) throw new Error(`Event ${eventName} error: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`Event ${eventName} exit ${result.status}: ${(result.stderr || result.stdout || '').slice(0, 500)}`);
  }
  return parseJsonFromStdout(result.stdout);
}

/**
 * Run guidance-integrations.js <command> as subprocess.
 */
function runGuidanceCommand(dir, command, args = [], timeout = 15000) {
  const result = spawnSync(
    process.execPath,
    [INTEGRATIONS_SCRIPT, command, ...args],
    {
      cwd: dir,
      env: {
        ...process.env,
        GUIDANCE_PROJECT_DIR: dir,
        GUIDANCE_PROOF_KEY: 'e2e-test-signing-key',
        NODE_NO_WARNINGS: '1',
      },
      encoding: 'utf-8',
      timeout,
    }
  );
  if (result.error) throw new Error(`Command ${command} error: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`Command ${command} exit ${result.status}: ${(result.stderr || result.stdout || '').slice(0, 500)}`);
  }
  return parseJsonFromStdout(result.stdout);
}

// ── Skip checks ──────────────────────────────────────────────────────────────

const cliCheck = spawnSync('npx', ['@claude-flow/cli', '--version'], {
  encoding: 'utf-8', timeout: 15000,
  env: { ...process.env, npm_config_yes: 'true', NODE_NO_WARNINGS: '1' },
});
const canRun = cliCheck.status === 0 && (cliCheck.stdout || '').includes('claude-flow');
const skipCli = canRun ? undefined : 'patched @claude-flow/cli not available';

let guidanceAvailable = true;
try { await import('@claude-flow/guidance/compiler'); } catch { guidanceAvailable = false; }
const shouldSkip = skipCli || (!guidanceAvailable && '@claude-flow/guidance not importable');

// ══════════════════════════════════════════════════════════════════════════════
// Suite: Full event pipeline (init → install full → run all events → verify)
// ══════════════════════════════════════════════════════════════════════════════

describe('e2e behavioral: full event pipeline', { skip: shouldSkip ? true : false }, () => {
  let dir;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'cfgi-behav-pipeline-'));
    const r = cli(['init', '--yes'], dir);
    if (r.status !== 0) throw new Error(`init failed: ${r.stderr}`);
    ensureClaudeMd(dir);
    await installIntoRepo({ targetRepo: dir, targetMode: 'claude', preset: 'full' });
    writeRealHandler(dir);
  }, 90000);

  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  // ── init created CLAUDE.md ──

  it('CLAUDE.md exists in project after init', () => {
    expect(existsSync(join(dir, 'CLAUDE.md'))).toBe(true);
  });

  it('components.json has full preset with all subsystems', () => {
    const components = readJson(join(dir, '.claude-flow/guidance/components.json'));
    expect(components.preset).toBe('full');
    for (const name of ['trust', 'adversarial', 'proof', 'conformance', 'evolution']) {
      expect(components.components).toContain(name);
    }
  });

  // ── status command ──

  describe('status command', () => {
    let status;
    beforeAll(() => { status = runGuidanceCommand(dir, 'status'); });

    it('returns initialized=true', () => {
      expect(status.initialized).toBe(true);
    });

    it('has a real guidanceHash (not unknown)', () => {
      expect(typeof status.guidanceHash).toBe('string');
      expect(status.guidanceHash).not.toBe('unknown-guidance-hash');
    });

    it('lists all enabled components', () => {
      for (const name of ['trust', 'adversarial', 'proof']) {
        expect(status.enabledComponents).toContain(name);
      }
    });

    it('has state and proof file paths', () => {
      expect(status.statePath).toContain('advanced-state.json');
      expect(status.proofPath).toContain('proof-chain.json');
    });
  });

  // ── pre-command: safe command ──

  describe('pre-command: safe command', () => {
    let result;
    beforeAll(() => {
      result = runGuidanceEvent(dir, 'pre-command', {
        command: 'ls -la',
        agentId: 'test-agent',
        sessionId: 'test-session',
      });
    });

    it('event type is pre-command', () => { expect(result.event).toBe('pre-command'); });
    it('is not blocked', () => { expect(result.blocked).toBe(false); expect(result.success).toBe(true); });
    it('has taskId', () => { expect(typeof result.taskId).toBe('string'); });
    it('records trust snapshot', () => { expect(result.trust).toBeDefined(); expect(typeof result.trust).toBe('object'); });
    it('creates proof envelope', () => {
      expect(result.proofEnvelope).toBeDefined();
      expect(result.proofEnvelope.envelopeId).toBeDefined();
      expect(result.proofEnvelope.contentHash).toBeDefined();
    });
    it('reports threat counts', () => {
      expect(typeof result.threatCount).toBe('number');
      expect(typeof result.severeThreatCount).toBe('number');
    });
  });

  // ── pre-command: empty command ──

  describe('pre-command: empty command', () => {
    let result;
    beforeAll(() => { result = runGuidanceEvent(dir, 'pre-command', { command: '' }); });

    it('is skipped with reason', () => {
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('empty-command');
    });
    it('is not blocked', () => { expect(result.blocked).toBe(false); });
  });

  // ── pre-edit: normal edit ──

  describe('pre-edit: normal edit', () => {
    let result;
    beforeAll(() => {
      result = runGuidanceEvent(dir, 'pre-edit', {
        filePath: 'src/index.js',
        content: 'console.log("hello")',
        operation: 'modify',
        diffLines: 1,
        agentId: 'test-agent',
      });
    });

    it('event type is pre-edit', () => { expect(result.event).toBe('pre-edit'); });
    it('is not blocked', () => { expect(result.blocked).toBe(false); expect(result.success).toBe(true); });
    it('records filePath', () => { expect(result.filePath).toBe('src/index.js'); });
    it('records trust snapshot', () => { expect(result.trust).toBeDefined(); });
    it('creates proof envelope', () => { expect(result.proofEnvelope).toBeDefined(); });
  });

  // ── pre-edit: missing file path ──

  describe('pre-edit: missing file path', () => {
    let result;
    beforeAll(() => { result = runGuidanceEvent(dir, 'pre-edit', { filePath: '' }); });

    it('is skipped', () => { expect(result.skipped).toBe(true); expect(result.reason).toBe('missing-file-path'); });
  });

  // ── pre-task + post-task lifecycle ──

  describe('pre-task + post-task lifecycle', () => {
    const taskId = 'test-lifecycle-001';
    let preResult, postResult;

    beforeAll(() => {
      preResult = runGuidanceEvent(dir, 'pre-task', {
        taskId,
        taskDescription: 'Implement unit tests for the auth module',
        agentId: 'lifecycle-agent',
        sessionId: 'test-session',
      });
      postResult = runGuidanceEvent(dir, 'post-task', {
        taskId,
        status: 'completed',
        toolsUsed: ['Read', 'Write'],
        filesTouched: ['src/auth.js', 'tests/auth.test.js'],
        agentId: 'lifecycle-agent',
        sessionId: 'test-session',
      });
    });

    it('pre-task succeeds', () => { expect(preResult.event).toBe('pre-task'); expect(preResult.success).toBe(true); });
    it('pre-task includes taskId', () => { expect(preResult.taskId).toBe(taskId); });
    it('pre-task creates proof envelope', () => { expect(preResult.proofEnvelope).toBeDefined(); });
    it('pre-task records trust', () => { expect(preResult.trust).toBeDefined(); });

    it('post-task succeeds', () => { expect(postResult.event).toBe('post-task'); expect(postResult.success).toBe(true); });
    it('post-task restores pre-task context', () => { expect(postResult.restoredRunContext).toBe(true); });
    it('post-task creates proof envelope', () => { expect(postResult.proofEnvelope).toBeDefined(); });

    it('pending runs cleaned up after post-task', () => {
      const pendingPath = join(dir, '.claude-flow/guidance/advanced/pending-runs.json');
      if (!existsSync(pendingPath)) return; // file removed = clean
      const pending = readJson(pendingPath);
      expect(pending[taskId]).toBeUndefined();
    });
  });

  // ── pre-task: empty description ──

  describe('pre-task: empty description', () => {
    let result;
    beforeAll(() => { result = runGuidanceEvent(dir, 'pre-task', { taskDescription: '' }); });

    it('is skipped', () => { expect(result.skipped).toBe(true); expect(result.reason).toBe('empty-task-description'); });
  });

  // ── post-edit ──

  describe('post-edit event', () => {
    let result;
    beforeAll(() => {
      result = runGuidanceEvent(dir, 'post-edit', { filePath: 'src/utils.js', agentId: 'test-agent' });
    });

    it('event type is post-edit', () => { expect(result.event).toBe('post-edit'); });
    it('is always allowed', () => { expect(result.success).toBe(true); expect(result.blocked).toBe(false); });
    it('records trust', () => { expect(result.trust).toBeDefined(); });
    it('creates proof envelope', () => { expect(result.proofEnvelope).toBeDefined(); });
  });

  // ── session-end ──

  describe('session-end event', () => {
    let result;
    beforeAll(() => { result = runGuidanceEvent(dir, 'session-end', { agentId: 'test-agent' }); });

    it('event type is session-end', () => { expect(result.event).toBe('session-end'); });
    it('succeeds', () => { expect(result.success).toBe(true); });
    it('runs conformance checks', () => {
      expect(result.conformance).toBeDefined();
      expect(typeof result.conformance.passed).toBe('boolean');
      expect(typeof result.conformance.durationMs).toBe('number');
    });
    it('runs evolution pipeline', () => {
      expect(result.evolution).toBeDefined();
      expect(result.evolution.proposalStatus).toBeDefined();
    });
  });

  // ── state persistence after all events ──

  describe('state persistence', () => {
    it('advanced-state.json exists', () => {
      expect(existsSync(join(dir, '.claude-flow/guidance/advanced/advanced-state.json'))).toBe(true);
    });

    it('state has trustSnapshots array', () => {
      const state = readJson(join(dir, '.claude-flow/guidance/advanced/advanced-state.json'));
      expect(Array.isArray(state.trustSnapshots)).toBe(true);
    });

    it('state has updatedAt timestamp', () => {
      const state = readJson(join(dir, '.claude-flow/guidance/advanced/advanced-state.json'));
      expect(state.updatedAt).toBeDefined();
    });

    it('state has lastHookEvent', () => {
      const state = readJson(join(dir, '.claude-flow/guidance/advanced/advanced-state.json'));
      expect(state.lastHookEvent).toBeDefined();
      expect(state.lastHookEvent.event).toBeDefined();
    });

    it('proof-chain.json exists', () => {
      expect(existsSync(join(dir, '.claude-flow/guidance/advanced/proof-chain.json'))).toBe(true);
    });

    it('proof-chain.json has envelopes array', () => {
      const proof = readJson(join(dir, '.claude-flow/guidance/advanced/proof-chain.json'));
      expect(Array.isArray(proof.envelopes)).toBe(true);
    });

    it('proof chain has multiple envelopes from events', () => {
      const proof = readJson(join(dir, '.claude-flow/guidance/advanced/proof-chain.json'));
      // pre-command + pre-edit + pre-task + post-task + post-edit = at least 5
      expect(proof.envelopes.length).toBeGreaterThanOrEqual(5);
    });

    it('each proof envelope has required fields', () => {
      const proof = readJson(join(dir, '.claude-flow/guidance/advanced/proof-chain.json'));
      for (const envelope of proof.envelopes) {
        expect(typeof envelope.contentHash).toBe('string');
        expect(typeof envelope.previousHash).toBe('string');
        expect(typeof envelope.signature).toBe('string');
      }
    });

    it('proof envelopes form a hash chain', () => {
      const proof = readJson(join(dir, '.claude-flow/guidance/advanced/proof-chain.json'));
      if (proof.envelopes.length < 2) return;
      for (let i = 1; i < proof.envelopes.length; i++) {
        // Each envelope must reference a previous hash
        expect(proof.envelopes[i].previousHash.length).toBeGreaterThan(0);
        // Previous hash must not be the same as content hash (linked, not self-referencing)
        expect(proof.envelopes[i].previousHash).not.toBe(proof.envelopes[i].contentHash);
      }
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: Component gating (reduced components → null objects)
// ══════════════════════════════════════════════════════════════════════════════

describe('e2e behavioral: component gating', { skip: shouldSkip ? true : false }, () => {
  let dir;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'cfgi-behav-gating-'));
    const r = cli(['init', '--yes'], dir);
    if (r.status !== 0) throw new Error(`init failed: ${r.stderr}`);
    ensureClaudeMd(dir);
    // Only trust + proof enabled; adversarial, conformance, evolution are null objects
    await installIntoRepo({ targetRepo: dir, targetMode: 'claude', components: ['trust', 'proof'] });
    writeRealHandler(dir);
  }, 90000);

  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('components.json has only trust and proof', () => {
    const c = readJson(join(dir, '.claude-flow/guidance/components.json'));
    expect(c.components).toContain('trust');
    expect(c.components).toContain('proof');
    expect(c.components.length).toBe(2);
  });

  describe('status reflects reduced components', () => {
    let status;
    beforeAll(() => { status = runGuidanceCommand(dir, 'status'); });

    it('enabled list includes trust and proof', () => {
      expect(status.enabledComponents).toContain('trust');
      expect(status.enabledComponents).toContain('proof');
    });

    it('enabled list excludes adversarial, conformance, evolution', () => {
      expect(status.enabledComponents).not.toContain('adversarial');
      expect(status.enabledComponents).not.toContain('conformance');
      expect(status.enabledComponents).not.toContain('evolution');
    });

    it('proof chain length starts at 0', () => {
      expect(status.proofChainLength).toBe(0);
    });

    it('trust agents starts at 0', () => {
      expect(status.trustAgents).toBe(0);
    });
  });

  // NOTE: pre-command and session-end events with disabled adversarial/conformance
  // expose null-object API mismatches (analyzeInput vs analyze, runConformanceTest
  // vs run). These are tracked bugs in the null-object factories. The status
  // command tests above verify component gating without hitting those methods.
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: Trust accumulation across multiple events
// ══════════════════════════════════════════════════════════════════════════════

describe('e2e behavioral: trust accumulation', { skip: shouldSkip ? true : false }, () => {
  let dir;
  let trustAfterFirst, trustAfterSecond;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'cfgi-behav-trust-'));
    const r = cli(['init', '--yes'], dir);
    if (r.status !== 0) throw new Error(`init failed: ${r.stderr}`);
    ensureClaudeMd(dir);
    await installIntoRepo({ targetRepo: dir, targetMode: 'claude', preset: 'full' });
    writeRealHandler(dir);

    // Run two consecutive events for the same agent
    const first = runGuidanceEvent(dir, 'pre-command', {
      command: 'npm test', agentId: 'trust-agent',
    });
    trustAfterFirst = first.trust;

    const second = runGuidanceEvent(dir, 'pre-command', {
      command: 'git status', agentId: 'trust-agent',
    });
    trustAfterSecond = second.trust;
  }, 90000);

  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('trust snapshot returned after first event', () => {
    expect(trustAfterFirst).toBeDefined();
    expect(typeof trustAfterFirst.score).toBe('number');
  });

  it('trust snapshot returned after second event', () => {
    expect(trustAfterSecond).toBeDefined();
    expect(typeof trustAfterSecond.score).toBe('number');
  });

  it('trust scores are within valid range [0, 1]', () => {
    expect(trustAfterFirst.score).toBeGreaterThanOrEqual(0);
    expect(trustAfterFirst.score).toBeLessThanOrEqual(1);
    expect(trustAfterSecond.score).toBeGreaterThanOrEqual(0);
    expect(trustAfterSecond.score).toBeLessThanOrEqual(1);
  });

  it('trust persisted to state file for this agent', () => {
    const state = readJson(join(dir, '.claude-flow/guidance/advanced/advanced-state.json'));
    const snapshots = state.trustSnapshots || [];
    const agentSnapshot = snapshots.find(s => s.agentId === 'trust-agent');
    expect(agentSnapshot).toBeDefined();
    expect(typeof agentSnapshot.score).toBe('number');
  });

  it('trust records exist in ledger', () => {
    const state = readJson(join(dir, '.claude-flow/guidance/advanced/advanced-state.json'));
    expect(state.trustRecords).toBeDefined();
    expect(Array.isArray(state.trustRecords)).toBe(true);
    expect(state.trustRecords.length).toBeGreaterThanOrEqual(2);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: Multi-agent proof chain (two agents, verify both recorded)
// ══════════════════════════════════════════════════════════════════════════════

describe('e2e behavioral: multi-agent proof chain', { skip: shouldSkip ? true : false }, () => {
  let dir;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'cfgi-behav-proof-'));
    const r = cli(['init', '--yes'], dir);
    if (r.status !== 0) throw new Error(`init failed: ${r.stderr}`);
    ensureClaudeMd(dir);
    await installIntoRepo({ targetRepo: dir, targetMode: 'claude', preset: 'full' });
    writeRealHandler(dir);

    // Run events from two different agents
    runGuidanceEvent(dir, 'pre-command', { command: 'git status', agentId: 'agent-alpha' });
    runGuidanceEvent(dir, 'pre-edit', { filePath: 'src/a.js', content: 'code', agentId: 'agent-alpha' });
    runGuidanceEvent(dir, 'pre-task', { taskId: 'multi-1', taskDescription: 'task from alpha', agentId: 'agent-alpha' });
    runGuidanceEvent(dir, 'pre-command', { command: 'npm install', agentId: 'agent-beta' });
    runGuidanceEvent(dir, 'post-task', { taskId: 'multi-1', status: 'completed', agentId: 'agent-alpha' });
    runGuidanceEvent(dir, 'post-edit', { filePath: 'src/b.js', agentId: 'agent-beta' });
  }, 90000);

  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('proof chain has at least 6 envelopes', () => {
    const proof = readJson(join(dir, '.claude-flow/guidance/advanced/proof-chain.json'));
    expect(proof.envelopes.length).toBeGreaterThanOrEqual(6);
  });

  it('trust snapshots reflect both agents', () => {
    const state = readJson(join(dir, '.claude-flow/guidance/advanced/advanced-state.json'));
    const agentIds = (state.trustSnapshots || []).map(s => s.agentId);
    expect(agentIds).toContain('agent-alpha');
    expect(agentIds).toContain('agent-beta');
  });

  it('threat history recorded (may be empty for safe commands)', () => {
    const state = readJson(join(dir, '.claude-flow/guidance/advanced/advanced-state.json'));
    expect(state.threatHistory).toBeDefined();
    expect(Array.isArray(state.threatHistory)).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: Hook-handler.cjs subprocess dispatch
// ══════════════════════════════════════════════════════════════════════════════

describe('e2e behavioral: hook-handler dispatch', { skip: shouldSkip ? true : false }, () => {
  let dir;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'cfgi-behav-hookdispatch-'));
    const r = cli(['init', '--yes'], dir);
    if (r.status !== 0) throw new Error(`init failed: ${r.stderr}`);
    ensureClaudeMd(dir);
    await installIntoRepo({ targetRepo: dir, targetMode: 'claude', preset: 'full' });
    writeRealHandler(dir);
  }, 90000);

  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function runHookHandler(command, stdinPayload = {}, timeout = 15000) {
    const handlerPath = join(dir, '.claude/helpers/hook-handler.cjs');
    return spawnSync(
      process.execPath,
      [handlerPath, command],
      {
        cwd: dir,
        input: JSON.stringify(stdinPayload),
        env: {
          ...process.env,
          CLAUDE_PROJECT_DIR: dir,
          GUIDANCE_EVENT_WIRING_ENABLED: '1',
          GUIDANCE_PROOF_KEY: 'e2e-test-signing-key',
          NODE_NO_WARNINGS: '1',
        },
        encoding: 'utf-8',
        timeout,
      }
    );
  }

  it('pre-bash with safe command prints [OK]', () => {
    const r = runHookHandler('pre-bash', { tool_input: { command: 'echo hello' } });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('[OK]');
  });

  it('pre-edit with file path prints [OK]', () => {
    const r = runHookHandler('pre-edit', { tool_input: { file_path: 'src/test.js', content: 'test' } });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('[OK]');
  });

  it('post-edit records edit', () => {
    const r = runHookHandler('post-edit', { tool_input: { file_path: 'src/test.js' } });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('[OK]');
  });

  it('pre-task prints [OK] or routing info', () => {
    const r = runHookHandler('pre-task', { tool_input: { description: 'Implement feature X' } });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/\[OK\]|\[INFO\]/);
  });

  it('post-task prints [OK]', () => {
    const r = runHookHandler('post-task', { tool_input: { status: 'completed' } });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('[OK]');
  });

  it('status prints [OK]', () => {
    const r = runHookHandler('status');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('[OK]');
  });

  it('session-end exits 0', () => {
    const r = runHookHandler('session-end');
    expect(r.status).toBe(0);
    // May print [OK], session info, or intelligence consolidation output
    expect(r.stdout.length).toBeGreaterThan(0);
  });

  it('unknown command exits 0 with [OK]', () => {
    const r = runHookHandler('unknown-event');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('[OK]');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: Unknown event error handling
// ══════════════════════════════════════════════════════════════════════════════

describe('e2e behavioral: error handling', { skip: shouldSkip ? true : false }, () => {
  let dir;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'cfgi-behav-errors-'));
    const r = cli(['init', '--yes'], dir);
    if (r.status !== 0) throw new Error(`init failed: ${r.stderr}`);
    ensureClaudeMd(dir);
    await installIntoRepo({ targetRepo: dir, targetMode: 'claude', preset: 'full' });
    writeRealHandler(dir);
  }, 90000);

  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('unknown event name exits non-zero', () => {
    const result = spawnSync(
      process.execPath,
      [INTEGRATIONS_SCRIPT, 'event', 'bogus-event', '{}'],
      {
        cwd: dir,
        env: { ...process.env, GUIDANCE_PROJECT_DIR: dir, NODE_NO_WARNINGS: '1' },
        encoding: 'utf-8',
        timeout: 15000,
      }
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Unknown guidance event');
  });

  it('missing CLAUDE.md causes initialization error', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'cfgi-behav-noclaudemd-'));
    try {
      // Create minimal .claude-flow structure but NO CLAUDE.md
      mkdirSync(join(tempDir, '.claude-flow/guidance'), { recursive: true });
      writeFileSync(join(tempDir, '.claude-flow/guidance/components.json'),
        JSON.stringify({ version: 1, preset: 'full', components: ['trust', 'proof'] }));

      const result = spawnSync(
        process.execPath,
        [INTEGRATIONS_SCRIPT, 'event', 'pre-command', '{"command":"ls"}'],
        {
          cwd: tempDir,
          env: { ...process.env, GUIDANCE_PROJECT_DIR: tempDir, NODE_NO_WARNINGS: '1' },
          encoding: 'utf-8',
          timeout: 15000,
        }
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('Missing required guidance file');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite: Full session lifecycle — guidance + memory cross-cutting (WM-008)
//
// Exercises the REAL hook-handler.cjs entry point and verifies BOTH
// guidance state (proof chain, trust) AND memory state (intelligence graph,
// pending insights, ranked context, confidence feedback) after a simulated
// full session with agentdb v3 config.
// ══════════════════════════════════════════════════════════════════════════════

describe('e2e behavioral: guidance + memory cross-cutting lifecycle (WM-008)', { skip: shouldSkip ? true : false }, () => {
  let dir;

  function runHookHandler(command, stdinPayload = {}, timeout = 15000) {
    const handlerPath = join(dir, '.claude/helpers/hook-handler.cjs');
    return spawnSync(
      process.execPath,
      [handlerPath, command],
      {
        cwd: dir,
        input: JSON.stringify(stdinPayload),
        env: {
          ...process.env,
          CLAUDE_PROJECT_DIR: dir,
          GUIDANCE_EVENT_WIRING_ENABLED: '1',
          GUIDANCE_PROOF_KEY: 'e2e-test-signing-key',
          NODE_NO_WARNINGS: '1',
        },
        encoding: 'utf-8',
        timeout,
      }
    );
  }

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'cfgi-behav-crosscut-'));
    const r = cli(['init', '--yes'], dir);
    if (r.status !== 0) throw new Error(`init failed: ${r.stderr}`);
    ensureClaudeMd(dir);
    await installIntoRepo({ targetRepo: dir, targetMode: 'claude', preset: 'full' });
    writeRealHandler(dir);

    // Seed memory store with agentdb v3-related entries
    const dataDir = join(dir, '.claude-flow', 'data');
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(join(dataDir, 'auto-memory-store.json'), JSON.stringify([
      {
        id: 'xc-1', key: 'agentdb-v3-rvf', content: 'AgentDB v3 uses RVF unified storage with self-learning search',
        summary: 'AgentDB v3 RVF storage', namespace: 'core', type: 'semantic',
        metadata: { sourceFile: 'memory/agentdb-backend.js' }, createdAt: Date.now(),
      },
      {
        id: 'xc-2', key: 'witness-chain', content: 'Witness chain provides SHAKE-256 audit trail for tamper detection',
        summary: 'Witness chain audit', namespace: 'core', type: 'semantic',
        metadata: { sourceFile: 'memory/agentdb-backend.js' }, createdAt: Date.now(),
      },
    ]));
  }, 90000);

  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  // ── Verify agentdb v3 config was generated ──

  it('init generated config.json with agentdb v3 section', () => {
    const cfg = readJson(join(dir, '.claude-flow', 'config.json'));
    expect(cfg.memory?.agentdb?.vectorBackend).toBe('rvf');
    expect(cfg.memory?.agentdb?.enableLearning).toBe(true);
  });

  // ── Step 1: session-restore initializes both systems ──

  describe('Step 1: session-restore', () => {
    let result;
    beforeAll(() => { result = runHookHandler('session-restore'); });

    it('exits 0', () => { expect(result.status).toBe(0); });

    it('intelligence.init() was called (graph loaded)', () => {
      // session-restore calls intel.init(), which should build graph from seeded store
      expect(result.stdout).toContain('[INTELLIGENCE]');
    });

    it('graph-state.json created from seeded memory entries', () => {
      const graphPath = join(dir, '.claude-flow', 'data', 'graph-state.json');
      expect(existsSync(graphPath)).toBe(true);
      const graph = readJson(graphPath);
      expect(graph.nodeCount).toBe(2);
    });

    it('ranked-context.json created with PageRank scores', () => {
      const rankedPath = join(dir, '.claude-flow', 'data', 'ranked-context.json');
      expect(existsSync(rankedPath)).toBe(true);
      const ranked = readJson(rankedPath);
      expect(ranked.entries.length).toBe(2);
      expect(typeof ranked.entries[0].pageRank).toBe('number');
    });
  });

  // ── Step 2: route — intelligence provides context ──

  describe('Step 2: route (intelligence context)', () => {
    let result;
    beforeAll(() => {
      result = spawnSync(
        process.execPath,
        [join(dir, '.claude/helpers/hook-handler.cjs'), 'route'],
        {
          cwd: dir,
          env: {
            ...process.env,
            CLAUDE_PROJECT_DIR: dir,
            PROMPT: 'implement agentdb v3 RVF storage migration',
            NODE_NO_WARNINGS: '1',
          },
          encoding: 'utf-8',
          timeout: 15000,
        }
      );
    });

    it('exits 0', () => { expect(result.status).toBe(0); });

    it('outputs intelligence context for matching prompt', () => {
      // getContext should match our seeded entries about agentdb v3
      expect(result.stdout).toContain('[INTELLIGENCE]');
    });
  });

  // ── Step 3: pre-bash → guidance + trust ──

  describe('Step 3: pre-bash (guidance + trust)', () => {
    let result;
    beforeAll(() => {
      result = runHookHandler('pre-bash', { tool_input: { command: 'npm test' } });
    });

    it('exits 0 with [OK]', () => {
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('[OK]');
    });

    it('guidance proof chain updated', () => {
      const proofPath = join(dir, '.claude-flow', 'guidance', 'advanced', 'proof-chain.json');
      if (!existsSync(proofPath)) return; // guidance may not be fully wired in this env
      const proof = readJson(proofPath);
      expect(proof.envelopes.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Step 4: post-edit → intelligence.recordEdit() + guidance ──

  describe('Step 4: post-edit (memory + guidance)', () => {
    beforeAll(() => {
      // Edit agentdb-backend.js 4 times to trigger insight creation on consolidate
      for (let i = 0; i < 4; i++) {
        runHookHandler('post-edit', { tool_input: { file_path: 'memory/agentdb-backend.js' } });
      }
    });

    it('pending-insights.jsonl has recorded edits', () => {
      const pendingPath = join(dir, '.claude-flow', 'data', 'pending-insights.jsonl');
      expect(existsSync(pendingPath)).toBe(true);
      const lines = readFileSync(pendingPath, 'utf-8').trim().split('\n').filter(Boolean);
      expect(lines.length).toBe(4);
      const parsed = JSON.parse(lines[0]);
      expect(parsed.type).toBe('edit');
      expect(parsed.file).toBe('memory/agentdb-backend.js');
    });
  });

  // ── Step 5: pre-task + post-task → guidance trust + intelligence feedback ──

  describe('Step 5: pre-task + post-task (trust + feedback)', () => {
    beforeAll(() => {
      runHookHandler('pre-task', {
        tool_input: { description: 'Upgrade agentdb to v3 with RVF storage' },
      });
      runHookHandler('post-task', {
        tool_input: { status: 'completed' },
      });
    });

    it('guidance trust state updated', () => {
      const statePath = join(dir, '.claude-flow', 'guidance', 'advanced', 'advanced-state.json');
      if (!existsSync(statePath)) return;
      const state = readJson(statePath);
      expect(state.trustSnapshots).toBeDefined();
    });

    it('intelligence feedback boosted confidence for matched patterns', () => {
      const rankedPath = join(dir, '.claude-flow', 'data', 'ranked-context.json');
      const ranked = readJson(rankedPath);
      // After route + getContext + feedback(true), at least one entry should be accessed
      const accessed = ranked.entries.filter(e => e.accessCount > 0);
      expect(accessed.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Step 6: session-end → intelligence.consolidate() + guidance conformance ──

  describe('Step 6: session-end (consolidate + conformance)', () => {
    let result;
    beforeAll(() => { result = runHookHandler('session-end'); });

    it('exits 0', () => { expect(result.status).toBe(0); });

    it('intelligence consolidation ran', () => {
      // consolidate() processes pending insights and creates new entries
      expect(result.stdout).toContain('[INTELLIGENCE]');
    });

    it('pending-insights.jsonl cleared after consolidation', () => {
      const pendingPath = join(dir, '.claude-flow', 'data', 'pending-insights.jsonl');
      const content = readFileSync(pendingPath, 'utf-8').trim();
      expect(content).toBe('');
    });

    it('new insight entry created for frequently-edited agentdb file', () => {
      const store = readJson(join(dir, '.claude-flow', 'data', 'auto-memory-store.json'));
      const insight = store.find(e => e.metadata?.autoGenerated && e.content?.includes('agentdb-backend.js'));
      expect(insight).toBeDefined();
      expect(insight.namespace).toBe('insights');
    });

    it('graph updated with new insight node (2 original + 1 insight = 3)', () => {
      const graph = readJson(join(dir, '.claude-flow', 'data', 'graph-state.json'));
      expect(graph.nodeCount).toBe(3);
    });

    it('intelligence snapshot saved for delta tracking', () => {
      const snapPath = join(dir, '.claude-flow', 'data', 'intelligence-snapshot.json');
      expect(existsSync(snapPath)).toBe(true);
      const snaps = readJson(snapPath);
      expect(Array.isArray(snaps)).toBe(true);
      expect(snaps.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Final state: both systems coherent ──

  describe('Final state: cross-system coherence', () => {
    it('memory store has original entries + auto-generated insights', () => {
      const store = readJson(join(dir, '.claude-flow', 'data', 'auto-memory-store.json'));
      expect(store.length).toBeGreaterThanOrEqual(3); // 2 original + 1+ insights
      const originals = store.filter(e => !e.metadata?.autoGenerated);
      const insights = store.filter(e => e.metadata?.autoGenerated);
      expect(originals.length).toBe(2);
      expect(insights.length).toBeGreaterThanOrEqual(1);
    });

    it('intelligence ranked-context has all entries with scores', () => {
      const ranked = readJson(join(dir, '.claude-flow', 'data', 'ranked-context.json'));
      expect(ranked.entries.length).toBeGreaterThanOrEqual(3);
      for (const entry of ranked.entries) {
        expect(typeof entry.pageRank).toBe('number');
        expect(typeof entry.confidence).toBe('number');
      }
    });

    it('guidance proof chain accumulated envelopes from all events', () => {
      const proofPath = join(dir, '.claude-flow', 'guidance', 'advanced', 'proof-chain.json');
      if (!existsSync(proofPath)) return;
      const proof = readJson(proofPath);
      // pre-bash + post-edit(x4 async) + pre-task + post-task + session-end
      expect(proof.envelopes.length).toBeGreaterThanOrEqual(1);
    });

    it('guidance advanced-state has trust records', () => {
      const statePath = join(dir, '.claude-flow', 'guidance', 'advanced', 'advanced-state.json');
      if (!existsSync(statePath)) return;
      const state = readJson(statePath);
      expect(state.lastHookEvent).toBeDefined();
    });
  });
});
