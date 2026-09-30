import { expect, test, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { card, NORMAL, pressOnGlow, recordLines, setNotch, SLOW, stopAt, tapUntil, waitDriving, waitLead } from './drive';

/**
 * PR8b「おいかけっこ」with the train backing up (PHASE9_CHAPTER5_6 第 7 部 §4.1 follow / met, §16.2). うしろむき itself is
 * PR8a's; until it is in, the lead reads "reversing" through a ReverseReader that a dev build can fake
 * (`window.__debugReverse(on)`, never in production: checked first). So this spec runs a Vite dev server of its own,
 * as environment-state.spec.ts does. The fake only says "reversing": the train still runs forwards on the lever, and
 * the lead follows what the train really does (it measures the train's moves, never the sign of its speed), so here she
 * walks towards a train coming at her and stops 12 m before it once 15 m were run "backwards". When PR8a is in, this
 * spec drives the real switch (tests/smoke/drive.ts setDirection) instead of the fake.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output');
const EKI = 310;
const ABILITIES = ['whistle', 'jump', 'light', 'rocket', 'dive', 'plow', 'magnetLight'];

let server: ChildProcess | null = null;
let origin = '';

test.beforeAll(async () => {
  test.setTimeout(120_000);
  server = spawn(resolve(ROOT, 'node_modules/.bin/vite'), ['--port', String(Number(process.env.PW_PORT || 4173) + 1002), '--host', '127.0.0.1'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  origin = await new Promise<string>((ok, fail) => {
    let out = '';
    server?.stdout?.on('data', (d) => {
      out += String(d).replace(/\x1b\[[0-9;]*m/g, '');
      const match = out.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) ok(match[0]);
    });
    server?.on('exit', (code) => fail(new Error(`vite exited ${code}`)));
  });
});

test.afterAll(() => {
  server?.kill();
});

const fake = (page: Page, on: boolean): Promise<void> => page.evaluate((v) => (window as unknown as { __debugReverse: (on: boolean) => void }).__debugReverse(v), on);

async function gameWait(page: Page, seconds: number): Promise<void> {
  const t0 = Number(await page.locator('#app').getAttribute('data-time'));
  await page.waitForFunction((t) => Number(document.getElementById('app')?.dataset.time) >= t, t0 + seconds, { timeout: seconds * 12_000 + 10_000 });
}

test('0-6 おいかけっこ backing up (dev fake): she turns round and follows, stops before the train, the station opens', async ({ page }) => {
  test.setTimeout(420_000);
  // Production: no fake.
  await page.goto('/?stage=0-6&go=1');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  expect(await page.evaluate(() => '__debugReverse' in window)).toBe(false);

  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript((abilities) => {
    localStorage.setItem('train-game.progress.v1', JSON.stringify({ schema: 1, cleared: ['5-3'], abilities, records: [], mapLinks: [] }));
    const log: { t: number; lead: string; gap: number }[] = [];
    (window as unknown as { __leadLog: typeof log }).__leadLog = log;
    new MutationObserver(() => {
      const d = document.getElementById('app')?.dataset;
      if (!d || d.lead === undefined) return;
      const e = { t: Number(d.time), lead: d.lead, gap: Number(d.leadGap) };
      const last = log[log.length - 1];
      if (!last || last.lead !== e.lead || last.gap !== e.gap) log.push(e);
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-lead', 'data-lead-gap'] });
  }, ABILITIES);
  const lines = await recordLines(page);
  await page.goto(`${origin}/?stage=0-6&go=1`);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', '1', { timeout: 180_000 });
  await card(page, 'ミッション 1');
  await waitDriving(page);
  const app = page.locator('#app');
  await setNotch(page, NORMAL);
  await waitLead(page, 'tease');
  // "Backing up" before "ぎゃくだ！" (a child who knows うしろむき already): she only waits; nothing is skipped.
  await fake(page, true);
  await gameWait(page, 2);
  await expect(app).toHaveAttribute('data-lead', 'tease');
  await fake(page, false);
  await pressOnGlow(page, 'whistle', 30_000);
  await expect(app).toHaveAttribute('data-lead-calls', '1', { timeout: 10_000 });
  await waitLead(page, 'tease', 20_000);
  await pressOnGlow(page, 'whistle', 30_000);
  await tapUntil(page, '#card', 60_000);
  await expect(page.locator('#card')).toContainText('うしろむき うんてんを');
  await page.locator('#card-button').click();
  await waitLead(page, 'backup', 30_000);
  // "うしろ" and the lever up: she turns round ("くるっ") and follows ("ついて きた！"), then stops before the train.
  await fake(page, true);
  await setNotch(page, SLOW);
  await waitLead(page, 'follow', 20_000);
  await expect.poll(lines, { timeout: 10_000 }).toContain('ついて きた！');
  await waitLead(page, 'met', 30_000);
  expect(Number(await app.getAttribute('data-lead-back'))).toBeGreaterThanOrEqual(14);
  await page.screenshot({ path: `${OUT}/lead-follow.png` });
  // Met while "reversing": the switch glows to go forward again ("まえに もどして えきへ！").
  await expect(page.locator('#reverse-switch')).toHaveAttribute('data-glow', '1', { timeout: 5_000 });
  await expect.poll(lines, { timeout: 10_000 }).toContain('まえに もどして えきへ！');
  const log = await page.evaluate(() => (window as unknown as { __leadLog: { t: number; lead: string; gap: number }[] }).__leadLog);
  const follow = log.filter((e) => e.lead === 'follow').map((e) => e.gap);
  expect(follow.length).toBeGreaterThan(0);
  expect(Math.min(...follow)).toBeLessThan(follow[0]);
  expect(Math.min(...follow)).toBeGreaterThanOrEqual(11);
  await fake(page, false);
  await expect(app).toHaveAttribute('data-station-closed', '', { timeout: 10_000 });
  await setNotch(page, NORMAL);
  await stopAt(page, 't-wa', EKI);
  await expect(app).toHaveAttribute('data-lead', 'gone');
  await card(page, 'できた');
  expect(errors).toEqual([]);
});
