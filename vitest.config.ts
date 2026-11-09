import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    // Many tests simulate hundreds of full matches, and CI machines (Windows especially) are several times slower
    // than a laptop, so every test gets one generous limit here instead of hand-tuned per-test numbers.
    testTimeout: 600_000,
    hookTimeout: 600_000,
  },
});
