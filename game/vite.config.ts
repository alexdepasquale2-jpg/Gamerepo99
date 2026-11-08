import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// The rebuilt game. Its own root (game/), the shared art in ../assets, its own dist.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: fileURLToPath(new URL('../assets', import.meta.url)),
  build: {
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
  },
  server: { port: 5174, strictPort: false },
});
