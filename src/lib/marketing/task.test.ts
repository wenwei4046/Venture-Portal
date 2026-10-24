import { describe, expect, it } from 'vitest'
import { approvalText, eventText, newFromHref, newProjectKey, opensFrom, ordinal, picApprover, seriesView, taskFromRow, taskView, trailLines } from './task'

// A task's page as mkt_project answers it (mig 20261023234000) and what each viewer is offered on it — the handoff's
// New Task Page: the owner Accepts, works and hands it on; the approver approves or sends it back; everybody else sees
// where it stands.

const RACHEL = 's-rachel'
const SITI = 's-siti'
const JASON = 's-jason'
const team = [
  { id: RACHEL, user: 'u1', full: 'RACHEL TAN', first: 'Rachel', title: 'MARKETING MANAGER', team: 'manager', role: null, color: null, capacity: 5 },
  { id: SITI, user: 'u2', full: 'SITI AMINAH', first: 'Siti', title: 'GRAPHIC DESIGNER', team: 'design', role: null, color: null, capacity: 5 },
  { id: JASON, user: 'u3', full: 'JASON LEE', first: 'Jason', title: 'SOCIAL MEDIA EXECUTIVE', team: 'social', role: null, color: null, capacity: 5 },
]
const stage = (idx: number, over: Record<string, unknown>) => ({
  project: 'p1', idx, name: ['First draft', 'Redesign', 'Publish'][idx], dept: 'social', mode: 'person', owner: [RACHEL, SITI, JASON][idx],
  cands: [], sla: 1, appr: [], split: false, spec: { form: [] }, work: {}, startsOn: '2026-10-23', dueOn: ['2026-10-26', '2026-10-27', '2026-10-28'][idx],
  status: 'planned', apprIdx: 0, ver: 0, changes: null, ...over,
})
const row = (stages: Record<string, unknown>[], over: Record<string, unknown> = {}) => ({
  today: '2026-10-26',
  me: SITI,
  team,
  sub: { id: 'sub', code: 'CAR', name: 'Carres', dot: 'x', emoji: '🛋️', client: false, pic: 'Kelvin' },
  project: { id: 'p1', trackId: 'TSK-CAR-2610-001', kind: 'quick', sub: 'sub', title: 'Price update', status: 'active', qType: 'social',
    brief: 'Change the price on the banner', owner: RACHEL, cur: 1, startsOn: '2026-10-23', dueOn: '2026-10-28', createdBy: 'Rachel Tan',
    free: [{ id: 'abc123', type: 'check', text: 'Tell Kelvin', done: false, by: 'Rachel' }], ...over },
  stages,
  subtasks: [],
  events: [
    { id: 1, at: '2026-10-23T01:00:00Z', actor: 'Rachel', action: 'created', data: { kind: 'quick', stages: 3 } },
    { id: 2, at: '2026-10-23T01:00:00Z', actor: 'Rachel', action: 'opened', stage: 0, stageName: 'First draft', fromTo: 'Rachel' },
    { id: 3, at: '2026-10-23T02:30:00Z', actor: 'Rachel', action: 'completed', stage: 0, stageName: 'First draft' },
    { id: 4, at: '2026-10-23T02:30:00Z', actor: 'Rachel', action: 'opened', stage: 1, stageName: 'Redesign', fromTo: 'Siti' },
    { id: 5, at: '2026-10-23T03:00:00Z', actor: 'Rachel', action: 'free', data: { op: 'put', type: 'check' } },
  ],
  series: null,
  holidays: [],
})
const ALL = { edit: true, approve: true, manage: true }
const STAFF = { edit: true, approve: false, manage: false }

describe('a task’s page', () => {
  it('reads what the database answers', () => {
    const page = taskFromRow(row([stage(0, { status: 'done' }), stage(1, { status: 'todo', appr: [{ kind: 'person', staff: RACHEL }],
      spec: { form: [{ label: 'Final artwork', type: 'File' }], back: 0 } }), stage(2, {})]))!
    expect([page.project.trackId, page.project.qType, page.project.free.length, page.stages[1].form, page.stages[1].back, page.sub?.pic])
      .toEqual(['TSK-CAR-2610-001', 'social', 1, [{ label: 'Final artwork', type: 'File' }], 0, 'Kelvin'])
    expect(taskFromRow(null)).toBeNull()
  })

  it('the owner of the stage now: Accept', () => {
    const page = taskFromRow(row([stage(0, { status: 'done' }), stage(1, { status: 'todo' }), stage(2, {})]))!
    const v = taskView(page, STAFF)
    expect([v.status, v.actions.map(a => a.key), v.note, v.banner]).toEqual(['Waiting for Siti to Accept', ['accept'], 'New · just assigned to you',
      { tone: 'waiting', text: 'You\'re up: Redesign · due Tue 27 Oct' }])
    expect(v.meta.map(m => m.v)).toEqual(['Carres', 'Rachel', 'Siti', '⚡ Quick task · Social Media', 'Due Wed 28 Oct'])
    expect(v.rail.map(r => [r.mark, r.state, r.appr])).toEqual([['✓', 'done', '— no approval'], ['S', 'current', '— no approval'], ['3', 'next', '— no approval']])
  })

  it('…working: Submit for approval once the form is filled in', () => {
    const form = { form: [{ label: 'Final artwork', type: 'File' }] }
    const before = taskView(taskFromRow(row([stage(0, { status: 'done' }), stage(1, { status: 'accepted', spec: form, appr: [{ kind: 'person', staff: RACHEL }] }), stage(2, {})]))!, STAFF)
    expect([before.actions, before.note, before.noteRed]).toEqual([[{ key: 'submit', label: 'Submit for approval', disabled: true }], 'Fill in Final artwork', true])
    expect(before.mine?.idx).toBe(1)
    expect(before.work.map(w => [w.name, w.editable, w.badge])).toEqual([['Redesign', true, 'Siti · due 27 Oct'], ['First draft', false, '✓ Done']])
    const after = taskView(taskFromRow(row([stage(0, { status: 'done' }), stage(1, { status: 'accepted', spec: form, work: { vals: { 'Final artwork': 'https://x' } } }), stage(2, {})]))!, STAFF)
    expect([after.actions, after.note]).toEqual([[{ key: 'complete', label: 'Complete stage', disabled: false }], 'Ready'])
  })

  it('the approver: Approve or Request changes; everybody else waits', () => {
    const rows = [stage(0, { status: 'done' }), stage(1, { status: 'review', ver: 2, appr: [{ kind: 'person', staff: RACHEL }] }), stage(2, {})]
    const mine = taskView(taskFromRow({ ...row(rows), me: RACHEL })!, ALL)
    expect([mine.actions.map(a => a.key), mine.banner?.text, mine.status, mine.version]).toEqual([['changes', 'approve'], 'Siti submitted Redesign v2 for your approval',
      'Waiting for Rachel', 'Redesign · v2'])
    const other = taskView(taskFromRow({ ...row(rows), me: JASON })!, ALL)
    expect([other.actions, other.note, other.waitingOn]).toEqual([[], 'Waiting for Rachel', RACHEL])
  })

  it('changes asked: red, why — and from which stage when sent back', () => {
    const page = taskFromRow(row([stage(0, { status: 'changes', changes: { by: 'Rachel', reason: 'Bigger logo', from: 'Redesign' } }), stage(1, {}), stage(2, {})], { cur: 0 }))!
    const v = taskView({ ...page, me: RACHEL }, ALL)
    expect([v.tone, v.status, v.banner]).toEqual(['red', 'Changes requested', { tone: 'red', text: 'Changes requested by Rachel on Redesign: "Bigger logo"' }])
  })

  it('late: red', () => {
    const v = taskView(taskFromRow({ ...row([stage(0, { status: 'done' }), stage(1, { status: 'accepted' }), stage(2, {})]), today: '2026-10-29' })!, STAFF)
    expect(v.tone).toBe('red')
  })

  it('done: every stage, the work of each', () => {
    const page = taskFromRow(row([stage(0, { status: 'done' }), stage(1, { status: 'done' }), stage(2, { status: 'done' })], { status: 'done', cur: 2 }))!
    const v = taskView(page, ALL)
    expect([v.status, v.tone, v.banner?.text, v.actions, v.work.length, v.note]).toEqual(['Done', 'done', 'All 3 stages done', [], 3, 'All stages done'])
  })

  it('a run before its day: nobody’s yet', () => {
    const page = taskFromRow(row([stage(0, { status: 'todo', owner: SITI }), stage(1, {}), stage(2, {})], { kind: 'recurring', series: 'p0', run: 2, cur: 0, startsOn: '2026-10-30' }))!
    const v = taskView(page, ALL)
    expect([v.status, v.tone, v.actions, v.note]).toEqual(['Opens Fri 30 Oct', 'draft', [], 'Opens Fri 30 Oct'])
  })

  it('the trail in the store’s words, newest first, the free space’s writes left out', () => {
    const page = taskFromRow(row([stage(0, { status: 'done' }), stage(1, { status: 'todo' }), stage(2, {})]))!
    expect(trailLines(page).map(l => [l.t, l.text])).toEqual([
      ['23 Oct 10:30', 'Stage 2 · Redesign opened for Siti'],
      ['23 Oct 10:30', 'Rachel completed First draft'],
      ['23 Oct 09:00', 'Stage 1 · First draft opened for Rachel'],
      ['23 Oct 09:00', 'Rachel created quick task "Price update" · 3 stages'],
    ])
    expect(eventText({ id: 9, at: '', actor: 'Rachel', action: 'changes', stage: 1, stageName: 'Redesign', fromTo: 'Rachel', reason: 'Bigger', version: 'v1',
      data: { back: 0, to: 'First draft' } }, page)).toBe('Rachel requested changes on Redesign v1: "Bigger" · back to First draft')
    // Replace Person (④-5): how the person replaced stood there.
    const replaced = (role: string, extra = {}) => eventText({ id: 10, at: '', actor: 'Josiah', action: 'replaced', stage: 1, stageName: 'Redesign',
      fromTo: 'Siti → Hafiz', reason: 'Resigned', version: null, data: { role, rec: 3, ...extra } }, page)
    expect([replaced('owner'), replaced('appr'), replaced('subtask', { subtask: 'Thumbnail' })]).toEqual([
      'Josiah replaced Siti → Hafiz · Redesign · "Resigned"', 'Josiah replaced Siti → Hafiz as approver · Redesign · "Resigned"',
      'Josiah replaced Siti → Hafiz on a subtask "Thumbnail" · Redesign · "Resigned"'])
    // A recurring product's months (②b-2f): made each run day, a plan carried, the day moved.
    const months = (action: string, data: Record<string, unknown>) =>
      eventText({ id: 12, at: '', actor: 'Josiah', action, stage: null, stageName: null, fromTo: null, reason: null, version: null, data }, page)
    expect([months('run made', { run: 3, month: '2026-11', made: 1, toPlan: 0 }), months('run day', { from: 1, to: 22 }),
      months('carried', { from: 'MKT-CAR-2610-001-D03', start: '2026-11-05' })]).toEqual([
      "Nov 2026's work made · 1 deliverable", 'Josiah moved the monthly run to the 22nd', 'Plan carried from D03 · starts 5 Nov'])
    // Paused and resumed (②b-2g): from which month, and the months left out.
    expect([months('runs paused', {}), months('runs resumed', { from: '2026-12', left: 2 }), months('runs resumed', { from: '2026-12', left: 0 })]).toEqual([
      'Josiah paused the monthly runs', 'Josiah resumed the monthly runs · from Dec 2026 · 2 months left out', 'Josiah resumed the monthly runs · from Dec 2026'])
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 28].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '28th'])
    // Billing (②b-2b), as a subsidiary's feed reads a product project's trail: its month, never its figure.
    const billing = (action: string, data: Record<string, unknown> | null) =>
      eventText({ id: 11, at: '', actor: 'Josiah', action, stage: null, stageName: null, fromTo: null, reason: null, version: null, data }, page)
    expect([billing('amount set', null), billing('billing confirmed', { month: '2026-10' }), billing('billing withdrawn', { month: '2026-10' }),
      billing('stopped', { until: '2026-12' }), billing('billing confirmed', { month: 'soon' })]).toEqual([
      'Josiah set the amount', 'Josiah confirmed the billing for Oct 2026', 'Josiah withdrew the billing for Oct 2026',
      'Josiah stopped the project · billed to Dec 2026', 'Josiah confirmed the billing for a month'])
  })

  it('a series: its rule, its runs', () => {
    const page = taskFromRow({
      ...row([stage(0, { status: 'planned' })], { kind: 'recurring', series: null, cur: 0, startsOn: '2026-10-26' }),
      series: { id: 'p1', trackId: 'RCR-CAR-2610-002', title: 'Weekly post', status: 'active',
        recur: { rule: { freq: 'weekly', days: [1], every: 1, start: '2026-10-26', endMode: 'count', count: 3 }, status: 'active' },
        runs: [{ id: 'r1', run: 1, trackId: 'RCR-CAR-2610-002-R01', status: 'done', startsOn: '2026-10-26', stage: 'done' },
          { id: 'r2', run: 2, trackId: 'RCR-CAR-2610-002-R02', status: 'active', startsOn: '2026-11-02', stage: 'todo' }] },
    })!
    expect(taskView(page, ALL)).toMatchObject({ isSeries: true, status: 'Active', actions: [], work: [] })
    expect(seriesView(page)).toMatchObject({ rule: 'Every week on Monday', period: 'from 26 Oct 2026 · 3 runs',
      runs: [{ label: 'Run 1', status: 'Done', tone: 'done' }, { label: 'Run 2', day: 'Mon 2 Nov', status: 'Scheduled', tone: 'draft' }] })
  })
})

describe('a PIC level, with one or two PICs (②b-2d-2b, the user’s answer 29)', () => {
  const p1 = { pic: 'Kelvin', pic2: null }
  const p2 = { pic: 'Kelvin', pic2: 'Hana' }
  it('names whom it waits for by the project’s own PICs — either, both, or the one still to answer', () => {
    expect(picApprover(p1, null, false, null)).toBe('Kelvin (PIC)')
    expect(picApprover({ pic: null, pic2: null }, { pic: 'Mr Tan' }, false, null)).toBe('Mr Tan (PIC)')
    expect(picApprover(p2, null, false, null)).toBe('Kelvin or Hana (PIC)')
    expect(picApprover(p2, null, true, null)).toBe('Kelvin and Hana (PIC)')
    expect(picApprover(p2, null, true, { '1': { name: 'Kelvin Tan', at: null } })).toBe('Hana (PIC) · Kelvin Tan approved')
    expect(picApprover(p2, null, true, { '2': { name: 'Hana Lee', at: null } })).toBe('Kelvin (PIC) · Hana Lee approved')
  })
  it('reads both on a stage’s level and whose approval is in; the approvals line says “Both PICs”', () => {
    const page = taskFromRow({ today: '2026-10-24', me: null, team: [],
      project: { id: 'd1', trackId: 'MKT-CAR-2610-001-D01', kind: 'deliverable', sub: 'sub', title: 'Poster', status: 'active', cur: 0, pic: 'Kelvin', pic2: 'Hana' },
      stages: [{ project: 'd1', idx: 0, name: 'Design', status: 'review', ver: 2, apprIdx: 0, appr: [{ kind: 'pic', all: true }], picOk: { '1': { name: 'Kelvin Tan', at: null } } }],
      events: [], holidays: [] })
    expect([page?.project.pic2, page?.stages[0].levels, page?.stages[0].picOk]).toEqual(['Hana', [{ kind: 'pic', all: true }], { '1': { name: 'Kelvin Tan', at: null } }])
    expect(approvalText([], page!.stages[0])).toBe('🔗 Both PICs')
  })
})

// 2026-10-24 — ④-2c: a post marked posted, or the mark taken back — the trail's words; the page reads the marks.
describe('a post’s mark', () => {
  it('reads the marks and words the trail’s lines', () => {
    const pg = taskFromRow({ project: { id: 'p1', trackId: 'T', kind: 'deliverable', sub: 's', title: 'x', status: 'done', cur: 0,
      posted: { '0:Post day': { at: '2026-11-10T02:00:00Z', name: 'Ali', link: 'https://x.my/1' }, '1:Bad': { name: 'nobody' } } }, stages: [] })!
    expect(pg.project.posted).toEqual({ '0:Post day': { at: '2026-11-10T02:00:00Z', name: 'Ali', link: 'https://x.my/1' } })
    const ev = (action: string, data: Record<string, unknown>) => ({ id: 1, at: '', actor: 'Ali', action, stage: 0, stageName: 'Schedule', fromTo: null, reason: null, version: null, data })
    expect(eventText(ev('posted', { field: 'Post day', link: 'https://x.my/1' }), pg)).toBe('Ali marked Post day posted')
    expect(eventText(ev('unposted', { field: 'Post day' }), pg)).toBe('Ali took back Post day’s posted mark')
  })
})

// 2026-10-25 — ④-4c (the user's answer 23): a project opened from inside another keeps it — its page says which, its
// created record names it, and the one it was opened from says so on its trail.
describe('opened from another project', () => {
  const SRC = { id: 'p0', trackId: 'MKT-CAR-2610-003', title: 'Carres · Social Media · Oct 2026', kind: 'product', status: 'active', owner: 'Rachel' }
  it('reads where it was opened from — none when from nowhere, or the source read wrong', () => {
    expect(taskFromRow(row([stage(0, {})], { source: SRC }))!.project.source).toEqual(SRC)
    expect(taskFromRow(row([stage(0, {})]))!.project.source).toBeNull()
    expect(taskFromRow(row([stage(0, {})], { source: { trackId: 'X' } }))!.project.source).toBeNull()
    expect(taskFromRow(row([stage(0, {})], { source: { id: 'p0', kind: 'nonsense', status: 'nonsense' } }))!.project.source)
      .toEqual({ id: 'p0', trackId: '', title: '', kind: 'quick', status: 'active', owner: '' })
  })

  it('words its created record, and the record on the one it was opened from', () => {
    const page = taskFromRow(row([stage(0, {})]))!
    const ev = (action: string, data: Record<string, unknown> | null, actor = 'Mei') =>
      eventText({ id: 1, at: '', actor, action, stage: null, stageName: null, fromTo: null, reason: null, version: null, data }, page)
    expect(ev('created', { kind: 'quick', stages: 2, from: SRC.trackId })).toBe('Mei created quick task "Price update" · 2 stages · from MKT-CAR-2610-003')
    expect(ev('created', { kind: 'recurring', stages: 2, rule: { freq: 'daily', start: '2026-10-26', endMode: 'count', count: 2 }, from: 'TSK-CAR-2610-004' }))
      .toMatch(/^Mei created recurring task "Price update" · .+ · from TSK-CAR-2610-004$/)
    expect(ev('created', { kind: 'quick', stages: 2, from: '' })).toBe('Mei created quick task "Price update" · 2 stages')
    expect(ev('opened project', { id: 'p9', track: 'TSK-CAR-2610-007', title: 'Resize for Instagram' })).toBe('Mei opened TSK-CAR-2610-007 "Resize for Instagram" from this project')
    expect(ev('opened project', null, '')).toBe('Somebody opened a project from this project')
  })

  it('a project may be opened from anything but a series’ pattern — its runs are the work', () => {
    expect([opensFrom({ kind: 'quick', series: null }), opensFrom({ kind: 'recurring', series: 's1' }), opensFrom({ kind: 'deliverable', series: null }),
      opensFrom({ kind: 'product', series: null }), opensFrom({ kind: 'recurring', series: null })]).toEqual([true, true, true, true, false])
    expect(newFromHref('TSK-CAR-2610-001')).toBe('/marketing/new?from=TSK-CAR-2610-001')
  })
})

// 2026-10-25 — a review's find: New Project stayed mounted from ?from=A to the top bar's + New Project, its source kept.
describe('New Project’s own for each address', () => {
  it('a different source, subsidiary or client form is a new one; the same address the same', () => {
    expect(newProjectKey('p0')).not.toBe(newProjectKey(null))
    expect(newProjectKey('p0', 'CAR')).not.toBe(newProjectKey('p0'))
    expect(newProjectKey(undefined, undefined, '1')).not.toBe(newProjectKey(undefined))
    expect(newProjectKey('p0', 'CAR', '1')).toBe(newProjectKey('p0', 'CAR', '1'))
  })
})
