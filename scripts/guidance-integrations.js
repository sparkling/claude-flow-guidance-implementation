#!/usr/bin/env node
import { resolve } from 'node:path';

import { createGuidanceAdvancedRuntime } from '../src/guidance/advanced-runtime.js';
import { safeString, parseJson } from '../src/utils.mjs';
import { runEvent } from './event-handlers.js';

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
      const payload = parseJson(args[1]);
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
