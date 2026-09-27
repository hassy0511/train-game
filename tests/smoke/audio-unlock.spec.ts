import { expect, test } from '@playwright/test';

/**
 * The sound starts on the first tap (iPad: only a finished tap may start it), also on the test course, which has
 * no title button to tap. Chromium is told to want a gesture, like Safari.
 */
test.use({
  launchOptions: {
    executablePath: process.env.PW_CHROMIUM_PATH || undefined,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=user-gesture-required'],
  },
});

test('the test course: one tap on the screen starts the sound', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?stage=0-0');
  const app = page.locator('#app');
  await expect(app).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await expect(app).toHaveAttribute('data-audio', 'none');
  // A tap on the scenery (no button there).
  await page.touchscreen.tap(600, 260);
  await expect(app).toHaveAttribute('data-audio', 'running', { timeout: 5_000 });
  // The whistle is heard: its button still works as before.
  await page.locator('#whistle').dispatchEvent('pointerdown');
  await expect(page.locator('#whistle')).toHaveAttribute('data-cooldown', '1');
  expect(errors).toEqual([]);
});
