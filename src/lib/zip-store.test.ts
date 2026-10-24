import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { crc32, createZip, dosTime } from './zip-store'

// 2026-10-25 — gap 221: a folder's ZIP made in the browser without holding the folder in the page's memory — each
// file's Blob kept as it came, only its CRC read, a slice at a time; stored, its names in UTF-8.

const bytes = (s: string) => new TextEncoder().encode(s)

describe('the ZIP’s CRC-32', () => {
  it('is the standard one, carried on across pieces', () => {
    expect(crc32(bytes('123456789'))).toBe(0xcbf43926)
    expect(crc32(bytes('6789'), crc32(bytes('12345')))).toBe(0xcbf43926)
    expect(crc32(new Uint8Array(0))).toBe(0)
  })
})

describe('a moment the ZIP’s way', () => {
  it('is the local day and time, two seconds at a time', () => {
    expect(dosTime(new Date(2026, 9, 25, 3, 41, 17))).toEqual({ time: (3 << 11) | (41 << 5) | 8, date: (46 << 9) | (10 << 5) | 25 })
  })
  it('holds 1980 to 2107 — before or unreadable is 1 Jan 1980', () => {
    expect(dosTime(new Date(1975, 0, 1))).toEqual({ time: 0, date: (1 << 5) | 1 })
    expect(dosTime(new Date(Number.NaN))).toEqual({ time: 0, date: (1 << 5) | 1 })
    expect(dosTime(new Date(2200, 0, 1)).date).toBe((127 << 9) | (12 << 5) | 31)
  })
})

describe('a ZIP made a file at a time', () => {
  it('reads back whole — names, bytes, days, every CRC checked — and stores, not squeezes', async () => {
    // Past one 8 MB slice, so the CRC is carried from one slice to the next.
    const big = new Uint8Array(8 * 1024 * 1024 + 4099)
    for (let i = 0; i < big.length; i++) big[i] = (i * 31 + 7) & 0xff
    const files: [string, Blob, Date][] = [
      ['Logo pack.zip', new Blob([bytes('the logo pack')]), new Date(2026, 9, 2, 9, 30, 0)],
      ['简报 · brief.pdf', new Blob([bytes('%PDF-1.4 brief')]), new Date(2026, 9, 24, 18, 5, 42)],
      ['empty.txt', new Blob([]), new Date(2026, 0, 1, 0, 0, 0)],
      ['KJ showroom.mp4', new Blob([big]), new Date(2026, 9, 25, 1, 2, 4)],
    ]
    const zip = createZip()
    for (const [name, data, at] of files) await zip.add(name, data, at)
    const blob = zip.finish()
    expect(blob.type).toBe('application/zip')
    const nameBytes = files.map(([n]) => bytes(n).length)
    // Every byte accounted for: a header and the bytes as they were, each file's line in the directory, its end.
    expect(blob.size).toBe(files.reduce((t, [, d], i) => t + 30 + nameBytes[i] + d.size + 46 + nameBytes[i], 0) + 22)

    const buf = await blob.arrayBuffer()
    expect(new DataView(buf).getUint32(0, true)).toBe(0x04034b50)
    expect(new DataView(buf).getUint16(6, true)).toBe(0x0800)
    expect(new DataView(buf).getUint16(8, true)).toBe(0)

    const read = await JSZip.loadAsync(buf, { checkCRC32: true })
    expect(Object.keys(read.files)).toEqual(files.map(([n]) => n))
    expect(await read.file('Logo pack.zip')!.async('string')).toBe('the logo pack')
    expect(await read.file('简报 · brief.pdf')!.async('string')).toBe('%PDF-1.4 brief')
    expect(await read.file('empty.txt')!.async('string')).toBe('')
    expect(Buffer.from(await read.file('KJ showroom.mp4')!.async('uint8array')).equals(Buffer.from(big))).toBe(true)
    // The ZIP keeps the local day and time, as Windows and 7-Zip read it; jszip hands it back as UTC fields.
    const at = read.file('简报 · brief.pdf')!.date
    expect([at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate(), at.getUTCHours(), at.getUTCMinutes(), at.getUTCSeconds()]).toEqual([2026, 9, 24, 18, 5, 42])
  })

  it('is an empty ZIP with nothing added', async () => {
    const blob = createZip().finish()
    expect(blob.size).toBe(22)
    expect(Object.keys((await JSZip.loadAsync(await blob.arrayBuffer())).files)).toEqual([])
  })

  it('refuses a 65,536th file and a nameless one', async () => {
    const zip = createZip()
    const none = new Blob([])
    for (let i = 0; i < 0xffff; i++) await zip.add(`f${i}`, none)
    await expect(zip.add('one more', none)).rejects.toThrow('65,535 files at most')
    await expect(createZip().add('', none)).rejects.toThrow('1 to 65,535 bytes')
  })
})
