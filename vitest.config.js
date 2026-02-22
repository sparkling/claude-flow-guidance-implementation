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
        'src/cli/analyze-guidance.js',
        'src/cli/scaffold-guidance.js',
        'src/cli/guidance-ab-benchmark.js',
        'src/cli/guidance-runtime.js',
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
