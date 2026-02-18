#!/usr/bin/env node
import { resolve } from 'node:path';

import { createGuidancePhase1Runtime } from '../guidance/phase1-runtime.js';

const rootDir = resolve(
  process.env.GUIDANCE_PROJECT_DIR || process.env.CLAUDE_PROJECT_DIR || process.cwd()
);

function usage() {
  console.log(`Usage:
  node scripts/guidance-runtime.js demo
  node scripts/guidance-runtime.js status
  node scripts/guidance-runtime.js task "<description>" [task-id]
  node scripts/guidance-runtime.js command "<shell command>"
  node scripts/guidance-runtime.js tool "<toolName>" [jsonParameters]
  node scripts/guidance-runtime.js edit "<filePath>" [diffLines] [content]`);
}

function printResult(label, result) {
  const out = {
    label,
    success: result.success,
    aborted: result.aborted ?? false,
    hooksExecuted: result.hooksExecuted,
    hooksFailed: result.hooksFailed,
    messages: result.messages ?? [],
    warnings: result.warnings ?? [],
  };
  console.log(JSON.stringify(out, null, 2));
}

async function run() {
  const [, , command, ...rest] = process.argv;

  if (!command) {
    usage();
    process.exit(1);
  }

  const runtime = createGuidancePhase1Runtime({ rootDir });
  await runtime.initialize();

  if (command === 'status') {
    console.log(JSON.stringify(runtime.getStatus(), null, 2));
    return;
  }

  if (command === 'task') {
    const taskDescription = rest[0] ?? '';
    const taskId = rest[1] ?? `task-${Date.now()}`;
    if (!taskDescription) {
      throw new Error('task description is required');
    }

    const pre = await runtime.preTask({ taskId, taskDescription });
    printResult('pre-task', pre);
    const policyText = runtime.extractPolicyText(pre);
    if (policyText) {
      console.log('\nInjected policy preview:\n');
      console.log(policyText.split('\n').slice(0, 16).join('\n'));
    }
    const post = await runtime.postTask({ taskId, status: 'completed' });
    printResult('post-task', post);
    return;
  }

  if (command === 'command') {
    const shellCommand = rest[0] ?? '';
    if (!shellCommand) {
      throw new Error('shell command is required');
    }
    const result = await runtime.preCommand(shellCommand);
    printResult('pre-command', result);
    return;
  }

  if (command === 'tool') {
    const toolName = rest[0] ?? '';
    const paramsInput = rest[1] ?? '{}';
    if (!toolName) {
      throw new Error('tool name is required');
    }
    let params;
    try {
      params = JSON.parse(paramsInput);
    } catch {
      throw new Error(`Invalid JSON parameters: ${paramsInput}`);
    }
    const result = await runtime.preToolUse(toolName, params);
    printResult('pre-tool-use', result);
    return;
  }

  if (command === 'edit') {
    const filePath = rest[0] ?? '';
    const diffLines = Number(rest[1] ?? 0);
    const content = rest[2] ?? '';
    if (!filePath) {
      throw new Error('file path is required');
    }
    const result = await runtime.preEdit({ filePath, diffLines, content });
    printResult('pre-edit', result);
    return;
  }

  if (command === 'demo') {
    const taskId = `demo-${Date.now()}`;
    const preTask = await runtime.preTask({
      taskId,
      taskDescription: 'Implement a guidance runtime integration script',
    });
    printResult('pre-task', preTask);

    const destructive = await runtime.preCommand('git push origin main --force');
    printResult('pre-command destructive', destructive);

    const safe = await runtime.preCommand('git status');
    printResult('pre-command safe', safe);

    const postTask = await runtime.postTask({
      taskId,
      status: 'completed',
      toolsUsed: ['Read', 'Edit', 'Bash'],
      filesTouched: ['scripts/guidance-runtime.js'],
    });
    printResult('post-task', postTask);
    return;
  }

  usage();
  process.exit(1);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
