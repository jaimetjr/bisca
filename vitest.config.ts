import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: true,
    testTimeout: 10_000,
    hookTimeout: 15_000,
    setupFiles: ['tests/setup-env.ts'],
    // Drizzle's pgTable mutates shared schema state on import; running test
    // files in parallel within the same worker occasionally races and throws
    // "Cannot read properties of undefined (reading 'config')". Serialising
    // file execution removes the flake — files still run in one worker, just
    // sequentially.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
});
