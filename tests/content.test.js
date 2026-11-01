import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../src/content-v1.3.0.js', import.meta.url), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));
function page() {
  let listener, failure = null, failureType = null, observer;
  const calls = [], nodes = [];
  class Link {
    constructor(href = null) { this.attrs = new Map(); this.rel = 'icon'; this.isConnected = true; if (href !== null) this.setAttribute('href', href); }
    getAttribute(key) { return this.attrs.get(key) ?? null; }
    setAttribute(key, value) { this.attrs.set(key, String(value)); }
    removeAttribute(key) { this.attrs.delete(key); }
    get href() { return new URL(this.getAttribute('href') || '', 'https://example.com/article').href; }
    remove() { this.isConnected = false; }
  }
  const original = new Link('/original.svg'); nodes.push(original);
  const document = { title: 'Original title', documentElement: new Link(), baseURI: 'https://example.com/article', querySelectorAll: () => nodes.filter(n => n.isConnected) };
  const runtime = {
    id: 'extension', onMessage: { addListener(fn) { listener = fn; } },
    sendMessage(message, callback) {
      assert.equal(typeof callback, 'function'); calls.push(message);
      const fails = failure && (!failureType || message.type === failureType);
      if (fails && failure === 'sync') throw new Error('Extension context invalidated.');
      queueMicrotask(() => {
        if (fails) { runtime.lastError = { message: 'Extension context invalidated.' }; callback(); delete runtime.lastError; }
        else callback({ ok: true });
      });
    }
  };
  const context = vm.createContext({ document, chrome: { runtime }, URL, location: new URL('https://example.com/article'),
    MutationObserver: class { constructor(callback) { observer = this; this.callback = callback; } observe() { this.active = true; } disconnect() { this.active = false; } },
    setTimeout, clearTimeout
  });
  return { document, original, runtime, calls,
    start() { vm.runInContext(source, context); },
    render(titleMarker = '☀️', extra = {}) { listener({ type: 'RENDER', url: 'https://example.com/article', titleMarker, ...extra }); },
    changeTitle(title) { document.title = title; observer.callback([]); },
    fail(mode, type) { failure = mode; failureType = type; },
    get observing() { return !!observer.active; },
    freshContext() { const fresh = { ...context }; delete fresh.__tabrotController; delete fresh.__tabrotContentVersion; vm.runInNewContext(source, fresh); },
    stopFirst() { context.__tabrotController.stop(); },
    seedLegacy(siteChanged = false) {
      original.setAttribute('data-tabrot-owner', 'old'); original.setAttribute('data-tabrot-rendered', 'data:image/png;base64,marked');
      original.setAttribute('data-tabrot-original', JSON.stringify('/original.svg')); original.setAttribute('href', siteChanged ? '/new.svg' : 'data:image/png;base64,marked');
      const own = new Link('data:image/png;base64,marked'); own.setAttribute('data-tabrot-owner', 'old'); own.setAttribute('data-tabrot-rendered', 'data:image/png;base64,marked'); own.setAttribute('data-tabrot-owned', 'true'); nodes.push(own); return own;
    }
  };
}
test('all title renders leave website favicon untouched and use callback messages', async () => {
  const p = page(); p.start(); p.render(); await settle();
  assert.equal(p.document.title, '☀️ Original title'); assert.equal(p.original.getAttribute('href'), '/original.svg');
  assert.equal(p.calls.some(message => message.type === 'ICON'), false);
  assert.ok(p.calls.some(message => message.type === 'SOURCE_TITLE' && message.title === 'Original title'));
});
test('dynamic site titles and stage changes never accumulate prefixes', async () => {
  const p = page(); p.start(); p.render(); await settle();
  p.changeTitle('Inbox (3)'); await settle(); assert.equal(p.document.title, '☀️ Inbox (3)');
  p.render('🌧️'); await settle(); assert.equal(p.document.title, '🌧️ Inbox (3)');
  p.render('🌧️'); assert.equal(p.document.title, '🌧️ Inbox (3)');
  p.render(null); assert.equal(p.document.title, 'Inbox (3)'); assert.equal(p.observing, false);
});
test('original titles starting with a natural emoji survive cleanup', async () => {
  const p = page(); p.document.title = '☀️ Weather'; p.start(); p.render(); await settle();
  assert.equal(p.document.title, '☀️ ☀️ Weather'); p.render(null); assert.equal(p.document.title, '☀️ Weather');
});
for (const mode of ['sync', 'async']) {
  test(`${mode} runtime invalidation on title notification restores title safely`, async () => {
    const p = page(); p.start(); await settle(); p.fail(mode, 'SOURCE_TITLE'); p.render(); await settle();
    assert.equal(p.document.title, 'Original title'); assert.equal(p.observing, false);
    const count = p.calls.length; p.render(); await settle(); assert.equal(p.calls.length, count);
  });
}
test('invalidation on initial HELLO is handled without pending native promises', async () => {
  const p = page(); p.fail('sync', 'HELLO'); assert.doesNotThrow(() => p.start()); await settle();
  p.render(); assert.equal(p.document.title, 'Original title'); assert.equal(p.observing, false);
});
test('context invalidation detected by DOM mutation preserves the site update', async () => {
  const p = page(); p.start(); p.render(); await settle(); p.runtime.id = undefined;
  p.changeTitle('Site updated'); await settle(); assert.equal(p.document.title, 'Site updated'); assert.equal(p.observing, false);
});
test('lastError is read synchronously inside callback', async () => {
  const p = page(); p.start(); await settle(); let consumed = 0;
  p.runtime.sendMessage = (message, callback) => {
    Object.defineProperty(p.runtime, 'lastError', { configurable: true, get() { consumed++; return { message: 'Extension context invalidated.' }; } });
    try { callback(); } finally { delete p.runtime.lastError; }
  };
  p.render(); await settle(); assert.equal(consumed, 1); assert.equal(p.document.title, 'Original title');
});
test('reinjection restores old title ownership; a late old stop cannot strip the new title', async () => {
  const p = page(); p.start(); p.render(); await settle(); p.freshContext(); p.render('🌿'); await settle();
  assert.equal(p.document.title, '🌿 Original title'); p.stopFirst(); assert.equal(p.document.title, '🌿 Original title');
  p.render(null); assert.equal(p.document.title, 'Original title');
});
for (const changed of [false, true]) {
  test(`upgrade restores legacy icon metadata and preserves site changes (${changed})`, async () => {
    const p = page(); const old = p.seedLegacy(changed); p.start(); p.render(); await settle();
    assert.equal(p.original.getAttribute('href'), changed ? '/new.svg' : '/original.svg'); assert.equal(old.isConnected, false);
    assert.equal(p.original.getAttribute('data-tabrot-owner'), null); assert.equal(p.document.title, '☀️ Original title');
  });
}
test('messages for a previous SPA URL cannot mark the current page', async () => {
  const p = page(); p.start(); p.render('🌧️', { url: 'https://example.com/other' }); await settle(); assert.equal(p.document.title, 'Original title');
});
