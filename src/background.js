import { DEFAULT_SETTINGS, ageColor, isTrackable, pageKey, restoreMatch, snoozeTime, statusOf, validateSettings, normalizeDomain } from './core.js';

let state, bindings, bootTime;
let savedLocal = null, savedSession = null;
const restorePool = new Set();
let queue = Promise.resolve();
const iconCache = new Map();
const enqueue = task => {
  const next = queue.then(async () => { await initialize(); return task(); });
  queue = next.catch(error => console.warn('TabRot:', error.message));
  return next;
};
async function initialize() {
  if (state) return;
  const [saved, session, tabs] = await Promise.all([chrome.storage.local.get('tabrot'), chrome.storage.session.get(['bindings', 'bootTime']), chrome.tabs.query({})]);
  state = saved.tabrot || { version: 1, settings: structuredClone(DEFAULT_SETTINGS), records: {} };
  try { state.settings = validateSettings(state.settings); } catch { state.settings = structuredClone(DEFAULT_SETTINGS); }
  bindings = session.bindings || {};
  bootTime = session.bootTime || Date.now();
  for (const id of Object.keys(state.records)) restorePool.add(id);
  const used = new Set();
  for (const tab of tabs) {
    if (!isTrackable(tab.url)) continue;
    let record = state.records[bindings[tab.id]];
    if (!record || used.has(record.id) || pageKey(record.url) !== pageKey(tab.url)) record = restoreMatch(tab, state.records, used);
    if (!record) record = newRecord(tab);
    bind(tab, record); used.add(record.id); restorePool.delete(record.id);
  }
  const live = new Set(tabs.map(t => String(t.id)));
  for (const id of Object.keys(bindings)) if (!live.has(id)) delete bindings[id];
  await persist();
  if (!await chrome.alarms.get('tabrot-refresh')) await chrome.alarms.create('tabrot-refresh', { periodInMinutes: 1 });
}
function newRecord(tab) {
  const record = { id: crypto.randomUUID(), url: pageKey(tab.url), openedAt: Date.now(), lastVisitedAt: tab.active ? Date.now() : null, read: false, ignored: false, snoozedUntil: 0 };
  state.records[record.id] = record;
  return record;
}
function bind(tab, record) {
  bindings[tab.id] = record.id;
  Object.assign(record, { url: pageKey(tab.url), title: tab.title || tab.url, windowId: tab.windowId, index: tab.index });
  // Never persist our generated icon as the original.
  if (!record.favicon && tab.favIconUrl && !tab.favIconUrl.startsWith('data:')) record.favicon = tab.favIconUrl;
}
async function persist() {
  const local = JSON.stringify(state), session = JSON.stringify({ bindings, bootTime });
  if (local !== savedLocal) { await chrome.storage.local.set({ tabrot: state }); savedLocal = local; }
  if (session !== savedSession) { await chrome.storage.session.set({ bindings, bootTime }); savedSession = session; }
}
async function ensureTab(tab) {
  let record = state.records[bindings[tab.id]];
  if (!isTrackable(tab.url)) {
    if (record) delete state.records[record.id];
    delete bindings[tab.id];
    return null;
  }
  if (!record || pageKey(record.url) !== pageKey(tab.url)) {
    if (record) delete state.records[record.id];
    // Recently restored tabs may arrive after onStartup.
    const used = new Set(Object.values(bindings));
    record = Date.now() - bootTime < 120000 ? restoreMatch(tab, Object.fromEntries([...restorePool].map(id => [id, state.records[id]]).filter(([, r]) => r)), used) : null;
    record ||= newRecord(tab);
    restorePool.delete(record.id);
  }
  bind(tab, record);
  return record;
}
async function deliver(tab, record, inject = false) {
  if (!record || tab.discarded) return;
  const message = { type: 'RENDER', url: record.url, color: statusOf(record, tab, state.settings) === 'unread' ? ageColor(Date.now() - record.openedAt, state.settings.thresholds) : null };
  try { await chrome.tabs.sendMessage(tab.id, message); }
  catch {
    if (!inject) return;
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['src/content-v1.0.2.js'] });
      await chrome.tabs.sendMessage(tab.id, message);
    } catch { /* Protected documents and suspended pages safely keep their favicon. */ }
  }
}
async function refresh(inject = false) {
  const tabs = await chrome.tabs.query({});
  const live = new Set(tabs.map(t => String(t.id)));
  for (const id of Object.keys(bindings)) if (!live.has(id)) delete bindings[id];
  for (const tab of tabs) await ensureTab(tab);
  if (Date.now() - bootTime >= 120000) {
    const used = new Set(Object.values(bindings));
    for (const id of Object.keys(state.records)) if (!used.has(id)) delete state.records[id];
  }
  await persist();
  await Promise.allSettled(tabs.map(tab => deliver(tab, state.records[bindings[tab.id]], inject)));
  return tabs;
}
async function snapshot() {
  const tabs = await chrome.tabs.query({});
  const items = [];
  for (const tab of tabs) {
    const record = await ensureTab(tab);
    if (!record) continue;
    items.push({ ...record, tabId: tab.id, pinned: tab.pinned, status: statusOf(record, tab, state.settings), color: ageColor(Date.now() - record.openedAt, state.settings.thresholds) });
  }
  await persist();
  return { items: items.sort((a, b) => a.openedAt - b.openedAt), settings: state.settings };
}
async function faviconData(url) {
  if (typeof url !== 'string' || !/^https?:\/\//.test(url)) return null;
  if (iconCache.has(url)) return iconCache.get(url);
  try {
    const response = await fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(5000), referrerPolicy: 'no-referrer' });
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) return null;
    const reader = response.body.getReader();
    const chunks = []; let size = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 524288) { await reader.cancel(); return null; } chunks.push(value); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    const data = `data:${response.headers.get('content-type').split(';')[0]};base64,${btoa(binary)}`;
    if (iconCache.size >= 100) iconCache.delete(iconCache.keys().next().value);
    iconCache.set(url, data); return data;
  } catch { return null; }
}
async function handle(message, sender) {
  if (message.type === 'HELLO' && sender.tab) {
    const tab = await chrome.tabs.get(sender.tab.id);
    const record = await ensureTab(tab); await persist(); await deliver(tab, record); return {};
  }
  if (message.type === 'SOURCE_ICON' && sender.tab) {
    const record = state.records[bindings[sender.tab.id]];
    if (record && pageKey(message.url) === record.url && typeof message.favicon === 'string' && message.favicon.length < 131072 && /^(https?:|data:image\/)/i.test(message.favicon)) { record.favicon = message.favicon; await persist(); }
    return {};
  }
  if (message.type === 'ICON' && sender.tab) return { data: await faviconData(message.url) };
  // Settings/actions are only accepted from this extension's own pages.
  if (!sender.url?.startsWith(chrome.runtime.getURL('src/'))) throw new Error('invalidSource');
  if (message.type === 'SNAPSHOT') return snapshot();
  if (message.type === 'SETTINGS') { state.settings = validateSettings(message.settings); await refresh(); return { settings: state.settings }; }
  if (message.type === 'RESET') {
    state = { version: 1, settings: structuredClone(DEFAULT_SETTINGS), records: {} }; restorePool.clear(); bindings = {}; bootTime = Date.now(); await refresh(); return snapshot();
  }
  if (message.type === 'ACTION') {
    const tab = await chrome.tabs.get(message.tabId);
    const record = await ensureTab(tab);
    if (!record || record.id !== message.recordId) throw new Error('staleTab');
    switch (message.action) {
      case 'read': record.read = true; record.snoozedUntil = 0; break;
      case 'unread': record.read = false; record.snoozedUntil = 0; break;
      case 'snooze': record.read = false; record.snoozedUntil = snoozeTime(message.choice); break;
      case 'resume': record.snoozedUntil = 0; break;
      case 'ignore': record.ignored = true; break;
      case 'unignore': record.ignored = false; break;
      case 'ignoreDomain': state.settings.ignoredDomains = [...new Set([...state.settings.ignoredDomains, normalizeDomain(new URL(record.url).hostname)])]; break;
      case 'focus': await chrome.windows.update(tab.windowId, { focused: true }); await chrome.tabs.update(tab.id, { active: true }); break;
      default: throw new Error('unknownAction');
    }
    await persist();
    if (message.action === 'ignoreDomain') await refresh(); else await deliver(tab, record);
    return snapshot();
  }
  throw new Error('unknownRequest');
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  // Favicon fetches must not block the event/state queue for other tabs.
  const pending = message?.type === 'ICON' && sender.tab ? faviconData(message.url).then(data => ({ data })) : enqueue(() => handle(message, sender));
  pending.then(data => respond({ ok: true, ...data })).catch(error => respond({ ok: false, error: error.message }));
  return true;
});
chrome.tabs.onCreated.addListener(tab => { enqueue(async () => { const r = await ensureTab(tab); await persist(); await deliver(tab, r); }); });
chrome.tabs.onUpdated.addListener((id, change, tab) => {
  if (change.url || change.status === 'complete' || 'pinned' in change) enqueue(async () => { const r = await ensureTab(tab); await persist(); await deliver(tab, r, change.status === 'complete'); });
});
chrome.tabs.onActivated.addListener(({ tabId }) => { enqueue(async () => { const tab = await chrome.tabs.get(tabId); const r = await ensureTab(tab); if (r) r.lastVisitedAt = Date.now(); await persist(); await deliver(tab, r); }); });
chrome.tabs.onRemoved.addListener((id, info) => { enqueue(async () => { if (!info.isWindowClosing) delete state.records[bindings[id]]; delete bindings[id]; await persist(); }); });
chrome.tabs.onReplaced.addListener((added, removed) => { enqueue(async () => { bindings[added] = bindings[removed]; delete bindings[removed]; const tab = await chrome.tabs.get(added); const r = await ensureTab(tab); await persist(); await deliver(tab, r, true); }); });
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'tabrot-refresh') enqueue(() => refresh()); });
chrome.runtime.onInstalled.addListener(() => { enqueue(() => refresh(true)); });
chrome.runtime.onStartup.addListener(() => { enqueue(() => refresh(true)); });
