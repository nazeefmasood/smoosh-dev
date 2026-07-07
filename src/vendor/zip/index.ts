/**
 * Minimal dependency-free ZIP writer (STORE / no compression).
 *
 * Good enough for a favicon bundle (small files, no need to shrink). Produces
 * a fully valid .zip readable by every OS and browser. CRC32 + local headers
 * + central directory + EOCD.
 */

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function strBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function u16(n: number): [number, number] {
  return [n & 0xff, (n >>> 8) & 0xff];
}
function u32(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}

/** Build a ZIP archive from named byte entries (STORE method). */
export function zipFiles(entries: ZipEntry[]): Uint8Array {
  const chunks: number[] = [];
  const central: number[] = [];
  let offset = 0;
  const now = new Date();
  // DOS time/date (local)
  const dosTime =
    ((now.getHours() & 0x1f) << 11) |
    ((now.getMinutes() & 0x3f) << 5) |
    ((now.getSeconds() / 2) & 0x1f);
  const dosDate =
    ((((now.getFullYear() - 1980) & 0x7f) << 9) |
      (((now.getMonth() + 1) & 0xf) << 5) |
      (now.getDate() & 0x1f)) >
    0
      ? (((now.getFullYear() - 1980) & 0x7f) << 9) |
        (((now.getMonth() + 1) & 0xf) << 5) |
        (now.getDate() & 0x1f)
      : 0x21; // fallback: 1980-01-01

  for (const entry of entries) {
    const nameBytes = strBytes(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    // Local file header
    const local: number[] = [];
    local.push(...u32(0x04034b50));
    local.push(...u16(20)); // version needed
    local.push(...u16(0)); // flags
    local.push(...u16(0)); // method = store
    local.push(...u16(dosTime));
    local.push(...u16(dosDate));
    local.push(...u32(crc));
    local.push(...u32(size)); // compressed size
    local.push(...u32(size)); // uncompressed size
    local.push(...u16(nameBytes.length));
    local.push(...u16(0)); // extra length
    local.push(...nameBytes);

    chunks.push(...local, ...entry.data);

    // Central directory header
    central.push(...u32(0x02014b50));
    central.push(...u16(20)); // version made by
    central.push(...u16(20)); // version needed
    central.push(...u16(0)); // flags
    central.push(...u16(0)); // method
    central.push(...u16(dosTime));
    central.push(...u16(dosDate));
    central.push(...u32(crc));
    central.push(...u32(size));
    central.push(...u32(size));
    central.push(...u16(nameBytes.length));
    central.push(...u16(0)); // extra
    central.push(...u16(0)); // comment
    central.push(...u16(0)); // disk number start
    central.push(...u16(0)); // internal attrs
    central.push(...u32(0)); // external attrs
    central.push(...u32(offset));
    central.push(...nameBytes);

    offset += local.length + size;
  }

  const centralStart = offset;
  chunks.push(...central);
  const centralEnd = offset + central.length;

  // End of central directory
  const eocd: number[] = [];
  eocd.push(...u32(0x06054b50));
  eocd.push(...u16(0)); // disk
  eocd.push(...u16(0)); // disk with cd
  eocd.push(...u16(entries.length));
  eocd.push(...u16(entries.length));
  eocd.push(...u32(central.length));
  eocd.push(...u32(centralStart));
  eocd.push(...u16(0)); // comment length
  chunks.push(...eocd);

  void centralEnd;
  return new Uint8Array(chunks);
}
