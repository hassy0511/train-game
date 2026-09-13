import { defineConfig } from 'vite';

// BASE_PATH is set in CI for the GitHub Pages deploy (e.g. "/train-game/").
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  build: {
    target: 'es2022',
    sourcemap: false,
    // Rapier's inlined wasm makes one large chunk; that is expected.
    chunkSizeWarningLimit: 3000,
  },
  server: { host: true },
  preview: { host: true },
});
