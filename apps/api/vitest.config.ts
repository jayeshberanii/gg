import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC (not esbuild) so that Nest's decorator metadata is emitted in tests.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  // The integration tests share one database; run in parallel they deadlock each other.
  test: { include: ['src/**/*.test.ts', 'test/**/*.test.ts'], fileParallelism: false },
});
