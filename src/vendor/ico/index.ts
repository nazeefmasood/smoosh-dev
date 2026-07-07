/**
 * Minimal .ico packer. Encodes each size as a PNG and embeds it in an ICO
 * container (PNG-in-ICO is supported by Windows Vista+ and all modern
 * browsers). Input is an array of { size, pngBytes }.
 */

interface IcoInput {
  size: number;
  png: Uint8Array;
}

function u16le(n: number): [number, number] {
  return [n & 0xff, (n >>> 8) & 0xff];
}
function u32le(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}

export function buildIco(entries: IcoInput[]): Uint8Array {
  const out: number[] = [];
  // ICONDIR
  out.push(...u16le(0)); // reserved
  out.push(...u16le(1)); // type = icon
  out.push(...u16le(entries.length)); // count

  let offset = 6 + entries.length * 16;
  // ICONDIRENTRYs
  for (const e of entries) {
    const s = e.size >= 256 ? 0 : e.size; // 256 encoded as 0 (1 byte)
    out.push(s & 0xff); // width
    out.push(s & 0xff); // height
    out.push(0); // color count (0 = >=256)
    out.push(0); // reserved
    out.push(...u16le(1)); // planes
    out.push(...u16le(32)); // bpp
    out.push(...u32le(e.png.length)); // size
    out.push(...u32le(offset)); // offset
    offset += e.png.length;
  }
  // Image data
  for (const e of entries) out.push(...e.png);
  return new Uint8Array(out);
}
