import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: true,
    testTimeout: 10_000,
    // Generous because of --coverage: v8's instrumentation pushes the WebSocket
    // suites' startTestServer() past 15s, and the beforeAll timing out took down
    // ws-gameplay on one full coverage run in two. The hook is not slow, the
    // instrumentation is.
    hookTimeout: 30_000,
    setupFiles: ['tests/setup-env.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
});
