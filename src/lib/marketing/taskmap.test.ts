import { describe, expect, it } from 'vitest'
import { taskFromRow, type MktTaskPage } from './task'
import { boxOf, edgePath, mapRows, mapSize, replayAt, taskMap } from './taskmap'

// 2026-10-23 — ④-4: the task map (`Task Map.dc.html`) — swim lanes, stations, hand-offs, a station's panel, Replay —
// drawn from a task page.

const RACHEL = 's-rachel'
const SITI = 's-siti'
const MEI = 's-mei'
const ev = (id: number, at: string, actor: string, action: string, more: Record<string, unknown> = {}) => ({ id, at, actor, action, ...more })

const raw = {
  today: '2026-10-26',
  me: RACHEL,
  team: [
    { id: RACHEL, user: 'u1', full: 'RACHEL TAN', first: 'Rachel', team: 'manager' },
    { id: SITI, user: 'u2', full: 'SITI AMINAH', first: 'Siti', team: 'design' },
    { id: MEI, user: 'u3', full: 'MEI LING', first: 'Mei', team: 'social' },
  ],
  sub: { id: 'sub', code: 'CAR', name: 'Carres', dot: 'x', emoji: '🛋️', client: false, pic: 'Kelvin' },
  project: { id: 'p1', trackId: 'TSK-CAR-2610-001', kind: 'quick', sub: 'sub', title: 'Price update', status: 'active', owner: RACHEL, cur: 1,
    createdAt: '2026-10-20T01:00:00Z', free: [] },
  stages: [
    { project: 'p1', idx: 0, name: 'First draft', dept: 'SOCIAL MEDIA SPECIALIST', owner: MEI, appr: [], mode: 'person', status: 'done', dueOn: '2026-10-21',
      doneAt: '2026-10-21T08:00:00Z', work: { notes: '', links: [] } },
    { project: 'p1', idx: 1, name: 'Redesign', dept: 'GRAPHIC DESIGNER', owner: SITI, appr: [{ kind: 'person', staff: RACHEL }, { kind: 'pic' }], mode: 'prev',
      status: 'review', apprIdx: 1, ver: 2, dueOn: '2026-10-24', submittedAt: '2026-10-25T01:30:00Z',
      work: { notes: '', links: [{ url: 'https://canva.com/x', label: 'Draft' }] } },
    { project: 'p1', idx: 2, name: 'Publish', dept: 'SOCIAL MEDIA SPECIALIST', owner: MEI, appr: [], mode: 'person', status: 'planned', dueOn: '2026-10-28',
      work: { notes: '', links: [] } },
  ],
  events: [
    ev(1, '2026-10-20T01:00:00Z', 'Rachel', 'created', { data: { kind: 'quick', stages: 3 } }),
    ev(2, '2026-10-20T01:00:00Z', 'Rachel', 'opened', { stage: 0, stageName: 'First draft', fromTo: 'Mei' }),
    ev(3, '2026-10-20T02:00:00Z', 'Mei', 'accepted', { stage: 0, stageName: 'First draft' }),
    ev(4, '2026-10-21T07:00:00Z', 'Mei', 'picked', { stage: 0, stageName: 'First draft', fromTo: 'Siti' }),
    ev(5, '2026-10-21T08:00:00Z', 'Mei', 'completed', { stage: 0, stageName: 'First draft' }),
    ev(6, '2026-10-21T08:00:00Z', 'Mei', 'opened', { stage: 1, stageName: 'Redesign', fromTo: 'Siti' }),
    ev(7, '2026-10-22T01:00:00Z', 'Siti', 'accepted', { stage: 1, stageName: 'Redesign' }),
    ev(8, '2026-10-23T09:45:00Z', 'Siti', 'submitted', { stage: 1, stageName: 'Redesign', fromTo: 'Rachel', version: 'v1' }),
    ev(9, '2026-10-24T01:10:00Z', 'Rachel', 'changes', { stage: 1, stageName: 'Redesign', fromTo: 'Siti', reason: 'Logo too small', version: 'v1' }),
    ev(10, '2026-10-25T01:30:00Z', 'Siti', 'submitted', { stage: 1, stageName: 'Redesign', fromTo: 'Rachel', version: 'v2' }),
    ev(11, '2026-10-25T03:00:00Z', 'Rachel', 'approved', { stage: 1, stageName: 'Redesign', fromTo: 'PIC', version: 'v2' }),
    ev(12, '2026-10-25T04:00:00Z', 'Rachel', 'free', { data: { op: 'put' } }),
  ],
}
const page = taskFromRow(raw) as MktTaskPage

const map = taskMap(page)

describe('the task map', () => {
  it('lays the road on swim lanes — Approvals on top, then the groups (People titles) as the stages meet them', () => {
    expect(map.lanes.map(l => `${l.emoji} ${l.name} ${l.tone}`)).toEqual(['🛡️ Approvals appr', '📣 SOCIAL MEDIA SPECIALIST social', '🎨 GRAPHIC DESIGNER design'])
    expect(map.nodes.map(n => `${n.id} ${n.lane}@${n.col} ${n.tone}${n.current ? ' HERE' : ''} · ${n.full} · ${n.person} · ${n.date}${n.tag ? ` · ${n.tag}` : ''} | ${n.status}`)).toEqual([
      'start SOCIAL MEDIA SPECIALIST@0 done · Created by Rachel · Rachel · 20 Oct | Done',
      's0 SOCIAL MEDIA SPECIALIST@1 done · First draft · Mei · 21 Oct | Done',
      's1 GRAPHIC DESIGNER@2 done · Redesign · Siti · 25 Oct · returned ×1 | Submitted',
      'g1-0 appr@3 done · Rachel approves Redesign · Rachel · 25 Oct | Done',
      'g1-1 appr@4 red HERE · Kelvin approves Redesign · Kelvin · Since 25 Oct | Waiting for PIC',
      's2 SOCIAL MEDIA SPECIALIST@5 draft · Publish · Mei · Due 28 Oct | Planned',
    ])
    expect(map.nodes.filter(n => n.kind === 'gate').map(n => n.icon)).toEqual(['👤', '🔗'])
  })

  it('joins the stations: made, picked, sent back, planned — each line with when, who and what', () => {
    expect(map.edges.map(e => `${e.key} ${e.kind}${e.label ? ` "${e.label}"` : ''}`)).toEqual([
      'start>s0 solid',
      's0>s1 dashed "picked by Mei"',
      's1>g1-0 solid',
      'g1-0>g1-1 solid',
      'g1-1>s2 future',
      'g1-0>s1~back return "returned ×1"',
    ])
    const m = Object.fromEntries(map.edges.map(e => [e.key, e.meta]))
    expect(m['start>s0']).toEqual({ t: '20 Oct 09:00', who: 'Rachel → Mei', what: 'Stage 1 · First draft opened for Mei', reason: '' })
    expect(m['s1>g1-0']).toMatchObject({ t: '25 Oct 09:30', who: 'Siti → Rachel', what: 'Siti submitted Redesign v2 → Rachel' })
    expect(m['g1-0>s1~back']).toMatchObject({ who: 'Rachel → Siti', reason: 'Logo too small' })
    expect(m['g1-1>s2']).toBeNull()
  })

  it('opens a station: its facts, its files, its versions, its own records', () => {
    expect(map.stations.s1).toEqual({
      facts: [['Track ID', 'TSK-CAR-2610-001'], ['Person', 'Siti'], ['Handoff', '🔓 Picked by Mei'], ['Deadline', '24 Oct'], ['Approval', '👤 Rachel → 🔗 Kelvin']],
      files: [{ name: 'Draft', href: 'https://canva.com/x' }],
      versions: [{ v: 'v1', t: 'Changes requested 24 Oct' }, { v: 'v2', t: 'Submitted 25 Oct' }],
      audit: [
        { t: '21 Oct 16:00', e: 'Stage 2 · Redesign opened for Siti' },
        { t: '22 Oct 09:00', e: 'Siti accepted Stage 2 · Redesign' },
        { t: '23 Oct 17:45', e: 'Siti submitted Redesign v1 → Rachel' },
        { t: '24 Oct 09:10', e: 'Rachel requested changes on Redesign v1: "Logo too small"' },
        { t: '25 Oct 09:30', e: 'Siti submitted Redesign v2 → Rachel' },
      ],
    })
    expect(map.stations['g1-0'].versions).toEqual([{ v: 'v1', t: 'Changes requested 24 Oct' }, { v: 'v2', t: 'Passed on 25 Oct' }])
    expect(map.stations['g1-1'].facts[4]).toEqual(['Approval', '🔗 PIC approves via link'])
    expect(map.stations.s0.facts[3]).toEqual(['Completed', '21 Oct'])
  })

  it('lists the stations along the road', () => {
    expect(mapRows(map).map(r => `${r.no} ${r.icon} ${r.title} · ${r.lane} · ${r.handoff} · ${r.status}`)).toEqual([
      '01 📣 Created by Rachel · SOCIAL MEDIA SPECIALIST · Created · Done',
      '02 📣 First draft · SOCIAL MEDIA SPECIALIST · 🔒 Assigned · Done',
      '03 🎨 Redesign · GRAPHIC DESIGNER · 🔓 Picked by Mei · returned ×1 · Submitted',
      '04 👤 Rachel approves Redesign · Approvals · Internal approver · Done',
      '05 🔗 Kelvin approves Redesign · Approvals · PIC via link · Waiting for PIC',
      '06 📣 Publish · SOCIAL MEDIA SPECIALIST · 🔒 Assigned · Planned',
    ])
  })

  it('replays the trail record by record — never the Free space’s', () => {
    expect(map.steps.map(s => `${s.t} ${s.at ?? '—'} [${s.edges.join(' ')}]`)).toEqual([
      '20 Oct 09:00 start []',
      '20 Oct 09:00 s0 [start>s0]',
      '20 Oct 10:00 s0 []',
      '21 Oct 15:00 s0 []',
      '21 Oct 16:00 s1 [s0>s1]',
      '21 Oct 16:00 s1 [s0>s1]',
      '22 Oct 09:00 s1 []',
      '23 Oct 17:45 g1-0 [s1>g1-0]',
      '24 Oct 09:10 s1 [g1-0>s1~back]',
      '25 Oct 09:30 g1-0 [s1>g1-0]',
      '25 Oct 11:00 g1-1 [g1-0>g1-1]',
    ])
    const r = replayAt(map, 9)
    expect([...r.lit]).toEqual(['start>s0', 's0>s1', 's1>g1-0', 'g1-0>s1~back'])
    expect([...r.seen].sort()).toEqual(['g1-0', 's0', 's1', 'start'])
    expect([r.at, r.last?.text]).toEqual(['s1', 'Rachel requested changes on Redesign v1: "Logo too small"'])
    expect(replayAt(map, 0)).toMatchObject({ at: 'start', last: null })
  })

  it('places each station on its lane, a line from one to the next, a send-back round the gate’s foot', () => {
    const s0 = boxOf(map.nodes[1], map.lanes)
    const g = boxOf(map.nodes[3], map.lanes)
    expect([s0.cx, s0.cy, s0.w, g.cx, g.cy, g.w]).toEqual([400, 225, 172, 800, 75, 140])
    // From s0's right edge (486) to s1's left (514, the arrow 2 short), bowing at least 40 each way.
    expect(edgePath(s0, boxOf(map.nodes[2], map.lanes), false).d).toBe('M486,225 C526,225 474,375 512,375')
    expect(edgePath(g, boxOf(map.nodes[2], map.lanes), true).d.startsWith('M790,108')).toBe(true)
    expect(mapSize(map)).toEqual({ w: 1340, h: 450 })
  })
})

// 2026-10-25 — ④-4c (the user's answer 23: "a project may be opened from inside another, its source kept, a line on the
// map"): the road starts at the project it was opened from.
describe('a project opened from another', () => {
  const SRC = { id: 'p0', trackId: 'MKT-CAR-2610-003', title: 'Carres · Social Media · Oct 2026', kind: 'product', status: 'active', owner: 'Rachel' }
  const opened = taskMap(taskFromRow({
    ...raw,
    project: { ...raw.project, source: SRC },
    events: raw.events.map(e => (e.action === 'created' ? { ...e, data: { kind: 'quick', stages: 3, from: SRC.trackId } } : e)),
  }) as MktTaskPage)

  it('starts at it: its station before Created (tagged Opened from), a line to it — unlabelled, the two sharing a lane', () => {
    expect(opened.nodes.slice(0, 3).map(n => `${n.id} ${n.lane}@${n.col} ${n.tone} · ${n.full} · ${n.person} · ${n.tag ?? '-'} | ${n.handoff} | ${n.status}`)).toEqual([
      'src SOCIAL MEDIA SPECIALIST@0 done · MKT-CAR-2610-003 · Carres · Social Media · Oct 2026 · Rachel · Opened from | Product project | In progress',
      'start SOCIAL MEDIA SPECIALIST@1 done · Created by Rachel · Rachel · - | Opened from MKT-CAR-2610-003 | Done',
      's0 SOCIAL MEDIA SPECIALIST@2 done · First draft · Mei · - | 🔒 Assigned | Done',
    ])
    expect(opened.edges[0]).toEqual({
      key: 'src>start', from: 'src', to: 'start', kind: 'solid', label: null,
      meta: { t: '20 Oct 09:00', who: 'Rachel', what: 'Rachel created quick task "Price update" · 3 stages · from MKT-CAR-2610-003', reason: '' },
    })
    expect(opened.edges.slice(1).map(e => e.key)).toEqual(map.edges.map(e => e.key))
  })

  it('opens it from its panel', () => {
    expect(opened.stations.src).toEqual({
      facts: [['Track ID', 'MKT-CAR-2610-003'], ['Person', 'Rachel'], ['Handoff', 'Opened TSK-CAR-2610-001 from it'], ['Kind', 'Product project'], ['Status', 'In progress']],
      files: [], versions: [], audit: [], open: { href: '/marketing/projects/MKT-CAR-2610-003', label: 'Open MKT-CAR-2610-003' },
    })
    expect(opened.stations.start.facts[2]).toEqual(['Handoff', 'Opened from MKT-CAR-2610-003'])
  })

  it('lists it first; Replay has it and its line from the start — the created record only says who opened it', () => {
    expect(mapRows(opened)[0]).toMatchObject({ no: '01', title: 'MKT-CAR-2610-003 · Carres · Social Media · Oct 2026', handoff: 'Product project · Opened from', status: 'In progress' })
    expect(opened.steps[0]).toMatchObject({ at: 'start', edges: [] })
    const start = replayAt(opened, 0)
    expect([[...start.seen].sort(), [...start.lit]]).toEqual([['src', 'start'], ['src>start']])
  })

  it('a project opened from nowhere draws none', () => {
    expect(map.nodes.some(n => n.id === 'src')).toBe(false)
    expect(map.stations.start.facts[2]).toEqual(['Handoff', 'Created'])
    expect([[...replayAt(map, 0).seen], [...replayAt(map, 0).lit]]).toEqual([['start'], []])
  })
})

// 2026-10-25 — ④-4d: a deliverable's road starts at its product project — the handoff's first station, *Requested*
// ("Opened from Social Media project").
describe('a deliverable’s map', () => {
  const parent = { id: 'pp', trackId: 'MKT-CAR-2610-003', title: 'Carres · Social Media · Oct 2026', status: 'active' }
  const deliverable = (more: Record<string, unknown> = {}) =>
    taskMap(taskFromRow({ ...raw, project: { ...raw.project, kind: 'deliverable', trackId: 'MKT-CAR-2610-003-D01', parent, ...more } }) as MktTaskPage)

  it('starts at its product project, its panel opening it', () => {
    const m = deliverable()
    expect(m.nodes[0]).toMatchObject({ id: 'src', col: 0, title: 'MKT-CAR-2610-003', person: '—', tag: 'Opened from', handoff: 'Product project', status: 'In progress' })
    expect(m.nodes[1]).toMatchObject({ id: 'start', handoff: 'Opened from MKT-CAR-2610-003' })
    expect(m.stations.src.open).toEqual({ href: '/marketing/projects/MKT-CAR-2610-003', label: 'Open MKT-CAR-2610-003' })
    expect(m.stations.src.facts[2]).toEqual(['Handoff', 'Opened MKT-CAR-2610-003-D01 from it'])
  })

  it('its line lit in Replay though a deliverable has no created record (a review’s find)', () => {
    const m = taskMap(taskFromRow({ ...raw, project: { ...raw.project, kind: 'deliverable', trackId: 'MKT-CAR-2610-003-D01', parent },
      events: raw.events.filter(e => e.action !== 'created') }) as MktTaskPage)
    expect(m.steps.flatMap(s => s.edges)).not.toContain('src>start')
    for (const step of [0, m.steps.length]) expect(replayAt(m, step).lit.has('src>start')).toBe(true)
  })

  it('one opened from another project starts at that one', () => {
    const m = deliverable({ source: { id: 'p0', trackId: 'TSK-CAR-2610-004', title: 'Banner', kind: 'quick', status: 'done', owner: 'Mei' } })
    expect(m.nodes[0]).toMatchObject({ id: 'src', title: 'TSK-CAR-2610-004', person: 'Mei', handoff: 'Quick task' })
  })
})

// 2026-10-25 — a task written with meeting minutes (②a-3) has their station after Created; the PIC approving them (②a-4 —
// the user's answers 52, 53) adds 🔗 their gate before the first stage: sent back red, gone round dashed when the manager
// started before approval.
describe('a task written with meeting minutes', () => {
  const MIN = { id: 'm1', project: 'p9', title: 'Kickoff', intake: true, status: 'completed', locked: true, rev: 3, vals: {}, signed: {}, notes: '',
    completedAt: '2026-10-26T03:00:00Z', template: { id: 't1', version: 1, name: 'Kickoff', fields: [], rules: { sign: false } } }
  const PM = { pic: 'Kelvin Tan', whatsapp: '012-345 6789', pic2: '', whatsapp2: '', link: 'a'.repeat(32), link2: null, sentAt: '2026-10-26T01:00:00Z',
    reply: null, override: null, ok: null, edited: null }
  const of = (status: string, events: ReturnType<typeof ev>[], pm: Record<string, unknown> | null, minutes: Record<string, unknown> = {}) => taskMap(taskFromRow({
    ...raw,
    project: { id: 'p9', trackId: 'TSK-CAR-2610-009', kind: 'quick', sub: 'sub', title: 'Raya push', status, owner: RACHEL, cur: 0, createdAt: '2026-10-26T00:00:00Z', free: [],
      picMinutes: pm ? { status, ...PM, ...pm } : null },
    stages: [{ project: 'p9', idx: 0, name: 'Design', dept: 'GRAPHIC DESIGNER', owner: SITI, appr: [], mode: 'person', status: status === 'active' ? 'todo' : 'planned',
      dueOn: status === 'active' ? '2026-10-27' : null, work: { notes: '', links: [] } }],
    events, minutes: { ...MIN, ...minutes },
  }) as MktTaskPage)
  const created = ev(1, '2026-10-26T00:00:00Z', 'Rachel', 'created', { data: { kind: 'quick', stages: 1, minutes: 'Kickoff' } })
  const sent = ev(2, '2026-10-26T01:00:00Z', 'Rachel', 'link sent', { reason: 'Kelvin Tan' })
  const edge = (m: ReturnType<typeof taskMap>, key: string) => m.edges.find(e => e.key === key)

  it('no PIC asked: the minutes’ station after Created — the first stage opened from it', () => {
    const m = of('active', [created, ev(2, '2026-10-26T00:00:00Z', 'Rachel', 'opened', { stage: 0, stageName: 'Design', fromTo: 'Siti' })], null)
    expect(m.nodes.map(n => n.id)).toEqual(['start', 'min', 's0'])
    expect(m.nodes[1]).toMatchObject({ title: 'Meeting minutes', full: 'Meeting minutes · Kickoff', tone: 'done', status: 'Done', handoff: 'Written on New Project' })
    expect(m.lanes.some(l => l.id === 'appr')).toBe(false)
    expect([edge(m, 'start>min')?.kind, edge(m, 'min>s0')?.kind]).toEqual(['solid', 'solid'])
    expect(m.stations.min.facts.find(f => f[0] === 'Approval')?.[1]).toBe('— No PIC sign-off')
    expect(replayAt(m, 2).lit.has('min>s0')).toBe(true)
  })

  it('sent to the PIC: 🔗 their gate waiting before the first stage — the stage still ahead', () => {
    const m = of('waiting_pic', [created, sent], {}, { status: 'sent', completedAt: null, locked: false })
    expect(m.nodes.map(n => n.id)).toEqual(['start', 'min', 'pic', 's0'])
    expect(m.lanes[0].id).toBe('appr')
    expect(m.nodes[2]).toMatchObject({ kind: 'gate', lane: 'appr', icon: '🔗', title: 'approves the minutes', person: 'Kelvin Tan (PIC)', current: true,
      status: 'Waiting for Kelvin Tan (PIC)', date: 'Since 26 Oct' })
    expect(m.nodes[1]).toMatchObject({ tone: 'done', status: 'Done' })
    expect(m.nodes[3]).toMatchObject({ future: true, current: false })
    expect([edge(m, 'min>pic')?.kind, edge(m, 'pic>s0')?.kind]).toEqual(['solid', 'future'])
    expect(replayAt(m, 2)).toMatchObject({ at: 'pic' })
    expect(m.stations.min.facts.find(f => f[0] === 'Approval')?.[1]).toBe('🔗 Kelvin Tan (PIC)')
  })

  it('sent back: a red line round to the minutes, written again there', () => {
    const back = ev(3, '2026-10-26T02:00:00Z', 'Kelvin Tan (PIC)', 'pic changes', { reason: 'Green banner please' })
    const m = of('changes', [created, sent, back], { reply: { decision: 'changes', name: 'Kelvin Tan', reason: 'Green banner please', at: '2026-10-26T02:00:00Z', pic: 1 } },
      { status: 'sent', completedAt: null, locked: false })
    expect(edge(m, 'pic>min~back')).toMatchObject({ kind: 'return', label: 'returned ×1' })
    expect(m.nodes[1]).toMatchObject({ tone: 'red', current: true, status: 'Changes requested', tag: 'returned ×1' })
    expect(m.nodes[2]).toMatchObject({ tone: 'red', current: false, status: 'Changes requested' })
    expect(replayAt(m, 3).at).toBe('min')
  })

  it('approved: the gate done, the first stage opened from it', () => {
    const ok = ev(3, '2026-10-26T03:00:00Z', 'Kelvin Tan (PIC)', 'pic approved', { reason: 'Kickoff' })
    const begun = ev(4, '2026-10-26T03:00:00Z', 'Kelvin Tan (PIC)', 'work started', { data: { stages: 1 } })
    const opened = ev(5, '2026-10-26T03:00:00Z', 'Kelvin Tan (PIC)', 'opened', { stage: 0, stageName: 'Design', fromTo: 'Siti' })
    const m = of('active', [created, sent, ok, begun, opened], { reply: { decision: 'approved', name: 'Kelvin Tan', reason: '', at: '2026-10-26T03:00:00Z', pic: 1 } })
    expect(m.nodes[2]).toMatchObject({ tone: 'done', current: false, status: 'Approved', date: '26 Oct' })
    expect(m.nodes[3]).toMatchObject({ current: true })
    expect(edge(m, 'pic>s0')).toMatchObject({ kind: 'solid', label: null })
    expect(replayAt(m, 5).lit.has('pic>s0')).toBe(true)
    expect(m.stations.pic.audit.map(a => a.e)).toEqual([
      'Rachel sent the minutes to Kelvin Tan · tracking link', 'Kelvin Tan (PIC) approved the Kickoff minutes on the link', 'The work started · its stages dated from today',
    ])
  })

  it('started before approval: round the gate, dashed and said so', () => {
    const over = ev(3, '2026-10-26T03:00:00Z', 'Rachel', 'started before approval', { reason: 'Kelvin confirmed by phone' })
    const opened = ev(4, '2026-10-26T03:00:00Z', 'Rachel', 'opened', { stage: 0, stageName: 'Design', fromTo: 'Siti' })
    const m = of('active', [created, sent, over, opened], { override: { by: 'Rachel', at: '2026-10-26T03:00:00Z', reason: 'Kelvin confirmed by phone' } },
      { status: 'sent', completedAt: null, locked: false })
    expect(m.nodes[2]).toMatchObject({ status: 'Started before approval', current: false })
    expect(edge(m, 'pic>s0')).toMatchObject({ kind: 'dashed', label: 'started before approval' })
  })
})
