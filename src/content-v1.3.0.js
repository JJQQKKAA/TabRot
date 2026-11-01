(() => {
  if (globalThis.__tabrotContentVersion === '1.3.0') return;
  globalThis.__tabrotController?.stop();
  globalThis.__tabrotContentVersion = '1.3.0';

  let titleMarker = null, originalTitle = null, renderedTitle = null;
  const titleObserver = new MutationObserver(() => {
    if (!titleMarker || !ensureContext()) return;
    if (document.title !== renderedTitle) { originalTitle = document.title; paintTitle(); }
  });
  function restoreTitle(adopt = false) {
    titleObserver.disconnect();
    const root = document.documentElement;
    if (!adopt && root.getAttribute('data-tabrot-title-owner') !== controllerId) { titleMarker = originalTitle = renderedTitle = null; return; }
    const previous = root.getAttribute('data-tabrot-title-rendered');
    if (previous && document.title === previous) document.title = root.getAttribute('data-tabrot-title-original') || '';
    root.removeAttribute('data-tabrot-title-rendered');
    root.removeAttribute('data-tabrot-title-original');
    root.removeAttribute('data-tabrot-title-owner');
    titleMarker = originalTitle = renderedTitle = null;
  }
  function paintTitle() {
    titleObserver.disconnect();
    const root = document.documentElement;
    root.setAttribute('data-tabrot-title-owner', controllerId);
    root.setAttribute('data-tabrot-title-original', originalTitle);
    renderedTitle = `${titleMarker} ${originalTitle}`;
    root.setAttribute('data-tabrot-title-rendered', renderedTitle);
    document.title = renderedTitle;
    send({ type: 'SOURCE_TITLE', url: pageKey(), title: originalTitle });
    if (ensureContext() && titleMarker) titleObserver.observe(root, { subtree: true, childList: true, characterData: true });
  }
  function setTitleMarker(marker) {
    if (marker === titleMarker && (!marker || document.title === renderedTitle)) return;
    restoreTitle();
    if (marker) { originalTitle = document.title; titleMarker = marker; paintTitle(); }
  }

  const controllerId = Math.random().toString(36).slice(2);
  const imageRequests = new Set();
  let revision = 0, imageRequest = null, stopped = false, adopted = false;
  const pageKey = () => { const url = new URL(location.href); url.hash = ''; return url.href; };
  const links = () => [...document.querySelectorAll('link[rel]')].filter(node =>
    node.rel.toLowerCase().split(/\s+/).includes('icon'));

  function restore(includePreviousControllers = false) {
    revision++;
    for (const request of imageRequests) {
      request.done = true;
      request.callbacks.length = 0;
      clearTimeout(request.timer);
      if (request.image) request.image.onload = request.image.onerror = null;
    }
    imageRequests.clear();
    imageRequest = null;
    let recovered = null;
    // Legacy DOM ownership metadata survives an extension reload. Restore only nodes whose href still equals our recorded render.
    for (const node of document.querySelectorAll('link[rel]')) {
      const previous = node.getAttribute('data-tabrot-rendered');
      if (!previous || (!includePreviousControllers && node.getAttribute('data-tabrot-owner') !== controllerId)) continue;
      if (node.getAttribute('href') === previous) {
        if (node.getAttribute('data-tabrot-owned') === 'true') node.remove();
        else {
          try {
            const href = JSON.parse(node.getAttribute('data-tabrot-original'));
            if (href === null) node.removeAttribute('href');
            else if (typeof href === 'string') { node.setAttribute('href', href); try { recovered ||= new URL(href, document.baseURI).href; } catch { /* Invalid original URL. */ } }
          } catch { /* Leave malformed or site-modified attributes alone. */ }
        }
      }
      node.removeAttribute('data-tabrot-original');
      node.removeAttribute('data-tabrot-rendered');
      node.removeAttribute('data-tabrot-owned');
      node.removeAttribute('data-tabrot-owner');
    }
    return recovered;
  }

  function stop() {
    restoreTitle();
    stopped = true;
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

  // Versions before 1.1.2 did not leave ownership metadata in the DOM. Match
  // their exact 32px opaque dot/white-ring geometry before touching a data icon.
  // Arbitrary site-provided data icons must remain unchanged.
  function hasLegacyMarker(image) {
    if (!image || image.naturalWidth !== 32 || image.naturalHeight !== 32) return false;
    try {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, 32, 32).data, center = (24 * 32 + 24) * 4;
      if (pixels[center + 3] !== 255) return false;
      if (pixels[center] > 245 && pixels[center + 1] > 245 && pixels[center + 2] > 245) return false;
      const mask = document.createElement('canvas'); mask.width = mask.height = 32;
      const reference = mask.getContext('2d');
      reference.beginPath(); reference.arc(24, 24, 7, 0, 2 * Math.PI);
      reference.fillStyle = `rgb(${pixels[center]},${pixels[center + 1]},${pixels[center + 2]})`;
      reference.fill(); reference.strokeStyle = '#ffffff'; reference.lineWidth = 2; reference.stroke();
      const expected = reference.getImageData(0, 0, 32, 32).data;
      let matched = 0;
      for (let i = 0; i < expected.length; i += 4) {
        if (expected[i + 3] !== 255) continue;
        for (let channel = 0; channel < 4; channel++) if (Math.abs(pixels[i + channel] - expected[i + channel]) > 1) return false;
        matched++;
      }
      return matched >= 150;
    } catch { return false; }
  }

  function repairLegacyMarker(message) {
    if (!message.repairLegacyIcons || !/^data:image\/png[;,]/i.test(message.currentFavicon || '')) return;
    const legacy = message.currentFavicon;
    const candidates = links().filter(node => node.href === legacy);
    if (!candidates.length) return;
    const token = revision;
    loadImage(legacy, image => {
      if (!ensureContext() || revision !== token || !hasLegacyMarker(image)) return;
      const fallback = new URL('/favicon.ico', location.origin).href;
      function replace(source) {
        if (!ensureContext() || revision !== token) return;
        let repaired = false;
        for (const node of candidates) {
          if (node.isConnected && node.href === legacy) { node.setAttribute('href', source); repaired = true; }
        }
        if (repaired) send({ type: 'SOURCE_ICON', url: pageKey(), favicon: source });
      }
      const original = message.originalFavicon;
      if (!/^(https?:|data:image\/)/i.test(original || '') || original === legacy) replace(fallback);
      else if (/^data:/i.test(original)) {
        // Older reinjections could have recorded an already-marked original.
        loadImage(original, source => replace(!source || hasLegacyMarker(source) ? fallback : original));
      } else replace(original);
    });
  }

  globalThis.__tabrotController = { stop };
  try {
    chrome.runtime.onMessage.addListener(message => {
      try {
        if (!ensureContext() || message.type !== 'RENDER' || message.url !== pageKey()) return;
        if (!adopted) {
          adopted = true;
          restoreTitle(true);
          const recovered = restore(true);
          if (recovered) send({ type: 'SOURCE_ICON', url: pageKey(), favicon: recovered });
        }
        setTitleMarker(message.titleMarker || null);
        repairLegacyMarker(message);
      } catch { stop(); }
    });
  } catch { stop(); return; }
  send({ type: 'HELLO' });
})();
