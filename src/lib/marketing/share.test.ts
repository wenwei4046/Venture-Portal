import { describe, expect, it } from 'vitest'
import { boardFromRow } from './board'
import { attachTasks, libraryFromRow, shareAddress, shareEnds, shareOf, taskFilesFromRow } from './library'
import { sharedBrandHref, sharedFileHref, sharedFromRow } from './share'

// 2026-10-23 — ⑥-3: a Library file's or folder's guest link — Marketing's side (mkt_library's shares) and the stranger's
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

// 2026-10-23 — ⑥-4: a Library file on a task.
describe('a Library file on a task', () => {
  it('reads a task’s files — only the Library’s own places', () => {
    expect(taskFilesFromRow([
      { id: FILE, name: 'Brief', path: `library/${FILE}/brief.pdf`, size: 2048, mime: 'application/pdf', folder: 'Brandbook', by: 'Mei', at: '2026-10-24T01:00:00Z' },
      { id: 'x', name: 'Elsewhere', path: 'brand/x/logo.png' },
      'junk',
    ]).map(f => `${f.name} · ${f.folder} · ${f.by}`)).toEqual(['Brief · Brandbook · Mei'])
  })

  it('offers each subsidiary’s open tasks — quick ones and recurring runs, newest first; never a series, a product project, a closed one', () => {
    const CAR = '10000000-0000-0000-0000-000000000001'
    const HK = '10000000-0000-0000-0000-000000000004'
    const id = (n: number) => `20000000-0000-0000-0000-00000000000${n}`
    const board = boardFromRow({
      subs: [{ id: CAR, code: 'CAR', name: 'Carres' }, { id: HK, code: 'HK', name: 'Hookka' }],
      projects: [
        { id: id(1), trackId: 'TSK-CAR-2610-001', kind: 'quick', sub: CAR, title: 'Banner', status: 'active', cur: 1 },
        { id: id(2), trackId: 'TSK-CAR-2610-002', kind: 'quick', sub: CAR, title: 'Reel', status: 'active', cur: 0 },
        { id: id(3), trackId: 'MKT-CAR-2610-003', kind: 'product', sub: CAR, title: 'Year-End Video', status: 'active', cur: 0 },
        { id: id(4), trackId: 'RCR-CAR-2610-004', kind: 'recurring', sub: CAR, title: 'Weekly reel', status: 'active', cur: 0, recur: { runs: [], status: 'active' } },
        { id: id(5), trackId: 'RCR-CAR-2610-004-R01', kind: 'recurring', sub: CAR, title: 'Weekly reel', status: 'active', cur: 0, series: id(4), run: 1 },
        { id: id(6), trackId: 'TSK-CAR-2610-006', kind: 'quick', sub: CAR, title: 'Done one', status: 'done', cur: 0 },
        { id: id(7), trackId: 'TSK-HK-2610-001', kind: 'quick', sub: HK, title: 'Ad copy', status: 'active', cur: 0 },
      ],
      stages: [
        { project: id(1), idx: 0, name: 'Draft', status: 'done' },
        { project: id(1), idx: 1, name: 'Publish', status: 'accepted' },
        { project: id(2), idx: 0, name: 'Shoot', status: 'todo' },
        { project: id(5), idx: 0, name: 'Plan', status: 'accepted' },
      ],
    })
    const tasks = attachTasks(board)
    expect(tasks[CAR].map(t => `${t.trackId} ${t.title} · ${t.stage}`))
      .toEqual(['TSK-CAR-2610-002 Reel · Shoot', 'TSK-CAR-2610-001 Banner · Publish', 'RCR-CAR-2610-004-R01 Weekly reel · Plan'])
    expect(tasks[HK].map(t => t.trackId)).toEqual(['TSK-HK-2610-001'])
  })
})
