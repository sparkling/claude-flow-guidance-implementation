#!/usr/bin/env node
/**
 * Claude Flow Hook Handler (Cross-Platform)
 * Dispatches hook events to the appropriate helper modules.
 */

const path = require('path');
const fs = require('fs');
const { createHash } = require('crypto');
const { spawn, spawnSync } = require('child_process');

const helpersDir = process.env.__GUIDANCE_HELPERS_DIR || __dirname;

function safeRequire(modulePath) {
  try {
    if (fs.existsSync(modulePath)) {
      const origLog = console.log;
      const origError = console.error;
      console.log = () => {};
      console.error = () => {};
      try {
        const mod = require(modulePath);
        return mod;
      } finally {
        console.log = origLog;
        console.error = origError;
      }
    }
  } catch (e) {
    // silently fail
  }
  return null;
}

const router = safeRequire(path.join(helpersDir, 'router.cjs'));
const session = safeRequire(path.join(helpersDir, 'session.cjs'));
const memory = safeRequire(path.join(helpersDir, 'memory.cjs'));
const intelligence = safeRequire(path.join(helpersDir, 'intelligence.cjs'));

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

function launchGuidanceAutopilot(source) {
  if (process.env.GUIDANCE_AUTOPILOT_ENABLED === '0') return;
  const projectDir = getProjectDir();
  const scriptPath = resolveGuidanceScriptPath('guidance-autopilot.js');
  if (!fs.existsSync(scriptPath)) return;

  try {
    const autopilotArgs = [
      scriptPath,
      '--once',
      '--apply',
      '--source',
      source || 'hook',
      '--min-delta',
      process.env.GUIDANCE_AUTOPILOT_MIN_DELTA || '0.5',
    ];

    if (process.env.GUIDANCE_AUTOPILOT_AB === '1') {
      autopilotArgs.push('--ab');
      autopilotArgs.push('--min-ab-gain');
      autopilotArgs.push(process.env.GUIDANCE_AUTOPILOT_MIN_AB_GAIN || '0.05');
    }

    const child = spawn(process.execPath, autopilotArgs, {
      cwd: projectDir,
      env: process.env,
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
  } catch (e) {
    // non-fatal
  }
}

function guidanceWiringEnabled() {
  return process.env.GUIDANCE_EVENT_WIRING_ENABLED !== '0';
}

function getProjectDir() {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

function getBundledScriptPath(scriptName) {
  return path.resolve(__dirname, 'cli', scriptName);
}

const _resolvedPaths = {};
function resolveGuidanceScriptPath(scriptName) {
  if (_resolvedPaths[scriptName]) return _resolvedPaths[scriptName];

  const localPath = path.join(getProjectDir(), 'src', 'cli', scriptName);
  if (fs.existsSync(localPath)) {
    _resolvedPaths[scriptName] = localPath;
    return localPath;
  }

  const bundledPath = getBundledScriptPath(scriptName);
  if (fs.existsSync(bundledPath)) {
    _resolvedPaths[scriptName] = bundledPath;
    return bundledPath;
  }

  return localPath;
}

function getGuidanceScriptPath() {
  return resolveGuidanceScriptPath('guidance-integrations.js');
}

function safeString(value, fallback) {
  if (value == null) return fallback || '';
  return String(value);
}

function toPositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round(parsed);
}

function parseJsonOutput(stdout) {
  const text = safeString(stdout, '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    const start = text.lastIndexOf('{');
    if (start >= 0) {
      const candidate = text.slice(start);
      try {
        return JSON.parse(candidate);
      } catch (nestedError) {
        return null;
      }
    }
    return null;
  }
}

function stableId(prefix, seed) {
  const input = safeString(seed, '').trim() || `${prefix}-${Date.now()}`;
  const digest = createHash('sha1').update(input).digest('hex').slice(0, 12);
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
  const candidate = toolInput.description || toolInput.prompt || toolInput.task || prompt;
  return safeString(candidate, '').trim();
}

function getExplicitTaskId() {
  const toolInput = getToolInput();
  return safeString(stdinData.task_id || toolInput.task_id || toolInput.id || stdinData.id, '').trim();
}

function getTaskCachePath() {
  return path.join(getProjectDir(), '.claude-flow', 'guidance', 'hook-task-cache.json');
}

function readTaskCache() {
  const cachePath = getTaskCachePath();
  if (!fs.existsSync(cachePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  } catch (error) {
    return {};
  }
}

function writeTaskCache(cache) {
  const cachePath = getTaskCachePath();
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
}

function rememberTaskContext(taskId, taskDescription) {
  const cache = readTaskCache();
  cache.last = {
    taskId: safeString(taskId, ''),
    taskDescription: safeString(taskDescription, ''),
    updatedAt: Date.now(),
  };
  writeTaskCache(cache);
}

function getRememberedTaskContext() {
  const cache = readTaskCache();
  const last = cache.last;
  if (!last || typeof last !== 'object') return null;
  const taskId = safeString(last.taskId, '').trim();
  const taskDescription = safeString(last.taskDescription, '').trim();
  if (!taskId && !taskDescription) return null;
  return { taskId, taskDescription };
}

function getTaskId(prefix) {
  const explicitId = getExplicitTaskId();
  if (explicitId) return safeString(explicitId, `${prefix}-${Date.now()}`);
  const remembered = getRememberedTaskContext();
  if (prefix === 'post-task' && remembered && remembered.taskId) {
    return remembered.taskId;
  }
  const toolInput = getToolInput();
  return stableId(prefix, getTaskDescription() || safeString(toolInput.command, '') || prefix);
}

function getSessionId() {
  return safeString(
    stdinData.session_id || process.env.CLAUDE_SESSION_ID,
    `session-${Date.now()}`
  );
}

function getAgentId() {
  return safeString(process.env.CLAUDE_AGENT_ID || stdinData.agent_id, 'claude-main');
}

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
  if (!content) return 0;
  return content.split('\n').length;
}

function buildGuidancePayload(overrides) {
  return Object.assign(
    {
      taskId: getTaskId('hook-task'),
      sessionId: getSessionId(),
      agentId: getAgentId(),
    },
    overrides || {}
  );
}

function runGuidanceEventSync(eventName, payload) {
  if (!guidanceWiringEnabled()) return null;
  const scriptPath = getGuidanceScriptPath();
  if (!fs.existsSync(scriptPath)) return null;

  const timeout = toPositiveInteger(process.env.GUIDANCE_EVENT_SYNC_TIMEOUT_MS, 8000);
  const result = spawnSync(
    process.execPath,
    [scriptPath, 'event', eventName, JSON.stringify(payload || {})],
    {
      cwd: getProjectDir(),
      env: process.env,
      encoding: 'utf-8',
      timeout,
    }
  );

  if (result.error) {
    return {
      event: eventName,
      success: true,
      blocked: false,
      skipped: true,
      error: result.error.message,
    };
  }

  if (result.status !== 0) {
    const failClosed = process.env.GUIDANCE_EVENT_FAIL_CLOSED === '1';
    return {
      event: eventName,
      success: !failClosed,
      blocked: failClosed,
      skipped: false,
      error: safeString(result.stderr, '').trim() || safeString(result.stdout, '').trim(),
    };
  }

  const parsed = parseJsonOutput(result.stdout);
  if (parsed) return parsed;

  return {
    event: eventName,
    success: true,
    blocked: false,
    skipped: true,
    error: 'Unable to parse guidance event output',
  };
}

function launchGuidanceEventAsync(eventName, payload) {
  if (!guidanceWiringEnabled()) return;
  const scriptPath = getGuidanceScriptPath();
  if (!fs.existsSync(scriptPath)) return;

  try {
    const child = spawn(
      process.execPath,
      [scriptPath, 'event', eventName, JSON.stringify(payload || {})],
      {
        cwd: getProjectDir(),
        env: process.env,
        detached: true,
        stdio: 'ignore',
      }
    );
    child.unref();
  } catch (error) {
    // non-fatal
  }
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
  if (fragments.length > 0) return fragments.join(' | ');
  return fallback;
}

const handlers = {
  'route': () => {
    if (intelligence && intelligence.getContext) {
      try {
        const ctx = intelligence.getContext(prompt);
        if (ctx) console.log(ctx);
      } catch (e) { /* non-fatal */ }
    }
    if (router && router.routeTask) {
      const result = router.routeTask(prompt);
      const output = [];
      output.push('[INFO] Routing task: ' + (prompt.substring(0, 80) || '(no prompt)'));
      output.push('');
      output.push('+------------------- Primary Recommendation -------------------+');
      output.push('| Agent: ' + result.agent.padEnd(53) + '|');
      output.push('| Confidence: ' + (result.confidence * 100).toFixed(1) + '%' + ' '.repeat(44) + '|');
      output.push('| Reason: ' + result.reason.substring(0, 53).padEnd(53) + '|');
      output.push('+--------------------------------------------------------------+');
      console.log(output.join('\n'));
    } else {
      console.log('[INFO] Router not available, using default routing');
    }
  },

  'pre-bash': () => {
    const commandText = safeString(getToolInput().command || prompt, '').trim();
    const guidance = runGuidanceEventSync(
      'pre-command',
      buildGuidancePayload({
        taskId: getTaskId('pre-command'),
        command: commandText,
      })
    );

    if (guidance && guidance.blocked) {
      console.error('[BLOCKED] ' + guidanceBlockMessage(guidance, 'Command blocked by guidance'));
      process.exit(1);
    }

    const cmd = commandText.toLowerCase();
    const dangerous = ['rm -rf /', 'format c:', 'del /s /q c:\\', ':(){:|:&};:'];
    for (let i = 0; i < dangerous.length; i++) {
      if (cmd.includes(dangerous[i])) {
        console.error('[BLOCKED] Dangerous command detected: ' + dangerous[i]);
        process.exit(1);
      }
    }
    console.log('[OK] Command validated');
  },

  'pre-edit': () => {
    const filePath = getFilePath();
    if (!filePath) {
      console.log('[OK] Edit validation skipped (missing file path)');
      return;
    }

    const guidance = runGuidanceEventSync(
      'pre-edit',
      buildGuidancePayload({
        taskId: getTaskId('pre-edit'),
        filePath,
        content: getEditContent(),
        diffLines: getDiffLines(),
        operation: safeString(getToolInput().operation, 'modify'),
      })
    );

    if (guidance && guidance.blocked) {
      console.error('[BLOCKED] ' + guidanceBlockMessage(guidance, 'Edit blocked by guidance'));
      process.exit(1);
    }

    console.log('[OK] Edit validated');
  },

  'post-edit': () => {
    if (session && session.metric) {
      try { session.metric('edits'); } catch (e) { /* no active session */ }
    }
    if (intelligence && intelligence.recordEdit) {
      try {
        const file = (stdinData.tool_input && stdinData.tool_input.file_path) || args[0] || '';
        intelligence.recordEdit(file);
      } catch (e) { /* non-fatal */ }
    }

    launchGuidanceEventAsync(
      'post-edit',
      buildGuidancePayload({
        taskId: getTaskId('post-edit'),
        filePath: getFilePath(),
      })
    );

    console.log('[OK] Edit recorded');
  },

  'session-restore': () => {
    if (session) {
      const existing = session.restore && session.restore();
      if (!existing) {
        session.start && session.start();
      }
    } else {
      console.log('[OK] Session restored: session-' + Date.now());
    }
    if (intelligence && intelligence.init) {
      try {
        const result = intelligence.init();
        if (result && result.nodes > 0) {
          console.log('[INTELLIGENCE] Loaded ' + result.nodes + ' patterns, ' + result.edges + ' edges');
        }
      } catch (e) { /* non-fatal */ }
    }
  },

  'session-end': () => {
    if (intelligence && intelligence.consolidate) {
      try {
        const result = intelligence.consolidate();
        if (result && result.entries > 0) {
          let msg = '[INTELLIGENCE] Consolidated: ' + result.entries + ' entries, ' + result.edges + ' edges';
          if (result.newEntries > 0) msg += ', ' + result.newEntries + ' new';
          msg += ', PageRank recomputed';
          console.log(msg);
        }
      } catch (e) { /* non-fatal */ }
    }
    if (session && session.end) {
      session.end();
    } else {
      console.log('[OK] Session ended');
    }

    launchGuidanceEventAsync(
      'session-end',
      buildGuidancePayload({
        taskId: getTaskId('session-end'),
      })
    );

    // Non-blocking background guidance optimization run.
    launchGuidanceAutopilot('session-end');
  },

  'pre-task': () => {
    const taskDescription = getTaskDescription();
    const taskId = getTaskId('pre-task');
    rememberTaskContext(taskId, taskDescription);
    const guidance = runGuidanceEventSync(
      'pre-task',
      buildGuidancePayload({
        taskId,
        taskDescription,
      })
    );

    if (guidance && guidance.blocked) {
      console.error('[BLOCKED] ' + guidanceBlockMessage(guidance, 'Task blocked by guidance'));
      process.exit(1);
    }

    if (session && session.metric) {
      try { session.metric('tasks'); } catch (e) { /* no active session */ }
    }
    const routePrompt = taskDescription || prompt;
    if (router && router.routeTask && routePrompt) {
      const result = router.routeTask(routePrompt);
      console.log('[INFO] Task routed to: ' + result.agent + ' (confidence: ' + result.confidence + ')');
    } else {
      console.log('[OK] Task started');
    }
  },

  'post-task': () => {
    const remembered = getRememberedTaskContext();
    const taskId = getExplicitTaskId() || (remembered && remembered.taskId) || getTaskId('post-task');
    const taskDescription = getTaskDescription() || (remembered && remembered.taskDescription) || '';

    if (intelligence && intelligence.feedback) {
      try {
        intelligence.feedback(true);
      } catch (e) { /* non-fatal */ }
    }

    launchGuidanceEventAsync(
      'post-task',
      buildGuidancePayload({
        taskId,
        taskDescription,
        status: safeString(getToolInput().status, 'completed'),
        toolsUsed: [],
        filesTouched: [],
      })
    );

    console.log('[OK] Task completed');
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

  'status': () => {
    console.log('[OK] Status check');
  },

  'stats': () => {
    if (intelligence && intelligence.stats) {
      intelligence.stats(args.includes('--json'));
    } else {
      console.log('[WARN] Intelligence module not available. Run session-restore first.');
    }
  },
};

async function main() {
  if (command && handlers[command]) {
    try {
      await Promise.resolve(handlers[command]());
    } catch (e) {
      console.log('[WARN] Hook ' + command + ' encountered an error: ' + e.message);
    }
    return;
  }

  if (command) {
    console.log('[OK] Hook: ' + command);
    return;
  }

  console.log('Usage: hook-handler.cjs <route|pre-bash|pre-edit|post-edit|session-restore|session-end|pre-task|post-task|compact-manual|compact-auto|status|stats>');
}

main();
