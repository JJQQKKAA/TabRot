// Reproduce a pre-protection marker left in a live document across an extension
// upgrade. Bookmarks, tabs and the extra favicon read permission are test-only.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = resolve(import.meta.dirname, '..'), temp = await mkdtemp(join(tmpdir(), 'tabrot-upgrade-'));
const extension = join(temp, 'extension'); await mkdir(extension);
for (const dir of ['src', 'icons']) await cp(join(root, dir), join(extension, dir), { recursive: true });
const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
manifest.permissions.push('favicon', 'bookmarks');
await writeFile(join(extension, 'manifest.json'), JSON.stringify(manifest));
const scripts = manifest.content_scripts[0].js;
const actualScripts = await Promise.all(scripts.map(path => readFile(join(extension, path), 'utf8')));
if (process.env.BASELINE_CONTENT) actualScripts[0] = await readFile(process.env.BASELINE_CONTENT, 'utf8');
// Emulate a legacy document without the current content script's in-memory state.
for (const path of scripts) await writeFile(join(extension, path), '// Legacy document fixture: no current content controller.\n');
const server = createServer((req, res) => {
  if (req.url.startsWith('/icon') || req.url === '/favicon.ico') {
    res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
    res.end('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#3366aa"/></svg>');
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<html><head><title>Unrefreshed document</title><link id="icon" rel="icon" href="/icon.svg"></head><body>Keep this document alive.</body></html>');
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`, url = `${origin}/article`;
let context;
try {
  context = await chromium.launchPersistentContext(join(temp, 'profile'), {
    headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : { channel: 'chromium' }),
    ignoreDefaultArgs: ['--disable-extensions'], args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
  });
  console.log('Test browser started');
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker'), id = new URL(worker.url()).host;
  let popup = await context.newPage(); await popup.goto(`chrome-extension://${id}/src/popup.html`);
  const request = message => popup.evaluate(message => chrome.runtime.sendMessage(message), message);
  let article = await context.newPage(); await article.goto(url);
  console.log('Fixture article loaded');
  await popup.evaluate(url => chrome.bookmarks.create({ title: 'Existing bookmark', url }), url);
  const cachedPixel = () => popup.evaluate(async url => {
    const resource = chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32&v=${Date.now()}`);
    const image = await createImageBitmap(await (await fetch(resource, { cache: 'no-store' })).blob());
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0, 32, 32);
    return [...ctx.getImageData(24, 24, 1, 1).data];
  }, url);
  async function waitPixel(wanted) {
    const deadline = Date.now() + 10000; let actual;
    do { actual = await cachedPixel(); if (actual.slice(0, 3).every((v, i) => v === wanted[i])) return; await article.waitForTimeout(100); } while (Date.now() < deadline);
    assert.deepEqual(actual.slice(0, 3), wanted, 'shared bookmark favicon must match the expected pixels');
  }
  console.log('Reading original cache');
  await waitPixel([51, 102, 170]);
  console.log('Original cache verified');
  const before = (await request({ type: 'SNAPSHOT' })).items.find(item => item.url === url);
  assert.ok(before?.favicon.endsWith('/icon.svg'));
  const legitimate = await context.newPage(); await legitimate.goto(`${origin}/legitimate`);
  const legitimateIcon = await legitimate.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#9966cc'; ctx.fillRect(0, 0, 32, 32);
    const icon = canvas.toDataURL('image/png'); document.querySelector('#icon').href = icon; return icon;
  });
  await popup.waitForFunction(async ({ url, icon }) => (await chrome.tabs.query({})).some(tab => tab.url === url && tab.favIconUrl === icon), { url: `${origin}/legitimate`, icon: legitimateIcon });
  const marked = await article.evaluate(() => {
    window.keepDocumentState = 'unchanged';
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#3366aa'; ctx.fillRect(0, 0, 32, 32);
    ctx.beginPath(); ctx.arc(24, 24, 7, 0, 2 * Math.PI); ctx.fillStyle = '#5eae89'; ctx.fill(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
    const marked = canvas.toDataURL('image/png');
    document.querySelector('#icon').href = marked;
    const legacyLink = document.createElement('link'); legacyLink.rel = 'icon'; legacyLink.href = marked; document.head.append(legacyLink);
    return marked;
  });
  await waitPixel([94, 174, 137]);
  console.log('Legacy marker cached');
  if (process.env.POISON_ORIGINAL === '1') {
    // Re-injection in older builds could save an already-marked data URL as the original.
    await popup.evaluate(async ({ recordId, marked }) => {
      const { tabrot } = await chrome.storage.local.get('tabrot'); tabrot.records[recordId].favicon = marked;
      await chrome.storage.local.set({ tabrot });
    }, { recordId: before.id, marked });
  }
  if (process.env.CLOSE_LEGACY_PAGE === '1') {
    await article.close();
    await request({ type: 'SNAPSHOT' });
  }
  for (let i = 0; i < scripts.length; i++) await writeFile(join(extension, scripts[i]), actualScripts[i]);
  const admin = await context.newPage(); await admin.goto('chrome://extensions');
  await admin.evaluate(() => chrome.developerPrivate.updateProfileConfiguration({ inDeveloperMode: true }));
  console.log('Reloading extension');
  await Promise.race([admin.evaluate(id => chrome.developerPrivate.reload(id, { failQuietly: true, populateErrorForUnpacked: true }), id), new Promise((_, reject) => setTimeout(() => reject(new Error('Extension reload timed out')), 15000))]);
  console.log('Extension reload complete');
  popup = await context.newPage(); await popup.goto(`chrome-extension://${id}/src/popup.html`);
  await popup.getByRole('button', { name: /^Unread/ }).waitFor();
  console.log('New script loaded');
  if (process.env.CLOSE_LEGACY_PAGE === '1') {
    // A closed page has no content context to repair. Revisit the same bookmark
    // normally; its original favicon must replace the stale cached marker.
    await waitPixel([94, 174, 137]);
    article = await context.newPage(); await article.goto(url);
  }
  // An open legacy document is repaired without navigation or refresh.
  await article.waitForFunction(() => [...document.querySelectorAll('link[rel="icon"]')].every(link => !link.href.startsWith('data:image/png')), null, { timeout: 10000 });
  await waitPixel([51, 102, 170]);
  if (process.env.CLOSE_LEGACY_PAGE !== '1') assert.equal(await article.evaluate(() => window.keepDocumentState), 'unchanged');
  assert.equal(await legitimate.locator('#icon').getAttribute('href'), legitimateIcon, 'legitimate data favicon must not be replaced');
  const after = (await request({ type: 'SNAPSHOT' })).items.find(item => item.url === url);
  if (process.env.CLOSE_LEGACY_PAGE !== '1') { assert.equal(after.id, before.id); assert.equal(after.openedAt, before.openedAt); }
  else assert.notEqual(after.id, before.id);
  assert.equal(after.status, 'unread');
  await article.waitForFunction(() => document.title.startsWith('☀️ '));
  assert.ok(after.favicon.endsWith(process.env.POISON_ORIGINAL === '1' ? '/favicon.ico' : '/icon.svg'));
  if (process.env.CLOSE_LEGACY_PAGE === '1') console.log('PASS: a closed bookmark retains its old cache until revisited; revisiting restores original favicon pixels without new markers.');
  else console.log(`PASS: upgrade repairs pre-existing marker DOM and shared bookmark cache without reloading the page${process.env.POISON_ORIGINAL === '1' ? ', including an already-marked saved original' : ''}.`);
} finally {
  await context?.close(); await new Promise(resolve => server.close(resolve)); await rm(temp, { recursive: true, force: true });
}
