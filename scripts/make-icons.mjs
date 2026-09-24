// Renders assets/icons/app-icon.svg to the PNG icons in public/icons (home screen / install icons).
// Run after editing the SVG: node scripts/make-icons.mjs   (uses Playwright's Chromium; PW_CHROMIUM_PATH to reuse one)
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';

const svg = readFileSync('assets/icons/app-icon.svg', 'utf8');
mkdirSync('public/icons', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
const page = await browser.newPage();
// Maskable icons keep the picture inside the central 80 % safe zone; the rest is sky.
const sizes = [
  { file: 'apple-touch-icon.png', size: 180, pad: 0 },
  { file: 'icon-192.png', size: 192, pad: 0 },
  { file: 'icon-512.png', size: 512, pad: 0 },
  { file: 'icon-maskable-512.png', size: 512, pad: 0.1 },
];
for (const { file, size, pad } of sizes) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * (1 - pad * 2));
  await page.setContent(
    `<html><body style="margin:0;background:#bfe6ff;display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px">` +
      `<div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`,
  );
  await page.screenshot({ path: `public/icons/${file}`, omitBackground: false });
}
await browser.close();
console.log(`icons: ${sizes.map((s) => s.file).join(', ')}`);
