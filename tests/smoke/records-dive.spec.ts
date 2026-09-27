import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The dive records promised in chapter 2 (docs/PHASE8_CHAPTER3_4.md 第 2 部 §4, §0.5): 2-2's marble in the puddle and
 * 2-3's bubble spring in the harbour's sea. Each has a side track for "もぐる" (`needs: "dive"`): without the
 * ability its arrow is grey and the partner says so; with it, the train runs out onto the water, dives where the
 * button glows, finds the record and is taken back to the main line from the buffer.
 */
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output');
mkdirSync(OUT, { recursive: true });

const KEY = 'train-game.progress.v1';
const FRONT = 6;
const NORMAL = 3;

async function seed(page: Page, abilities: string[], cleared: string[]): Promise<void> {
  await page.addInitScript(
    ([key, data]) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ schema: 1, records: [], mapLinks: [], ...data }));
    },
    [KEY, { abilities, cleared }] as const,
  );
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

/** Taps through lines and captions until `selector` shows. */
async function tapUntil(page: Page, selector: string, timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await page.locator(selector).isVisible()) return;
    if (await page.locator('#bubble').isVisible()) await page.locator('#bubble').dispatchEvent('pointerdown');
    if (await page.locator('#caption').isVisible()) await page.locator('#caption').dispatchEvent('click');
    await page.waitForTimeout(150);
  }
  throw new Error(`timed out waiting for ${selector}`);
}

/** Into the stage's first mission, driving at ふつう. */
async function startDriving(page: Page, stage: string, mission: string): Promise<void> {
  await page.goto(`/?stage=${stage}&go=1`);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  for (;;) {
    await tapUntil(page, '#card', 120_000);
    const text = (await page.locator('#card').textContent()) ?? '';
    await page.locator('#card-button').click();
    if (text.includes(mission)) break;
  }
  await page.waitForFunction(() => document.getElementById('app')?.dataset.phase === 'driving', null, { timeout: 60_000 });
  const box = await page.locator(`.lever-detent[data-notch="${NORMAL}"]`).boundingBox();
  if (!box) throw new Error('lever not laid out');
  await page.mouse.click(box.x + 30, box.y);
}

async function waitFront(page: Page, rail: string, at: number, timeout = 180_000): Promise<void> {
  await page.waitForFunction(
    ([r, s]) => {
      const d = document.getElementById('app')?.dataset;
      return d?.rail === r && Number(d.s) >= s;
    },
    [rail, at - FRONT] as const,
    { timeout },
  );
}

/** Presses the round button `id` the moment it glows (polled every frame). */
async function pressOnGlow(page: Page, id: string, mode?: string): Promise<void> {
  await page.waitForFunction(
    ([button, want]) => {
      const b = document.getElementById(button);
      if (!b || b.dataset.glow !== '1' || (want && b.dataset.mode !== want)) return false;
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      return true;
    },
    [id, mode ?? ''] as const,
    { timeout: 180_000, polling: 'raf' },
  );
}

const records = (page: Page): Promise<string[]> => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}').records ?? [], KEY);

test('2-2 without もぐる: the arrow to the puddle is grey and says why', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await seed(page, ['whistle', 'jump', 'light'], ['1-1', '1-2', '1-3', '2-1']);
  await startDriving(page, '2-2', 'バッタと');
  // The gap before the fork (main 340–352) at ふつう.
  await pressOnGlow(page, 'jump');
  await expect(page.locator('#junction')).toBeVisible({ timeout: 180_000 });
  const left = page.locator('.arrow[data-side="left"]');
  await expect(left).toHaveAttribute('data-needs', 'dive');
  await expect(left).toHaveAttribute('data-locked', '1');
  await left.dispatchEvent('pointerdown');
  await expect(left).not.toHaveClass(/is-selected/);
  await expect(page.locator('#bubble')).toContainText('もぐれたら いけそう…', { timeout: 10_000 });
  await page.screenshot({ path: resolve(OUT, 'records-dive-2-2-locked.png') });
  await waitFront(page, 'main', 400);
  await expect(page.locator('#app')).toHaveAttribute('data-rail', 'main');
  expect(errors).toEqual([]);
});

test('2-2 with もぐる: out onto the pond, dive for the marble, back to main 395', async ({ page }) => {
  test.setTimeout(400_000);
  const errors = watchErrors(page);
  await seed(page, ['whistle', 'jump', 'light', 'rocket', 'dive'], ['1-1', '1-2', '1-3', '2-1', '2-2', '2-3', '3-1']);
  await startDriving(page, '2-2', 'バッタと');
  await expect(page.locator('#junction')).toBeVisible({ timeout: 180_000 });
  await page.locator('.arrow[data-side="left"]').dispatchEvent('pointerdown');
  await expect(page.locator('.arrow[data-side="left"]')).toHaveClass(/is-selected/);
  // Still a jump over the gap before the fork.
  await pressOnGlow(page, 'jump', 'jump');
  await expect(page.locator('#app')).toHaveAttribute('data-rail', 'mizutamari', { timeout: 60_000 });
  await expect(page.locator('#jump')).toHaveAttribute('data-mode', 'dive', { timeout: 60_000 });
  await pressOnGlow(page, 'jump', 'dive');
  await expect(page.locator('#app')).toHaveAttribute('data-diving', '1', { timeout: 5_000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(OUT, 'records-dive-2-2.png') });
  await expect.poll(() => records(page), { timeout: 30_000 }).toContain('mizutamari');
  // At the buffer on the water: back to main 395 (not a fail), where the grasshopper still hops on.
  await page.waitForFunction(() => {
    const d = document.getElementById('app')?.dataset;
    return d?.rail === 'main' && Math.abs(Number(d.s) + 6 - 395) < 1;
  }, null, { timeout: 120_000 });
  expect(errors).toEqual([]);
});

test('2-3 with もぐる: down to the harbour sea, dive for the bubble spring, back to main 210', async ({ page }) => {
  test.setTimeout(400_000);
  const errors = watchErrors(page);
  await seed(page, ['whistle', 'jump', 'light', 'rocket', 'dive'], ['1-1', '1-2', '1-3', '2-1', '2-2', '2-3', '3-1']);
  await startDriving(page, '2-3', 'のぼれ');
  // The seabird on the quay track flies off at the whistle.
  await waitFront(page, 'main', 72);
  await page.locator('#whistle').dispatchEvent('pointerdown');
  await expect(page.locator('#junction')).toBeVisible({ timeout: 180_000 });
  const right = page.locator('.arrow[data-side="right"]');
  await expect(right).toHaveAttribute('data-needs', 'dive');
  await expect(right).toHaveAttribute('data-locked', '0');
  await right.dispatchEvent('pointerdown');
  await expect(page.locator('#app')).toHaveAttribute('data-rail', 'umi', { timeout: 60_000 });
  await expect(page.locator('#jump')).toHaveAttribute('data-mode', 'dive', { timeout: 60_000 });
  await pressOnGlow(page, 'jump', 'dive');
  await expect(page.locator('#app')).toHaveAttribute('data-diving', '1', { timeout: 5_000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(OUT, 'records-dive-2-3.png') });
  await expect.poll(() => records(page), { timeout: 30_000 }).toContain('bubble-spring');
  await page.waitForFunction(() => {
    const d = document.getElementById('app')?.dataset;
    return d?.rail === 'main' && Math.abs(Number(d.s) + 6 - 210) < 1;
  }, null, { timeout: 120_000 });
  expect(errors).toEqual([]);
});
