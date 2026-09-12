/**
 * Minimal, dependency-free ZIP writer.
 *
 * Entries are stored (method 0) rather than deflated: everything we put in a
 * zip here is already-compressed image data, so deflate would cost CPU and
 * memory for ~0% gain. Zip64 records are emitted when an entry, the archive,
 * or the entry count outgrows the classic 32-bit fields, so very large batches
 * still produce a valid archive.
 *
 * Bytes are read one entry at a time and the original Blob is handed straight
 * to the output Blob, so the whole archive never has to sit in the JS heap.
 */

export interface ZipEntry {
  /** Path inside the archive. Forward slashes make folders. */
  name: string;
  blob: Blob;
}

const U32_MAX = 0xffffffff;
const U16_MAX = 0xffff;

let crcTable: Uint32Array | undefined;

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  crcTable = table;
  return table;
}

function crc32(bytes: Uint8Array): number {
  const table = getCrcTable();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = table[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** MS-DOS date/time pair, as used by the zip headers. */
function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/** Little-endian byte writer over a fixed-size buffer. */
class ByteWriter {
  private view: DataView;
  private offset = 0;
  readonly bytes: Uint8Array;

  constructor(size: number) {
    this.bytes = new Uint8Array(size);
    this.view = new DataView(this.bytes.buffer);
  }

  u16(value: number) {
    this.view.setUint16(this.offset, value, true);
    this.offset += 2;
  }

  u32(value: number) {
    this.view.setUint32(this.offset, value >>> 0, true);
    this.offset += 4;
  }

  /** 64-bit little-endian, written as two 32-bit halves. */
  u64(value: number) {
    this.view.setUint32(this.offset, value >>> 0, true);
    this.view.setUint32(this.offset + 4, Math.floor(value / 0x100000000), true);
    this.offset += 8;
  }

  raw(value: Uint8Array) {
    this.bytes.set(value, this.offset);
    this.offset += value.length;
  }
}

async function readBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') {
    return new Uint8Array(await blob.arrayBuffer());
  }
  // Safari < 14 and friends.
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsArrayBuffer(blob);
  });
}

interface CentralEntry {
  nameBytes: Uint8Array;
  crc: number;
  size: number;
  offset: number;
  time: number;
  date: number;
}

/**
 * Build a zip archive from `entries`.
 *
 * `onProgress` is called after each entry is added, so callers can show a
 * "zipping 3/40" style indicator for large batches.
 */
export async function createZip(
  entries: ZipEntry[],
  onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
  const encoder = new TextEncoder();
  const parts: BlobPart[] = [];
  const central: CentralEntry[] = [];
  const now = new Date();
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const { time, date } = dosDateTime(now);
    // CRC32 needs the whole entry in memory; it is released as soon as the
    // checksum is computed — the Blob itself is what gets written out.
    const crc = crc32(await readBytes(entry.blob));
    const size = entry.blob.size;
    const needsZip64 = size > U32_MAX;
    const extraLength = needsZip64 ? 20 : 0;

    const header = new ByteWriter(30 + nameBytes.length + extraLength);
    header.u32(0x04034b50); // local file header signature
    header.u16(needsZip64 ? 45 : 20); // version needed to extract
    header.u16(0x0800); // flags: UTF-8 filename
    header.u16(0); // method: stored
    header.u16(time);
    header.u16(date);
    header.u32(crc);
    header.u32(needsZip64 ? U32_MAX : size); // compressed size
    header.u32(needsZip64 ? U32_MAX : size); // uncompressed size
    header.u16(nameBytes.length);
    header.u16(extraLength);
    header.raw(nameBytes);
    if (needsZip64) {
      header.u16(0x0001); // Zip64 extended information
      header.u16(16);
      header.u64(size); // uncompressed
      header.u64(size); // compressed
    }

    parts.push(header.bytes, entry.blob);
    central.push({ nameBytes, crc, size, offset, time, date });
    offset += header.bytes.length + size;

    onProgress?.(central.length, entries.length);
  }

  const centralStart = offset;

  for (const entry of central) {
    const zip64Values: number[] = [];
    if (entry.size > U32_MAX) zip64Values.push(entry.size, entry.size);
    if (entry.offset > U32_MAX) zip64Values.push(entry.offset);
    const extraLength = zip64Values.length ? 4 + zip64Values.length * 8 : 0;

    const record = new ByteWriter(46 + entry.nameBytes.length + extraLength);
    record.u32(0x02014b50); // central directory header signature
    record.u16(extraLength ? 45 : 20); // version made by
    record.u16(extraLength ? 45 : 20); // version needed to extract
    record.u16(0x0800); // flags: UTF-8 filename
    record.u16(0); // method: stored
    record.u16(entry.time);
    record.u16(entry.date);
    record.u32(entry.crc);
    record.u32(entry.size > U32_MAX ? U32_MAX : entry.size); // compressed
    record.u32(entry.size > U32_MAX ? U32_MAX : entry.size); // uncompressed
    record.u16(entry.nameBytes.length);
    record.u16(extraLength);
    record.u16(0); // file comment length
    record.u16(0); // disk number start
    record.u16(0); // internal attributes
    record.u32(0); // external attributes
    record.u32(entry.offset > U32_MAX ? U32_MAX : entry.offset);
    record.raw(entry.nameBytes);
    if (extraLength) {
      record.u16(0x0001);
      record.u16(zip64Values.length * 8);
      for (const value of zip64Values) record.u64(value);
    }

    parts.push(record.bytes);
    offset += record.bytes.length;
  }

  const centralSize = offset - centralStart;
  const needsZip64End =
    central.length > U16_MAX || centralStart > U32_MAX || centralSize > U32_MAX;

  if (needsZip64End) {
    const end64 = new ByteWriter(56 + 20);
    end64.u32(0x06064b50); // Zip64 end of central directory record
    end64.u64(44); // size of this record, minus 12
    end64.u16(45); // version made by
    end64.u16(45); // version needed to extract
    end64.u32(0); // this disk
    end64.u32(0); // disk with central directory
    end64.u64(central.length);
    end64.u64(central.length);
    end64.u64(centralSize);
    end64.u64(centralStart);
    end64.u32(0x07064b50); // Zip64 end of central directory locator
    end64.u32(0); // disk with the Zip64 end record
    end64.u64(offset);
    end64.u32(1); // total number of disks
    parts.push(end64.bytes);
  }

  const end = new ByteWriter(22);
  end.u32(0x06054b50); // end of central directory record
  end.u16(0); // this disk
  end.u16(0); // disk with central directory
  end.u16(Math.min(central.length, U16_MAX));
  end.u16(Math.min(central.length, U16_MAX));
  end.u32(Math.min(centralSize, U32_MAX));
  end.u32(Math.min(centralStart, U32_MAX));
  end.u16(0); // comment length
  parts.push(end.bytes);

  return new Blob(parts, { type: 'application/zip' });
}

/**
 * Make `name` unique within `used`, inserting " (2)", " (3)"… before the
 * extension. Two sources called `photo.jpg` must not collapse into one entry.
 */
export function uniqueZipName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const slash = name.lastIndexOf('/');
  const dot = name.lastIndexOf('.');
  const hasExt = dot > slash + 1;
  const base = hasExt ? name.slice(0, dot) : name;
  const ext = hasExt ? name.slice(dot) : '';
  for (let i = 2; ; i++) {
    const candidate = `${base} (${i})${ext}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
}
