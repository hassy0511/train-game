import { execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

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

const BUILD_ID = buildId();

/**
 * Writes dist/sw.js: the service worker from src/pwa/sw-template.js with the list of files to cache on
 * install (the game page, its code, the stages, the models, icons). The model viewer (models.html) and the
 * picture-book previews are left out; the previews are cached when first shown.
 */
function serviceWorker(): Plugin {
  return {
    name: 'service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle).filter(
        (file) => file !== 'models.html' && !/^assets\/models-.*\.js$/.test(file) && !file.endsWith('.png'),
      );
      const fromPublic = [
        ...modelManifest.map((name) => `models/${name}.glb`),
        'manifest.webmanifest',
        ...readdirSync('public/icons').map((file) => `icons/${file}`),
      ];
      const precache = ['./', ...built.filter((file) => file !== 'index.html'), ...fromPublic];
      const source = readFileSync('src/pwa/sw-template.js', 'utf8')
        .replace('__VERSION__', JSON.stringify(BUILD_ID))
        .replace('__PRECACHE__', JSON.stringify(precache));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  define: {
    __MODEL_MANIFEST__: JSON.stringify(modelManifest),
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  plugins: [serviceWorker()],
  build: {
    target: 'es2022',
    rollupOptions: {
      // models.html is the standalone model viewer for reviewing Blender deliveries.
      input: { main: resolve(__dirname, 'index.html'), models: resolve(__dirname, 'models.html') },
    },
    sourcemap: false,
    // Rapier's inlined wasm makes one large chunk; that is expected.
    chunkSizeWarningLimit: 3000,
  },
  server: { host: true },
  preview: { host: true },
});
