import { describe, expect, it } from 'vitest'
import { libraryFromRow, shareAddress, shareEnds, shareOf } from './library'
import { sharedBrandHref, sharedFileHref, sharedFromRow } from './share'

// 2026-10-24 — ⑥-3: a Library file's or folder's guest link — Marketing's side (mkt_library's shares) and the stranger's
// page (mkt_lib_shared).

const CODE = '0123456789abcdef0123456789abcdef'
const FILE = '30000000-0000-4000-8000-000000000001'

describe('a guest link in the Library', () => {
  const lib = libraryFromRow({
    shares: [
      { kind: 'file', id: FILE, code: CODE, download: false, expiry: '24h', expires: '2026-10-25T02:22:00Z' },
      { kind: 'folder', id: 'f2', code: 'nope', download: true, expiry: '7d', expires: null },
      { kind: 'folder', id: 'f3', code: CODE.replace('0', '1'), expiry: 'forever', expires: null },
    ],
  })

  it('keeps only real codes; what was picked, its end', () => {
    expect(lib.shares.map(s => `${s.kind}:${s.id}:${s.download}:${s.expiry}`)).toEqual([`file:${FILE}:false:24h`, 'folder:f3:true:7d'])
    expect(shareOf(lib, 'file', FILE)?.code).toBe(CODE)
    expect(shareOf(lib, 'folder', FILE)).toBeNull()
  })

  it('says its address and when it ends — the office’s time', () => {
    expect(shareAddress('https://erp.houzsventure.com/', CODE)).toBe(`https://erp.houzsventure.com/l/${CODE}`)
    expect(shareEnds('2026-10-25T02:22:00Z')).toBe('Expires Sun 25 Oct, 10:22')
    expect(shareEnds(null)).toBe('Never expires')
  })
})

describe('the stranger’s page', () => {
  it('reads what mkt_lib_shared answers — never more', () => {
    const page = sharedFromRow({
      kind: 'folder', name: 'Brandbook', folder: 'Brandbook', download: true, expires: null,
      sub: { name: 'Carres', code: 'CAR', emoji: '🛋️', dot: 'x', client: false, profile: { font: 'Playfair', name: 'Carres Living' } },
      files: [
        { id: FILE, name: 'Brief', ext: 'PDF', size: 2048, mime: 'application/pdf', at: '2026-10-24T01:00:00Z' },
        { id: 'not-an-id', name: 'x', ext: 'PDF', size: 1, mime: 'x' },
        { id: '30000000-0000-4000-8000-000000000002', name: 'Odd', ext: '../x', size: '9', mime: 'image/png' },
      ],
    })
    expect(page?.sub.profile.font).toBe('Playfair')
    expect(page?.files.map(f => `${f.name}:${f.ext}:${f.size}`)).toEqual(['Brief:PDF:2048', 'Odd:FILE:9'])
    expect([sharedFromRow(null), sharedFromRow({ kind: 'file' })]).toEqual([null, null])
  })

  it('fetches its files and its brand’s pictures through the link', () => {
    expect([sharedFileHref(CODE, FILE), sharedFileHref(CODE, FILE, true), sharedBrandHref(CODE, 'banner')])
      .toEqual([`/l/${CODE}/f/${FILE}`, `/l/${CODE}/f/${FILE}?download=1`, `/l/${CODE}/b/banner`])
  })
})
