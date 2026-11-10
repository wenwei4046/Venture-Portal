import { describe, expect, it } from 'vitest'
import type { DataFile } from './agent'
import { checkedLabel, dcState, dcTree, extOf, freeName, hostOf, knowledgeReads, linkDue, readLine, slug, type DataFolder } from './data-center'

const file = (id: string, over: Partial<DataFile> = {}): DataFile => ({
  id, brandId: 'b1', category: '', kind: 'file', name: `${id}.pdf`, path: `files/x/${id}.pdf`, url: null, mime: 'application/pdf', sizeBytes: 1, ver: 1,
  validFrom: null, validUntil: null, status: 'active', updatedByName: 'Mei Ling', updatedAt: '2026-10-18T02:00:00Z', usedBy: [], folderId: null, ...over,
})
const folder = (id: string, parentId: string | null, name: string, brandId: string | null = 'b1'): DataFolder => ({ id, brandId, parentId, name, color: null, updatedAt: '' })
const brands = [{ id: 'b1', name: '2990s' }, { id: 'b2', name: 'Carress' }]
const folders = [folder('pr', null, 'Promotions'), folder('raya', 'pr', 'Raya 2026'), folder('cat', null, 'Catalogues'), folder('sh', null, 'Showrooms & hours', null)]

describe('dcTree', () => {
  const t = dcTree(brands, folders, [file('a', { folderId: 'raya' }), file('b', { folderId: 'pr' }), file('c'), file('d', { folderId: 'sh', brandId: null }), file('l', { kind: 'link' })])
  it('puts the brands first and Shared last, folders under them', () => {
    expect(t.roots.map(r => r.name)).toEqual(['2990s', 'Carress', 'Shared'])
    expect(t.kids('B:b1').map(k => k.name)).toEqual(['Catalogues', 'Promotions'])
    expect(t.kids('B:shared').map(k => k.name)).toEqual(['Showrooms & hours'])
  })
  it('counts the files in a folder and every folder under it, never a link', () => {
    expect([t.count('B:b1'), t.count('pr'), t.count('raya'), t.count('B:shared')]).toEqual([3, 2, 1, 1])
  })
  it('writes the path and the drawn link', () => {
    expect(t.pathOf('raya')).toBe('2990s / Promotions / Raya 2026')
    expect(t.linkOf('raya')).toBe('https://leadview.my/dc/2990s/promotions/raya-2026')
    expect(t.linkOf('sh', 'Showrooms and opening hours.docx')).toBe('https://leadview.my/dc/shared/showrooms-and-hours/showrooms-and-opening-hours')
  })
})

describe('the small parts', () => {
  it('slug', () => expect(slug(' Products & prices! ')).toBe('products-and-prices'))
  it('a file’s state, as drawn', () => {
    expect(dcState({ status: 'active', validUntil: '2026-10-31' }, '2026-11-01')).toMatchObject({ label: 'Expired', expired: true })
    expect(dcState({ status: 'paused', validUntil: null }, '2026-11-01').label).toBe('Paused')
    expect(dcState({ status: 'active', validUntil: '2026-11-02' }, '2026-11-01').label).toBe('Ends in 1 day')
    expect(dcState({ status: 'active', validUntil: '2026-11-15' }, '2026-11-01').label).toBe('Ends in 14 days')
    expect(dcState({ status: 'active', validUntil: '2026-11-16' }, '2026-11-01').label).toBe('In use')
  })
  it('the tiles', () => {
    expect(['a.pdf', 'b.xlsx', 'c.docx', 'd.PNG', 'e.zip'].map(n => extOf(n).ext)).toEqual(['PDF', 'XLS', 'DOC', 'JPG', 'ZIP'])
  })
  it('hostOf and checkedLabel', () => {
    expect(hostOf('https://carress.my/mattresses/')).toBe('carress.my/mattresses')
    const now = Date.parse('2026-11-01T04:00:00Z')
    expect(checkedLabel('2026-11-01T01:12:00Z', now)).toBe('Today 9:12')
    expect(checkedLabel('2026-10-31T01:12:00Z', now)).toBe('Yesterday')
    expect(checkedLabel(null, now)).toBe('Not yet')
  })
  it('a link is due once its frequency has passed', () => {
    const now = Date.parse('2026-11-01T04:00:00Z')
    expect(linkDue({ checkedAt: '2026-11-01T03:30:00Z', checkEvery: 'hour' }, now)).toBe(false)
    expect(linkDue({ checkedAt: '2026-11-01T02:30:00Z', checkEvery: 'hour' }, now)).toBe(true)
    expect(linkDue({ checkedAt: null, checkEvery: 'week' }, now)).toBe(true)
  })
  it('a free name for a new folder', () => expect(freeName(['Untitled folder', 'untitled folder 2'])).toBe('Untitled folder 3'))
})

describe('knowledgeReads', () => {
  const files = [file('a', { folderId: 'raya' }), file('b', { folderId: 'pr' }), file('c', { folderId: 'cat' }), file('l', { kind: 'link' })]
  it('reads a folder’s files and its folders’, each once, a file picked on its own unpaused', () => {
    const r = knowledgeReads([{ kind: 'folder', ref: 'pr', paused: true }, { kind: 'file', ref: 'a', paused: false }, { kind: 'link', ref: 'l', paused: false }], files, folders)
    // b sits in Promotions, right above a (v3 § 5: a pick reads the line above it), so a's pick reads it unpaused.
    expect(r.map(x => [x.file.id, x.paused]).sort()).toEqual([['a', false], ['b', false], ['l', false]])
  })
})

// Lead View v3 § 5: picking deep in the Data Center reads the whole line above the pick, never the folders beside it.
describe('readLine', () => {
  const tree = [folder('sofa', null, 'Sofa'), folder('s2', 'sofa', '2 seater'), folder('s3', 'sofa', '3 seater'), folder('push', 's3', 'Pushback'),
    folder('slide', 's3', 'Slide out'), folder('ma', 'push', 'Model A'), folder('mb', 'push', 'Model B')]
  const fs = [file('root'), file('care', { folderId: 'sofa' }), file('two', { folderId: 's2' }), file('size', { folderId: 's3' }), file('how', { folderId: 'push' }),
    file('spec', { folderId: 'ma' }), file('price', { folderId: 'ma' }), file('bspec', { folderId: 'mb' }), file('other', { brandId: 'b2' })]
  it('a folder: every level’s own files, then everything in it; the folders beside the line are named, not read', () => {
    const line = readLine({ kind: 'folder', ref: 'ma' }, fs, tree)
    expect(line.map(l => [l.name, l.files.map(f => f.id), l.skipped])).toEqual([
      ['', ['root'], []], ['Sofa', ['care'], ['2 seater']], ['3 seater', ['size'], ['Slide out']], ['Pushback', ['how'], ['Model B']], ['Model A', ['spec', 'price'], []]])
  })
  it('a file: its folder’s level reads that file alone', () => {
    expect(readLine({ kind: 'file', ref: 'spec' }, fs, tree).at(-1)!.files.map(f => f.id)).toEqual(['spec'])
    expect(readLine({ kind: 'file', ref: 'root' }, fs, tree).map(l => l.files.map(f => f.id))).toEqual([['root']])
  })
  it('knowledgeReads takes the line too, never another branch or brand', () => {
    const r = knowledgeReads([{ kind: 'folder', ref: 'ma', paused: false }], fs, tree).map(x => x.file.id).sort()
    expect(r).toEqual(['care', 'how', 'price', 'root', 'size', 'spec'])
  })
})
