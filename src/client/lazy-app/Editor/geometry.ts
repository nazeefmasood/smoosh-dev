/**
 * Pure geometry helpers shared by the Editor's Crop and Resize panels.
 * All crop rects are normalized to [0..1] relative to the (oriented) image.
 */

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ResizeMode = 'dimensions' | 'percent';

export interface ResizeOpts {
  mode: ResizeMode;
  width: number | '';
  height: number | '';
  lockAspect: boolean;
  percent: number;
}

export const FULL_CROP: CropRect = { x: 0, y: 0, w: 1, h: 1 };

export const DEFAULT_RESIZE: ResizeOpts = {
  mode: 'percent',
  width: '',
  height: '',
  lockAspect: true,
  percent: 100,
};

/** Aspect presets. `ratio` is pixel width/height; null = free, 0 = image's own. */
export const CROP_ASPECTS: {
  key: string;
  label: string;
  ratio: number | null;
}[] = [
  { key: 'free', label: 'Free', ratio: null },
  { key: 'original', label: 'Original', ratio: 0 },
  { key: '1:1', label: '1:1', ratio: 1 },
  { key: '4:5', label: '4:5', ratio: 4 / 5 },
  { key: '3:2', label: '3:2', ratio: 3 / 2 },
  { key: '16:9', label: '16:9', ratio: 16 / 9 },
  { key: '9:16', label: '9:16', ratio: 9 / 16 },
];

/** Resolve an aspect preset key to a pixel width/height ratio (null = free). */
export function resolveAspectRatio(
  key: string,
  natW: number,
  natH: number,
): number | null {
  const preset = CROP_ASPECTS.find((a) => a.key === key);
  if (!preset || preset.ratio === null) return null;
  if (preset.ratio === 0) return natW && natH ? natW / natH : null;
  return preset.ratio;
}

/** Largest centered rect of the given pixel aspect that fits the image. */
export function centeredRectForAspect(
  natW: number,
  natH: number,
  pxAspect: number | null,
): CropRect {
  if (!pxAspect) return { ...FULL_CROP };
  const imgAspect = natW / natH;
  let pxW: number;
  let pxH: number;
  if (pxAspect > imgAspect) {
    pxW = natW;
    pxH = natW / pxAspect;
  } else {
    pxH = natH;
    pxW = natH * pxAspect;
  }
  return {
    x: (1 - pxW / natW) / 2,
    y: (1 - pxH / natH) / 2,
    w: pxW / natW,
    h: pxH / natH,
  };
}

/** Keep a rect within the image and above a minimum size. */
export function clampCrop(r: CropRect): CropRect {
  const MIN = 0.03;
  const w = Math.min(1, Math.max(MIN, r.w));
  const h = Math.min(1, Math.max(MIN, r.h));
  const x = Math.min(1 - w, Math.max(0, r.x));
  const y = Math.min(1 - h, Math.max(0, r.y));
  return { x, y, w, h };
}

/**
 * Apply a drag (move or handle resize) to a rect. `ratioN` is the normalized
 * width/height to enforce, or null for freeform.
 */
export function applyCropDrag(
  mode: string,
  s: CropRect,
  dx: number,
  dy: number,
  ratioN: number | null,
): CropRect {
  if (mode === 'move') return { x: s.x + dx, y: s.y + dy, w: s.w, h: s.h };

  let { x, y, w, h } = s;
  const right = x + w;
  const bottom = y + h;

  if (mode.includes('e')) w = s.w + dx;
  if (mode.includes('w')) {
    x = s.x + dx;
    w = s.w - dx;
  }
  if (mode.includes('s')) h = s.h + dy;
  if (mode.includes('n')) {
    y = s.y + dy;
    h = s.h - dy;
  }

  if (ratioN) {
    const horizontal = mode.includes('e') || mode.includes('w');
    if (mode === 'n' || mode === 's') {
      const cx = s.x + s.w / 2;
      w = h * ratioN;
      x = cx - w / 2;
    } else if (horizontal) {
      const newH = w / ratioN;
      if (mode.includes('n')) y = bottom - newH;
      else if (!mode.includes('s')) y = s.y + s.h / 2 - newH / 2;
      h = newH;
      if (mode.includes('w')) x = right - w;
    }
  }
  return { x, y, w, h };
}

/**
 * Resolve the resize target for an image of size sw×sh. Percent scales both
 * axes; dimensions honours the aspect lock (whichever axis is set drives the
 * other). Returns integer pixel dimensions.
 */
export function computeResizeTarget(
  sw: number,
  sh: number,
  o: ResizeOpts,
): { width: number; height: number } {
  if (o.mode === 'percent') {
    const p = Math.max(1, o.percent) / 100;
    return {
      width: Math.max(1, Math.round(sw * p)),
      height: Math.max(1, Math.round(sh * p)),
    };
  }
  const w = typeof o.width === 'number' ? o.width : 0;
  const h = typeof o.height === 'number' ? o.height : 0;
  if (o.lockAspect) {
    if (w && !h)
      return { width: w, height: Math.max(1, Math.round((w * sh) / sw)) };
    if (h && !w)
      return { width: Math.max(1, Math.round((h * sw) / sh)), height: h };
    if (w && h)
      return { width: w, height: Math.max(1, Math.round((w * sh) / sw)) };
    return { width: sw, height: sh };
  }
  return { width: w || sw, height: h || sh };
}
