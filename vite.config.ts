import { readdirSync } from 'node:fs';
import { defineConfig } from 'vite';

// BASE_PATH is set in CI for the GitHub Pages deploy (e.g. "/train-game/").
const modelManifest = readdirSync('public/models')
  .filter((f) => f.endsWith('.glb'))
  .map((f) => f.replace(/\.glb$/, ''))
  .sort();

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  define: {
    __MODEL_MANIFEST__: JSON.stringify(modelManifest),
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    // Rapier's inlined wasm makes one large chunk; that is expected.
    chunkSizeWarningLimit: 3000,
  },
  server: { host: true },
  preview: { host: true },
});
