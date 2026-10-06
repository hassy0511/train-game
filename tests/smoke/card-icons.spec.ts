import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARD_ICONS, type RoundCardIcon } from '../../src/ui/card-icons';

/**
 * The round card pictures (src/ui/card-icons.ts), shown the way showCard shows them, over the title screen with the
 * game's own styles. v1.11 (PR9b, docs/PHASE9_CHAPTER5_6.md 第 1 部 §1.3): `world`, the picture of chapter 6's card and
 * of the ending 「せかいの わ」 (neither is on the map before PR10 / PR11b): six dots in the chapters' colours on a
 * rainbow ring of rail and a star in the middle, unlike chapter 2's `ring`. No letters in any picture.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, 'output');
mkdirSync(OUT, { recursive: true });

async function toTitle(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await expect(page.locator('#title-screen')).toBeVisible();
}

/** A card like showCard's (src/ui/cards.ts): the picture, the lines, the button. */
async function showCard(page: Page, svg: string, title: string, button: string): Promise<void> {
  await page.evaluate(
    ([svg, title, button]) => {
      const el = document.createElement('div');
      el.className = 'overlay card';
      el.id = 'card';
      el.insertAdjacentHTML('beforeend', svg);
      const h = document.createElement('h1');
      title.split('\n').forEach((line, i) => {
        if (i > 0) h.appendChild(document.createElement('br'));
        h.appendChild(document.createTextNode(line));
      });
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'big-button';
      btn.id = 'card-button';
      btn.textContent = button;
      el.append(h, btn);
      document.getElementById('ui')?.appendChild(el);
    },
    [svg, title, button] as const,
  );
}

test("chapter 6's card picture `world`: a rainbow ring of rail with six dots and a star", async ({ page }) => {
  await toTitle(page);
  // Chapter 6's card as world.json will have it (第 1 部 §3.3; its finale comes with 6-2, PR11b).
  await showCard(page, CARD_ICONS.world, '6しょう クリア！\nぜんぶの せかいを\nまわったね！', 'やったね！');
  const icon = page.locator('#card svg.card-icon');
  await expect(icon).toHaveCount(1);
  await expect(icon).toBeVisible();
  const box = await icon.boundingBox();
  expect(box?.width).toBeGreaterThan(100);
  // Six chapter dots, the star, no letters.
  await expect(icon.locator('circle[r="10"]')).toHaveCount(6);
  await expect(icon.locator('path[fill="#ffd166"]')).toHaveCount(1);
  await expect(icon.locator('text')).toHaveCount(0);
  await expect(page.locator('#card')).toContainText('6しょう クリア！');
  await page.screenshot({ path: resolve(OUT, 'card-world.png') });
});

test('every round card picture side by side (the chapter ends: ring, wave, snow, firefly, world)', async ({ page }) => {
  await toTitle(page);
  const names = Object.keys(CARD_ICONS) as RoundCardIcon[];
  // Not the same picture twice (world is not ring), and none has letters.
  expect(new Set(names.map((n) => CARD_ICONS[n])).size).toBe(names.length);
  for (const n of names) expect(CARD_ICONS[n], n).not.toMatch(/<text/);
  await showCard(page, `<div style="display:flex;gap:16px">${names.map((n) => CARD_ICONS[n]).join('')}</div>`, names.join(' '), 'とじる');
  await expect(page.locator('#card svg.card-icon')).toHaveCount(names.length);
  await page.screenshot({ path: resolve(OUT, 'card-icons.png') });
});
