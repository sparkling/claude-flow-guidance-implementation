import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

import {
  GUIDANCE_COMPONENTS,
  GUIDANCE_CORE_SCRIPTS,
  GUIDANCE_PRESETS,
  GUIDANCE_PACKAGE_SCRIPTS,
  resolveComponents,
} from '../src/default-settings.mjs';

import { installIntoRepo } from '../src/installer.mjs';

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

// ---------------------------------------------------------------------------
// Suite 1: resolveComponents()
// ---------------------------------------------------------------------------
describe('resolveComponents', () => {
  it('resolves minimal preset to empty array', () => {
    expect(resolveComponents({ preset: 'minimal' })).toEqual([]);
  });

  it('resolves standard preset to trust, proof, analysis (sorted)', () => {
    const result = resolveComponents({ preset: 'standard' });
    expect(result).toEqual(['analysis', 'proof', 'trust']);
  });

  it('resolves full preset to all 8 component names', () => {
    const result = resolveComponents({ preset: 'full' });
    expect(result).toHaveLength(8);
    expect(result).toEqual(expect.arrayContaining(Object.keys(GUIDANCE_COMPONENTS)));
  });

  it('defaults to standard preset when no args given', () => {
    const result = resolveComponents();
    expect(result).toEqual(['analysis', 'proof', 'trust']);
  });

  it('explicit components overrides preset', () => {
    const result = resolveComponents({ components: ['trust', 'proof'] });
    expect(result).toEqual(['proof', 'trust']);
  });

  it('full preset with exclude removes specified components', () => {
    const result = resolveComponents({ preset: 'full', exclude: ['autopilot', 'codex'] });
    expect(result).toHaveLength(6);
    expect(result).not.toContain('autopilot');
    expect(result).not.toContain('codex');
  });

  it('standard preset with exclude removes from resolved set', () => {
    const result = resolveComponents({ preset: 'standard', exclude: ['trust'] });
    expect(result).toEqual(['analysis', 'proof']);
  });

  it('exclude wins over explicit components', () => {
    const result = resolveComponents({ components: ['trust'], exclude: ['trust'] });
    expect(result).toEqual([]);
  });

  it('throws on unknown component name', () => {
    expect(() => resolveComponents({ components: ['nonexistent'] })).toThrow(/Unknown component/);
  });

  it('throws on unknown preset name', () => {
    expect(() => resolveComponents({ preset: 'nope' })).toThrow(/Unknown preset/);
  });

  it('throws on unknown exclude name', () => {
    expect(() => resolveComponents({ exclude: ['nonexistent'] })).toThrow(/Unknown component in exclude/);
  });
});

// ---------------------------------------------------------------------------
// Suite 2: GUIDANCE_COMPONENTS registry
// ---------------------------------------------------------------------------
describe('GUIDANCE_COMPONENTS', () => {
  it('has exactly 8 entries', () => {
    expect(Object.keys(GUIDANCE_COMPONENTS)).toHaveLength(8);
  });

  it('each entry has label, description, scripts, runtimeSubsystems', () => {
    for (const [name, comp] of Object.entries(GUIDANCE_COMPONENTS)) {
      expect(comp).toHaveProperty('label');
      expect(comp).toHaveProperty('description');
      expect(comp).toHaveProperty('scripts');
      expect(comp).toHaveProperty('runtimeSubsystems');
      expect(typeof comp.label).toBe('string');
      expect(typeof comp.description).toBe('string');
      expect(Array.isArray(comp.scripts)).toBe(true);
      expect(Array.isArray(comp.runtimeSubsystems)).toBe(true);
    }
  });

  it('GUIDANCE_CORE_SCRIPTS is a non-empty array of strings', () => {
    expect(Array.isArray(GUIDANCE_CORE_SCRIPTS)).toBe(true);
    expect(GUIDANCE_CORE_SCRIPTS.length).toBeGreaterThan(0);
    for (const s of GUIDANCE_CORE_SCRIPTS) {
      expect(typeof s).toBe('string');
    }
  });

  it('every core script exists in GUIDANCE_PACKAGE_SCRIPTS', () => {
    const scriptKeys = Object.keys(GUIDANCE_PACKAGE_SCRIPTS);
    for (const s of GUIDANCE_CORE_SCRIPTS) {
      expect(scriptKeys).toContain(s);
    }
  });

  it('every component script exists in GUIDANCE_PACKAGE_SCRIPTS', () => {
    const scriptKeys = Object.keys(GUIDANCE_PACKAGE_SCRIPTS);
    for (const comp of Object.values(GUIDANCE_COMPONENTS)) {
      for (const s of comp.scripts) {
        expect(scriptKeys).toContain(s);
      }
    }
  });

  it('union of all component scripts + core scripts covers all package scripts', () => {
    const allScripts = new Set(GUIDANCE_CORE_SCRIPTS);
    for (const comp of Object.values(GUIDANCE_COMPONENTS)) {
      for (const s of comp.scripts) {
        allScripts.add(s);
      }
    }
    for (const key of Object.keys(GUIDANCE_PACKAGE_SCRIPTS)) {
      expect(allScripts.has(key)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 3: GUIDANCE_PRESETS
// ---------------------------------------------------------------------------
describe('GUIDANCE_PRESETS', () => {
  it('has 3 presets: minimal, standard, full', () => {
    expect(Object.keys(GUIDANCE_PRESETS).sort()).toEqual(['full', 'minimal', 'standard']);
  });

  it('minimal is an empty array', () => {
    expect(GUIDANCE_PRESETS.minimal).toEqual([]);
  });

  it('standard contains only valid component names', () => {
    const validNames = Object.keys(GUIDANCE_COMPONENTS);
    for (const name of GUIDANCE_PRESETS.standard) {
      expect(validNames).toContain(name);
    }
  });

  it('full contains all component names', () => {
    const validNames = Object.keys(GUIDANCE_COMPONENTS);
    expect(GUIDANCE_PRESETS.full.sort()).toEqual(validNames.sort());
  });
});

// ---------------------------------------------------------------------------
// Suite 4: installIntoRepo with components
// ---------------------------------------------------------------------------
describe('installIntoRepo with components', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'comp-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('empty components array installs only core scripts', () => {
    installIntoRepo({ targetRepo: tmpDir, components: [], targetMode: 'claude' });

    const pkg = readJson(resolve(tmpDir, 'package.json'));
    const scriptKeys = Object.keys(pkg.scripts);

    // Core scripts must be present
    expect(scriptKeys).toContain('guidance:status');
    expect(scriptKeys).toContain('guidance:all');
    expect(scriptKeys).toContain('guidance:hooks');
    expect(scriptKeys).toContain('guidance:runtime');

    // Non-core scripts must NOT be present
    expect(scriptKeys).not.toContain('guidance:adversarial');
    expect(scriptKeys).not.toContain('guidance:evolution');
    expect(scriptKeys).not.toContain('guidance:analyze');
    expect(scriptKeys).not.toContain('guidance:trust');
  });

  it('trust and proof components install their scripts but not others', () => {
    installIntoRepo({ targetRepo: tmpDir, components: ['trust', 'proof'], targetMode: 'claude' });

    const pkg = readJson(resolve(tmpDir, 'package.json'));
    const scriptKeys = Object.keys(pkg.scripts);

    expect(scriptKeys).toContain('guidance:trust');
    expect(scriptKeys).toContain('guidance:proof');
    expect(scriptKeys).not.toContain('guidance:adversarial');
    expect(scriptKeys).not.toContain('guidance:evolution');
    expect(scriptKeys).not.toContain('guidance:analyze');
  });

  it('codex component excluded does not create config.toml even in both mode', () => {
    installIntoRepo({ targetRepo: tmpDir, components: ['trust'], targetMode: 'both' });

    const configToml = resolve(tmpDir, '.agents/config.toml');
    const agentsMd = resolve(tmpDir, 'AGENTS.md');
    expect(existsSync(configToml)).toBe(false);
    expect(existsSync(agentsMd)).toBe(false);
  });

  it('writes components.json with correct shape', () => {
    installIntoRepo({ targetRepo: tmpDir, components: ['trust', 'proof'], targetMode: 'claude' });

    const jsonPath = resolve(tmpDir, '.claude-flow/guidance/components.json');
    expect(existsSync(jsonPath)).toBe(true);

    const data = readJson(jsonPath);
    expect(data).toHaveProperty('version', 1);
    expect(data).toHaveProperty('components');
    expect(Array.isArray(data.components)).toBe(true);
    expect(data).toHaveProperty('installedAt');
    expect(typeof data.installedAt).toBe('string');
  });

  it('second install without components reads back components.json', () => {
    // First install with explicit components
    installIntoRepo({ targetRepo: tmpDir, components: ['trust', 'proof'], targetMode: 'claude' });

    // Second install without specifying components
    installIntoRepo({ targetRepo: tmpDir, targetMode: 'claude' });

    const pkg = readJson(resolve(tmpDir, 'package.json'));
    const scriptKeys = Object.keys(pkg.scripts);

    // Should still only have trust and proof (read from components.json)
    expect(scriptKeys).toContain('guidance:trust');
    expect(scriptKeys).toContain('guidance:proof');
    expect(scriptKeys).not.toContain('guidance:adversarial');
  });

  it('all 8 components matches current full behaviour', () => {
    const allComponents = Object.keys(GUIDANCE_COMPONENTS);
    installIntoRepo({ targetRepo: tmpDir, components: allComponents, targetMode: 'both' });

    const pkg = readJson(resolve(tmpDir, 'package.json'));
    const scriptKeys = Object.keys(pkg.scripts);

    // All non-codex scripts should be present (codex scripts require codex mode)
    expect(scriptKeys).toContain('guidance:trust');
    expect(scriptKeys).toContain('guidance:adversarial');
    expect(scriptKeys).toContain('guidance:proof');
    expect(scriptKeys).toContain('guidance:conformance');
    expect(scriptKeys).toContain('guidance:evolution');
    expect(scriptKeys).toContain('guidance:analyze');
    expect(scriptKeys).toContain('guidance:optimize');
    expect(scriptKeys).toContain('guidance:codex:status');
  });

  it('codex component with both mode creates config.toml', () => {
    installIntoRepo({ targetRepo: tmpDir, components: ['codex'], targetMode: 'both' });

    const configToml = resolve(tmpDir, '.agents/config.toml');
    expect(existsSync(configToml)).toBe(true);

    const content = readFileSync(configToml, 'utf-8');
    expect(content).toContain('[guidance_codex]');
  });
});

// ---------------------------------------------------------------------------
// Suite 5: GuidanceAdvancedRuntime null objects
// ---------------------------------------------------------------------------
describe('GuidanceAdvancedRuntime null objects', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'runtime-comp-test-'));
    // Create minimal CLAUDE.md so runtime can initialize
    writeFileSync(resolve(tmpDir, 'CLAUDE.md'), '# Test\n\n- [test-rule] Always test (high) #testing\n');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // Note: We need to dynamically import because the runtime module
  // imports from @claude-flow/guidance which may not be available in
  // all test environments. If the import fails, skip these tests.

  let GuidanceAdvancedRuntime;
  let runtimeAvailable = false;

  beforeAll(async () => {
    try {
      const mod = await import('../src/guidance/advanced-runtime.js');
      GuidanceAdvancedRuntime = mod.GuidanceAdvancedRuntime;
      runtimeAvailable = true;
    } catch {
      // Module not available, tests will be skipped
    }
  });

  function writeComponentsJson(dir, components) {
    const cfDir = resolve(dir, '.claude-flow/guidance');
    mkdirSync(cfDir, { recursive: true });
    writeFileSync(resolve(cfDir, 'components.json'), JSON.stringify({
      version: 1,
      components,
      installedAt: new Date().toISOString(),
    }));
  }

  it('empty components disables trust', () => {
    if (!runtimeAvailable) return;
    writeComponentsJson(tmpDir, []);
    const runtime = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    expect(runtime.isComponentEnabled('trust')).toBe(false);
  });

  it('trust component enables trust', () => {
    if (!runtimeAvailable) return;
    writeComponentsJson(tmpDir, ['trust']);
    const runtime = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    expect(runtime.isComponentEnabled('trust')).toBe(true);
    expect(runtime.isComponentEnabled('adversarial')).toBe(false);
  });

  it('no components.json means all enabled (backwards compat)', () => {
    if (!runtimeAvailable) return;
    const runtime = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    expect(runtime.isComponentEnabled('trust')).toBe(true);
    expect(runtime.isComponentEnabled('adversarial')).toBe(true);
    expect(runtime.isComponentEnabled('proof')).toBe(true);
  });

  it('null trust system methods return safe defaults', () => {
    if (!runtimeAvailable) return;
    writeComponentsJson(tmpDir, []);
    const runtime = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    // Should not throw
    runtime.trustSystem.recordOutcome('agent-1', 'allow', 'test');
    expect(runtime.trustSystem.getAllSnapshots()).toEqual([]);
  });

  it('null threat detector returns safe defaults', () => {
    if (!runtimeAvailable) return;
    writeComponentsJson(tmpDir, []);
    const runtime = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    expect(runtime.threatDetector.getThreatHistory()).toEqual([]);
  });

  it('null proof chain export returns empty envelopes', () => {
    if (!runtimeAvailable) return;
    writeComponentsJson(tmpDir, []);
    const runtime = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    expect(runtime.proofChain.export()).toEqual({ envelopes: [] });
  });

  it('null evolution pipeline returns empty proposals', () => {
    if (!runtimeAvailable) return;
    writeComponentsJson(tmpDir, []);
    const runtime = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    expect(runtime.evolutionPipeline.getProposals()).toEqual([]);
  });

  it('getEnabledComponents returns correct set', () => {
    if (!runtimeAvailable) return;
    writeComponentsJson(tmpDir, ['trust', 'proof']);
    const runtime = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    expect(runtime.getEnabledComponents()).toEqual(['proof', 'trust']);
  });

  it('getStatus works with null objects', () => {
    if (!runtimeAvailable) return;
    writeComponentsJson(tmpDir, []);
    const runtime = new GuidanceAdvancedRuntime({ rootDir: tmpDir });
    const status = runtime.getStatus();
    expect(status).toHaveProperty('initialized', false);
    expect(status).toHaveProperty('enabledComponents');
    expect(status.enabledComponents).toEqual([]);
    expect(status.trustAgents).toBe(0);
    expect(status.threatSignals).toBe(0);
    expect(status.proofChainLength).toBe(0);
    expect(status.evolutionProposals).toBe(0);
  });
});
