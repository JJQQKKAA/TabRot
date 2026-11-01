import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../src/core.js';
const event = () => ({ listeners: [], addListener(fn) { this.listeners.push(fn); } });
let serial = 0;
function environment({ local = {}, session = {}, tabs = [], bookmarkTree = [] } = {}) {
  const calls = { deliveries: [], localWrites: 0 };
  const storage = area => ({ async get() { return structuredClone(area); }, async set(value) { Object.assign(area, structuredClone(value)); if (area === local) calls.localWrites++; } });
  const api = {
    storage: { local: storage(local), session: storage(session) },
    tabs: { async query() { return structuredClone(tabs); }, async get(id) { const t = tabs.find(t => t.id === id); if (!t) throw new Error('Tab closed'); return structuredClone(t); }, async sendMessage(id, m) { calls.deliveries.push({ id, ...m }); }, async update(id, data) { Object.assign(tabs.find(t => t.id === id), data); }, onCreated: event(), onUpdated: event(), onActivated: event(), onRemoved: event(), onReplaced: event() },
    bookmarks: { async getTree() { return structuredClone(bookmarkTree); }, onCreated: event(), onRemoved: event(), onChanged: event(), onImportBegan: event(), onImportEnded: event() },
    alarms: { async get() { return null; }, async create() {}, onAlarm: event() }, scripting: { async executeScript() {} }, windows: { async update() {} },
    runtime: { getURL: p => `chrome-extension://test/${p}`, onMessage: event(), onInstalled: event(), onStartup: event() }
  };
  globalThis.chrome = api;
  return { api, local, session, tabs, calls, bookmarkTree, async load() { await import(`../src/background.js?test=${serial++}`); }, message(message, sender = { url: 'chrome-extension://test/src/popup.html' }) { return new Promise(resolve => api.runtime.onMessage.listeners[0](message, sender, resolve)); } };
}
const tab = (id, url = 'https://example.com/article', index = 0) => ({ id, url, index, windowId: 1, title: `Article ${id}`, active: false, pinned: false });

test('worker lifecycle preserves age, handles navigation, snooze, ignore and browser restoration', async () => {
  const env = environment({ tabs: [tab(1), tab(2, 'https://example.com/article', 1), tab(3, 'chrome://settings')] }); await env.load();
  let snap = await env.message({ type: 'SNAPSHOT' }); assert.equal(snap.ok, true); assert.equal(snap.items.length, 2);
  const first = snap.items.find(i => i.tabId === 1), second = snap.items.find(i => i.tabId === 2);
  const action = (action, choice) => env.message({ type: 'ACTION', tabId: 1, recordId: first.id, action, choice });
  snap = await action('read'); assert.equal(snap.items.find(i => i.tabId === 1).status, 'read');
  const writes = env.calls.localWrites;
  await env.message({ type: 'SNAPSHOT' }); await env.message({ type: 'SNAPSHOT' });
  assert.equal(env.calls.localWrites, writes, 'snapshots must not create storage change loops');
  env.api.tabs.onUpdated.listeners[0](1, { status: 'complete' }, env.tabs[0]);
  snap = await env.message({ type: 'SNAPSHOT' }); assert.equal(snap.items.find(i => i.tabId === 1).openedAt, first.openedAt); assert.equal(snap.items.find(i => i.tabId === 1).read, true);
  snap = await action('snooze', 'hour'); assert.equal(snap.items.find(i => i.tabId === 1).status, 'snoozed'); assert.equal(snap.items.find(i => i.tabId === 1).openedAt, first.openedAt);
  snap = await action('resume'); assert.equal(snap.items.find(i => i.tabId === 1).status, 'unread');
  await action('read');
  // A new process has no session bindings and different tab IDs.
  const restarted = environment({ local: env.local, tabs: [tab(10), tab(11, 'https://example.com/article', 1)] }); await restarted.load();
  snap = await restarted.message({ type: 'SNAPSHOT' }); assert.equal(snap.items.find(i => i.tabId === 10).id, first.id); assert.equal(snap.items.find(i => i.tabId === 10).read, true); assert.equal(snap.items.find(i => i.tabId === 11).id, second.id);
  restarted.tabs[0].url = 'https://example.com/different';
  snap = await restarted.message({ type: 'SNAPSHOT' }); assert.notEqual(snap.items.find(i => i.tabId === 10).id, first.id); assert.equal(snap.items.find(i => i.tabId === 10).read, false);
  const stale = await restarted.message({ type: 'ACTION', tabId: 10, recordId: first.id, action: 'read' }); assert.equal(stale.ok, false);
  const domain = await restarted.message({ type: 'ACTION', tabId: 11, recordId: second.id, action: 'ignoreDomain' }); assert.ok(domain.items.every(i => i.status === 'ignored'));
  const reset = await restarted.message({ type: 'RESET' }); assert.deepEqual(reset.settings, DEFAULT_SETTINGS); assert.ok(reset.items.every(i => i.status === 'unread'));
});
test('closed tab is removed, while window shutdown preserves records for restore', async () => {
  const env = environment({ tabs: [tab(1), tab(2, 'https://other.example.com')] }); await env.load();
  const before = await env.message({ type: 'SNAPSHOT' }); const id = before.items.find(i => i.tabId === 1).id;
  env.tabs.splice(0, 1); env.api.tabs.onRemoved.listeners[0](1, { isWindowClosing: false }); await env.message({ type: 'SNAPSHOT' });
  assert.equal(env.local.tabrot.records[id], undefined);
  const remaining = before.items.find(i => i.tabId === 2).id;
  env.tabs.splice(0, 1); env.api.tabs.onRemoved.listeners[0](2, { isWindowClosing: true }); await env.message({ type: 'SNAPSHOT' });
  assert.ok(env.local.tabrot.records[remaining]);
});
test('web content cannot execute extension actions', async () => {
  const env = environment({ tabs: [tab(1)] }); await env.load();
  const response = await env.message({ type: 'RESET' }, { tab: env.tabs[0], url: env.tabs[0].url });
  assert.equal(response.ok, false);
});
test('a newly opened tab never inherits a closed window record in the same session', async () => {
  const env = environment({ tabs: [tab(1)] }); await env.load();
  const before = await env.message({ type: 'SNAPSHOT' });
  env.tabs.splice(0, 1); env.api.tabs.onRemoved.listeners[0](1, { isWindowClosing: true }); await env.message({ type: 'SNAPSHOT' });
  env.tabs.push(tab(2)); env.api.tabs.onCreated.listeners[0](env.tabs[0]);
  const after = await env.message({ type: 'SNAPSHOT' }); assert.notEqual(after.items[0].id, before.items[0].id);
});
test('service worker suspension keeps session bindings even with duplicate URLs', async () => {
  const env = environment({ tabs: [tab(1), tab(2, 'https://example.com/article', 1)] }); await env.load();
  const before = await env.message({ type: 'SNAPSHOT' });
  const first = before.items.find(i => i.tabId === 1);
  await env.message({ type: 'ACTION', tabId: 1, recordId: first.id, action: 'read' });
  const awake = environment({ local: env.local, session: env.session, tabs: [tab(2, 'https://example.com/article', 0), tab(1, 'https://example.com/article', 1)] }); await awake.load();
  const after = await awake.message({ type: 'SNAPSHOT' });
  assert.equal(after.items.find(i => i.tabId === 1).id, first.id); assert.equal(after.items.find(i => i.tabId === 1).status, 'read');
  assert.equal(after.items.find(i => i.tabId === 2).status, 'unread');
});

test('all unread pages receive title markers without bookmarks access or favicon rendering', async () => {
  const env = environment({ tabs: [tab(1), tab(2, 'https://other.org/read')] });
  delete env.api.bookmarks; await env.load();
  env.api.alarms.onAlarm.listeners[0]({ name: 'tabrot-refresh' });
  let snap = await env.message({ type: 'SNAPSHOT' });
  assert.ok(snap.items.every(item => item.color && item.status === 'unread'));
  for (const id of [1, 2]) {
    const render = env.calls.deliveries.findLast(item => item.id === id);
    assert.equal(render.titleMarker, '☀️'); assert.equal(render.color, undefined); assert.equal(render.repairLegacyIcons, true);
  }
  const first = snap.items[0];
  snap = await env.message({ type: 'ACTION', tabId: first.tabId, recordId: first.id, action: 'read' });
  assert.equal(env.calls.deliveries.findLast(item => item.id === first.tabId).titleMarker, null);
  assert.equal(snap.items.find(item => item.id === first.id).openedAt, first.openedAt);
});

test('custom icon stages are independent from Popup color timing and survive worker restart', async () => {
  const env = environment({ tabs: [tab(1)] }); await env.load();
  const before = await env.message({ type: 'SNAPSHOT' });
  const stages = [{ afterMinutes: 0, icon: '🌱' }, { afterMinutes: 0.5, icon: '🌿' }, { afterMinutes: 10, icon: '🍂' }];
  await env.message({ type: 'SETTINGS', settings: { ...before.settings, emojiStages: stages } });
  assert.equal(env.calls.deliveries.at(-1).titleMarker, '🌱');
  assert.deepEqual(env.local.tabrot.settings.thresholds, before.settings.thresholds);
  env.local.tabrot.records[before.items[0].id].openedAt = Date.now() - 60000;
  const awake = environment({ local: env.local, session: env.session, tabs: env.tabs }); delete awake.api.bookmarks; await awake.load();
  awake.api.alarms.onAlarm.listeners[0]({ name: 'tabrot-refresh' });
  const after = await awake.message({ type: 'SNAPSHOT' });
  assert.equal(awake.calls.deliveries.at(-1).titleMarker, '🌿'); assert.deepEqual(after.settings.emojiStages, stages);
  assert.equal(awake.local.tabrot.records[before.items[0].id].titleMarker, '🌿');
});

test('Popup titles omit only our last marker, preserve natural emoji and accept site title updates', async () => {
  const env = environment({ tabs: [tab(1)] }); await env.load();
  env.api.alarms.onAlarm.listeners[0]({ name: 'tabrot-refresh' }); await env.message({ type: 'SNAPSHOT' });
  env.tabs[0].title = '☀️ Article 1';
  let snap = await env.message({ type: 'SNAPSHOT' }); assert.equal(snap.items[0].title, 'Article 1');
  await env.message({ type: 'SOURCE_TITLE', url: env.tabs[0].url, title: 'Updated title' }, { tab: env.tabs[0] });
  assert.equal(env.local.tabrot.records[snap.items[0].id].title, 'Updated title');
  env.tabs[0].title = '🌱 Natural title'; snap = await env.message({ type: 'SNAPSHOT' }); assert.equal(snap.items[0].title, '🌱 Natural title');
});
