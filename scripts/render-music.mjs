#!/usr/bin/env node
/**
 * Renders the game's songs (src/audio/songs.ts) to WAV files for listening outside the game:
 *   node scripts/render-music.mjs <out-dir> [song ...]    (default: every song, two loops or 30 s)
 * Needs Playwright's Chromium (PW_CHROMIUM_PATH to reuse an installed one).
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [outDir, ...wanted] = process.argv.slice(2);
if (!outDir) throw new Error('usage: node scripts/render-music.mjs <out-dir> [song ...]');
const songs = wanted.length ? wanted : ['title', 'town', 'valley', 'sky', 'forest', 'meadow', 'volcano', 'hurry'];
const PORT = 5198;

const server = spawn(resolve(root, 'node_modules/.bin/vite'), ['--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((ok, fail) => {
  server.stdout.on('data', (d) => String(d).includes('Local') && ok());
  server.on('exit', (code) => fail(new Error(`vite exited ${code}`)));
});
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
try {
  mkdirSync(outDir, { recursive: true });
  for (const id of songs) {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/tools/music-render.html?song=${id}&seconds=32`);
    await page.waitForFunction(() => document.body.dataset.done || document.body.dataset.error, null, { timeout: 120_000 });
    const error = await page.evaluate(() => document.body.dataset.error);
    if (error) throw new Error(`${id}: ${error}`);
    const b64 = await page.evaluate(() => window.wav);
    const out = resolve(outDir, `${id}.wav`);
    writeFileSync(out, Buffer.from(b64, 'base64'));
    console.log(`${out} peak ${await page.evaluate(() => document.body.dataset.peak)}`);
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}
