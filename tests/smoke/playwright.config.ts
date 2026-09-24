import { defineConfig } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// Runs against the production build served by `vite preview` (base "/").
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  outputDir: './test-results',
  timeout: 180_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    // iPad Pro 11" landscape in CSS pixels; DPR 1 to keep software rendering fast.
    viewport: { width: 1194, height: 834 },
    deviceScaleFactor: 1,
    hasTouch: true,
    // The offline cache is tested on its own (pwa.spec.ts); elsewhere it would only add timing noise.
    serviceWorkers: 'block',
    launchOptions: {
      // Set PW_CHROMIUM_PATH to reuse a pre-installed Chromium instead of downloading one.
      executablePath: process.env.PW_CHROMIUM_PATH || undefined,
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  webServer: {
    // Playwright inherits the package-script PATH, so the local Vite binary is
    // directly available. Avoid npx, which is absent in the bundled runtime.
    command: 'vite preview --host 127.0.0.1 --port 4173 --strictPort',
    cwd: resolve(here, '../..'),
    url: 'http://127.0.0.1:4173',
    stdout: 'ignore',
    stderr: 'pipe',
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
