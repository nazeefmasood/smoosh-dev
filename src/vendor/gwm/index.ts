/**
 * Typed shim over the vendored Gemini Watermark Remover engine.
 *
 * The engine source lives in ./sdk and ./core (vendored from
 * @pilio/gemini-watermark-remover, MIT — see ./LICENSE). We import it directly
 * instead of depending on the npm package so the code is auditable in-repo.
 *
 * The browser entry uses pure-JS reverse alpha blending (auto-detects the
 * Gemini watermark and inverts the compositing). It returns an
 * HTMLCanvasElement or OffscreenCanvas.
 */
// @ts-ignore - vendored plain JS module (no type declarations)
export { removeWatermarkFromImage } from './sdk/browser.js';

export interface WatermarkMeta {
  detected?: boolean;
}
