// Offscreen document — does the actual image processing in the extension's
// own origin (immune to the host page's worker-src CSP).
//
// Receives { type:'smoosh-run', blob, mode, options } and replies with
// { blob } or { error }. The Gemini watermark remover is bundled in here by
// esbuild at build time (alias 'gwm').
import { removeWatermarkFromImageDataSync } from 'gwm';

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type !== 'smoosh-run') return;
  (async () => {
    try {
      const { buffer, mimeType, mode, options = {} } = msg;
      // Reconstruct the Blob from the ArrayBuffer shipped over by the
      // background (sendMessage doesn't reliably clone Blob).
      const blob = new Blob([buffer], { type: mimeType || 'image/png' });
      const bitmap = await createImageBitmap(blob);
      const { width, height } = bitmap;
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();

      if (mode === 'watermark') {
        const imageData = ctx.getImageData(0, 0, width, height);
        removeWatermarkFromImageDataSync(imageData, options);
        ctx.putImageData(imageData, 0, 0);
      }

      const fmt = options.format || 'image/png';
      const quality =
        typeof options.quality === 'number' ? options.quality : 0.9;
      const outBlob = await canvas.convertToBlob({ type: fmt, quality });
      reply({ blob: outBlob });
    } catch (err) {
      reply({ error: String((err && err.message) || err) });
    }
  })();
  return true; // async reply
});
