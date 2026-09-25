#!/usr/bin/env node
/**
 * Draws the world-map island pictures (public/map/<id>.png) from the game's own models, as laid out in
 * src/world/world.json. Re-run after changing a diorama or when new models arrive (e.g. ticket 0006):
 *   node scripts/render-map.mjs            # every island with a diorama, plus the "?" silhouette
 *   node scripts/render-map.mjs 1-3        # just some
 * Needs Playwright's Chromium (PW_CHROMIUM_PATH to reuse an installed one).
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const world = JSON.parse(readFileSync(resolve(root, 'src/world/world.json'), 'utf8'));
const wanted = process.argv.slice(2);
const ids = [...world.islands.filter((i) => i.diorama).map((i) => i.id), 'unknown'].filter(
  (id) => wanted.length === 0 || wanted.includes(id),
);
const PORT = 5199;

const server = spawn(resolve(root, 'node_modules/.bin/vite'), ['--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((ok, fail) => {
  server.stdout.on('data', (d) => String(d).includes('Local') && ok());
  server.on('exit', (code) => fail(new Error(`vite exited ${code}`)));
});

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
try {
  mkdirSync(resolve(root, 'public/map'), { recursive: true });
  for (const id of ids) {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1050 } });
    page.on('console', (m) => m.type() === 'error' && console.error(`[${id}] ${m.text()}`));
    await page.goto(`http://127.0.0.1:${PORT}/tools/map-render.html?island=${id}`);
    await page.waitForFunction(() => document.body.dataset.done || document.body.dataset.error, null, { timeout: 120_000 });
    const error = await page.evaluate(() => document.body.dataset.error);
    if (error) throw new Error(`${id}: ${error}`);
    const png = await page.evaluate(() => document.getElementById('out').toDataURL('image/png'));
    const out = resolve(root, `public/map/${id}.png`);
    writeFileSync(out, Buffer.from(png.split(',')[1], 'base64'));
    console.log(`public/map/${id}.png ${await page.evaluate(() => document.body.dataset.size)}`);
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}
