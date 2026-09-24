import { expect, test } from '@playwright/test';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Home-screen app: install metadata, and the game still starts after the server is gone once it was opened.
// Offline is real here: the game is served by a server this test starts and then shuts down. (Playwright's
// setOffline and request routing both make Chromium bypass the service worker, which an iPad does not do.)
test.use({ serviceWorkers: 'allow' });

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist');
const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.glb': 'model/gltf-binary',
  '.wasm': 'application/wasm',
};

function serveDist(): Promise<{ server: Server; sockets: Set<Socket>; origin: string }> {
  const sockets = new Set<Socket>();
  const server = createServer((req, res) => {
    let path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = resolve(DIST, `.${path}`);
    if (!file.startsWith(DIST) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  return new Promise((done) =>
    server.listen(0, '127.0.0.1', () => done({ server, sockets, origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}` })),
  );
}

test('home-screen metadata and offline start', async ({ page }) => {
  test.setTimeout(180_000);
  const { server, sockets, origin } = await serveDist();
  await page.goto(`${origin}/`);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', '1', { timeout: 90_000 });
  await expect(page).toHaveTitle('ワンダーごうと ふしぎな せかい');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'ワンダーごう');
  const manifest = await (await page.request.get(`${origin}/manifest.webmanifest`)).json();
  expect(manifest.short_name).toBe('ワンダーごう');
  expect(manifest.orientation).toBe('landscape');
  for (const icon of manifest.icons as { src: string }[]) expect((await page.request.get(`${origin}/${icon.src}`)).ok()).toBe(true);

  // The service worker caches the whole game on install, then activates.
  await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated', null, {
    timeout: 90_000,
  });
  const worker = page.context().serviceWorkers().find((w) => w.url().endsWith('/sw.js'));
  if (!worker) throw new Error('no service worker');
  const missingEntries = (): Promise<string[]> => worker.evaluate(async () => {
    const cache = await caches.open('wonder-go');
    const out: string[] = [];
    for (const path of PRECACHE) if (!(await cache.match(new URL(path, self.location.href).href))) out.push(path);
    return out;
  });
  // Chromium shows the cached entries to other contexts shortly after activation; wait for all of them.
  await expect.poll(missingEntries, { timeout: 30_000 }).toEqual([]);

  // Server gone: nothing answers on that port any more. The worker's own fetch handlers must now answer
  // from the cache: a page URL with a query (a stage never opened), a model, a hashed build file.
  for (const socket of sockets) socket.destroy();
  await new Promise((done) => server.close(done));
  // Chromium under Playwright does not route page requests through the worker, so its handlers are called
  // directly here; on a device the browser calls them for every request.
  const answers = await worker.evaluate(async () => {
    const origin = self.location.origin;
    const main = PRECACHE.find((p) => /^assets\/main-.*\.js$/.test(p)) ?? '';
    const results: string[] = [];
    for (const [kind, url] of [
      ['page', `${origin}/?stage=1-2&go=1`],
      ['model', `${origin}/models/dino-large-body.glb`],
      ['code', `${origin}/${main}`],
    ] as const) {
      try {
        const res = kind === 'code' ? await cacheFirst(new Request(url)) : await networkFirst(new Request(url));
        results.push(`${kind}:${res.status}`);
      } catch (e) {
        results.push(`${kind}:error ${String(e)}`);
      }
    }
    return results;
  });
  expect(answers).toEqual(['page:200', 'model:200', 'code:200']);
  console.log('pwa: offline answers', answers.join(' '));
});

declare const PRECACHE: string[];
declare function networkFirst(request: Request): Promise<Response>;
declare function cacheFirst(request: Request): Promise<Response>;
