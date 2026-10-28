import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/content-v1.0.2.js', import.meta.url), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));

function page() {
  let listener, observer, failure = null, failureType = null;
  const timers = new Map(), calls = [];
  class Element { querySelector() { return null; } }
  class Link extends Element {
    constructor(href = null) { super(); this.attrs = new Map(); this.rel = 'icon'; this.isConnected = false; if (href !== null) this.attrs.set('href', href); }
    getAttribute(key) { return this.attrs.get(key) ?? null; }
    setAttribute(key, value) { this.attrs.set(key, value); }
    removeAttribute(key) { this.attrs.delete(key); }
    get href() { return new URL(this.getAttribute('href') || '', 'https://example.com/article').href; }
    set href(value) { this.setAttribute('href', value); }
    remove() { this.isConnected = false; }
  }
  const original = new Link('/original.svg'); original.isConnected = true;
  const nodes = [original];
  const runtime = {
    id: 'test-extension',
    onMessage: { addListener(fn) { listener = fn; } },
    sendMessage(message, callback) {
      assert.equal(typeof callback, 'function', 'content messages must use the callback API');
      calls.push(message);
      if (failure === 'sync' && (!failureType || message.type === failureType)) throw new Error('Extension context invalidated.');
      queueMicrotask(() => {
        if (failure === 'async' && (!failureType || message.type === failureType)) {
          runtime.lastError = { message: 'Extension context invalidated.' };
          callback(undefined);
          delete runtime.lastError;
        } else callback(message.type === 'ICON' ? { data: 'data:image/png;base64,original' } : { ok: true });
      });
    }
  };
  const context = vm.createContext({
    URL, chrome: { runtime }, location: new URL('https://example.com/article'), Element, HTMLLinkElement: Link,
    MutationObserver: class {
      constructor(callback) { observer = this; this.callback = callback; this.active = false; }
      observe() { this.active = true; }
      disconnect() { this.active = false; }
    },
    Image: class { set src(value) { queueMicrotask(() => this.onload()); } },
    document: {
      documentElement: {}, baseURI: 'https://example.com/article',
      head: { append(node) { nodes.push(node); node.isConnected = true; } },
      querySelectorAll() { return nodes.filter(n => n.isConnected); },
      createElement(tag) {
        if (tag === 'link') return new Link();
        return { getContext: () => ({ drawImage() {}, beginPath() {}, arc() {}, fill() {}, stroke() {} }), toDataURL: () => 'data:image/png;base64,marked' };
      }
    },
    setTimeout(fn, delay) { const id = Symbol(); timers.set(id, { fn, delay }); return id; },
    clearTimeout(id) { timers.delete(id); }
  });
  return {
    original, nodes, runtime, calls,
    start() { vm.runInContext(source, context); },
    render() { listener({ type: 'RENDER', url: 'https://example.com/article', color: '#e77448' }); },
    fail(mode, type = null) { failure = mode; failureType = type; },
    get observing() { return observer.active; },
    mutate() {
      observer.callback([{ type: 'attributes', target: original, attributeName: 'href' }]);
      for (const [id, timer] of timers) if (timer.delay === 250) { timers.delete(id); timer.fn(); }
    }
  };
}

for (const mode of ['sync', 'async']) {
  test(`context invalidation during a dynamic favicon update (${mode}) stops safely`, async () => {
    const p = page(); p.start(); p.render(); await settle();
    assert.equal(p.original.getAttribute('href'), 'data:image/png;base64,marked');
    assert.equal(p.nodes.filter(n => n.isConnected).length, 2);
    p.fail(mode);
    // The site has just changed its favicon, so cleanup must preserve its new URL.
    p.original.href = '/new-site-icon.svg'; p.mutate(); await settle();
    assert.equal(p.original.getAttribute('href'), '/new-site-icon.svg');
    assert.equal(p.nodes.filter(n => n.isConnected).length, 1);
    assert.equal(p.observing, false);
    const count = p.calls.length; p.render(); await settle(); assert.equal(p.calls.length, count);
  });
}

test('synchronous invalidation on initial HELLO does not escape or leave active observers', async () => {
  const p = page(); p.fail('sync'); assert.doesNotThrow(() => p.start()); await settle();
  p.render(); await settle(); assert.equal(p.original.getAttribute('href'), '/original.svg'); assert.equal(p.observing, false);
});

test('missing runtime ID after extension reload restores a previously marked favicon', async () => {
  const p = page(); p.start(); p.render(); await settle();
  p.runtime.id = undefined;
  // A new color triggers another render; the ICON request detects the missing ID.
  // Change the source to exercise the outgoing SOURCE_ICON request at the reported line.
  p.original.href = '/another.svg'; p.mutate(); await settle();
  assert.equal(p.original.getAttribute('href'), '/another.svg'); assert.equal(p.observing, false);
  assert.equal(p.nodes.filter(n => n.isConnected).length, 1);
});

for (const mode of ['sync', 'async']) {
  test(`ICON request handles ${mode} invalidation without an unhandled rejection`, async () => {
    const p = page(); p.start(); await settle(); p.fail(mode, 'ICON'); p.render(); await settle();
    assert.ok(p.calls.some(m => m.type === 'SOURCE_ICON'));
    assert.ok(p.calls.some(m => m.type === 'ICON'));
    assert.equal(p.original.getAttribute('href'), '/original.svg');
    assert.equal(p.nodes.filter(n => n.isConnected).length, 1);
    assert.equal(p.observing, false);
    const count = p.calls.length; p.render(); await settle(); assert.equal(p.calls.length, count);
  });
}

test('a late ICON response cannot repaint after the runtime has been invalidated', async () => {
  const p = page(); p.start(); await settle();
  const originalSend = p.runtime.sendMessage; let finish;
  p.runtime.sendMessage = (message, callback) => {
    if (message.type === 'ICON') finish = callback;
    else originalSend(message, callback);
  };
  p.render(); await settle(); assert.equal(typeof finish, 'function');
  p.runtime.id = undefined;
  finish({ data: 'data:image/png;base64,original' }); await settle();
  assert.equal(p.original.getAttribute('href'), '/original.svg');
  assert.equal(p.nodes.filter(n => n.isConnected).length, 1); assert.equal(p.observing, false);
});

test('an unrelated page mutation cleans up stale marks after extension reload', async () => {
  const p = page(); p.start(); p.render(); await settle();
  assert.equal(p.original.getAttribute('href'), 'data:image/png;base64,marked');
  p.runtime.id = undefined;
  p.mutate(); await settle();
  assert.equal(p.original.getAttribute('href'), '/original.svg');
  assert.equal(p.nodes.filter(n => n.isConnected).length, 1); assert.equal(p.observing, false);
});

test('lastError is consumed synchronously within the Chrome callback', async () => {
  const p = page(); p.start(); await settle();
  let consumed = 0;
  p.runtime.sendMessage = (message, callback) => {
    assert.equal(typeof callback, 'function');
    Object.defineProperty(p.runtime, 'lastError', {
      configurable: true,
      get() { consumed++; return { message: 'Extension context invalidated.' }; }
    });
    try { callback(undefined); } finally { delete p.runtime.lastError; }
  };
  p.render(); await settle();
  assert.equal(consumed, 1); assert.equal(p.observing, false);
  assert.equal(p.original.getAttribute('href'), '/original.svg');
});
