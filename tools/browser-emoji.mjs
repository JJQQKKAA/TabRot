// Real MV3 tests in an isolated browser; no personal browsing data is accessed.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = resolve(import.meta.dirname, '..');
const server = createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/icon.svg' ? 'image/svg+xml' : 'text/html; charset=utf-8');
  res.end(req.url === '/icon.svg' ? '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="blue"/></svg>' : '<title>Test article</title><link rel="icon" href="/icon.svg"><h1>Article</h1>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const profile = await mkdtemp(join(tmpdir(), 'tabrot-emoji-'));
let context;
try {
  context = await chromium.launchPersistentContext(profile, { headless: true, executablePath: process.env.CHROME_EXECUTABLE, ignoreDefaultArgs: ['--disable-extensions'], args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`] });
  const errors = []; context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const options = await context.newPage(); await options.setViewportSize({ width: 1000, height: 1300 }); await options.goto(`chrome-extension://${id}/src/options.html`);
  await options.locator('.stage-row').first().waitFor();
  assert.equal(await options.locator('[data-preset]').count(), 3);
  assert.equal(await options.locator('.stage-row').count(), 8);
  const permissions = await options.evaluate(() => chrome.runtime.getManifest().permissions);
  assert.equal(permissions.includes('bookmarks'), false);
  const request = message => options.evaluate(message => chrome.runtime.sendMessage(message), message);
  const url = `http://127.0.0.1:${server.address().port}/article`;
  const page = await context.newPage(); await page.goto(url);
  await page.waitForFunction(() => document.title === '☀️ Test article');
  assert.equal(await page.locator('link').getAttribute('href'), '/icon.svg');
  let snapshot = await request({ type: 'SNAPSHOT' });
  let item = snapshot.items.find(item => item.url === url); const openedAt = item.openedAt;
  const colorTiming = snapshot.settings.thresholds;
  assert.equal(item.title, 'Test article');
  await page.evaluate(() => { document.title = 'New notification (2)'; });
  await page.waitForFunction(() => document.title === '☀️ New notification (2)');
  // Editing and adding stages is a draft; language changes retain all values.
  await options.locator('.stage-time').nth(1).fill('5');
  await options.locator('.stage-icon').nth(1).fill('🌵');
  await options.locator('#add-stage').click(); assert.equal(await options.locator('.stage-row').count(), 9);
  await options.locator('.stage-remove').last().click(); assert.equal(await options.locator('.stage-row').count(), 8);
  await options.locator('#language').selectOption('zh');
  await options.getByText('时间轴预览', { exact: true }).waitFor();
  assert.equal(await options.locator('.stage-time').nth(1).inputValue(), '5');
  assert.equal(await options.locator('.stage-icon').nth(1).inputValue(), '🌵');
  await options.locator('#save').click(); await options.getByText('修改已保存', { exact: true }).first().waitFor();
  snapshot = await request({ type: 'SNAPSHOT' }); assert.equal(snapshot.settings.emojiStages[1].afterMinutes, 5); assert.equal(snapshot.settings.emojiStages[1].icon, '🌵');
  assert.deepEqual(snapshot.settings.thresholds, colorTiming);
  // Invalid drafts show a specific error and leave saved settings intact.
  await options.locator('.stage-time').nth(1).fill('0'); await options.locator('#save').click(); await options.locator('#stage-error').waitFor();
  assert.equal((await request({ type: 'SNAPSHOT' })).settings.emojiStages[1].afterMinutes, 5);
  await options.locator('.stage-time').nth(1).fill('5'); await options.locator('.stage-icon').nth(1).fill('two icons');
  await options.locator('#save').click(); assert.match(await options.locator('#stage-error').textContent(), /emoji/);
  // Presets replace the draft only; stage count can range from two to sixteen.
  await options.locator('[data-preset="plants"]').click();
  for (let i = 0; i < 6; i++) await options.locator('.stage-remove').last().click();
  assert.equal(await options.locator('.stage-row').count(), 2);
  assert.equal(await options.locator('.stage-remove').last().isDisabled(), true);
  for (let i = 0; i < 14; i++) await options.locator('#add-stage').click();
  assert.equal(await options.locator('.stage-row').count(), 16); assert.equal(await options.locator('#add-stage').isDisabled(), true);
  await options.locator('#save').click();
  assert.equal((await request({ type: 'SNAPSHOT' })).settings.emojiStages.length, 16);
  await page.waitForFunction(() => document.title === '🌱 New notification (2)');
  await options.locator('[data-preset="weather"]').click();
  await options.locator('#save').click();
  snapshot = await request({ type: 'SNAPSHOT' });
  // Time scrubber is a preview only, without mutating a real tab or dirtying settings.
  assert.ok(Number(await options.locator('#preview-age').getAttribute('max')) >= colorTiming.at(-1));
  await options.locator('#preview-age').fill('500');
  assert.match(await options.locator('#preview-title').textContent(), /^☁️/);
  assert.equal(await page.title(), '☀️ New notification (2)');
  await options.locator('#toast').waitFor({ state: 'hidden' });
  await options.locator('#settings-form > section').nth(1).screenshot({ path: join(root, 'docs/emoji-settings.png') });
  await options.setViewportSize({ width: 420, height: 1000 });
  assert.equal(await options.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'settings must fit a narrow viewport');
  await options.setViewportSize({ width: 1000, height: 1300 });
  const action = action => request({ type: 'ACTION', action, tabId: item.tabId, recordId: item.id });
  await action('read'); await page.waitForFunction(() => document.title === 'New notification (2)');
  await action('unread'); await page.waitForFunction(() => document.title === '☀️ New notification (2)');
  // Every default stage works on an unsaved site; Popup titles stay clean.
  for (const stage of snapshot.settings.emojiStages) {
    await options.evaluate(async ({ recordId, minutes }) => { const { tabrot } = await chrome.storage.local.get('tabrot'); tabrot.records[recordId].openedAt = Date.now() - minutes * 60000; await chrome.storage.local.set({ tabrot }); }, { recordId: item.id, minutes: stage.afterMinutes });
    const session = await context.newCDPSession(options); await session.send('ServiceWorker.enable'); await session.send('ServiceWorker.stopAllWorkers'); await session.detach();
    await request({ type: 'SETTINGS', settings: snapshot.settings });
    await page.waitForFunction(marker => document.title === `${marker} New notification (2)`, stage.icon);
    const updated = (await request({ type: 'SNAPSHOT' })).items.find(candidate => candidate.id === item.id);
    assert.equal(updated.title, 'New notification (2)');
    assert.equal(await page.locator('link').getAttribute('href'), '/icon.svg');
  }
  assert.ok(openedAt); assert.deepEqual(errors, []);
  console.log('PASS: three non-color presets, 2–16 editable stages, custom emoji/time, validation, language/draft preservation, independent gradients, preview scrubber, narrow layout, read/unread cleanup, all eight live stages and untouched favicons.');
} finally { await context?.close(); server.close(); await rm(profile, { recursive: true, force: true }); }
