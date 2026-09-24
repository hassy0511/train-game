import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The game draws only the front of each face. A face wound the wrong way (inside-out roof, backwards decal)
// is invisible in play but looks fine in Blender, which renders both sides. For every model in the manifest
// this renders each material front-only vs double-sided and fails when a material mostly disappears.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MODELS = Object.keys(JSON.parse(readFileSync(resolve(ROOT, 'assets/models.json'), 'utf8'))).filter((k) => !k.startsWith('_'));
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary' };

// Decal edges overhanging a curved body show a sliver of their back from behind; that stays well below this.
const MAX_HIDDEN_SHARE = 0.2;
const MIN_PIXELS = 4;

test('no model part is hidden by back-face culling', async ({ page }) => {
  test.setTimeout(600_000);
  expect(MODELS.length).toBeGreaterThan(0);
  await page.route('**/__culling/**', (route) => {
    const path = resolve(ROOT, decodeURIComponent(new URL(route.request().url()).pathname.replace(/^\/__culling\//, '')));
    if (!path.startsWith(ROOT)) return route.fulfill({ status: 403 });
    return route.fulfill({ body: readFileSync(path), contentType: TYPES[extname(path)] ?? 'application/octet-stream' });
  });
  await page.goto('/__culling/tests/smoke/fixtures/culling.html');
  await page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready === true);

  const failures: string[] = [];
  for (const model of MODELS) {
    const rows = await page.evaluate(
      (url) => (window as unknown as { measure: (u: string) => Promise<{ name: string; seen: number; hidden: number }[]> }).measure(url),
      `/__culling/public/models/${model}.glb`,
    );
    for (const { name, seen, hidden } of rows) {
      if (hidden / seen > 0.02) console.log(`${model}: "${name}" ${hidden}/${seen} px seen only from behind`);
      if (hidden >= MIN_PIXELS && hidden / seen > MAX_HIDDEN_SHARE) {
        failures.push(`${model}: "${name}" is ${Math.round((100 * hidden) / seen)}% hidden (${hidden}/${seen} px)`);
      }
    }
  }
  expect(failures, failures.join('\n')).toEqual([]);
});
