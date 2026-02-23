import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.{js,mjs}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,mjs,cjs}'],
      exclude: [
        'scripts/analyze-guidance.js',
        'scripts/scaffold-guidance.js',
        'scripts/guidance-ab-benchmark.js',
        'scripts/guidance-runtime.js',
      ],
      reporter: ['text', 'text-summary'],
      thresholds: {
        statements: 50,
        branches: 40,
        functions: 50,
        lines: 50,
      },
    },
  },
});
