import { describe, expect, it } from 'vitest'
import { auditRows, projectLogFromRow } from './audit'
import { subtaskPath } from './library'
import { eventText, sizeText, subtaskView, taskFromRow, taskView } from './task'
import { boxOf, edgePath, taskMap } from './taskmap'

// 2026-10-24 — ②b-2c: a stage's subtasks (`Task Page.dc.html` › ✂️ Split into subtasks, Review delivery; `Task Map.dc.html`'s
// subtask station), as mkt_project reads them (mig 20261025101000) and as each viewer is offered them.

const MEI = 's-mei'
const SITI = 's-siti'
const AINA = 's-aina'
const RACHEL = 's-rachel'
const team = [
  { id: RACHEL, user: 'u1', full: 'RACHEL TAN', first: 'Rachel', title: 'MARKETING MANAGER', team: null, role: null, color: null, capacity: 5 },
  { id: MEI, user: 'u2', full: 'MEI LING', first: 'Mei', title: 'VIDEOGRAPHER & VIDEO EDITOR', team: null, role: null, color: null, capacity: 5 },
  { id: SITI, user: 'u3', full: 'SITI AMINAH', first: 'Siti', title: 'GRAPHIC DESIGNER', team: null, role: null, color: null, capacity: 5 },
  { id: AINA, user: 'u4', full: 'AINA ZAKI', first: 'Aina', title: 'GRAPHIC DESIGNER', team: null, role: null, color: null, capacity: 5 },
]
const stage = (idx: number, over: Record<string, unknown>) => ({
  project: 'p1', idx, name: ['Edit', 'Final'][idx], dept: 'VIDEOGRAPHER & VIDEO EDITOR', mode: 'person', owner: [MEI, RACHEL][idx],
  cands: [], sla: 2, appr: [], split: idx === 0, spec: { form: [] }, work: {}, startsOn: '2026-10-21', dueOn: ['2026-10-25', '2026-10-27'][idx],
  status: 'planned', apprIdx: 0, ver: 0, changes: null, ...over,
})
const SRT = { path: 'subtask/00000000-0000-4000-8000-000000000001/subtitles_BM_EN.srt', name: 'subtitles_BM_EN.srt', size: 2048, mime: 'application/x-subrip' }
const sub = (id: string, over: Record<string, unknown>) => ({
  id, project: 'p1', stage: 0, title: 'Subtitles BM + EN', assignee: SITI, dueOn: '2026-10-24', status: 'working', returns: 0, delivery: {}, ...over,
})
const row = (subtasks: Record<string, unknown>[], over: { me?: string; stage0?: Record<string, unknown>; events?: Record<string, unknown>[] } = {}) => ({
  today: '2026-10-23',
  me: over.me ?? MEI,
  team,
  sub: { id: 'sub', code: 'CAR', name: 'Carres', dot: 'x', emoji: '🛋️', client: false, pic: 'Kelvin' },
  project: { id: 'p1', trackId: 'MKT-CAR-2610-007-D01', kind: 'deliverable', sub: 'sub', title: 'Red Truck Reels', status: 'active', owner: RACHEL, cur: 0,
    startsOn: '2026-10-21', dueOn: '2026-10-27', createdBy: 'Rachel Tan', free: [] },
  stages: [stage(0, { status: 'accepted', ...over.stage0 }), stage(1, { appr: [{ kind: 'person', staff: RACHEL }] })],
  subtasks,
  events: over.events ?? [],
  series: null,
  holidays: [],
})
const STAFF = { edit: true, approve: false, manage: false }
const MANAGER = { edit: true, approve: true, manage: true }
const VIEW = { edit: false, approve: false, manage: false }

describe('a stage’s subtasks on the task page', () => {
  it('reads a delivery as the database answers it', () => {
    const page = taskFromRow(row([sub('t1', { status: 'ready', delivery: { v: 2, files: [SRT], links: [{ url: 'https://drive.google.com/x', label: '' }], note: 'BM + EN', at: '2026-10-23T03:00:00Z' } }),
      sub('t2', { title: 'Thumbnail', assignee: AINA })]))!
    expect(page.subtasks.map(t => [t.id, t.delivery])).toEqual([
      ['t1', { v: 2, files: [SRT], links: [{ url: 'https://drive.google.com/x', label: '' }], note: 'BM + EN', at: '2026-10-23T03:00:00Z' }],
      ['t2', null],
    ])
  })

  it('the stage’s owner: the list, ✂️ Split, Review delivery and Take back', () => {
    const page = taskFromRow(row([sub('t1', { status: 'ready', delivery: { v: 1, files: [SRT], links: [], note: null, at: null } }),
      sub('t2', { title: 'Thumbnail', assignee: AINA, status: 'revising', returns: 1 }), sub('t3', { title: 'Teaser', status: 'approved' }),
      sub('t4', { title: 'Late one', dueOn: '2026-10-21' })], { stage0: { work: { notes: 'Cut both reels' } } }))!
    const v = subtaskView(page, STAFF)!
    expect([v.stage, v.stageDue, v.canSplit, v.alert]).toEqual(['Edit', '2026-10-25', true, null])
    expect(v.rows.map(r => [r.title, r.who, r.due, r.label, r.tone, r.canReview, r.canRemove, r.mine])).toEqual([
      ['Subtitles BM + EN', 'Siti', 'Due 24 Oct', 'Ready', 'waiting', true, true, false],
      ['Thumbnail', 'Aina', 'Due 24 Oct', 'Returned 1× · Aina is revising', 'waiting', false, true, false],
      ['Teaser', 'Siti', 'Due 24 Oct', 'Approved', 'done', false, false, false],
      ['Late one', 'Siti', 'Due 21 Oct', 'Overdue 2 days', 'red', false, true, false],
    ])
    const tv = taskView(page, STAFF)
    expect([tv.subsOut, tv.actions, tv.note, tv.noteRed]).toEqual([3, [{ key: 'complete', label: 'Complete stage', disabled: true }], '3 subtasks not approved yet', true])
  })

  it('…only while it works the stage, on a stage that splits — Marketing · Edit', () => {
    expect(subtaskView(taskFromRow(row([], { stage0: { split: false } }))!, STAFF)).toBeNull()
    expect(subtaskView(taskFromRow(row([], { stage0: { status: 'todo' } }))!, STAFF)).toBeNull()
    expect(subtaskView(taskFromRow(row([]))!, VIEW)).toBeNull()
    const inReview = subtaskView(taskFromRow(row([sub('t1', { status: 'ready' })], { stage0: { status: 'review' } }))!, STAFF)!
    expect([inReview.canSplit, inReview.rows[0].canReview, inReview.rows[0].canRemove]).toEqual([false, false, false])
  })

  it('the assignee: their own to deliver, the reason it came back; delivered — waiting for the owner', () => {
    const events = [{ id: 9, at: '2026-10-23T02:00:00Z', actor: 'Mei', action: 'delivery returned', stage: 0, stageName: 'Edit', fromTo: 'Siti',
      reason: 'Fix the timing at 0:42', version: 'v1', data: { subtask: 't1', title: 'Subtitles BM + EN', returns: 1 } }]
    const revising = subtaskView(taskFromRow(row([sub('t1', { status: 'revising', returns: 1 })], { me: SITI, events }))!, STAFF)!
    expect([revising.canSplit, revising.rows.map(r => [r.mine, r.returned, r.canReview])]).toEqual([false, [[true, 'Fix the timing at 0:42', false]]])
    const ready = subtaskView(taskFromRow(row([sub('t1', { status: 'ready', delivery: { v: 2, files: [], links: [], note: 'x', at: null } })], { me: SITI }))!, STAFF)!
    expect(ready.rows.map(r => [r.mine, r.label])).toEqual([[false, 'Delivered v2 · waiting for Mei']])
    expect(subtaskView(taskFromRow(row([sub('t1', {})], { me: SITI }))!, VIEW)!.rows[0].mine).toBe(false)
  })

  it('returned three times: the red line — who has been told, or for the manager whom to check in with', () => {
    const page = taskFromRow(row([sub('t1', { title: 'Motion graphics: price tags', assignee: AINA, status: 'revising', returns: 3 })]))!
    const v = subtaskView(page, STAFF)!
    expect([v.rows[0].label, v.rows[0].tone, v.rows[0].red, v.alert]).toEqual(['Returned 3 times', 'red', true,
      { text: 'Aina\'s delivery has been returned 3 times.', tail: 'Rachel has been notified.' }])
    expect(subtaskView({ ...page, me: MEI }, MANAGER)!.alert?.tail).toBe('Check in with Aina and Mei before it slips further.')
  })

  it('its lines on the trail, in the handoff’s words', () => {
    const page = taskFromRow(row([]))!
    const e = (action: string, over: Record<string, unknown>) => ({ id: 1, at: '', actor: 'Mei', action, stage: 0, stageName: 'Edit', fromTo: 'Siti',
      reason: null, version: null, data: { subtask: 't1', title: 'Thumbnail' }, ...over })
    expect([
      eventText(e('subtask', { data: { subtask: 't1', title: 'Thumbnail', due: '2026-10-24' } }), page),
      eventText(e('delivered', { actor: 'Siti', fromTo: 'Mei', version: 'v2', data: { subtask: 't1', title: 'Thumbnail', files: ['thumb.png'] } }), page),
      eventText(e('delivery returned', { reason: 'Logo too small', version: 'v1' }), page),
      eventText(e('delivery approved', { version: 'v2' }), page),
      eventText(e('subtask removed', {}), page),
    ]).toEqual([
      'Mei created subtask "Thumbnail" → Siti · due 24 Oct',
      'Siti delivered "Thumbnail" v2 → Mei · 1 file',
      'Mei returned "Thumbnail" v1 to Siti: "Logo too small"',
      'Mei approved "Thumbnail" v2',
      'Mei took back subtask "Thumbnail" from Siti',
    ])
  })

  it('a delivered file’s size and its place in the bucket', () => {
    expect([sizeText(512), sizeText(38 * 1024), sizeText(1.1 * 1024 ** 2), sizeText(84 * 1024 ** 2), sizeText(2 * 1024 ** 3)]).toEqual(['512 B', '38 KB', '1.1 MB', '84 MB', '2 GB'])
    expect(subtaskPath('Subtitles BM EN.SRT', 'abc')).toBe('subtask/abc/Subtitles-BM-EN.srt')
  })
})

describe('the formal log', () => {
  it('a subtask’s lines: their own action words, and the subtask’s version', () => {
    const log = projectLogFromRow({ track: 'MKT-CAR-2610-007-D01', title: 'Red Truck Reels', kind: 'deliverable', rows: [
      { id: 1, at: '2026-10-23T03:00:00Z', actor: 'Mei', action: 'subtask', stage: 0, stageName: 'Edit', fromTo: 'Siti', data: { subtask: 't1', title: 'Thumbnail' } },
      { id: 2, at: '2026-10-23T05:00:00Z', actor: 'Siti', action: 'delivered', stage: 0, stageName: 'Edit', fromTo: 'Mei', version: 'v1', data: { subtask: 't1', title: 'Thumbnail' } },
      { id: 3, at: '2026-10-23T06:00:00Z', actor: 'Mei', action: 'delivery returned', stage: 0, stageName: 'Edit', fromTo: 'Siti', reason: 'Logo too small', version: 'v1', data: { subtask: 't1', title: 'Thumbnail' } },
      { id: 4, at: '2026-10-24T02:00:00Z', actor: 'Mei', action: 'delivery approved', stage: 0, stageName: 'Edit', fromTo: 'Siti', version: 'v2', data: { subtask: 't1', title: 'Thumbnail' } },
      { id: 5, at: '2026-10-24T03:00:00Z', actor: 'Mei', action: 'subtask removed', stage: 0, stageName: 'Edit', fromTo: 'Aina', data: { subtask: 't2', title: 'Teaser' } },
    ] })!
    expect(auditRows(log).map(r => [r.action, r.tone, r.fromTo, r.reason, r.version])).toEqual([
      ['Subtask created', 'grey', '→ Siti', '—', 'Thumbnail'],
      ['Delivered', 'amber', '→ Mei', '—', 'Thumbnail v1'],
      ['Delivery returned', 'red', '→ Siti', '"Logo too small"', 'Thumbnail v1'],
      ['Delivery approved', 'green', '→ Siti', '—', 'Thumbnail v2'],
      ['Subtask taken back', 'grey', '→ Aina', '—', 'Teaser'],
    ])
  })
})

describe('the task map', () => {
  const events = [
    { id: 1, at: '2026-10-21T01:00:00Z', actor: 'Rachel', action: 'opened', stage: 0, stageName: 'Edit', fromTo: 'Mei' },
    { id: 2, at: '2026-10-21T02:00:00Z', actor: 'Mei', action: 'accepted', stage: 0, stageName: 'Edit' },
    { id: 3, at: '2026-10-21T03:00:00Z', actor: 'Mei', action: 'subtask', stage: 0, stageName: 'Edit', fromTo: 'Siti', data: { subtask: 't1', title: 'Thumbnail', due: '2026-10-24' } },
    { id: 4, at: '2026-10-22T03:00:00Z', actor: 'Siti', action: 'delivered', stage: 0, stageName: 'Edit', fromTo: 'Mei', version: 'v1', data: { subtask: 't1', title: 'Thumbnail', files: [] } },
    { id: 5, at: '2026-10-22T05:00:00Z', actor: 'Mei', action: 'delivery returned', stage: 0, stageName: 'Edit', fromTo: 'Siti', reason: 'Logo too small', version: 'v1', data: { subtask: 't1', title: 'Thumbnail', returns: 1 } },
    { id: 6, at: '2026-10-23T03:00:00Z', actor: 'Siti', action: 'delivered', stage: 0, stageName: 'Edit', fromTo: 'Mei', version: 'v2', data: { subtask: 't1', title: 'Thumbnail', files: ['thumb.png'] } },
  ]

  it('a subtask off the road in its person’s lane, then the stage’s Review delivery', () => {
    const page = taskFromRow(row([sub('t1', { title: 'Thumbnail', status: 'ready', returns: 1,
      delivery: { v: 2, files: [{ ...SRT, path: 'subtask/x/thumb v2.png', name: 'thumb v2.png' }], links: [{ url: 'https://canva.com/d', label: '' }], note: null, at: null } })], { events }))!
    const map = taskMap(page)
    expect(map.lanes.map(l => l.id)).toEqual(['appr', 'VIDEOGRAPHER & VIDEO EDITOR', 'GRAPHIC DESIGNER'])
    expect(map.nodes.map(n => [n.id, n.kind, n.lane, n.col, n.tone, n.current, n.tag, n.status, n.mini ?? false])).toEqual([
      ['start', 'card', 'VIDEOGRAPHER & VIDEO EDITOR', 0, 'done', false, null, 'Done', false],
      ['s0', 'card', 'VIDEOGRAPHER & VIDEO EDITOR', 1, 'waiting', true, null, 'Waiting · now here', false],
      ['tt1', 'card', 'GRAPHIC DESIGNER', 2, 'done', false, 'returned ×1', 'Delivered · waiting for review', false],
      ['r0', 'gate', 'VIDEOGRAPHER & VIDEO EDITOR', 3, 'waiting', true, null, 'Waiting for Mei', true],
      ['s1', 'card', 'VIDEOGRAPHER & VIDEO EDITOR', 4, 'draft', false, null, 'Planned', false],
      ['g1-0', 'gate', 'appr', 5, 'draft', false, null, 'Planned', false],
    ])
    const edge = (key: string) => map.edges.find(e => e.key === key)
    expect([edge('s0>tt1')?.kind, edge('s0>tt1')?.label, edge('tt1>r0')?.kind, edge('r0>tt1~back')?.label, edge('s0>r0')?.kind, edge('r0>s1')?.kind])
      .toEqual(['dashed', 'picked by Mei', 'solid', 'returned ×1', 'solid', 'future'])
    expect(map.stations.tt1.files).toEqual([{ name: 'thumb v2.png', href: '/files/marketing/subtask/x/thumb%20v2.png' }, { name: 'https://canva.com/d', href: 'https://canva.com/d' }])
    expect(map.stations.tt1.versions).toEqual([{ v: 'v1', t: 'Returned 22 Oct' }, { v: 'v2', t: 'Delivered 23 Oct' }])
    expect(map.stations.r0.facts.find(f => f[0] === 'Approval')?.[1]).toBe('👤 Mei reviews the delivery')
    expect(map.steps.map(s => [s.edges, s.at])).toEqual([
      [['start>s0'], 's0'], [[], 's0'], [['s0>tt1'], 'tt1'], [['tt1>r0'], 'r0'], [['r0>tt1~back'], 'tt1'], [['tt1>r0'], 'r0'],
    ])
  })

  it('its lines: one “picked by” a stage, down into each card from above; a delivery’s up out of its top', () => {
    const page = taskFromRow(row([sub('t1', {}), sub('t2', { title: 'Thumbnail', assignee: AINA })]))!
    const map = taskMap(page)
    const edge = (key: string) => map.edges.find(e => e.key === key)!
    expect([edge('s0>tt1').label, edge('s0>tt2').label, edge('s0>tt1').drop, edge('tt1>r0').rise, edge('tt1>r0').kind]).toEqual(['picked by Mei', null, true, true, 'future'])
    const box = (id: string) => boxOf(map.nodes.find(n => n.id === id)!, map.lanes)
    const [s0, t2, r0] = [box('s0'), box('tt2'), box('r0')]
    expect(edgePath(t2, r0, false, true).d.startsWith(`M${t2.cx},${t2.t} `)).toBe(true)
    expect(edgePath(s0, t2, false, false, true).d.endsWith(` ${t2.l + 30},${t2.t - 2}`)).toBe(true)
    expect([r0.w, r0.h]).toEqual([112, 58])
  })

  it('a stage with no subtasks keeps its road as it was', () => {
    const map = taskMap(taskFromRow(row([]))!)
    expect(map.nodes.map(n => n.id)).toEqual(['start', 's0', 's1', 'g1-0'])
  })
})
