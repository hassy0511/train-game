#!/usr/bin/env node
/**
 * Draws the picture-book pictures (public/zukan/<record id>.png, 256 px, transparent) from the game's own models,
 * one for every record with a `model` in a playable stage (docs/PHASE7_FINISH.md §4 item 2). Re-run after adding a
 * record or when a record's model changes (e.g. a code-drawn stand-in is replaced by a built one):
 *   node scripts/render-zukan.mjs              # every record
 *   node scripts/render-zukan.mjs dino-egg     # just some
 *   node scripts/render-zukan.mjs --model partner public/title/pico.png 12 8   # any model: name, file, yaw, pitch
 * Needs Playwright's Chromium (PW_CHROMIUM_PATH to reuse an installed one). ZUKAN_PORT picks the dev server's port
 * (default 5197). Each picture should stay within 40 KB (the script warns).
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
/** `--model <name> <file> [yaw] [pitch]`: one model to one file (the title's partner picture). */
const single = args[0] === '--model' ? { name: args[1], file: args[2], yaw: args[3] ?? '30', pitch: args[4] ?? '22' } : null;
const wanted = single ? [] : args;
const PORT = Number(process.env.ZUKAN_PORT) || 5197;
const MAX_KB = 40;

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
const done = (page) => page.waitForFunction(() => document.body.dataset.done || document.body.dataset.error, null, { timeout: 120_000 });
try {
  if (single) {
    const page = await browser.newPage({ viewport: { width: 600, height: 600 } });
    await page.goto(`http://127.0.0.1:${PORT}/tools/zukan-render.html?model=${single.name}&yaw=${single.yaw}&pitch=${single.pitch}`);
    await done(page);
    const error = await page.evaluate(() => document.body.dataset.error);
    if (error) throw new Error(`${single.name}: ${error}`);
    const png = await page.evaluate(() => document.getElementById('out').toDataURL('image/png'));
    const bytes = Buffer.from(png.split(',')[1], 'base64');
    mkdirSync(dirname(resolve(root, single.file)), { recursive: true });
    writeFileSync(resolve(root, single.file), bytes);
    console.log(`${single.file} ${(bytes.length / 1024).toFixed(1)} KB`);
  }
  mkdirSync(resolve(root, 'public/zukan'), { recursive: true });
  const lister = await browser.newPage();
  await lister.goto(`http://127.0.0.1:${PORT}/tools/zukan-render.html?list=1`);
  await done(lister);
  const all = JSON.parse(await lister.evaluate(() => document.body.dataset.list));
  await lister.close();
  const ids = single ? [] : all.filter((id) => wanted.length === 0 || wanted.includes(id));
  for (const id of ids) {
    const page = await browser.newPage({ viewport: { width: 600, height: 600 } });
    page.on('console', (m) => m.type() === 'error' && console.error(`[${id}] ${m.text()}`));
    await page.goto(`http://127.0.0.1:${PORT}/tools/zukan-render.html?record=${id}`);
    await done(page);
    const error = await page.evaluate(() => document.body.dataset.error);
    if (error) throw new Error(`${id}: ${error}`);
    const png = await page.evaluate(() => document.getElementById('out').toDataURL('image/png'));
    const bytes = Buffer.from(png.split(',')[1], 'base64');
    writeFileSync(resolve(root, `public/zukan/${id}.png`), bytes);
    const kb = bytes.length / 1024;
    console.log(`public/zukan/${id}.png ${kb.toFixed(1)} KB${kb > MAX_KB ? `  (over ${MAX_KB} KB)` : ''}`);
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}
