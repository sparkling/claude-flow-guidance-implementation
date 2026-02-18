import {
  SyntheticContentAwareExecutor,
  createSyntheticContentAwareExecutor,
} from '../src/guidance/content-aware-executor.js';

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------
describe('createSyntheticContentAwareExecutor', () => {
  it('returns an instance of SyntheticContentAwareExecutor', () => {
    const executor = createSyntheticContentAwareExecutor();
    expect(executor).toBeInstanceOf(SyntheticContentAwareExecutor);
  });
});

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------
describe('SyntheticContentAwareExecutor initial state', () => {
  it('context is an empty string', () => {
    const executor = new SyntheticContentAwareExecutor();
    expect(executor.context).toBe('');
  });

  it('guidanceStrength is 0', () => {
    const executor = new SyntheticContentAwareExecutor();
    expect(executor.guidanceStrength).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// setContext
// ---------------------------------------------------------------------------
describe('setContext', () => {
  it('sets context to empty and strength to 0 when called with null', () => {
    const executor = new SyntheticContentAwareExecutor();
    executor.setContext(null);
    expect(executor.context).toBe('');
    expect(executor.guidanceStrength).toBe(0);
  });

  it('counts NEVER/ALWAYS/MUST enforcement terms (case-insensitive)', () => {
    const executor = new SyntheticContentAwareExecutor();
    executor.setContext('NEVER do X. ALWAYS do Y. MUST follow Z.');
    expect(executor.guidanceStrength).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// execute — baseline mode (no context / strength 0)
// ---------------------------------------------------------------------------
describe('execute in baseline mode', () => {
  let executor;

  beforeEach(() => {
    executor = new SyntheticContentAwareExecutor();
    // No setContext call — strength stays 0.
  });

  it('returns a short working note', async () => {
    const result = await executor.execute('do something');
    expect(result.stdout).toContain('Working note:');
    expect(result.stdout.length).toBeLessThan(200);
  });

  it('result has stdout, stderr, and exitCode 0', async () => {
    const result = await executor.execute('anything');
    expect(result).toHaveProperty('stdout');
    expect(result).toHaveProperty('stderr');
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
  });
});

// ---------------------------------------------------------------------------
// execute — guided mode (strength > 0)
// ---------------------------------------------------------------------------
describe('execute in guided mode', () => {
  let executor;

  beforeEach(() => {
    executor = new SyntheticContentAwareExecutor();
    executor.setContext('NEVER do X. ALWAYS do Y. MUST follow Z.');
  });

  it('returns longer policy text with multiple snippets', async () => {
    const result = await executor.execute('general task');
    const lines = result.stdout.split('\n');
    expect(lines.length).toBeGreaterThan(3);
    expect(result.stdout.length).toBeGreaterThan(200);
  });

  it('includes security-specific snippet for security task', async () => {
    const result = await executor.execute('security task');
    expect(result.stdout).toContain('Security controls');
  });

  it('includes refactor snippet for refactor task', async () => {
    const result = await executor.execute('refactor code');
    expect(result.stdout).toContain('Refactor approach');
  });

  it('includes performance snippet for performance optimize', async () => {
    const result = await executor.execute('performance optimize');
    expect(result.stdout).toContain('Performance approach');
  });

  it('includes testing snippet for write tests', async () => {
    const result = await executor.execute('write tests');
    expect(result.stdout).toContain('Testing approach');
  });

  it('all execute results have stdout, stderr, and exitCode 0', async () => {
    const prompts = [
      'general task',
      'security task',
      'refactor code',
      'performance optimize',
      'write tests',
    ];

    for (const prompt of prompts) {
      const result = await executor.execute(prompt);
      expect(result).toHaveProperty('stdout');
      expect(result).toHaveProperty('stderr');
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
    }
  });
});
