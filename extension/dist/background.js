'use strict';
(() => {
  // src/background.js
  var offscreenReady = false;
  async function hasOffscreen() {
    if (offscreenReady) return true;
    if (chrome.runtime.getContexts) {
      const ctxs = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
      });
      offscreenReady = ctxs.length > 0;
      return offscreenReady;
    }
    return Boolean(await chrome.offscreen?.hasDocument?.());
  }
  async function ensureOffscreen() {
    if (await hasOffscreen()) return;
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['BLOBS'],
      justification:
        'Decode, remove the Gemini watermark, and re-encode images off the page (page CSP blocks extension workers).',
    });
    offscreenReady = true;
  }
  function extFor(type) {
    if (type.includes('png')) return '.png';
    if (type.includes('webp')) return '.webp';
    if (type.includes('jpeg') || type.includes('jpg')) return '.jpg';
    return '.png';
  }
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg?.type !== 'smoosh-process') return;
    (async () => {
      try {
        await ensureOffscreen();
        const res = await chrome.runtime.sendMessage({
          type: 'smoosh-run',
          blob: msg.blob,
          mode: msg.mode,
          options: msg.options,
        });
        if (!res || res.error) {
          reply({ error: (res && res.error) || 'no response from processor' });
          return;
        }
        const url = URL.createObjectURL(res.blob);
        const stamp = /* @__PURE__ */ new Date()
          .toISOString()
          .slice(0, 19)
          .replace(/[:T]/g, '-');
        const tag = msg.mode === 'watermark' ? 'clean' : 'compressed';
        const filename = `smoosh-${tag}-${stamp}${extFor(res.blob.type)}`;
        await chrome.downloads.download({ url, filename, saveAs: false });
        setTimeout(() => URL.revokeObjectURL(url), 3e4);
        reply({ ok: true });
      } catch (e) {
        reply({ error: String((e && e.message) || e) });
      }
    })();
    return true;
  });
  chrome.runtime.onInstalled.addListener(() => {});
})();
