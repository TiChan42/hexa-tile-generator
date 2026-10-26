import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    maxWorkers: 2,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/core/**/*.ts',
        'src/editor/engineClient.ts',
        'src/editor/generationKey.ts',
        'src/editor/presentation.ts',
        'src/editor/storage.ts',
        'server/*.ts',
      ],
      exclude: ['src/core/types.ts', 'src/core/index.ts', 'server/index.ts'],
      reporter: ['text', 'html', 'lcov'],
      thresholds: { lines: 85, functions: 85, branches: 75, statements: 85 },
    },
  },
});
