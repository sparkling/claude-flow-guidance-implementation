import {
  GUIDANCE_ENV_DEFAULTS,
  GUIDANCE_HOOKS_DEFAULTS,
  GUIDANCE_PACKAGE_SCRIPTS,
  GUIDANCE_PACKAGE_DEPS,
  buildHookDefaults,
  buildConfigJson,
} from '../src/default-settings.mjs';

// ---------------------------------------------------------------------------
// GUIDANCE_ENV_DEFAULTS
// ---------------------------------------------------------------------------
describe('GUIDANCE_ENV_DEFAULTS', () => {
  it('has the expected keys', () => {
    const keys = Object.keys(GUIDANCE_ENV_DEFAULTS);
    expect(keys).toContain('CLAUDE_FLOW_HOOKS_ENABLED');
    expect(keys).toContain('GUIDANCE_EVENT_WIRING_ENABLED');
    expect(keys).toContain('GUIDANCE_EVENT_SYNC_TIMEOUT_MS');
    expect(keys).toContain('GUIDANCE_EVENT_FAIL_CLOSED');
    expect(keys).toContain('GUIDANCE_AUTOPILOT_ENABLED');
    expect(keys).toContain('GUIDANCE_AUTOPILOT_MIN_DELTA');
    expect(keys).toContain('GUIDANCE_AUTOPILOT_AB');
    expect(keys).toContain('GUIDANCE_AUTOPILOT_MIN_AB_GAIN');
    expect(keys).toContain('GUIDANCE_CODEX_SKIP_CF_HOOKS');
  });

  it('all values are strings', () => {
    for (const [key, value] of Object.entries(GUIDANCE_ENV_DEFAULTS)) {
      expect(typeof value).toBe('string');
    }
  });
});

// ---------------------------------------------------------------------------
// GUIDANCE_HOOKS_DEFAULTS
// ---------------------------------------------------------------------------
describe('GUIDANCE_HOOKS_DEFAULTS', () => {
  it('has PreToolUse, PostToolUse, SessionStart, SessionEnd, PreCompact keys', () => {
    expect(GUIDANCE_HOOKS_DEFAULTS).toHaveProperty('PreToolUse');
    expect(GUIDANCE_HOOKS_DEFAULTS).toHaveProperty('PostToolUse');
    expect(GUIDANCE_HOOKS_DEFAULTS).toHaveProperty('SessionStart');
    expect(GUIDANCE_HOOKS_DEFAULTS).toHaveProperty('SessionEnd');
    expect(GUIDANCE_HOOKS_DEFAULTS).toHaveProperty('PreCompact');
  });

  const hookCategories = ['PreToolUse', 'PostToolUse', 'SessionStart', 'SessionEnd', 'PreCompact'];

  for (const category of hookCategories) {
    describe(`${category}`, () => {
      it('is a non-empty array of hook blocks', () => {
        const blocks = GUIDANCE_HOOKS_DEFAULTS[category];
        expect(Array.isArray(blocks)).toBe(true);
        expect(blocks.length).toBeGreaterThan(0);
      });

      it('each block has a matcher property and a hooks array', () => {
        for (const block of GUIDANCE_HOOKS_DEFAULTS[category]) {
          expect(block).toHaveProperty('matcher');
          expect(typeof block.matcher).toBe('string');
          expect(Array.isArray(block.hooks)).toBe(true);
          expect(block.hooks.length).toBeGreaterThan(0);
        }
      });

      it('each hook entry has type, command, and timeout', () => {
        for (const block of GUIDANCE_HOOKS_DEFAULTS[category]) {
          for (const hook of block.hooks) {
            expect(hook).toHaveProperty('type');
            expect(hook).toHaveProperty('command');
            expect(hook).toHaveProperty('timeout');
          }
        }
      });

      it('all hook commands reference hook-handler.cjs', () => {
        for (const block of GUIDANCE_HOOKS_DEFAULTS[category]) {
          for (const hook of block.hooks) {
            expect(hook.command).toContain('hook-handler.cjs');
          }
        }
      });

      it('all hooks have timeout 5000', () => {
        for (const block of GUIDANCE_HOOKS_DEFAULTS[category]) {
          for (const hook of block.hooks) {
            expect(hook.timeout).toBe(5000);
          }
        }
      });
    });
  }
});

// ---------------------------------------------------------------------------
// GUIDANCE_PACKAGE_SCRIPTS
// ---------------------------------------------------------------------------
describe('GUIDANCE_PACKAGE_SCRIPTS', () => {
  it('is a non-empty object', () => {
    expect(typeof GUIDANCE_PACKAGE_SCRIPTS).toBe('object');
    expect(Object.keys(GUIDANCE_PACKAGE_SCRIPTS).length).toBeGreaterThan(0);
  });

  it('has expected script entries', () => {
    const keys = Object.keys(GUIDANCE_PACKAGE_SCRIPTS);
    expect(keys).toContain('guidance:analyze');
    expect(keys).toContain('guidance:optimize');
    expect(keys).toContain('guidance:autopilot:once');
    expect(keys).toContain('guidance:autopilot:daemon');
    expect(keys).toContain('guidance:ab-benchmark');
    expect(keys).toContain('guidance:scaffold');
    expect(keys).toContain('guidance:all');
    expect(keys).toContain('guidance:status');
    expect(keys).toContain('guidance:hooks');
    expect(keys).toContain('guidance:trust');
    expect(keys).toContain('guidance:adversarial');
    expect(keys).toContain('guidance:proof');
    expect(keys).toContain('guidance:conformance');
    expect(keys).toContain('guidance:evolution');
    expect(keys).toContain('guidance:runtime');
  });

  it('all script values are non-empty strings', () => {
    for (const [key, value] of Object.entries(GUIDANCE_PACKAGE_SCRIPTS)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// GUIDANCE_PACKAGE_DEPS
// ---------------------------------------------------------------------------
describe('GUIDANCE_PACKAGE_DEPS', () => {
  it('declares the implementation package', () => {
    expect(GUIDANCE_PACKAGE_DEPS).toHaveProperty('@sparkleideas/claude-flow-guidance');
  });

  it('uses a semver range string', () => {
    const version = GUIDANCE_PACKAGE_DEPS['@sparkleideas/claude-flow-guidance'];
    expect(typeof version).toBe('string');
    expect(version.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// buildHookDefaults
// ---------------------------------------------------------------------------
describe('buildHookDefaults', () => {
  it('returns the same structure as GUIDANCE_HOOKS_DEFAULTS when called with no args', () => {
    const defaults = buildHookDefaults();
    expect(Object.keys(defaults).sort()).toEqual(Object.keys(GUIDANCE_HOOKS_DEFAULTS).sort());
  });

  it('uses default timeout of 5000 when no argument given', () => {
    const defaults = buildHookDefaults();
    for (const blocks of Object.values(defaults)) {
      for (const block of blocks) {
        for (const hook of block.hooks) {
          expect(hook.timeout).toBe(5000);
        }
      }
    }
  });

  it('applies custom timeout to all hooks', () => {
    const custom = buildHookDefaults(3000);
    for (const blocks of Object.values(custom)) {
      for (const block of blocks) {
        for (const hook of block.hooks) {
          expect(hook.timeout).toBe(3000);
        }
      }
    }
  });

  it('only uses valid Claude Code hook event keys', () => {
    const defaults = buildHookDefaults();
    const validEvents = ['Setup', 'PreToolUse', 'PermissionRequest', 'PostToolUse',
      'PostToolUseFailure', 'UserPromptSubmit', 'Stop', 'SubagentStop', 'SubagentStart',
      'SessionStart', 'SessionEnd', 'Notification', 'PreCompact'];
    for (const key of Object.keys(defaults)) {
      expect(validEvents).toContain(key);
    }
  });

  it('includes PreCompact hooks with manual and auto matchers', () => {
    const defaults = buildHookDefaults();
    expect(defaults).toHaveProperty('PreCompact');
    expect(defaults.PreCompact).toHaveLength(2);
    expect(defaults.PreCompact[0].matcher).toBe('manual');
    expect(defaults.PreCompact[0].hooks[0].command).toContain('compact-manual');
    expect(defaults.PreCompact[1].matcher).toBe('auto');
    expect(defaults.PreCompact[1].hooks[0].command).toContain('compact-auto');
  });
});

// ---------------------------------------------------------------------------
// buildConfigJson
// ---------------------------------------------------------------------------
describe('buildConfigJson', () => {
  it('returns defaults when called with no arguments', () => {
    const cfg = buildConfigJson();
    expect(cfg.version).toBe('3.0.0');
    expect(cfg.memory.backend).toBe('hybrid');
    expect(cfg.memory.enableHNSW).toBe(true);
    expect(cfg.memory.cacheSize).toBe(100);
    expect(cfg.memory.learningBridge.enabled).toBe(true);
    expect(cfg.memory.learningBridge.sonaMode).toBe('balanced');
    expect(cfg.memory.learningBridge.confidenceDecayRate).toBe(0.005);
    expect(cfg.memory.learningBridge.accessBoostAmount).toBe(0.03);
    expect(cfg.memory.learningBridge.consolidationThreshold).toBe(10);
    expect(cfg.memory.memoryGraph.enabled).toBe(true);
    expect(cfg.memory.memoryGraph.pageRankDamping).toBe(0.85);
    expect(cfg.memory.memoryGraph.maxNodes).toBe(5000);
    expect(cfg.memory.memoryGraph.similarityThreshold).toBe(0.8);
    expect(cfg.memory.agentScopes.enabled).toBe(true);
    expect(cfg.memory.agentScopes.defaultScope).toBe('project');
    expect(cfg.neural.enabled).toBe(true);
    expect(cfg.neural.modelPath).toBe('.claude-flow/neural');
    expect(cfg.hooks.enabled).toBe(true);
    expect(cfg.hooks.autoExecute).toBe(true);
  });

  it('accepts a string for backwards compatibility', () => {
    const cfg = buildConfigJson('sqlite');
    expect(cfg.memory.backend).toBe('sqlite');
    expect(cfg.memory.enableHNSW).toBe(true);
  });

  it('accepts backend option', () => {
    const cfg = buildConfigJson({ backend: 'agentdb' });
    expect(cfg.memory.backend).toBe('agentdb');
  });

  it('--no-hnsw disables HNSW', () => {
    const cfg = buildConfigJson({ enableHNSW: false });
    expect(cfg.memory.enableHNSW).toBe(false);
  });

  it('--cache-size sets cache size', () => {
    const cfg = buildConfigJson({ cacheSize: 500 });
    expect(cfg.memory.cacheSize).toBe(500);
  });

  it('--no-learning-bridge disables learning bridge', () => {
    const cfg = buildConfigJson({ learningBridge: false });
    expect(cfg.memory.learningBridge.enabled).toBe(false);
  });

  it('--sona-mode sets SONA mode', () => {
    const cfg = buildConfigJson({ sonaMode: 'aggressive' });
    expect(cfg.memory.learningBridge.sonaMode).toBe('aggressive');
  });

  it('--confidence-decay sets decay rate', () => {
    const cfg = buildConfigJson({ confidenceDecayRate: 0.01 });
    expect(cfg.memory.learningBridge.confidenceDecayRate).toBe(0.01);
  });

  it('--access-boost sets boost amount', () => {
    const cfg = buildConfigJson({ accessBoostAmount: 0.1 });
    expect(cfg.memory.learningBridge.accessBoostAmount).toBe(0.1);
  });

  it('--consolidation-threshold sets threshold', () => {
    const cfg = buildConfigJson({ consolidationThreshold: 25 });
    expect(cfg.memory.learningBridge.consolidationThreshold).toBe(25);
  });

  it('--no-memory-graph disables memory graph', () => {
    const cfg = buildConfigJson({ memoryGraph: false });
    expect(cfg.memory.memoryGraph.enabled).toBe(false);
  });

  it('--pagerank-damping sets damping factor', () => {
    const cfg = buildConfigJson({ pageRankDamping: 0.9 });
    expect(cfg.memory.memoryGraph.pageRankDamping).toBe(0.9);
  });

  it('--max-graph-nodes sets max nodes', () => {
    const cfg = buildConfigJson({ maxNodes: 10000 });
    expect(cfg.memory.memoryGraph.maxNodes).toBe(10000);
  });

  it('--similarity-threshold sets threshold', () => {
    const cfg = buildConfigJson({ similarityThreshold: 0.95 });
    expect(cfg.memory.memoryGraph.similarityThreshold).toBe(0.95);
  });

  it('--no-agent-scopes disables agent scopes', () => {
    const cfg = buildConfigJson({ agentScopes: false });
    expect(cfg.memory.agentScopes.enabled).toBe(false);
  });

  it('--default-scope sets scope', () => {
    const cfg = buildConfigJson({ defaultScope: 'global' });
    expect(cfg.memory.agentScopes.defaultScope).toBe('global');
  });

  it('--no-neural disables neural', () => {
    const cfg = buildConfigJson({ neuralEnabled: false });
    expect(cfg.neural.enabled).toBe(false);
  });

  it('--neural-model-path sets path', () => {
    const cfg = buildConfigJson({ neuralModelPath: '/custom/neural' });
    expect(cfg.neural.modelPath).toBe('/custom/neural');
  });

  it('hooks.enabled defaults to true', () => {
    const cfg = buildConfigJson({ hooksEnabled: false });
    expect(cfg.hooks.enabled).toBe(false);
  });

  it('--no-hooks-auto-execute disables auto-execute', () => {
    const cfg = buildConfigJson({ hooksAutoExecute: false });
    expect(cfg.hooks.autoExecute).toBe(false);
  });

  it('returns agentdb v3 defaults', () => {
    const cfg = buildConfigJson();
    expect(cfg.memory.agentdb.vectorBackend).toBe('rvf');
    expect(cfg.memory.agentdb.enableLearning).toBe(true);
    expect(cfg.memory.agentdb.learningPositiveThreshold).toBe(0.7);
    expect(cfg.memory.agentdb.learningNegativeThreshold).toBe(0.3);
    expect(cfg.memory.agentdb.learningBatchSize).toBe(32);
    expect(cfg.memory.agentdb.learningTickInterval).toBe(30000);
  });

  it('--no-agentdb-learning disables agentdb learning', () => {
    const cfg = buildConfigJson({ agentdbEnableLearning: false });
    expect(cfg.memory.agentdb.enableLearning).toBe(false);
  });

  it('--agentdb-backend sets vector backend', () => {
    const cfg = buildConfigJson({ agentdbVectorBackend: 'hnsw' });
    expect(cfg.memory.agentdb.vectorBackend).toBe('hnsw');
  });

  it('multiple options combine correctly', () => {
    const cfg = buildConfigJson({
      backend: 'sqlite',
      enableHNSW: false,
      cacheSize: 200,
      learningBridge: false,
      memoryGraph: false,
      neuralEnabled: false,
      hooksAutoExecute: false,
    });
    expect(cfg.memory.backend).toBe('sqlite');
    expect(cfg.memory.enableHNSW).toBe(false);
    expect(cfg.memory.cacheSize).toBe(200);
    expect(cfg.memory.learningBridge.enabled).toBe(false);
    expect(cfg.memory.memoryGraph.enabled).toBe(false);
    expect(cfg.neural.enabled).toBe(false);
    expect(cfg.hooks.autoExecute).toBe(false);
    // Unchanged defaults preserved
    expect(cfg.memory.agentScopes.enabled).toBe(true);
    expect(cfg.hooks.enabled).toBe(true);
  });
});
