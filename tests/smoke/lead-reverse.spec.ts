import { expect, test, type Page } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { card, NORMAL, pressOnGlow, recordLines, setDirection, setNotch, SLOW, stopAt, tapUntil, waitDriving, waitLead } from './drive';

/**
 * PR8b「おいかけっこ」with the train backing up (PHASE9_CHAPTER5_6 第 7 部 §4.1 follow / met, §16.2), on the real
 * まえ／うしろ switch (PR8a, #reverse-switch; the lead reads it through the runner's ReverseSystem, `isReversing()` =
 * `train.reversing`). The train really runs backwards, retracing the way it came: Sakasa turns round and follows it,
 * and stops 12 m before the train once 15 m were run backwards. Runs on the production build like the other specs.
 */
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output');
const EKI = 310;
const ABILITIES = ['whistle', 'jump', 'light', 'rocket', 'dive', 'plow', 'magnetLight'];

type LeadRow = { t: number; lead: string; gap: number };

async function start(page: Page, abilities: string[]): Promise<void> {
  await page.addInitScript((list) => {
    localStorage.setItem('train-game.progress.v1', JSON.stringify({ schema: 1, cleared: ['5-3'], abilities: list, records: [], mapLinks: [] }));
    const log: { t: number; lead: string; gap: number }[] = [];
    (window as unknown as { __leadLog: typeof log }).__leadLog = log;
    new MutationObserver(() => {
      const d = document.getElementById('app')?.dataset;
      if (!d || d.lead === undefined) return;
      const e = { t: Number(d.time), lead: d.lead, gap: Number(d.leadGap) };
      const last = log[log.length - 1];
      if (!last || last.lead !== e.lead || last.gap !== e.gap) log.push(e);
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-lead', 'data-lead-gap'] });
  }, abilities);
  await page.goto('/?stage=0-6&go=1');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await card(page, 'ミッション 1');
  await waitDriving(page);
}

async function gameWait(page: Page, seconds: number): Promise<void> {
  const t0 = Number(await page.locator('#app').getAttribute('data-time'));
  await page.waitForFunction((t) => Number(document.getElementById('app')?.dataset.time) >= t, t0 + seconds, { timeout: seconds * 12_000 + 10_000 });
}

/** Lever to "とまる" and waits until the train stands. */
async function standStill(page: Page): Promise<void> {
  await setNotch(page, 1);
  await page.waitForFunction(() => Number(document.getElementById('app')?.dataset.speed) < 0.05, null, { timeout: 60_000 });
}

test('0-6 おいかけっこ, うしろむき known already: backing up before "ぎゃくだ！" she only waits (nothing is skipped)', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await start(page, [...ABILITIES, 'reverse']);
  const app = page.locator('#app');
  await expect(page.locator('#reverse-switch')).toBeVisible();
  await setNotch(page, NORMAL);
  await waitLead(page, 'tease');
  await standStill(page);
  await setDirection(page, 'back');
  await setNotch(page, SLOW);
  await gameWait(page, 2);
  await expect(app).toHaveAttribute('data-direction', '-1');
  await expect(app).toHaveAttribute('data-lead', 'tease');
  await expect(app).toHaveAttribute('data-lead-calls', '0');
  await standStill(page);
  await setDirection(page, 'front');
  await expect(app).toHaveAttribute('data-lead', 'tease');
  expect(errors).toEqual([]);
});

test('0-6 おいかけっこ backing up on the switch: she turns round and follows, stops before the train, the station opens', async ({ page }) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const lines = await recordLines(page);
  await start(page, ABILITIES);
  const app = page.locator('#app');
  const sw = page.locator('#reverse-switch');
  // Not learned yet: no switch.
  await expect(sw).toBeHidden();
  await setNotch(page, NORMAL);
  await waitLead(page, 'tease');
  await pressOnGlow(page, 'whistle', 30_000);
  await expect(app).toHaveAttribute('data-lead-calls', '1', { timeout: 10_000 });
  await waitLead(page, 'tease', 20_000);
  await pressOnGlow(page, 'whistle', 30_000);
  await tapUntil(page, '#card', 60_000);
  await expect(page.locator('#card')).toContainText('うしろむき うんてんを');
  await page.locator('#card-button').click();
  await tapUntil(page, '#app[data-inline-cutscene=""]', 30_000);
  await waitLead(page, 'backup', 30_000);
  // Learned: the switch is there and glows (back up to her).
  await expect(sw).toBeVisible();
  await expect(sw).toHaveAttribute('data-glow', '1', { timeout: 10_000 });
  // "うしろ" and the lever up: she turns round ("くるっ") and follows ("ついて きた！"), then stops before the train.
  await setDirection(page, 'back');
  // Turned round (standing): the rear window.
  await expect(app).toHaveAttribute('data-camera', 'rear', { timeout: 10_000 });
  await setNotch(page, SLOW);
  // Reversing, but while she follows the view stays the one picked (the cab, looking ahead at her), not the rear window.
  await waitLead(page, 'follow', 30_000);
  await expect(app).toHaveAttribute('data-camera-hold', 'lead', { timeout: 10_000 });
  await expect(app).toHaveAttribute('data-camera', 'cab');
  await expect(app).toHaveAttribute('data-direction', '-1');
  await expect.poll(lines, { timeout: 10_000 }).toContain('ついて きた！');
  await waitLead(page, 'met', 60_000);
  expect(Number(await app.getAttribute('data-lead-back'))).toBeGreaterThanOrEqual(14);
  // Met: the train stops (still reversing); she walks up and stops 12 m before it, the view still looking ahead at her.
  await standStill(page);
  await page.waitForFunction(() => Number(document.getElementById('app')?.dataset.leadGap) <= 14, null, { timeout: 30_000 });
  await expect(app).toHaveAttribute('data-camera-hold', 'lead');
  await expect(app).toHaveAttribute('data-camera', 'cab');
  await page.screenshot({ path: `${OUT}/lead-follow.png` });
  // Met while reversing: the switch glows to go forward again ("まえに もどして えきへ！").
  await expect(sw).toHaveAttribute('data-glow', '1', { timeout: 5_000 });
  await expect.poll(lines, { timeout: 10_000 }).toContain('まえに もどして えきへ！');
  const log = await page.evaluate(() => (window as unknown as { __leadLog: LeadRow[] }).__leadLog);
  const follow = log.filter((e) => e.lead === 'follow').map((e) => e.gap);
  console.log(`lead: the gap following ${follow.join(' → ')} m`);
  expect(follow.length).toBeGreaterThan(0);
  // She comes nearer as the train backs up (PHASE9 第 7 部 §16.2), never nearer than 12 m (± 1).
  expect(Math.min(...follow)).toBeLessThan(follow[0]);
  expect(Math.min(...follow)).toBeGreaterThanOrEqual(11);
  await standStill(page);
  await setDirection(page, 'front');
  await expect(app).toHaveAttribute('data-camera-hold', '');
  await expect(app).toHaveAttribute('data-camera', 'cab');
  await expect(app).toHaveAttribute('data-station-closed', '', { timeout: 10_000 });
  await setNotch(page, NORMAL);
  await stopAt(page, 't-wa', EKI);
  await expect(app).toHaveAttribute('data-lead', 'gone');
  await card(page, 'できた');
  expect(errors).toEqual([]);
});
