import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { availableParallelism } from 'node:os';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    passWithNoTests: true,
    // Node 25+ ships a native localStorage getter that throws without
    // --localstorage-file and shadows jsdom's Storage. Drop it so
    // vitest can install jsdom's implementation. Node <25 rejects the flag.
    execArgv:
      Number(process.versions.node.split('.')[0]) >= 25
        ? ['--no-webstorage']
        : [],
    // Bound jsdom concurrency: host-wide CPU fan-out made the 101-row
    // projection test exceed 5s; the same assertions take 417ms in isolation.
    // A two-CPU CI runner should not start four jsdom workers. Keep the local
    // four-worker ceiling while respecting the runner's available CPUs.
    maxWorkers: Math.min(4, availableParallelism()),
    exclude: ['**/node_modules/**', '**/domain_apps/**'],
  },
});
