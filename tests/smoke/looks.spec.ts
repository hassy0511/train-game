import { expect, test, type Page } from '@playwright/test';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * v1.13 「みための くらべっこ」: other looks of some models (public/looks/<look>/, listed in assets/looks/<look>.json)
 * shown in a check run with `look=`. The check list offers them first (each mission once per look, the usual models
 * 「いま」 first); a run draws that look's models (fetched from looks/<look>/) and says which on the badge. Without the
 * check mode (a kid's iPad), `look=` does nothing.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output');
mkdirSync(OUT, { recursive: true });

const FLAG_KEY = 'train-game.kakunin.v1';
/** The hash the flag must hold (src/core/kakunin.ts KAKUNIN_HASH). */
const FLAG_VALUE = '80eaae856b4fc19a430f4f92ea3a592073d382618d7915a5397176eb6c7a1f0f';

const LOOKS: Record<string, string[]> = existsSync(resolve(ROOT, 'assets/looks'))
  ? Object.fromEntries(
      readdirSync(resolve(ROOT, 'assets/looks'))
        .filter((f) => f.endsWith('.json'))
        .map((f) => [f.slice(0, -5), Object.keys(JSON.parse(readFileSync(resolve(ROOT, 'assets/looks', f), 'utf8')))]),
    )
  : {};
const LABELS: Record<string, string> = { craft: 'つくりこみ', kit: 'ライブラリ' };
/** The stage the looks are made for (1-3 くものうえ: its islands, clouds and buoys). */
const STAGE = '1-3';

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

/** The look models the page fetched, by look, and any that failed. */
function watchLooks(page: Page): { got: Map<string, Set<string>>; failed: string[] } {
  const got = new Map<string, Set<string>>();
  const failed: string[] = [];
  page.on('response', (r) => {
    const m = /\/looks\/([^/]+)\/([^/]+)\.glb$/.exec(new URL(r.url()).pathname);
    if (!m) return;
    if (!r.ok()) failed.push(`${m[1]}/${m[2]}: ${r.status()}`);
    got.set(m[1], (got.get(m[1]) ?? new Set()).add(m[2]));
  });
  return { got, failed };
}

async function ready(page: Page, stage: string): Promise<void> {
  await expect(page.locator('#app')).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await expect(page.locator('#app')).toHaveAttribute('data-stage', stage);
}

test.beforeAll(() => {
  expect(Object.keys(LOOKS).length, 'assets/looks/ lists no look').toBeGreaterThan(0);
});

test('the check list offers the looks first; a tap runs that mission with that look, its models fetched and named on the badge', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  const { got, failed } = watchLooks(page);
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [FLAG_KEY, FLAG_VALUE] as const);
  // Title → the gear → 「おうちの かたへ」 (held) → 「かくにん モード」 (unlocked before: the list at once).
  await page.goto('/');
  await ready(page, '1-1');
  await page.locator('#title-settings').click();
  await page.locator('#settings-parents').dispatchEvent('pointerdown');
  await expect(page.locator('#parents')).toBeVisible({ timeout: 15_000 });
  await page.locator('#settings-parents').dispatchEvent('pointerup');
  await page.locator('#parents-kakunin').click();
  await expect(page.locator('#kakunin-list')).toBeVisible();
  const section = page.locator('.kakunin-chapter[data-chapter="look"]');
  await expect(section).toBeVisible({ timeout: 15_000 });
  // First in the list, above the chapters.
  await expect(page.locator('.kakunin-chapter').first()).toHaveAttribute('data-chapter', 'look');
  await expect(section.locator('h2')).toHaveText('みための くらべっこ');
  const missions = (JSON.parse(readFileSync(resolve(ROOT, `src/stages/${STAGE}.json`), 'utf8')) as { missions: unknown[] }).missions.length;
  const looks = Object.keys(LOOKS);
  // Each mission: 「いま」 and one button per look.
  await expect(section.locator(`.kakunin-look[data-stage="${STAGE}"]`)).toHaveCount(missions * (looks.length + 1));
  await expect(section.locator(`.kakunin-look[data-stage="${STAGE}"][data-mission="0"]`).first()).toHaveText('いま');
  await page.screenshot({ path: resolve(OUT, 'looks-list.png') });

  const look = looks.includes('craft') ? 'craft' : looks[0];
  await section.locator(`.kakunin-look[data-stage="${STAGE}"][data-mission="0"][data-look="${look}"]`).click();
  await page.waitForURL(new RegExp(`stage=${STAGE}&go=1&kakunin=1&look=${look}`));
  await ready(page, STAGE);
  await expect(page.locator('#app')).toHaveAttribute('data-look', look);
  await expect(page.locator('#kakunin-badge')).toHaveText(`かくにん・${LABELS[look] ?? look}`);
  await expect.poll(() => got.get(look)?.size ?? 0, { timeout: 30_000 }).toBeGreaterThan(0);
  for (const name of got.get(look) ?? []) expect(LOOKS[look]).toContain(name);
  expect(failed).toEqual([]);
  expect(errors).toEqual([]);
});

for (const look of Object.keys(LOOKS)) {
  test(`look "${look}": ${STAGE} draws its models from looks/${look}/`, async ({ page }) => {
    test.setTimeout(180_000);
    const errors = watchErrors(page);
    const { got, failed } = watchLooks(page);
    await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [FLAG_KEY, FLAG_VALUE] as const);
    await page.goto(`/?stage=${STAGE}&go=1&kakunin=1&look=${look}`);
    await ready(page, STAGE);
    await expect(page.locator('#app')).toHaveAttribute('data-look', look);
    // Every model of the look that the stage places is fetched from the look's folder, none from elsewhere.
    const used = new Set([...readFileSync(resolve(ROOT, `src/stages/${STAGE}.json`), 'utf8').matchAll(/"model":\s*"([^"]+)"/g)].map(([, m]) => m));
    const expected = LOOKS[look].filter((n) => used.has(n));
    await expect.poll(() => [...(got.get(look) ?? [])].sort().join(','), { timeout: 30_000 }).toBe([...expected].sort().join(','));
    expect([...got.keys()]).toEqual([look]);
    expect(failed).toEqual([]);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: resolve(OUT, `looks-${look}.png`) });
    expect(errors).toEqual([]);
  });
}

test('without the check mode (a kid\'s iPad) look= does nothing', async ({ page }) => {
  test.setTimeout(120_000);
  const { got } = watchLooks(page);
  await page.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
  const look = Object.keys(LOOKS)[0];
  await page.goto(`/?stage=1-1&go=1&look=${look}`);
  await ready(page, '1-1');
  await expect(page.locator('#app')).not.toHaveAttribute('data-look', /./);
  expect(got.size).toBe(0);
});
