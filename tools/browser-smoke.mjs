// Optional: npm install --no-save playwright && npx playwright install chromium
// Run: node tools/browser-smoke.mjs (uses an isolated temporary browser profile).
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = resolve(import.meta.dirname, '..');
const svg = color => `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="7" fill="${color}"/><path d="M8 10h16M8 16h12M8 22h8" stroke="white" stroke-width="3"/></svg>`;
const titles = { '/one': 'A small guide to paying attention', '/two': 'A calmer way to read the web', '/three': 'Designing for a quieter internet', '/four': 'Building small, thoughtful tools', '/five': 'The art of noticing', '/six': 'A reading list worth returning to', '/seven': 'Notes on slow productivity', '/eight': 'Making room for good ideas' };
const server = createServer((req, res) => {
  if (req.url.startsWith('/icon')) { res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); res.end(svg(req.url.includes('two') ? '#815f9f' : '#42785f')); return; }
  if (req.url === '/missing.ico') { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><html><head><meta charset="utf-8"><title>${titles[req.url] || 'Another article'}</title><link id="original-icon" rel="icon" href="/icon.svg"></head><body><h1>${titles[req.url] || 'Another article'}</h1><p>A local test article.</p></body></html>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = await mkdtemp(join(tmpdir(), 'tabrot-smoke-'));
let context;
const errors = [];
try {
  const launchOptions = { headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : { channel: 'chromium' }), ignoreDefaultArgs: ['--disable-extensions'], args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`, '--restore-last-session'] };
  context = await chromium.launchPersistentContext(profile, launchOptions);
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  worker.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const extensionId = new URL(worker.url()).host;
  const a = await context.newPage(); await a.goto(`${origin}/one`);
  await a.waitForFunction(() => document.title.startsWith('☀️ '));
  const popup = await context.newPage(); await popup.setViewportSize({ width: 420, height: 580 }); await popup.goto(`chrome-extension://${extensionId}/src/popup.html`);
  await popup.getByText(titles['/one'], { exact: true }).waitFor();
  const request = message => popup.evaluate(message => chrome.runtime.sendMessage(message), message);
  let snap = await request({ type: 'SNAPSHOT' }); const original = snap.items.find(i => i.url === `${origin}/one`);
  assert.ok(original); assert.equal(original.status, 'unread'); assert.ok(original.favicon.endsWith('/icon.svg'));
  await a.reload(); await a.waitForFunction(() => document.title.startsWith('☀️ '));
  snap = await request({ type: 'SNAPSHOT' }); assert.equal(snap.items.find(i => i.id === original.id).openedAt, original.openedAt);
  await popup.getByRole('button', { name: 'Mark as read', exact: true }).click();
  await a.waitForFunction(() => !document.title.startsWith('☀️ ') && document.querySelector('#original-icon').getAttribute('href') === '/icon.svg');
  await popup.locator('[data-filter="read"]').click(); await popup.getByRole('button', { name: 'Mark as unread' }).click();
  await a.waitForFunction(() => document.title.startsWith('☀️ '));
  const action = (action, choice) => request({ type: 'ACTION', tabId: original.tabId, recordId: original.id, action, choice });
  await action('snooze', 'hour'); await a.waitForFunction(() => !document.title.startsWith('☀️ ') && document.querySelector('#original-icon').getAttribute('href') === '/icon.svg');
  snap = await request({ type: 'SNAPSHOT' }); assert.equal(snap.items.find(i => i.id === original.id).openedAt, original.openedAt);
  await action('resume'); await a.waitForFunction(() => document.title.startsWith('☀️ '));
  await a.evaluate(() => { document.querySelector('#original-icon').href = '/icon-two.svg'; });
  await a.waitForFunction(() => document.title.startsWith('☀️ '));
  await action('read'); await a.waitForFunction(() => !document.title.startsWith('☀️ ') && document.querySelector('#original-icon').getAttribute('href') === '/icon-two.svg');
  await action('unread'); await a.waitForFunction(() => document.title.startsWith('☀️ '));
  await popup.evaluate(id => chrome.tabs.update(id, { pinned: true }), original.tabId);
  await a.waitForFunction(() => !document.title.startsWith('☀️ ') && document.querySelector('#original-icon').getAttribute('href') === '/icon-two.svg');
  await popup.evaluate(id => chrome.tabs.update(id, { pinned: false }), original.tabId);
  await a.waitForFunction(() => document.title.startsWith('☀️ '));
  await a.evaluate(() => history.pushState({}, '', '/new-article'));
  await popup.waitForTimeout(300);
  snap = await request({ type: 'SNAPSHOT' }); assert.notEqual(snap.items.find(i => i.tabId === original.tabId).id, original.id);
  const updated = snap.items.find(i => i.tabId === original.tabId);
  await request({ type: 'ACTION', tabId: updated.tabId, recordId: updated.id, action: 'ignoreDomain' });
  await a.waitForFunction(() => !document.title.startsWith('☀️ ') && document.querySelector('#original-icon').getAttribute('href') === '/icon-two.svg');
  await request({ type: 'SETTINGS', settings: { ...snap.settings, ignoredDomains: [] } });
  await a.waitForFunction(() => document.title.startsWith('☀️ '));
  // Page-provided icons, including missing icons, must remain untouched.
  await a.evaluate(() => { document.querySelector('#original-icon').href = '/missing.ico'; });
  await a.waitForFunction(() => document.querySelectorAll('link[rel="icon"]').length === 1 && document.querySelector('#original-icon').getAttribute('href') === '/missing.ico');
  await a.evaluate(() => { document.querySelector('#original-icon').href = '/icon.svg'; });
  await a.waitForFunction(() => document.title.startsWith('☀️ '));
  const options = await context.newPage(); await options.setViewportSize({ width: 1000, height: 1200 }); await options.goto(`chrome-extension://${extensionId}/src/options.html`);
  await options.locator('#thresholds input').first().waitFor();
  await options.locator('#domains').fill('example.com'); await options.locator('#save').click(); await options.locator('#save-state').filter({ hasText: 'Changes saved' }).waitFor();
  let settings = (await request({ type: 'SNAPSHOT' })).settings; assert.deepEqual(settings.ignoredDomains, ['example.com']);
  await options.locator('#domains').fill(''); await options.locator('#save').click(); await options.locator('#save-state').filter({ hasText: 'Changes saved' }).waitFor();
  for (const path of ['/two', '/three', '/four', '/five', '/six', '/seven', '/eight']) { const p = await context.newPage(); await p.goto(`${origin}${path}`); }
  await popup.locator('[data-filter="unread"]').click(); await popup.locator('#search').fill('calmer'); await popup.getByText(titles['/two'], { exact: true }).waitFor(); assert.equal(await popup.locator('.tab-card').count(), 1); await popup.locator('#search').fill('');
  // Compact layout reserves most of the popup for rows, including at least seven whole rows.
  const geometry = await popup.evaluate(() => {
    const list = document.querySelector('#tab-list').getBoundingClientRect();
    const rows = [...document.querySelectorAll('.tab-card')].map(node => node.getBoundingClientRect());
    return { listHeight: list.height, wholeRows: rows.filter(row => row.top >= list.top && row.bottom <= list.bottom).length };
  });
  assert.ok(geometry.listHeight >= 400, `list is only ${geometry.listHeight}px tall`);
  assert.ok(geometry.wholeRows >= 7, `only ${geometry.wholeRows} rows fit`);
  const lastMore = popup.locator('.tab-card').last().getByRole('button', { name: 'More actions' });
  await lastMore.click();
  const bounds = await popup.locator('#row-menu').boundingBox();
  assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 580, 'menu must fit even on the last row');
  await popup.keyboard.press('Escape');
  await popup.locator('#tab-list').evaluate(node => { node.scrollTop = 0; });
  // Language changes persist and synchronize without resetting timers or an unsaved form.
  await options.locator('#domains').fill('draft.example.com');
  await popup.locator('#language-toggle').click();
  await popup.getByRole('button', { name: '待读 8' }).waitFor();
  await options.getByText('有未保存的修改', { exact: true }).waitFor();
  assert.equal(await options.locator('#domains').inputValue(), 'draft.example.com');
  assert.equal(await options.locator('#language').inputValue(), 'zh');
  await mkdir(join(root, 'docs'), { recursive: true });
  await popup.screenshot({ path: join(root, 'docs/popup-zh.png') });
  await options.locator('#language').selectOption('en');
  await popup.getByRole('button', { name: 'Unread 8' }).waitFor();
  await options.locator('#domains').fill(''); await options.locator('#save').click();
  const afterLanguage = (await request({ type: 'SNAPSHOT' })).items.find(item => item.id === updated.id);
  assert.equal(afterLanguage.openedAt, updated.openedAt);
  await popup.reload(); await popup.getByRole('button', { name: 'Unread 8' }).waitFor();
  await mkdir(join(root, 'docs'), { recursive: true });
  await popup.locator('#search').blur();
  await popup.locator('#toast').waitFor({ state: 'hidden' });
  await options.locator('#toast').waitFor({ state: 'hidden' });
  await popup.screenshot({ path: join(root, 'docs/popup.png') }); await options.screenshot({ path: join(root, 'docs/settings.png'), fullPage: true });
  assert.equal(await popup.evaluate(() => document.documentElement.scrollHeight > 580), false, 'popup must fit Chrome height limit');
  assert.deepEqual(errors, []);
  // Check real browser shutdown, changed session IDs and restoration of saved state.
  const beforeRestart = (await request({ type: 'SNAPSHOT' })).items.find(i => i.url === `${origin}/two`);
  await request({ type: 'ACTION', tabId: beforeRestart.tabId, recordId: beforeRestart.id, action: 'read' });
  await context.close();
  context = await chromium.launchPersistentContext(profile, launchOptions);
  const restartedWorker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const restoredPopup = await context.newPage(); await restoredPopup.goto(`chrome-extension://${new URL(restartedWorker.url()).host}/src/popup.html`);
  await restoredPopup.getByRole('button', { name: /^Unread/ }).waitFor();
  const restored = await restoredPopup.evaluate(() => chrome.runtime.sendMessage({ type: 'SNAPSHOT' }));
  const restoredItem = restored.items.find(i => i.url === `${origin}/two`);
  assert.ok(restoredItem, 'Chrome must restore the article tab');
  assert.equal(restoredItem.id, beforeRestart.id); assert.equal(restoredItem.openedAt, beforeRestart.openedAt); assert.equal(restoredItem.status, 'read');
  console.log('PASS: real MV3 loading, automatic tracking, reload persistence, read/unread, snooze/resume, dynamic title cleanup and unchanged favicons, pinned exclusion, SPA navigation, domain rules, unchanged missing-icon URLs, settings save, search, compact layout (7+ visible rows), menu placement, bilingual persistence/draft preservation and actual browser restart restoration.');
} finally {
  await context?.close(); await new Promise(resolve => server.close(resolve)); await rm(profile, { recursive: true, force: true });
}
