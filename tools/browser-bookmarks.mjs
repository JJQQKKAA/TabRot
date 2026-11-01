// Optional: npm install --no-save playwright && npx playwright install chromium
// All bookmarks and permissions used by this test belong to a disposable profile.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = resolve(import.meta.dirname, '..'), temp = await mkdtemp(join(tmpdir(), 'tabrot-bookmarks-'));
const extension = join(temp, 'extension'), profile = join(temp, 'profile');
await mkdir(extension);
for (const dir of ['src', 'icons']) await cp(join(root, dir), join(extension, dir), { recursive: true });
const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
// Only this fixture gets the favicon read API, to inspect Chrome's actual shared cache.
assert.ok(!manifest.permissions.includes('bookmarks'));
manifest.permissions.push('favicon', 'bookmarks');
await writeFile(join(extension, 'manifest.json'), JSON.stringify(manifest));
const server = createServer((req, res) => {
  if (req.url.startsWith('/icon')) {
    res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
    res.end('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#3366aa"/></svg>');
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<html><head><title>Bookmark test</title><link id="icon" rel="icon" href="/icon.svg"></head><body>Bookmark test</body></html>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`, articleUrl = `${origin}/article`;
const launch = { headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : { channel: 'chromium' }), ignoreDefaultArgs: ['--disable-extensions'], args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--restore-last-session'] };
let context, popup;
const errors = [];
async function start() {
  context = await chromium.launchPersistentContext(profile, launch);
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  popup = await context.newPage(); await popup.goto(`chrome-extension://${new URL(worker.url()).host}/src/popup.html`);
  await popup.getByRole('button', { name: /^Unread/ }).waitFor();
}
const request = message => popup.evaluate(message => chrome.runtime.sendMessage(message), message);
const bookmark = (operation, value) => popup.evaluate(async ({ operation, value }) => {
  if (operation === 'create') return chrome.bookmarks.create(value);
  if (operation === 'remove') return chrome.bookmarks.remove(value);
  if (operation === 'update') return chrome.bookmarks.update(value.id, value.change);
}, { operation, value });
async function waitSnapshot(predicate) {
  let snapshot;
  const deadline = Date.now() + 10000;
  do { snapshot = await request({ type: 'SNAPSHOT' }); if (predicate(snapshot)) return snapshot; await popup.waitForTimeout(50); } while (Date.now() < deadline);
  throw new Error(`Unexpected snapshot: ${JSON.stringify(snapshot)}`);
}
async function originalIcon(page, href = '/icon.svg') {
  await page.waitForFunction(href => document.querySelector('#icon').getAttribute('href') === href, href);
}
async function sharedIconIsOriginal() {
  const deadline = Date.now() + 10000; let pixel;
  do {
    pixel = await popup.evaluate(async url => {
      const resource = chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32&v=${Date.now()}`);
      const blob = await (await fetch(resource, { cache: 'no-store' })).blob();
      const image = await createImageBitmap(blob), canvas = document.createElement('canvas');
      canvas.width = canvas.height = 32;
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0, 32, 32);
      return [...ctx.getImageData(24, 24, 1, 1).data];
    }, articleUrl);
    if (pixel[0] === 51 && pixel[1] === 102 && pixel[2] === 170) return;
    await popup.waitForTimeout(100);
  } while (Date.now() < deadline);
  throw new Error(`Shared bookmark favicon was changed: ${pixel}`);
}
try {
  await start();
  let article = await context.newPage(); await article.goto(articleUrl);
  let sibling = await context.newPage(); await sibling.goto(`${origin}/another-article`);
  await article.waitForFunction(() => document.title === '☀️ Bookmark test');
  await sibling.waitForFunction(() => document.title === '☀️ Bookmark test');
  await originalIcon(article); await originalIcon(sibling); await sharedIconIsOriginal();
  const saved = await bookmark('create', { title: 'Original bookmark', url: articleUrl });
  let snapshot = await waitSnapshot(snapshot => snapshot.items.length === 2);
  const first = snapshot.items.find(item => item.url === articleUrl);
  assert.equal(first.title, 'Bookmark test');
  await originalIcon(article); await sharedIconIsOriginal();
  await article.evaluate(() => { document.querySelector('#icon').href = '/icon-two.svg'; });
  await popup.waitForTimeout(400);
  await originalIcon(article, '/icon-two.svg'); await sharedIconIsOriginal();
  await bookmark('remove', saved.id);
  await article.waitForFunction(() => document.title === '☀️ Bookmark test');
  await originalIcon(article, '/icon-two.svg'); await sharedIconIsOriginal();
  await bookmark('create', { title: 'Another bookmark', url: articleUrl });
  const action = action => request({ type: 'ACTION', tabId: first.tabId, recordId: first.id, action });
  await action('read'); await article.waitForFunction(() => document.title === 'Bookmark test');
  await action('unread'); await article.waitForFunction(() => document.title === '☀️ Bookmark test');
  await originalIcon(article, '/icon-two.svg'); await sharedIconIsOriginal();
  await context.close(); await start();
  snapshot = await waitSnapshot(snapshot => snapshot.items.some(item => item.id === first.id));
  const restored = snapshot.items.find(item => item.id === first.id);
  assert.equal(restored.status, 'unread'); assert.equal(restored.openedAt, first.openedAt);
  article = context.pages().find(page => page.url() === articleUrl);
  sibling = context.pages().find(page => page.url() === `${origin}/another-article`);
  assert.ok(article && sibling); await originalIcon(article); await originalIcon(sibling); await sharedIconIsOriginal();
  await article.waitForFunction(() => document.title === '☀️ Bookmark test');
  assert.deepEqual(errors, []);
  console.log('PASS: both saved and unsaved pages use title icons, actual bookmark favicon cache pixels remain original, dynamic favicon changes, read/unread and browser restart. No production bookmarks permission.');
} finally {
  await context?.close(); await new Promise(resolve => server.close(resolve)); await rm(temp, { recursive: true, force: true });
}
