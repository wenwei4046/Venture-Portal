import { describe, expect, it } from 'vitest'
import {
  binRows, extOf, fileKind, folderTiles, libHref, libraryFromRow, libraryPath, libView, linkHost, listedName, moveTargets, railCounts,
  sizeLabel, tidyFileName, typeChoices, viewFiles,
} from './library'

// 2026-10-23 — ⑥-1: the Library (`Library.dc.html`), read from mkt_library().

const T = { brand: 't1', photos: 't2', raw: 't3', minutes: 't4' }
const CAR = 's1'
const H2990 = 's2'
const lib = libraryFromRow({
  today: '2026-10-23',
  types: [
    { id: T.brand, name: 'Brandbook', color: 'oklch(0.55 0.12 300)', cat: 'Brand', link: false },
    { id: T.photos, name: 'Product photos', color: 'oklch(0.58 0.12 50)', cat: 'Photo', link: false },
    { id: T.raw, name: 'Raw footage', color: 'oklch(0.48 0.04 240)', cat: 'Video', link: true },
    { id: T.minutes, name: 'Meeting minutes', color: 'oklch(0.55 0.01 60)', cat: 'Minutes', link: false },
  ],
  subs: [
    { id: CAR, code: 'CAR', name: 'Carres', emoji: '🛋️', dot: 'x', client: false },
    { id: H2990, code: '2990', name: '2990 Home', emoji: '🏡', dot: 'y', client: false },
  ],
  folders: [
    { id: 'f1', sub: CAR, type: T.brand, url: null, at: '2026-10-02T02:00:00Z' },
    { id: 'f2', sub: CAR, type: T.photos, url: null, at: '2026-10-15T02:00:00Z' },
    { id: 'f3', sub: CAR, type: T.raw, url: 'https://drive.google.com/drive/folders/abc', at: '2026-10-15T02:00:00Z' },
    { id: 'f4', sub: H2990, type: T.brand, url: null, at: '2026-10-01T02:00:00Z' },
  ],
  files: [
    { id: 'x3', folder: 'f2', name: 'KJ showroom · wide', path: 'library/u3/kj.jpg', size: 1153434, mime: 'image/jpeg', by: 'Ah Kit', at: '2026-10-15T02:00:00Z' },
    { id: 'x2', folder: 'f1', name: 'Logo pack', path: 'library/u2/logo.zip', size: 20971520, mime: 'application/zip', by: 'Rachel', at: '2026-10-02T03:00:00Z' },
    { id: 'x1', folder: 'f4', name: '2990 brand sheet', path: 'library/u1/sheet.pdf', size: 1887437, mime: 'application/pdf', by: 'Rachel', at: '2026-10-01T03:00:00Z' },
  ],
  trash: [
    { kind: 'file', id: 'x9', name: 'Old logo draft', sub: CAR, type: T.brand, size: 100, by: 'Mei', at: '2026-10-16T00:00:00Z' },
    { kind: 'folder', id: 'f9', name: 'Meeting minutes', sub: H2990, type: T.minutes, n: 3, by: 'Mei', at: '2026-09-25T00:00:00Z' },
    'junk',
  ],
})

describe('the Library', () => {
  it('reads mkt_library()', () => {
    expect([lib.types.length, lib.subs.length, lib.folders.length, lib.files.length, lib.trash.length]).toEqual([4, 2, 4, 3, 2])
    expect(libraryFromRow(null).files).toEqual([])
    expect(libraryFromRow({ types: [{ id: 'z', cat: 'Memes' }] }).types[0].cat).toBe('Content')
  })

  it('opens where its address says — a subsidiary by its code, a folder, the Dustbin — and writes it back', () => {
    expect(libView(lib, {})).toEqual({ t: 'all' })
    expect(libView(lib, { co: 'car' })).toEqual({ t: 'co', sub: CAR })
    expect(libView(lib, { folder: 'f2' })).toEqual({ t: 'folder', sub: CAR, folder: 'f2' })
    expect(libView(lib, { bin: '1', co: 'CAR' })).toEqual({ t: 'bin' })
    expect(libView(lib, { co: 'NOPE', folder: 'nope' })).toEqual({ t: 'all' })
    expect(libHref(lib, { t: 'co', sub: CAR }, { cat: 'Brand', q: 'logo' })).toBe('/marketing/library?co=CAR&cat=Brand&q=logo')
    expect(libHref(lib, { t: 'all' })).toBe('/marketing/library')
    expect(libHref(lib, { t: 'bin' })).toBe('/marketing/library?bin=1')
  })

  it('shows a view’s files — every file under its folder type’s category; a search reaches every folder', () => {
    const names = (v: Parameters<typeof viewFiles>[1], f = { cat: null, q: '' } as Parameters<typeof viewFiles>[2]) => viewFiles(lib, v, f).map(x => x.name)
    expect(names({ t: 'all' })).toEqual(['KJ showroom · wide', 'Logo pack', '2990 brand sheet'])
    expect(names({ t: 'co', sub: CAR })).toEqual(['KJ showroom · wide', 'Logo pack'])
    expect(names({ t: 'folder', sub: CAR, folder: 'f1' })).toEqual(['Logo pack'])
    expect(names({ t: 'all' }, { cat: 'Brand', q: '' })).toEqual(['Logo pack', '2990 brand sheet'])
    expect(names({ t: 'co', sub: CAR }, { cat: null, q: 'BRAND' })).toEqual(['2990 brand sheet'])
    expect(names({ t: 'folder', sub: CAR, folder: 'f1' }, { cat: null, q: 'brand' })).toEqual([])
    expect(names({ t: 'bin' })).toEqual([])
  })

  it('counts the rail: files per subsidiary under the category picked, per category in the view’s reach', () => {
    expect(railCounts(lib, { t: 'all' }, null)).toEqual({ subs: { [CAR]: 2, [H2990]: 1 }, all: 3, cats: { Photo: 1, Brand: 2 }, catAll: 3 })
    expect(railCounts(lib, { t: 'co', sub: CAR }, 'Brand')).toEqual({ subs: { [CAR]: 1, [H2990]: 1 }, all: 2, cats: { Photo: 1, Brand: 1 }, catAll: 2 })
  })

  it('draws a subsidiary’s folders in the types’ order — a link folder says where it points', () => {
    expect(folderTiles(lib, CAR).map(t => `${t.type.name}: ${t.meta}`)).toEqual([
      'Brandbook: 1 file · updated 2 Oct',
      'Product photos: 1 file · updated 15 Oct',
      'Raw footage: Google Drive · link',
    ])
    expect(typeChoices(lib, CAR).map(c => `${c.type.name}${c.has ? ' (here)' : ''}`))
      .toEqual(['Brandbook (here)', 'Product photos (here)', 'Raw footage (here)', 'Meeting minutes'])
    expect([linkHost('https://www.dropbox.com/s/x'), linkHost('https://example.com/a'), linkHost('nope')]).toEqual(['Dropbox', 'example.com', 'Link'])
  })

  it('keeps the Dustbin’s days — a folder from its subsidiary, a file from its folder', () => {
    const now = Date.parse('2026-10-23T00:00:00Z')
    expect(binRows(lib, now).map(r => `${r.kind} ${r.name} · ${r.from} · ${r.left}d`)).toEqual([
      'file Old logo draft · Carres / Brandbook · 23d',
      'folder Meeting minutes · 2990 Home · 2d',
    ])
  })

  it('moves a file to any folder holding files, a folder to a subsidiary without one of its type', () => {
    expect(moveTargets(lib, 'file', 'x2').map(m => `${m.label}${m.off ? ' (off)' : ''}`))
      .toEqual(['Carres / Brandbook (off)', 'Carres / Product photos', '2990 Home / Brandbook'])
    expect(moveTargets(lib, 'folder', 'f2').map(m => `${m.label} · ${m.note}${m.off ? ' (off)' : ''}`)).toEqual(['Carres · 3 folders (off)', '2990 Home · 1 folder'])
    expect(moveTargets(lib, 'folder', 'f1').map(m => `${m.label} · ${m.note}${m.off ? ' (off)' : ''}`)).toEqual(['Carres · 3 folders (off)', '2990 Home · has one (off)'])
  })

  it('names a file’s look, its size and its place in the bucket', () => {
    expect([fileKind({ mime: 'video/mp4' }), fileKind({ mime: 'image/png' }), fileKind({ mime: 'application/pdf' })]).toEqual(['video', 'image', 'doc'])
    expect([extOf('Brand book.PDF'), extOf('notes'), extOf('a.tar.gz')]).toEqual(['PDF', 'FILE', 'GZ'])
    expect([sizeLabel(12), sizeLabel(862208), sizeLabel(4718592), sizeLabel(1288490189)]).toEqual(['12 B', '842 KB', '4.5 MB', '1.2 GB'])
    expect(tidyFileName('KJ showroom · wide (final).JPG')).toBe('KJ-showroom-wide-final.jpg')
    expect(tidyFileName('../../etc/passwd')).toBe('etc-passwd')
    expect(tidyFileName('日本語.pdf')).toBe('file.pdf')
    expect(libraryPath('Logo pack.zip', '00000000-0000-4000-8000-000000000001')).toBe('library/00000000-0000-4000-8000-000000000001/Logo-pack.zip')
    expect(listedName('Brand  book v3.pdf')).toBe('Brand book v3')
  })
})
