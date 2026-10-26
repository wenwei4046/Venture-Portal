import { describe, expect, it } from 'vitest'
import { stagePath } from './library'
import { picFileHref, picPageFromRow } from './pic'
import { taskFromRow } from './task'
import { taskMap } from './taskmap'
import { workFromRow } from './tasks'

// 2026-10-24 — ②b-2e: a stage's own files uploaded (`Task Page.dc.html`'s *Drop the final cut here*), as mkt_project and
// mkt_pic_page read them (mig 20261025113000): the work's files, the PIC's own, the map's attachments.

const FINAL = { path: 'stage/30000000-0000-4000-8000-000000000001/final.png', name: 'RedTruck final.png', size: 2048, mime: 'image/png',
  field: 'Final image', by: 'Ali', at: '2026-10-25T01:00:00Z' }

describe('a stage’s files', () => {
  it('read with the work: each its name, size, type, field (none: the stage’s own Files), who and when', () => {
    expect(workFromRow({ notes: '', links: [], vals: {}, files: [FINAL, { path: 'stage/k/mood.pdf', size: '9', field: '' }, { name: 'no path' }] }).files).toEqual([
      FINAL,
      { path: 'stage/k/mood.pdf', name: 'mood.pdf', size: 9, mime: '', field: null, by: '', at: null },
    ])
    expect(workFromRow({ notes: 'x' }).files).toEqual([])
  })

  it('their place in the bucket: stage/<uuid>/<the name, tidied>', () => {
    expect(stagePath('RedTruck Reels v2.MP4', 'abc')).toBe('stage/abc/RedTruck-Reels-v2.mp4')
  })

  it('on the map, a stage’s station lists its files before its links — each signed at the click', () => {
    const page = taskFromRow({
      today: '2026-10-23', me: null, team: [], sub: null,
      project: { id: 'p1', trackId: 'TSK-CAR-2610-001', kind: 'quick', sub: 'sub', title: 'Reels', status: 'active', cur: 0, free: [] },
      stages: [{ project: 'p1', idx: 0, name: 'Edit', dept: '', owner: null, sla: 1, appr: [], spec: { form: [] }, status: 'accepted',
        work: { notes: '', links: [{ url: 'https://drive.google.com/x', label: 'Raw' }], vals: {}, files: [FINAL] } }],
      subtasks: [], events: [], series: null, holidays: [],
    })!
    expect(taskMap(page).stations.s0.files).toEqual([
      { name: 'RedTruck final.png', href: '/files/marketing/stage/30000000-0000-4000-8000-000000000001/final.png' },
      { name: 'Raw', href: 'https://drive.google.com/x' },
    ])
  })
})

describe('the PIC’s page', () => {
  const pageWith = (files: unknown) => picPageFromRow({
    track: 'MKT-CAR-2610-007', title: 'Post pack', status: 'approved', minutes: { title: 'Kickoff', fields: [] },
    work: [{ id: 'd1', title: 'Image post', status: 'active', stages: 2, done: 0, stage: { idx: 0, name: 'Design', status: 'review', ver: 1, waiting: true,
      fields: [{ name: 'Final image', type: 'File', value: null }], links: [], files } }],
  })
  it('the stage’s files they see — by key, never a path; anything else dropped', () => {
    const files = pageWith([
      { key: '30000000-0000-4000-8000-000000000001', name: 'final.png', size: 2048, mime: 'image/png', field: 'Final image' },
      { key: '30000000-0000-4000-8000-000000000003', name: 'Moodboard.pdf', size: '50000', mime: 'application/pdf', field: null },
      { key: 'stage/x/a.png', name: 'a path is no key' },
    ])?.work[0].stage?.files
    expect(files).toEqual([
      { key: '30000000-0000-4000-8000-000000000001', name: 'final.png', size: 2048, mime: 'image/png', field: 'Final image' },
      { key: '30000000-0000-4000-8000-000000000003', name: 'Moodboard.pdf', size: 50000, mime: 'application/pdf', field: null },
    ])
    expect(pageWith(undefined)?.work[0].stage?.files).toEqual([])
  })
  it('each opened through its own route on the link', () => {
    expect(picFileHref('0123456789abcdef0123456789abcdef', '30000000-0000-4000-8000-000000000001'))
      .toBe('/t/0123456789abcdef0123456789abcdef/f/30000000-0000-4000-8000-000000000001')
  })
})
