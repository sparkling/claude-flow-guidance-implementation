import {
  GUIDANCE_ENV_DEFAULTS,
  GUIDANCE_HOOKS_DEFAULTS,
  GUIDANCE_PACKAGE_SCRIPTS,
  GUIDANCE_PACKAGE_DEPS,
  buildHookDefaults,
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
  it('has PreToolUse, PostToolUse, SessionStart, SessionEnd keys', () => {
    expect(GUIDANCE_HOOKS_DEFAULTS).toHaveProperty('PreToolUse');
    expect(GUIDANCE_HOOKS_DEFAULTS).toHaveProperty('PostToolUse');
    expect(GUIDANCE_HOOKS_DEFAULTS).toHaveProperty('SessionStart');
    expect(GUIDANCE_HOOKS_DEFAULTS).toHaveProperty('SessionEnd');
  });

  const hookCategories = ['PreToolUse', 'PostToolUse', 'SessionStart', 'SessionEnd'];

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

  it('does not include invalid hook event keys', () => {
    const defaults = buildHookDefaults();
    const validEvents = ['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Stop',
      'SubagentStop', 'SubagentStart', 'SessionStart', 'SessionEnd', 'Notification'];
    for (const key of Object.keys(defaults)) {
      expect(validEvents).toContain(key);
    }
  });
});
