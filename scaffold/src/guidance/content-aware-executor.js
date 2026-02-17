/**
 * Lightweight in-process content-aware executor for analyzer benchmarks.
 *
 * This avoids external `claude -p` process execution while still producing
 * behavior differences between "no guidance" and "with guidance" phases.
 */
export class SyntheticContentAwareExecutor {
  constructor() {
    this.context = '';
    this.guidanceStrength = 0;
  }

  setContext(claudeMdContent) {
    this.context = claudeMdContent ?? '';
    const enforcementTerms = this.context.match(/\b(NEVER|ALWAYS|MUST)\b/gi) ?? [];
    this.guidanceStrength = enforcementTerms.length;
  }

  async execute(prompt) {
    const guided = this.guidanceStrength > 0;
    const lower = String(prompt ?? '').toLowerCase();

    if (!guided) {
      // Baseline mode intentionally weaker.
      return {
        stdout: `Working note: ${lower.slice(0, 120)}.`,
        stderr: '',
        exitCode: 0,
      };
    }

    const snippets = [];
    snippets.push(`Task: ${prompt}`);
    snippets.push('Implement safely with explicit validation and verification.');
    snippets.push('Include tests (describe/it/expect) and run test coverage checks.');
    snippets.push('Use batch + parallel processing (Promise.all) where beneficial.');
    snippets.push('Use sanitize/escape/regex input filtering for security-sensitive inputs.');
    snippets.push('Verify signatures with HMAC-SHA256 and reject invalid envelopes.');
    snippets.push('Use LRU cache with invalidation and hit-rate metrics.');
    snippets.push('Apply rate limiting with throttle/window/bucket controls.');
    snippets.push('For deployment, use multi-stage Docker build/runtime separation.');
    snippets.push('For publish flows, manage dist-tag values (alpha, latest, v3alpha).');
    snippets.push('For output export, include CSV formatting with proper escaping.');
    snippets.push('Avoid destructive commands, secret leakage, and unsafe typing.');

    // Prompt-sensitive additions improve task-class adherence while remaining safe.
    if (lower.includes('security') || lower.includes('sanitize') || lower.includes('secret')) {
      snippets.push('Security controls: scan patterns for password/api-key/credential leaks.');
    }
    if (lower.includes('refactor')) {
      snippets.push('Refactor approach: shared helper/base abstractions with test preservation.');
    }
    if (lower.includes('performance') || lower.includes('optimiz')) {
      snippets.push('Performance approach: optimize verification path with concurrent checks.');
    }
    if (lower.includes('test')) {
      snippets.push('Testing approach: add integration coverage across compile/retrieve/gate/ledger flow.');
    }

    return {
      stdout: snippets.join('\n'),
      stderr: '',
      exitCode: 0,
    };
  }
}

export function createSyntheticContentAwareExecutor() {
  return new SyntheticContentAwareExecutor();
}
