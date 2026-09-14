import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.spec.ts'],
    // Testcontainers pulls and boots real Postgres/Redis/MinIO images, which is
    // far slower than a mocked suite but is the only way to verify the
    // behaviour the PRD actually pins down.
    testTimeout: 120_000,
    hookTimeout: 180_000,
    // Integration suites share container ports and a database; running files in
    // parallel makes them fight over both.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.module.ts', 'src/main.ts'],
    },
  },
  plugins: [
    // NestJS relies on emitDecoratorMetadata, which esbuild (Vitest's default
    // transformer) does not emit. SWC does.
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
});
