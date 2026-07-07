/**
 * Dependency-free EXIF / metadata read + lossless strip.
 *
 * No external libraries (COEP blocks CDNs anyway). JPEG and PNG are rewritten
 * at the byte level so metadata is dropped with zero re-compression — the
 * pixels and quality are preserved exactly. Other formats fall back to a
 * decode → re-encode done by the caller, which also strips metadata.
 */

export type MetaCategory =
  | 'camera'
  | 'location'
  | 'date'
  | 'software'
  | 'other';

export interface MetaField {
  label: string;
  value: string;
  category: MetaCategory;
}

export interface MetaResult {
  format: 'jpeg' | 'png' | 'other';
  fields: MetaField[];
  hasGps: boolean;
  /** Total bytes of metadata-bearing chunks found. */
  metaBytes: number;
}

export interface StripResult {
  file: File;
  /** True when a true lossless strip was performed (jpeg/png). */
  lossless: boolean;
}

// ---- TIFF value types ----
const TYPE_ASCII = 2;
const TYPE_SHORT = 3;
const TYPE_LONG = 4;
const TYPE_RATIONAL = 5;

interface IfdEntry {
  type: number;
  count: number;
  /** Byte offset (relative to the TIFF reader) of this entry's value field. */
  off: number;
}

interface TiffReader {
  dv: DataView;
  ascii(off: number, count: number): string;
  u16(off: number): number;
  u32(off: number): number;
  rational(off: number): number;
}

function makeTiff(buf: ArrayBuffer, tiffStart: number): TiffReader {
  const dv = new DataView(buf, tiffStart);
  const little = dv.getUint16(0) === 0x4949; // 'II' little-endian
  const u16 = (off: number) => dv.getUint16(off, little);
  const u32 = (off: number) => dv.getUint32(off, little);
  return {
    dv,
    u16,
    u32,
    ascii(off: number, count: number) {
      let s = '';
      for (let i = 0; i < count; i++) {
        const c = dv.getUint8(off + i);
        if (c === 0) break;
        s += String.fromCharCode(c);
      }
      return s;
    },
    rational(off: number) {
      const n = u32(off);
      const d = u32(off + 4) || 1;
      return d === 1 ? n : n / d;
    },
  };
}

/** Read one IFD into `out` (tag → entry). Returns the next-IFD offset. */
function readIfd(
  t: TiffReader,
  ifdOff: number,
  out: Map<number, IfdEntry>,
): number {
  if (ifdOff + 2 > t.dv.byteLength) return 0;
  const entryCount = t.u16(ifdOff);
  let p = ifdOff + 2;
  for (let i = 0; i < entryCount; i++) {
    const tag = t.u16(p);
    const type = t.u16(p + 2);
    const count = t.u32(p + 4);
    out.set(tag, { type, count, off: p + 8 });
    p += 12;
  }
  return t.u32(p);
}

function readEntryValue(t: TiffReader, e: IfdEntry | undefined): string {
  if (!e) return '';
  if (e.type === TYPE_ASCII) {
    const off = e.count <= 4 ? e.off : t.u32(e.off);
    return t.ascii(off, e.count);
  }
  if (e.type === TYPE_SHORT) return String(t.u16(e.off));
  if (e.type === TYPE_LONG) return String(t.u32(e.off));
  if (e.type === TYPE_RATIONAL) {
    const r = t.rational(t.u32(e.off));
    return Number.isInteger(r) ? `${r}` : r.toFixed(1);
  }
  return '';
}

function formatGpsCoord(t: TiffReader, e: IfdEntry | undefined): string {
  if (!e) return '';
  const base = t.u32(e.off);
  const d = t.rational(base);
  const m = t.rational(base + 8);
  const s = t.rational(base + 16);
  return `${d}°${m}′${s.toFixed(1)}″`;
}

/** True if an APP1 payload begins with the EXIF signature "Exif\0\0". */
function isExifPayload(p: Uint8Array): boolean {
  return (
    p.length >= 8 &&
    p[0] === 0x45 &&
    p[1] === 0x78 &&
    p[2] === 0x69 &&
    p[3] === 0x66 &&
    p[4] === 0 &&
    p[5] === 0
  );
}

const isAppXmp = (b: Uint8Array) =>
  b.length >= 29 &&
  String.fromCharCode(...b.slice(0, 29)).startsWith('http://ns.adobe.com/xap');

/** Parse a JPEG APP1 EXIF segment payload into human-readable fields. */
function parseExifPayload(payload: Uint8Array): MetaField[] {
  const fields: MetaField[] = [];
  if (!isExifPayload(payload)) return fields;
  const buf = payload.buffer.slice(payload.byteOffset) as ArrayBuffer;
  const t = makeTiff(buf, 6); // TIFF header starts 6 bytes into the APP1 payload
  const ifd0Off = t.u32(4); // offset to IFD0 (from TIFF start)
  const entries = new Map<number, IfdEntry>();
  readIfd(t, ifd0Off, entries);

  const exifEntries = new Map<number, IfdEntry>();
  const gpsEntries = new Map<number, IfdEntry>();
  const exifPtr = entries.get(0x8769);
  const gpsPtr = entries.get(0x8825);
  if (exifPtr) readIfd(t, t.u32(exifPtr.off) || exifPtr.off, exifEntries);
  if (gpsPtr) readIfd(t, t.u32(gpsPtr.off) || gpsPtr.off, gpsEntries);

  const add = (cat: MetaCategory, label: string, val: string) => {
    if (val) fields.push({ category: cat, label, value: val });
  };

  add('camera', 'Make', readEntryValue(t, entries.get(0x010f)));
  add('camera', 'Model', readEntryValue(t, entries.get(0x0110)));
  add('camera', 'Lens', readEntryValue(t, exifEntries.get(0xa434)));
  add('camera', 'Focal length', readEntryValue(t, exifEntries.get(0x920a)));
  add('camera', 'F-number', readEntryValue(t, exifEntries.get(0x829d)));
  add('camera', 'Exposure time', readEntryValue(t, exifEntries.get(0x829a)));
  add('date', 'Date taken', readEntryValue(t, exifEntries.get(0x9003)));
  add('date', 'Date digitized', readEntryValue(t, exifEntries.get(0x9004)));
  add('date', 'Modified', readEntryValue(t, entries.get(0x0132)));
  add('software', 'Software', readEntryValue(t, entries.get(0x0131)));
  add('software', 'Artist', readEntryValue(t, entries.get(0x013b)));

  const lat = formatGpsCoord(t, gpsEntries.get(0x0002));
  const latRef = readEntryValue(t, gpsEntries.get(0x0001));
  const lon = formatGpsCoord(t, gpsEntries.get(0x0004));
  const lonRef = readEntryValue(t, gpsEntries.get(0x0003));
  const alt = readEntryValue(t, gpsEntries.get(0x0006));
  if (lat) add('location', 'Latitude', lat + (latRef ? ` ${latRef}` : ''));
  if (lon) add('location', 'Longitude', lon + (lonRef ? ` ${lonRef}` : ''));
  if (alt) add('location', 'Altitude', `${alt} m`);
  const gpsDate = readEntryValue(t, gpsEntries.get(0x001d));
  if (gpsDate) add('location', 'GPS date', gpsDate);

  return fields;
}

// ---- JPEG segment walk ----
/**
 * JPEG lossless strip: copy SOI + keep APP0(JFIF)/APP14(Adobe)/tables/SOF/SOS,
 * drop APP1(EXIF/XMP), APP2(ICC), APP13(IPTC/Photoshop), COM. Scan data copied
 * verbatim. Pixels and quality are preserved exactly.
 */
function stripJpeg(bytes: Uint8Array): Uint8Array {
  const out: number[] = [0xff, 0xd8]; // SOI
  let i = 2;
  const n = bytes.length;
  while (i < n - 1) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = bytes[i + 1];
    // Standalone markers (no length payload)
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (marker === 0xd9) {
      out.push(0xff, 0xd9); // EOI
      break;
    }
    if (marker === 0xda) {
      // SOS: emit marker + length-prefixed header, then entropy data verbatim.
      const len = (bytes[i + 2] << 8) | bytes[i + 3];
      out.push(0xff, 0xda);
      for (let k = 0; k < len; k++) out.push(bytes[i + 2 + k]);
      let j = i + 2 + len;
      while (j < n - 1) {
        if (bytes[j] === 0xff && bytes[j + 1] !== 0) break; // FF 00 = stuffed byte
        out.push(bytes[j]);
        j++;
      }
      i = j;
      continue;
    }
    // Length-prefixed segment
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    const drop =
      marker === 0xe1 || // APP1 (EXIF / XMP)
      marker === 0xe2 || // APP2 (ICC profile)
      marker === 0xed || // APP13 (IPTC / Photoshop)
      marker === 0xfe; // COM
    if (!drop) {
      out.push(0xff, marker);
      for (let k = 0; k < len; k++) out.push(bytes[i + 2 + k]);
    }
    i += 2 + len;
  }
  return new Uint8Array(out);
}

/** Count metadata-bearing JPEG APP/COM segments and parse EXIF fields. */
function analyzeJpeg(bytes: Uint8Array): {
  fields: MetaField[];
  metaBytes: number;
} {
  const fields: MetaField[] = [];
  let metaBytes = 0;
  let i = 2;
  const n = bytes.length;
  while (i < n - 3) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = bytes[i + 1];
    if (marker === 0xda || marker === 0xd9) break; // SOS or EOI → image data
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    const payload = bytes.subarray(i + 4, i + 4 + len - 2);
    if (marker === 0xe1 && isExifPayload(payload)) {
      metaBytes += len + 2;
      fields.push(...parseExifPayload(payload));
    } else if (
      (marker === 0xe1 && isAppXmp(payload)) ||
      marker === 0xed || // APP13 IPTC
      marker === 0xfe // COM
    ) {
      metaBytes += len + 2;
      fields.push({
        category: 'other',
        label: 'Embedded metadata',
        value: `${len} bytes`,
      });
    }
    i += 2 + len;
  }
  return { fields, metaBytes };
}

// ---- PNG chunk walk ----
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
function isPng(b: Uint8Array): boolean {
  return b.length >= 8 && PNG_SIG.every((v, k) => b[k] === v);
}
const TEXT_CHUNKS = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf']);

/** PNG lossless strip: keep IHDR/PLTE/IDAT/etc., drop text + eXIf chunks. */
function stripPng(bytes: Uint8Array): Uint8Array {
  const out: number[] = [...PNG_SIG];
  let i = 8;
  const n = bytes.length;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  while (i < n - 8) {
    const len = view.getUint32(i);
    const type = String.fromCharCode(...bytes.subarray(i + 4, i + 8));
    const chunkEnd = i + 12 + len;
    if (!TEXT_CHUNKS.has(type)) {
      for (let k = i; k < chunkEnd; k++) out.push(bytes[k]);
    }
    i = chunkEnd;
    if (type === 'IEND') break;
  }
  return new Uint8Array(out);
}

function analyzePng(bytes: Uint8Array): {
  fields: MetaField[];
  metaBytes: number;
} {
  const fields: MetaField[] = [];
  let metaBytes = 0;
  let i = 8;
  const n = bytes.length;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  while (i < n - 8) {
    const len = view.getUint32(i);
    const type = String.fromCharCode(...bytes.subarray(i + 4, i + 8));
    const chunkEnd = i + 12 + len;
    if (TEXT_CHUNKS.has(type)) {
      metaBytes += len + 12;
      if (type === 'tEXt') {
        const data = bytes.subarray(i + 8, i + 8 + len);
        const nul = data.indexOf(0);
        const key = String.fromCharCode(...data.subarray(0, nul));
        const val = String.fromCharCode(...data.subarray(nul + 1));
        const cat: MetaCategory = /date/i.test(key) ? 'date' : 'software';
        fields.push({ category: cat, label: key, value: val.slice(0, 80) });
      } else {
        fields.push({ category: 'other', label: type, value: `${len} bytes` });
      }
    }
    i = chunkEnd;
    if (type === 'IEND') break;
  }
  return { fields, metaBytes };
}

export function sniffFormat(bytes: Uint8Array): 'jpeg' | 'png' | 'other' {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  )
    return 'jpeg';
  if (isPng(bytes)) return 'png';
  return 'other';
}

export async function readMeta(file: File): Promise<MetaResult> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const format = sniffFormat(buf);
  let analyzed = { fields: [] as MetaField[], metaBytes: 0 };
  if (format === 'jpeg') analyzed = analyzeJpeg(buf);
  else if (format === 'png') analyzed = analyzePng(buf);
  return {
    format,
    fields: analyzed.fields,
    hasGps: analyzed.fields.some((f) => f.category === 'location'),
    metaBytes: analyzed.metaBytes,
  };
}

export async function stripMeta(file: File): Promise<StripResult | null> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const format = sniffFormat(buf);
  if (format === 'other') return null; // caller falls back to re-encode
  const stripped = format === 'jpeg' ? stripJpeg(buf) : stripPng(buf);
  const blob = new Blob([stripped], { type: file.type });
  const name =
    file.name.replace(/(\.[^.]+)?$/, (m, ext) => '-cleaned' + (ext || '')) ||
    'image-cleaned';
  return { file: new File([blob], name, { type: file.type }), lossless: true };
}
