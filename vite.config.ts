import { execSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { defineConfig } from 'vite';

// BASE_PATH is set in CI for the GitHub Pages deploy (e.g. "/train-game/").
const modelManifest = readdirSync('public/models')
  .filter((f) => f.endsWith('.glb'))
  .map((f) => f.replace(/\.glb$/, ''))
  .sort();

// Short build id shown on the title screen so testers can tell which build they are on.
function buildId(): string {
  let sha = process.env.GITHUB_SHA?.slice(0, 7);
  if (!sha) {
    try {
      sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      sha = 'dev';
    }
  }
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${sha} ${d.getUTCMonth() + 1}/${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}Z`;
}

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  define: {
    __MODEL_MANIFEST__: JSON.stringify(modelManifest),
    __BUILD_ID__: JSON.stringify(buildId()),
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
