import { describe, expect, it } from 'vitest'
import { taskFromRow, type MktTaskPage } from './task'
import { boxOf, edgePath, mapRows, mapSize, replayAt, taskMap } from './taskmap'

// 2026-10-23 — ④-4: the task map (`Task Map.dc.html`) — swim lanes, stations, hand-offs, a station's panel, Replay —
// drawn from a task page.

const RACHEL = 's-rachel'
const SITI = 's-siti'
const MEI = 's-mei'
const ev = (id: number, at: string, actor: string, action: string, more: Record<string, unknown> = {}) => ({ id, at, actor, action, ...more })

const page = taskFromRow({
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
}) as MktTaskPage

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
