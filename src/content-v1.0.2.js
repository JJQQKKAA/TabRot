(() => {
  if (globalThis.__tabrotLoaded) return;
  globalThis.__tabrotLoaded = true;

  const originals = new Map();
  const imageRequests = new Set();
  let color = null, rendered = null, ownLink = null, timer, revision = 0;
  let imageRequest = null, stopped = false;
  const pageKey = () => { const url = new URL(location.href); url.hash = ''; return url.href; };
  const links = () => [...document.querySelectorAll('link[rel]')].filter(node =>
    node !== ownLink && node.rel.toLowerCase().split(/\s+/).includes('icon'));

  const observer = new MutationObserver(mutations => {
    try {
      if (!ensureContext() || !color) return;
      const relevant = mutations.some(m => m.type === 'attributes'
        ? m.target instanceof HTMLLinkElement && m.target !== ownLink &&
          (m.attributeName === 'rel' || m.target.getAttribute('href') !== rendered)
        : [...m.addedNodes, ...m.removedNodes].some(node => node instanceof HTMLLinkElement ||
          (node instanceof Element && node.querySelector('link[rel]'))));
      if (relevant) { clearTimeout(timer); timer = setTimeout(requestPaint, 250); }
    } catch { stop(); }
  });

  function observe() {
    if (!stopped) observer.observe(document.documentElement, {
      subtree: true, childList: true, attributes: true, attributeFilter: ['href', 'rel']
    });
  }

  function restore() {
    revision++;
    observer.disconnect();
    clearTimeout(timer);
    for (const request of imageRequests) {
      request.done = true;
      request.callbacks.length = 0;
      clearTimeout(request.timer);
      if (request.image) request.image.onload = request.image.onerror = null;
    }
    imageRequests.clear();
    imageRequest = null;
    for (const [node, href] of originals) {
      if (node.getAttribute('href') === rendered) {
        if (href === null) node.removeAttribute('href');
        else node.setAttribute('href', href);
      }
    }
    originals.clear();
    ownLink?.remove();
    ownLink = null;
    rendered = null;
  }

  function stop() {
    stopped = true;
    color = null;
    restore();
  }

  function ensureContext() {
    if (stopped) return false;
    try { if (chrome.runtime?.id) return true; } catch { /* Invalidated runtime. */ }
    stop();
    return false;
  }

  // Use Chrome's callback API: no native API promise remains pending across a
  // reload. Consume lastError inside the callback, where Chrome exposes it.
  function send(message, callback = () => {}) {
    if (!ensureContext()) { callback(null); return; }
    try {
      chrome.runtime.sendMessage(message, response => {
        try {
          const error = chrome.runtime.lastError;
          if (error) {
            if (/extension context invalidated/i.test(error.message || '')) stop();
            callback(null);
          } else callback(ensureContext() ? response : null);
        } catch { stop(); }
      });
    } catch (error) {
      if (/extension context invalidated/i.test(error?.message || '')) stop();
      callback(null);
    }
  }

  function loadImage(source, callback) {
    if (imageRequest?.source === source) {
      if (imageRequest.done) callback(imageRequest.result);
      else imageRequest.callbacks.push(callback);
      return;
    }
    const request = { source, done: false, callbacks: [callback], image: null, timer: null, result: null };
    imageRequest = request;
    imageRequests.add(request);
    function finish(image) {
      if (request.done) return;
      request.done = true;
      request.result = image;
      clearTimeout(request.timer);
      if (request.image) request.image.onload = request.image.onerror = null;
      imageRequests.delete(request);
      const callbacks = request.callbacks.splice(0);
      if (!ensureContext()) return;
      for (const done of callbacks) {
        try { done(image); } catch { stop(); break; }
      }
    }
    function decode(data) {
      if (request.done || !ensureContext()) return;
      if (!data) { finish(null); return; }
      try {
        const image = new Image();
        request.image = image;
        image.onload = () => finish(image);
        image.onerror = () => finish(null);
        request.timer = setTimeout(() => finish(null), 5000);
        image.src = data;
      } catch { finish(null); }
    }
    if (/^data:image\//i.test(source)) decode(source);
    else send({ type: 'ICON', url: source }, response => decode(response?.data));
  }

  function requestPaint() {
    if (!ensureContext()) return;
    try { paint(); } catch { stop(); }
  }

  function paint() {
    if (!color || !document.head) return;
    const token = ++revision;
    const icons = links();
    for (const node of icons) {
      if (!originals.has(node) || node.getAttribute('href') !== rendered) {
        originals.set(node, node.getAttribute('href'));
      }
    }
    for (const node of originals.keys()) if (!node.isConnected) originals.delete(node);
    const sourceNode = icons.find(node => (originals.get(node) || '').length);
    let source = new URL('/favicon.ico', location.origin).href;
    try { if (sourceNode) source = new URL(originals.get(sourceNode), document.baseURI).href; }
    catch { /* Use conventional favicon. */ }
    if (source !== imageRequest?.source) send({ type: 'SOURCE_ICON', url: pageKey(), favicon: source });
    if (!ensureContext() || token !== revision) return;
    loadImage(source, image => {
      if (!ensureContext() || token !== revision || !color) return;
      // Preserve the site's identity when its original favicon cannot be loaded.
      if (!image && icons.length) { restore(); observe(); return; }
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 32;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      try {
        if (image) ctx.drawImage(image, 0, 0, 32, 32);
        else {
          ctx.fillStyle = '#e5e9e2'; ctx.beginPath(); ctx.roundRect(5, 2, 21, 27, 4); ctx.fill();
          ctx.fillStyle = '#42574e'; ctx.fillRect(10, 9, 11, 2); ctx.fillRect(10, 15, 8, 2);
        }
        ctx.beginPath(); ctx.arc(24, 24, 7, 0, 2 * Math.PI);
        ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
        const next = canvas.toDataURL('image/png');
        observer.disconnect();
        rendered = next;
        for (const node of icons) node.setAttribute('href', rendered);
        if (!ownLink?.isConnected) {
          ownLink = document.createElement('link');
          ownLink.rel = 'icon'; ownLink.type = 'image/png'; ownLink.sizes = '32x32';
          document.head.append(ownLink);
        }
        ownLink.href = rendered;
        observe();
      } catch { restore(); }
    });
  }

  try {
    chrome.runtime.onMessage.addListener(message => {
      try {
        if (!ensureContext() || message.type !== 'RENDER' || message.url !== pageKey()) return;
        if (message.color === color && ownLink?.isConnected) return;
        color = message.color;
        if (!color) restore(); else requestPaint();
      } catch { stop(); }
    });
  } catch { stop(); return; }
  send({ type: 'HELLO' });
})();
