import { describe, expect, it } from 'vitest'
import { boardFromRow } from './board'
import { cleanPath, deleteNote, driveHref, driveLevel, fileLook, folderMeta, matches, withoutDeleted } from './drive'
import { projectRows } from './projects'

// Projects as a Drive (2026-11-17 — docs/design_handoff_workflow_projects/ › 2): the levels, the counts of the level
// shown, a search over the level and below, the path kept only where it is real, what a delete takes off the page.

const MEI = '00000000-0000-0000-0000-00000000000a'
const CAR = '10000000-0000-0000-0000-000000000001'
const HK = '10000000-0000-0000-0000-000000000004'
const id = (n: number) => `20000000-0000-0000-0000-${String(n).padStart(12, '0')}`

const driveBoard = boardFromRow({
  today: '2026-11-17',
  team: [{ id: MEI, full: 'Mei Ling', first: 'Mei' }],
  subs: [{ id: CAR, code: 'CAR', name: 'Carres', emoji: '🛋️', dot: '#3b82f6' }, { id: HK, code: 'HK', name: 'Hookka' }],
  projects: [
    { id: id(1), trackId: 'MKT-CAR-2611-001', kind: 'product', sub: CAR, title: 'Year-End Package', status: 'active', updatedAt: '2026-11-16T01:00:00Z' },
    { id: id(2), trackId: 'MKT-CAR-2611-001-D01', kind: 'deliverable', sub: CAR, parent: id(1), title: 'Reels video 1/2', status: 'active', cur: 0, updatedAt: '2026-11-16T02:00:00Z' },
    { id: id(3), trackId: 'MKT-CAR-2611-001-D02', kind: 'deliverable', sub: CAR, parent: id(1), title: 'Poster 1/1', status: 'done', updatedAt: '2026-11-15T02:00:00Z' },
    { id: id(4), trackId: 'TSK-CAR-2611-002', kind: 'quick', sub: CAR, title: 'Meta Ads × 1', qType: 'ads', status: 'active', cur: 0, updatedAt: '2026-11-17T01:00:00Z' },
    { id: id(5), trackId: 'TSK-CAR-2611-003', kind: 'quick', sub: CAR, title: 'Old banner', qType: 'social', status: 'done', updatedAt: '2026-11-10T01:00:00Z' },
    { id: id(6), trackId: 'TSK-HK-2611-001', kind: 'quick', sub: HK, title: 'Rug video', qType: 'content', status: 'active', cur: 0, updatedAt: '2026-11-14T01:00:00Z' },
  ],
  stages: [
    { project: id(2), idx: 0, name: 'Edit', owner: MEI, status: 'accepted', dueOn: '2026-11-12' },
    { project: id(4), idx: 0, name: 'Run', owner: MEI, status: 'accepted', dueOn: '2026-11-20' },
    { project: id(6), idx: 0, name: 'Shoot', owner: MEI, status: 'accepted', dueOn: '2026-11-25' },
  ],
})

describe('Projects as a Drive', () => {
  const rows = projectRows(driveBoard)
  const subs = driveBoard.subs
  const root = { sub: null, project: null }

  it('the root: one folder a subsidiary, its items at its own level and anything late in it', () => {
    const lv = driveLevel(rows, subs, root, 'all', '')
    expect(lv.level).toBe('root')
    expect(lv.subFolders.map(f => [f.sub.code, f.items, f.late])).toEqual([['CAR', 3, 1], ['HK', 1, 0]])
    expect(lv.files).toEqual([])
    // Counted at this level: projects and tasks, never a project's deliverables.
    expect(lv.counts).toEqual({ open: 3, done: 1, all: 4 })
    expect(driveLevel(rows, subs, root, 'open', '').subFolders.map(f => f.items)).toEqual([2, 1])
  })

  it('a subsidiary: its product projects are folders, its tasks files — counted there', () => {
    const lv = driveLevel(rows, subs, { sub: 'CAR', project: null }, 'open', '')
    expect(lv.level).toBe('sub')
    expect(lv.folders.map(r => r.trackId)).toEqual(['MKT-CAR-2611-001'])
    expect(lv.files.map(r => r.trackId)).toEqual(['TSK-CAR-2611-002'])
    expect(lv.counts).toEqual({ open: 2, done: 1, all: 3 })
    expect(folderMeta(rows, lv.folders[0])).toMatch(/ · 2 tasks$/)
  })

  it('a project: its tasks are files, counted there', () => {
    const lv = driveLevel(rows, subs, { sub: 'CAR', project: id(1) }, 'all', '')
    expect(lv.level).toBe('project')
    expect(lv.project?.title).toBe('Year-End Package')
    expect(lv.files.map(r => r.title)).toEqual(['Reels video 1/2', 'Poster 1/1'])
    expect(lv.counts).toEqual({ open: 1, done: 1, all: 2 })
    expect(driveLevel(rows, subs, { sub: 'CAR', project: id(1) }, 'done', '').files.map(r => r.title)).toEqual(['Poster 1/1'])
  })

  it('a search looks at the level and everything under it, flat — by Track ID, title or person', () => {
    const lv = driveLevel(rows, subs, { sub: 'CAR', project: null }, 'all', 'video')
    expect(lv.searching).toBe(true)
    expect(lv.files.map(r => r.title)).toEqual(['Reels video 1/2'])
    expect(driveLevel(rows, subs, root, 'all', 'video').files.map(r => r.title).sort()).toEqual(['Reels video 1/2', 'Rug video'])
    expect(driveLevel(rows, subs, root, 'all', 'MKT-CAR').folders.map(r => r.trackId)).toEqual(['MKT-CAR-2611-001'])
    expect(matches(rows.find(r => r.id === id(4))!, 'mei')).toBe(true)
  })

  it('the path is kept only where it is real', () => {
    expect(cleanPath(rows, subs, 'car', id(1))).toEqual({ sub: 'CAR', project: id(1) })
    expect(cleanPath(rows, subs, 'CAR', 'MKT-CAR-2611-001')).toEqual({ sub: 'CAR', project: id(1) })
    expect(cleanPath(rows, subs, 'HK', id(1))).toEqual({ sub: 'HK', project: null })
    expect(cleanPath(rows, subs, 'CAR', id(4))).toEqual({ sub: 'CAR', project: null })
    expect(cleanPath(rows, subs, 'NOPE', id(1))).toEqual({ sub: null, project: null })
    expect(driveHref({ sub: 'CAR', project: id(1) })).toBe(`/marketing/projects?sub=CAR&p=${id(1)}`)
    expect(driveHref({ sub: null, project: id(1) })).toBe('/marketing/projects')
  })

  it('a file’s look, and what a delete takes and says', () => {
    expect(fileLook(rows.find(r => r.id === id(4))!).emoji).toBe('📈')
    expect(fileLook(rows.find(r => r.id === id(6))!).emoji).toBe('🎞️')
    expect(fileLook(rows.find(r => r.id === id(5))!).emoji).toBe('🖼️')
    expect(withoutDeleted(rows, id(1)).map(r => r.id).sort()).toEqual([id(4), id(5), id(6)])
    expect(deleteNote(rows.find(r => r.id === id(1))!)).toBe('Deletes the project and every task inside it. You can undo for 6 seconds.')
    expect(deleteNote(rows.find(r => r.id === id(4))!)).toBe('You can undo for 6 seconds.')
  })
})
