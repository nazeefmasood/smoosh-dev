/**
 * Background remover — main-thread wrapper.
 *
 * All ONNX work (model download, session creation, inference) runs in a
 * dedicated Web Worker (./worker) so the heavy RMBG-1.4 forward pass never
 * freezes the page. This module spawns that worker and exposes the same
 * promise-based API the Tool uses.
 */
import workerURL from 'omt:vendor/bgremove/worker';

export type ProgressFn = (loaded: number, total: number) => void;

export interface RemoveBgResult {
  imageData: ImageData;
  width: number;
  height: number;
}

let worker: Worker | null = null;
let readyPromise: Promise<void> | null = null;
let readyResolve: (() => void) | null = null;
let readyReject: ((e: Error) => void) | null = null;
let progressFn: ProgressFn | null = null;
let seq = 0;
const pending = new Map<
  number,
  { resolve: (v: any) => void; reject: (e: any) => void }
>();

function ensureWorker() {
  if (worker) return;
  worker = new Worker(workerURL);
  worker.onmessage = (e: MessageEvent) => {
    const m = e.data;
    switch (m.type) {
      case 'progress':
        if (progressFn) progressFn(m.loaded, m.total);
        break;
      case 'ready':
        readyResolve?.();
        break;
      case 'init-error':
        readyReject?.(new Error(m.error || 'Model failed to load'));
        break;
      case 'result': {
        const p = pending.get(m.id);
        if (p) {
          pending.delete(m.id);
          const imageData = new ImageData(m.rgba, m.width, m.height);
          p.resolve({ imageData, width: m.width, height: m.height });
        }
        break;
      }
      case 'process-error': {
        const p = pending.get(m.id);
        if (p) {
          pending.delete(m.id);
          p.reject(new Error(m.error || 'Inference failed'));
        }
        break;
      }
    }
  };
}

/**
 * Load the model in the worker. Resolves when the worker reports ready.
 * `onProgress` fires during the one-time model download.
 */
export function preloadModel(onProgress?: ProgressFn): Promise<void> {
  progressFn = onProgress || null;
  if (readyPromise) return readyPromise;
  ensureWorker();
  readyPromise = new Promise<void>((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
    worker!.postMessage({ type: 'init' });
  });
  return readyPromise;
}

/** Remove the background from an image. Requires the model to be loaded. */
export async function removeBackground(
  src: ImageData,
): Promise<RemoveBgResult> {
  if (!readyPromise) throw new Error('Model not preloaded');
  await readyPromise;
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker!.postMessage({ type: 'process', id, imageData: src });
  });
}
