import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Unit tests for pure sim modules of the rebuild (game/tests/**). Browser tests (game/tests/e2e) run under
// Playwright, not here. Whole-world proofs stay in game/scripts/check-*.mts.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
    testTimeout: 30_000,
  },
});
