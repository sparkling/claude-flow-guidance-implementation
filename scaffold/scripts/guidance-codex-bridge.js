#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(
  process.env.GUIDANCE_PROJECT_DIR || process.env.CLAUDE_PROJECT_DIR || process.cwd()
);

const SUPPORTED_EVENTS = new Set([
  'pre-command',
  'pre-edit',
  'pre-task',
  'post-edit',
  'post-task',
  'session-start',
  'session-end',
  'status',
]);

const HOOK_HANDLER_MAP = {
  'pre-command': 'pre-bash',
  'pre-edit': 'pre-edit',
  'pre-task': 'pre-task',
  'post-edit': 'post-edit',
  'post-task': 'post-task',
  'session-start': 'session-restore',
  'session-end': 'session-end',
  status: 'status',
};

function usage() {
  console.log(`Usage:
  node scripts/guidance-codex-bridge.js <event> [options]

Events:
  pre-command   --command "<bash command>"
  pre-edit      --file <path> [--content "..."] [--operation modify] [--diff-lines 10]
  pre-task      --description "<task description>"
  post-edit     --file <path>
  post-task     --task-id <id> [--description "..."] [--status completed]
  session-start [--session-id <id>]
  session-end   [--session-id <id>]
  status

Common options:
  --task-id <id>
  --session-id <id>
  --agent-id <id>
  --payload-json '<json object>'
  --skip-cf-hooks

Examples:
  node scripts/guidance-codex-bridge.js pre-task --description "Implement auth middleware"
  node scripts/guidance-codex-bridge.js pre-command --command "git push --force origin main"
  node scripts/guidance-codex-bridge.js post-task --task-id task-123 --status completed`);
}

function parseArgs(argv) {
  const positional = [];
  const options = {};
  const flags = new Set();

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith('--')) {
      positional.push(current);
      continue;
    }

    const key = current.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      flags.add(key);
      continue;
    }

    options[key] = next;
    i += 1;
  }

  return { positional, options, flags };
}

function safeString(value, fallback = '') {
  if (value == null) return fallback;
  return String(value);
}

function toInteger(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.round(parsed);
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

function parseArray(value) {
  if (!value) return [];
  const parsed = parseJson(value, []);
  return Array.isArray(parsed) ? parsed : [];
}

function stableId(prefix) {
  return `${prefix}-${Date.now()}`;
}

function baseIds(eventName, options, payload) {
  const eventTaskPrefix =
    eventName === 'pre-command' || eventName === 'pre-edit' ? eventName : 'task';

  const taskId = safeString(
    options['task-id'] || payload.taskId || payload.task_id,
    stableId(eventTaskPrefix)
  );
  const sessionId = safeString(
    options['session-id'] || payload.sessionId || payload.session_id,
    safeString(process.env.CLAUDE_SESSION_ID, `session-${Date.now()}`)
  );
  const agentId = safeString(
    options['agent-id'] || payload.agentId || payload.agent_id,
    'codex-main'
  );
  return { taskId, sessionId, agentId };
}

function hookHandlerInput(eventName, options, payload, ids, fallbackText) {
  const toolPayload = payload.tool_input && typeof payload.tool_input === 'object'
    ? { ...payload.tool_input }
    : {};

  if (eventName === 'pre-command') {
    const command = safeString(options.command, fallbackText);
    toolPayload.command = command;
  }

  if (eventName === 'pre-edit' || eventName === 'post-edit') {
    toolPayload.file_path = safeString(options.file, safeString(payload.filePath, ''));
  }

  if (eventName === 'pre-edit') {
    toolPayload.content = safeString(options.content, safeString(payload.content, ''));
    toolPayload.operation = safeString(options.operation, safeString(payload.operation, 'modify'));
    toolPayload.diff_lines = toInteger(
      options['diff-lines'] || payload.diffLines || payload.diff_lines,
      toolPayload.content ? toolPayload.content.split('\n').length : 0
    );
  }

  if (eventName === 'pre-task') {
    toolPayload.description = safeString(options.description, fallbackText);
  }

  if (eventName === 'post-task') {
    toolPayload.status = safeString(options.status, safeString(payload.status, 'completed'));
    toolPayload.description = safeString(options.description, fallbackText);
  }

  return {
    task_id: ids.taskId,
    session_id: ids.sessionId,
    agent_id: ids.agentId,
    tool_input: toolPayload,
  };
}

function runHookHandler(mappedCommand, inputJson) {
  const handlerPath = resolve(rootDir, '.claude/helpers/hook-handler.cjs');
  if (!existsSync(handlerPath)) {
    return {
      ok: false,
      exitCode: 2,
      stdout: '',
      stderr: `Missing hook handler: ${handlerPath}`,
    };
  }

  const result = spawnSync(process.execPath, [handlerPath, mappedCommand], {
    cwd: rootDir,
    env: process.env,
    input: inputJson,
    encoding: 'utf-8',
  });

  return {
    ok: result.status === 0,
    exitCode: result.status ?? 1,
    stdout: safeString(result.stdout, '').trim(),
    stderr: safeString(result.stderr, '').trim(),
  };
}

function claudeFlowHookArgs(eventName, options, payload, ids) {
  const description = safeString(options.description, safeString(payload.taskDescription, ''));
  switch (eventName) {
    case 'pre-command': {
      const command = safeString(options.command, '');
      if (!command) return null;
      return ['hooks', 'pre-command', '--task-id', ids.taskId, '--command', command];
    }
    case 'pre-edit': {
      const filePath = safeString(options.file, safeString(payload.filePath, ''));
      if (!filePath) return null;
      const operation = safeString(options.operation, safeString(payload.operation, 'modify'));
      return [
        'hooks',
        'pre-edit',
        '--task-id',
        ids.taskId,
        '--file',
        filePath,
        '--operation',
        operation,
      ];
    }
    case 'pre-task':
      if (!description) return null;
      return ['hooks', 'pre-task', '--task-id', ids.taskId, '--description', description];
    case 'post-edit': {
      const filePath = safeString(options.file, safeString(payload.filePath, ''));
      if (!filePath) return null;
      return [
        'hooks',
        'post-edit',
        '--task-id',
        ids.taskId,
        '--file',
        filePath,
        '--success',
        'true',
      ];
    }
    case 'post-task': {
      const taskId = safeString(options['task-id'], ids.taskId);
      const status = safeString(options.status, safeString(payload.status, 'completed'));
      const success = status !== 'failed' ? 'true' : 'false';
      return ['hooks', 'post-task', '--task-id', taskId, '--success', success];
    }
    case 'session-start':
      return ['hooks', 'session-start', '--task-id', ids.taskId, '--session-id', ids.sessionId];
    case 'session-end':
      return ['hooks', 'session-end', '--task-id', ids.taskId, '--export-metrics', 'true'];
    default:
      return null;
  }
}

function runClaudeFlowHook(args) {
  if (!args) return { skipped: true, reason: 'no-compatible-args' };

  const result = spawnSync('npx', ['@claude-flow/cli@latest', ...args], {
    cwd: rootDir,
    env: process.env,
    encoding: 'utf-8',
  });

  return {
    skipped: false,
    ok: result.status === 0,
    exitCode: result.status ?? 1,
    stdout: safeString(result.stdout, '').trim(),
    stderr: safeString(result.stderr, '').trim(),
  };
}

function buildSummary(eventName, ids, handlerResult, cfHookResult, metadata) {
  return {
    event: eventName,
    ids,
    handler: handlerResult,
    claudeFlowHook: cfHookResult,
    metadata,
  };
}

async function main() {
  const { positional, options, flags } = parseArgs(process.argv.slice(2));
  const eventName = safeString(positional[0], '');

  if (!eventName || eventName === 'help' || eventName === '--help' || eventName === '-h') {
    usage();
    process.exit(eventName ? 0 : 1);
  }

  if (!SUPPORTED_EVENTS.has(eventName)) {
    console.error(`Unsupported event: ${eventName}`);
    usage();
    process.exit(1);
  }

  const fallbackText = positional.slice(1).join(' ').trim();
  const payload = parseJson(options['payload-json'], {});
  const ids = baseIds(eventName, options, payload);
  const mappedCommand = HOOK_HANDLER_MAP[eventName];

  const input = hookHandlerInput(eventName, options, payload, ids, fallbackText);
  const handlerResult = runHookHandler(mappedCommand, JSON.stringify(input));

  const shouldRunCfHooks =
    eventName !== 'status' &&
    !flags.has('skip-cf-hooks') &&
    process.env.GUIDANCE_CODEX_SKIP_CF_HOOKS !== '1';

  let cfHookResult = { skipped: true, reason: 'disabled' };
  if (shouldRunCfHooks && handlerResult.ok) {
    const args = claudeFlowHookArgs(eventName, options, payload, ids);
    cfHookResult = runClaudeFlowHook(args);
  }

  const metadata = {
    filePath: safeString(options.file, safeString(payload.filePath, '')),
    status: safeString(options.status, safeString(payload.status, '')),
    toolsUsed: parseArray(options['tools-used']),
    filesTouched: parseArray(options['files-touched']),
  };

  const summary = buildSummary(eventName, ids, handlerResult, cfHookResult, metadata);
  console.log(JSON.stringify(summary, null, 2));

  if (!handlerResult.ok) {
    process.exit(handlerResult.exitCode || 1);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
