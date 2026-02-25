#!/usr/bin/env node
/**
 * Guidance Enforcement Handler
 * Runs ALONGSIDE the upstream hook-handler.cjs -- never replaces it.
 * Contains only guidance-specific enforcement gates, telemetry, and autopilot.
 */

const path = require('path');
const fs = require('fs');
const { createHash } = require('crypto');
const { spawn, spawnSync } = require('child_process');

const [,, command, ...args] = process.argv;

// Read stdin JSON from Claude Code hooks (provides tool_input, tool_name, etc.)
let stdinData = {};
try {
  if (!process.stdin.isTTY) {
    const raw = fs.readFileSync(0, 'utf-8').trim();
    if (raw) stdinData = JSON.parse(raw);
  }
} catch (e) { /* stdin may be empty or non-JSON */ }

const prompt = process.env.PROMPT || (stdinData.tool_input && stdinData.tool_input.command) || args.join(' ') || '';

function guidanceWiringEnabled() { return process.env.GUIDANCE_EVENT_WIRING_ENABLED !== '0'; }
function getProjectDir() { return process.env.CLAUDE_PROJECT_DIR || process.cwd(); }
function getBundledScriptPath(scriptName) { return path.resolve(__dirname, 'cli', scriptName); }

const _resolvedPaths = {};
function resolveGuidanceScriptPath(scriptName) {
  if (_resolvedPaths[scriptName]) return _resolvedPaths[scriptName];
  const localPath = path.join(getProjectDir(), 'src', 'cli', scriptName);
  if (fs.existsSync(localPath)) { _resolvedPaths[scriptName] = localPath; return localPath; }
  const bundledPath = getBundledScriptPath(scriptName);
  if (fs.existsSync(bundledPath)) { _resolvedPaths[scriptName] = bundledPath; return bundledPath; }
  return localPath;
}

function getGuidanceScriptPath() { return resolveGuidanceScriptPath('guidance-integrations.js'); }
function safeString(value, fallback) { return value == null ? (fallback || '') : String(value); }

function toPositiveInteger(value, fallback) {
  const parsed = Number(value);
  return (!Number.isFinite(parsed) || parsed <= 0) ? fallback : Math.round(parsed);
}

function parseJsonOutput(stdout) {
  const text = safeString(stdout, '').trim();
  if (!text) return null;
  try { return JSON.parse(text); } catch (error) {
    const start = text.lastIndexOf('{');
    if (start >= 0) { try { return JSON.parse(text.slice(start)); } catch (_) { return null; } }
    return null;
  }
}

function stableId(prefix, seed) {
  const input = safeString(seed, '').trim() || `${prefix}-${Date.now()}`;
  const digest = createHash('sha256').update(input).digest('hex').slice(0, 12);
  return `${prefix}-${digest}`;
}

let _toolInput;
function getToolInput() {
  if (_toolInput !== undefined) return _toolInput;
  _toolInput = (stdinData && typeof stdinData.tool_input === 'object' && stdinData.tool_input) || {};
  return _toolInput;
}

function getTaskDescription() {
  const toolInput = getToolInput();
  return safeString(toolInput.description || toolInput.prompt || toolInput.task || prompt, '').trim();
}

function getExplicitTaskId() {
  const toolInput = getToolInput();
  return safeString(stdinData.task_id || toolInput.task_id || toolInput.id || stdinData.id, '').trim();
}

function getTaskCachePath() { return path.join(getProjectDir(), '.claude-flow', 'guidance', 'hook-task-cache.json'); }

function readTaskCache() {
  const cachePath = getTaskCachePath();
  if (!fs.existsSync(cachePath)) return {};
  try { return JSON.parse(fs.readFileSync(cachePath, 'utf-8')); } catch (error) { return {}; }
}

function writeTaskCache(cache) {
  const cachePath = getTaskCachePath();
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
}

function rememberTaskContext(taskId, taskDescription) {
  const cache = readTaskCache();
  cache.last = { taskId: safeString(taskId, ''), taskDescription: safeString(taskDescription, ''), updatedAt: Date.now() };
  writeTaskCache(cache);
}

function getRememberedTaskContext() {
  const cache = readTaskCache();
  const last = cache.last;
  if (!last || typeof last !== 'object') return null;
  const taskId = safeString(last.taskId, '').trim();
  const taskDescription = safeString(last.taskDescription, '').trim();
  return (!taskId && !taskDescription) ? null : { taskId, taskDescription };
}

function getTaskId(prefix) {
  const explicitId = getExplicitTaskId();
  if (explicitId) return safeString(explicitId, `${prefix}-${Date.now()}`);
  const remembered = getRememberedTaskContext();
  if (prefix === 'post-task' && remembered && remembered.taskId) return remembered.taskId;
  const toolInput = getToolInput();
  return stableId(prefix, getTaskDescription() || safeString(toolInput.command, '') || prefix);
}

function getSessionId() {
  return safeString(stdinData.session_id || process.env.CLAUDE_SESSION_ID, `session-${Date.now()}`);
}
function getAgentId() { return safeString(process.env.CLAUDE_AGENT_ID || stdinData.agent_id, 'claude-main'); }

function getFilePath() {
  const toolInput = getToolInput();
  return safeString(toolInput.file_path || toolInput.path || args[0], '').trim();
}

function getEditContent() {
  const toolInput = getToolInput();
  return safeString(toolInput.content || toolInput.new_string || toolInput.new_content || '', '');
}

function getDiffLines() {
  const toolInput = getToolInput();
  if (toolInput.diff_lines != null) return toPositiveInteger(toolInput.diff_lines, 0);
  if (toolInput.diffLines != null) return toPositiveInteger(toolInput.diffLines, 0);
  const content = getEditContent();
  return content ? content.split('\n').length : 0;
}

function buildGuidancePayload(overrides) {
  return Object.assign({ taskId: getTaskId('hook-task'), sessionId: getSessionId(), agentId: getAgentId() }, overrides || {});
}

function runGuidanceEventSync(eventName, payload) {
  if (!guidanceWiringEnabled()) return null;
  const scriptPath = getGuidanceScriptPath();
  if (!fs.existsSync(scriptPath)) return null;
  const timeout = toPositiveInteger(process.env.GUIDANCE_EVENT_SYNC_TIMEOUT_MS, 8000);
  const result = spawnSync(
    process.execPath,
    [scriptPath, 'event', eventName, JSON.stringify(payload || {})],
    { cwd: getProjectDir(), env: process.env, encoding: 'utf-8', timeout }
  );
  if (result.error) {
    return { event: eventName, success: true, blocked: false, skipped: true, error: result.error.message };
  }
  if (result.status !== 0) {
    const failClosed = process.env.GUIDANCE_EVENT_FAIL_CLOSED === '1';
    return {
      event: eventName, success: !failClosed, blocked: failClosed, skipped: false,
      error: safeString(result.stderr, '').trim() || safeString(result.stdout, '').trim(),
    };
  }
  return parseJsonOutput(result.stdout) || { event: eventName, success: true, blocked: false, skipped: true, error: 'Unable to parse guidance event output' };
}

function launchGuidanceEventAsync(eventName, payload) {
  if (!guidanceWiringEnabled()) return;
  const scriptPath = getGuidanceScriptPath();
  if (!fs.existsSync(scriptPath)) return;
  try {
    const child = spawn(
      process.execPath,
      [scriptPath, 'event', eventName, JSON.stringify(payload || {})],
      { cwd: getProjectDir(), env: process.env, detached: true, stdio: 'ignore' }
    );
    child.unref();
  } catch (error) { /* non-fatal */ }
}

function launchGuidanceAutopilot(source) {
  if (process.env.GUIDANCE_AUTOPILOT_ENABLED === '0') return;
  const projectDir = getProjectDir();
  const scriptPath = resolveGuidanceScriptPath('guidance-autopilot.js');
  if (!fs.existsSync(scriptPath)) return;

  try {
    const autopilotArgs = [
      scriptPath, '--once', '--apply',
      '--source', source || 'hook',
      '--min-delta', process.env.GUIDANCE_AUTOPILOT_MIN_DELTA || '0.5',
    ];
    if (process.env.GUIDANCE_AUTOPILOT_AB === '1') {
      autopilotArgs.push('--ab', '--min-ab-gain', process.env.GUIDANCE_AUTOPILOT_MIN_AB_GAIN || '0.05');
    }
    const child = spawn(process.execPath, autopilotArgs, {
      cwd: projectDir, env: process.env, detached: true, stdio: 'ignore',
    });
    child.unref();
  } catch (e) { /* non-fatal */ }
}

function guidanceBlockMessage(result, fallback) {
  if (!result) return fallback;
  const messages = Array.isArray(result.messages) ? result.messages : [];
  const warnings = Array.isArray(result.warnings) ? result.warnings : [];
  const fragments = [];
  if (result.blockedByThreat) fragments.push('Adversarial threat detected in command input');
  if (messages.length > 0) fragments.push(messages.join(' | '));
  if (warnings.length > 0) fragments.push(warnings.join(' | '));
  if (result.error) fragments.push(String(result.error));
  return fragments.length > 0 ? fragments.join(' | ') : fallback;
}

// --- Dispatch table ---

const handlers = {
  'pre-command': () => {
    const commandText = safeString(getToolInput().command || prompt, '').trim();
    const guidance = runGuidanceEventSync('pre-command', buildGuidancePayload({ taskId: getTaskId('pre-command'), command: commandText }));
    if (guidance && guidance.blocked) {
      console.error('[BLOCKED] ' + guidanceBlockMessage(guidance, 'Command blocked by guidance'));
      process.exit(1);
    }
    const dangerousPatterns = [
      /rm\s+-rf\s+\//,
      /format\s+c:/i,
      /del\s+\/s\s+\/q\s+c:\\/i,
      /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
    ];
    for (const pattern of dangerousPatterns) {
      if (pattern.test(commandText)) {
        console.error('[BLOCKED] Dangerous command pattern detected');
        process.exit(1);
      }
    }
    console.log('[OK] Command validated');
  },

  'pre-edit': () => {
    const filePath = getFilePath();
    if (!filePath) { console.log('[OK] Edit validation skipped (missing file path)'); return; }
    const guidance = runGuidanceEventSync('pre-edit', buildGuidancePayload({
      taskId: getTaskId('pre-edit'), filePath, content: getEditContent(),
      diffLines: getDiffLines(), operation: safeString(getToolInput().operation, 'modify'),
    }));
    if (guidance && guidance.blocked) {
      console.error('[BLOCKED] ' + guidanceBlockMessage(guidance, 'Edit blocked by guidance'));
      process.exit(1);
    }
    console.log('[OK] Edit validated');
  },

  'pre-task': () => {
    const taskDescription = getTaskDescription();
    const taskId = getTaskId('pre-task');
    rememberTaskContext(taskId, taskDescription);
    const guidance = runGuidanceEventSync('pre-task', buildGuidancePayload({ taskId, taskDescription }));
    if (guidance && guidance.blocked) {
      console.error('[BLOCKED] ' + guidanceBlockMessage(guidance, 'Task blocked by guidance'));
      process.exit(1);
    }
    console.log('[OK] Task started');
  },

  'post-edit': () => {
    launchGuidanceEventAsync('post-edit', buildGuidancePayload({ taskId: getTaskId('post-edit'), filePath: getFilePath() }));
    console.log('[OK] Edit recorded');
  },

  'post-task': () => {
    const remembered = getRememberedTaskContext();
    const taskId = getExplicitTaskId() || (remembered && remembered.taskId) || getTaskId('post-task');
    const taskDescription = getTaskDescription() || (remembered && remembered.taskDescription) || '';
    launchGuidanceEventAsync('post-task', buildGuidancePayload({
      taskId, taskDescription, status: safeString(getToolInput().status, 'completed'), toolsUsed: [], filesTouched: [],
    }));
    console.log('[OK] Task completed');
  },

  'session-end': () => {
    launchGuidanceEventAsync('session-end', buildGuidancePayload({ taskId: getTaskId('session-end') }));
    launchGuidanceAutopilot('session-end');
    console.log('[OK] Session ended');
  },

  'compact-manual': () => {
    console.log('PreCompact Guidance:');
    console.log('IMPORTANT: Review CLAUDE.md in project root for:');
    console.log('   - Available agents and concurrent usage patterns');
    console.log('   - Swarm coordination strategies (hierarchical, mesh, adaptive)');
    console.log('   - Critical concurrent execution rules (1 MESSAGE = ALL OPERATIONS)');
    console.log('Ready for compact operation');
  },

  'compact-auto': () => {
    console.log('Auto-Compact Guidance (Context Window Full):');
    console.log('CRITICAL: Before compacting, ensure you understand:');
    console.log('   - All agents available in .claude/agents/ directory');
    console.log('   - Concurrent execution patterns from CLAUDE.md');
    console.log('   - Swarm coordination strategies for complex tasks');
    console.log('Apply GOLDEN RULE: Always batch operations in single messages');
    console.log('Auto-compact proceeding with full agent context');
  },

  'user-prompt': () => { console.log('[OK] User prompt received'); },
  'post-tool-failure': () => { console.log('[OK] Tool failure noted'); },
  'stop': () => { console.log('[OK] Stop acknowledged'); },
  'session-restore': () => { console.log('[OK] Session restored'); },
};

async function main() {
  if (command && handlers[command]) {
    try { await Promise.resolve(handlers[command]()); } catch (e) {
      console.log('[WARN] Hook ' + command + ' encountered an error: ' + e.message);
    }
    return;
  }
  if (command) { console.log('[OK] Hook: ' + command); return; }
  console.log('Usage: guidance-enforcement.cjs <pre-command|pre-edit|pre-task|post-edit|post-task|session-end|compact-manual|compact-auto|user-prompt|post-tool-failure|stop|session-restore>');
}

main();
