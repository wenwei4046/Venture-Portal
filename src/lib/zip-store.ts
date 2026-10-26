/**
 * A ZIP whose files are STORED (not compressed), made as a Blob of parts: each file's bytes stay the Blob they came as —
 * a fetched file's body, which the browser may keep on disk — and only its CRC is read, a slice at a time, so a folder's
 * ZIP never sits whole in the page's memory (jszip's `generateAsync` holds it two or three times over). No ZIP64: each
 * file and the whole under 4 GB, 65,535 files at most — refused past either. Names in UTF-8 (flag bit 11).
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

/** The ZIP's CRC-32, carried on from `crc` over `bytes`. */
export function crc32(bytes: Uint8Array, crc = 0): number {
  let c = (crc ^ 0xffffffff) >>> 0
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** A moment the ZIP's way (MS-DOS): the local day and time, two seconds at a time, 1980 to 2107 — before or unreadable,
 * 1 Jan 1980; after, the last moment of 2107. */
export function dosTime(d: Date): { time: number; date: number } {
  const y = d.getFullYear()
  if (!Number.isFinite(y) || y < 1980) return { time: 0, date: (1 << 5) | 1 }
  if (y > 2107) return { time: (23 << 11) | (59 << 5) | 29, date: (127 << 9) | (12 << 5) | 31 }
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((y - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  }
}

const SLICE = 8 * 1024 * 1024
const MAX_U32 = 0xffffffff
const MAX_FILES = 0xffff
const UTF8 = 0x0800

/** A ZIP made a file at a time: `add` each (its CRC read as it goes), then `finish` for the Blob. */
export function createZip() {
  const parts: BlobPart[] = []
  const central: Uint8Array<ArrayBuffer>[] = []
  const enc = new TextEncoder()
  let offset = 0
  return {
    async add(name: string, data: Blob, at: Date = new Date()): Promise<void> {
      if (central.length >= MAX_FILES) throw new Error('A ZIP of this kind holds 65,535 files at most.')
      const bytes = enc.encode(name)
      if (!bytes.length || bytes.length > 0xffff) throw new Error(`A file's name in a ZIP is 1 to 65,535 bytes: "${name}".`)
      let crc = 0
      for (let from = 0; from < data.size; from += SLICE) crc = crc32(new Uint8Array(await data.slice(from, from + SLICE).arrayBuffer()), crc)
      const size = data.size
      if (offset + 30 + bytes.length + size > MAX_U32) throw new Error('A ZIP of this kind stops at 4 GB.')
      const { time, date } = dosTime(at)

      const local = new Uint8Array(30 + bytes.length)
      const l = new DataView(local.buffer)
      l.setUint32(0, 0x04034b50, true)
      l.setUint16(4, 20, true)
      l.setUint16(6, UTF8, true)
      l.setUint16(8, 0, true)
      l.setUint16(10, time, true)
      l.setUint16(12, date, true)
      l.setUint32(14, crc, true)
      l.setUint32(18, size, true)
      l.setUint32(22, size, true)
      l.setUint16(26, bytes.length, true)
      l.setUint16(28, 0, true)
      local.set(bytes, 30)

      const head = new Uint8Array(46 + bytes.length)
      const c = new DataView(head.buffer)
      c.setUint32(0, 0x02014b50, true)
      c.setUint16(4, 20, true)
      c.setUint16(6, 20, true)
      c.setUint16(8, UTF8, true)
      c.setUint16(10, 0, true)
      c.setUint16(12, time, true)
      c.setUint16(14, date, true)
      c.setUint32(16, crc, true)
      c.setUint32(20, size, true)
      c.setUint32(24, size, true)
      c.setUint16(28, bytes.length, true)
      c.setUint32(42, offset, true)
      head.set(bytes, 46)

      parts.push(local, data)
      central.push(head)
      offset += local.length + size
    },
    finish(): Blob {
      const size = central.reduce((t, h) => t + h.length, 0)
      if (offset + size + 22 > MAX_U32) throw new Error('A ZIP of this kind stops at 4 GB.')
      const end = new Uint8Array(22)
      const e = new DataView(end.buffer)
      e.setUint32(0, 0x06054b50, true)
      e.setUint16(8, central.length, true)
      e.setUint16(10, central.length, true)
      e.setUint32(12, size, true)
      e.setUint32(16, offset, true)
      return new Blob([...parts, ...central, end], { type: 'application/zip' })
    },
  }
}
