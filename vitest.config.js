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
        'src/cli/**',
        'src/hook-handler.cjs',
        'src/guidance/advanced-runtime.js',
        'src/guidance/integration-runners.js',
        'src/guidance/phase1-runtime.js',
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
