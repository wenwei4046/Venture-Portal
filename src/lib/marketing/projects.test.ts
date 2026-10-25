import { describe, expect, it } from 'vitest'
import { boardFromRow } from './board'
import { filterProjects, projectRows, scopeFor } from './projects'

const MEI = '00000000-0000-0000-0000-00000000000a'
const RACHEL = '00000000-0000-0000-0000-00000000000b'
const CAR = '10000000-0000-0000-0000-000000000001'
const HK = '10000000-0000-0000-0000-000000000004'
const id = (n: number) => `20000000-0000-0000-0000-${String(n).padStart(12, '0')}`

const board = boardFromRow({
  today: '2026-10-22',
  team: [{ id: MEI, full: 'Mei Ling', first: 'Mei' }, { id: RACHEL, full: 'Rachel Tan', first: 'Rachel' }],
  subs: [{ id: CAR, code: 'CAR', name: 'Carres' }, { id: HK, code: 'HK', name: 'Hookka' }],
  projects: [
    { id: id(1), trackId: 'MKT-CAR-2610-001', kind: 'product', sub: CAR, title: 'Year-End Video', status: 'active', cur: 1, updatedAt: '2026-10-21T01:00:00Z' },
    { id: id(2), trackId: 'MKT-HK-2610-002', kind: 'product', sub: HK, title: 'Rug launch', status: 'waiting_pic', pic: 'Kelvin', updatedAt: '2026-10-20T01:00:00Z' },
    { id: id(3), trackId: 'TSK-CAR-2610-003', kind: 'quick', sub: CAR, title: 'Fix FB cover', status: 'active', cur: 0, updatedAt: '2026-10-22T01:00:00Z' },
    { id: id(4), trackId: 'TSK-HK-2609-004', kind: 'quick', sub: HK, title: 'Old banner', status: 'done', updatedAt: '2026-09-30T01:00:00Z' },
  ],
  stages: [
    { project: id(1), idx: 0, name: 'Script', owner: MEI, status: 'done' },
    { project: id(1), idx: 1, name: 'Edit', owner: MEI, status: 'review', appr: [{ kind: 'person', staff: RACHEL }], dueOn: '2026-10-25' },
    { project: id(3), idx: 0, name: 'Edit cover', owner: MEI, status: 'accepted', dueOn: '2026-10-21' },
  ],
})

describe('Projects', () => {
  const rows = projectRows(board)

  it('says where each one stands and whose it is now — open first, latest change first', () => {
    expect(rows.map(r => `${r.trackId} | ${r.stage} | ${r.who} | ${r.dueLabel} | ${r.tone} ${r.label}`)).toEqual([
      'TSK-CAR-2610-003 | Stage 1/1 · Edit cover | Mei | 21 Oct | red Overdue · In progress',
      'MKT-CAR-2610-001 | Stage 2/2 · Edit | Rachel | 25 Oct | waiting Waiting for Rachel',
      'MKT-HK-2610-002 | Before the plan | Kelvin (PIC) | — | waiting Waiting for PIC',
      'TSK-HK-2609-004 | — | — | — | done Done',
    ])
  })

  it('a task whose minutes the PIC approves waits before its first stage (②a-4)', () => {
    const b = boardFromRow({
      today: '2026-10-22', team: [{ id: MEI, full: 'Mei Ling', first: 'Mei' }], subs: [{ id: CAR, code: 'CAR', name: 'Carres' }],
      projects: [{ id: id(9), trackId: 'TSK-CAR-2610-009', kind: 'quick', sub: CAR, title: 'Raya push', status: 'waiting_pic', pic: 'Kelvin', owner: MEI, cur: 0, updatedAt: '2026-10-22T01:00:00Z' }],
      stages: [{ project: id(9), idx: 0, name: 'Design', owner: MEI, status: 'planned' }],
    })
    expect(projectRows(b).map(r => `${r.stage} | ${r.who} | ${r.dueLabel} | ${r.label}`)).toEqual(['Before stage 1 | Kelvin (PIC) | — | Waiting for PIC'])
  })

  it('filters by scope, subsidiary and words — a Track ID reaches the done ones too', () => {
    expect(filterProjects(rows, { scope: 'open', sub: null, q: '' }).length).toBe(3)
    expect(filterProjects(rows, { scope: 'open', sub: 'HK', q: '' }).map(r => r.trackId)).toEqual(['MKT-HK-2610-002'])
    expect(filterProjects(rows, { scope: 'done', sub: null, q: '' }).map(r => r.trackId)).toEqual(['TSK-HK-2609-004'])
    expect(filterProjects(rows, { scope: 'open', sub: null, q: 'video' }).map(r => r.trackId)).toEqual(['MKT-CAR-2610-001'])
    expect(scopeFor('TSK-HK-2609-004')).toBe('all')
    expect(scopeFor('banner')).toBe('open')
  })
})

// 2026-10-24 — ④-2b: a campaign is Live while it runs, once its work started (the handoff's *Live*).
describe('a campaign running', () => {
  it('is Live while it runs — done or not — and itself before and after', () => {
    const at = (today: string, status: string) => projectRows(boardFromRow({
      today,
      subs: [{ id: CAR, code: 'CAR', name: 'Carres' }],
      projects: [{ id: id(9), trackId: 'MKT-CAR-2611-009', kind: 'product', sub: CAR, title: 'Truck event', status, cur: 0,
        campaign: { from: '2026-11-09', until: '2026-11-12' }, updatedAt: '2026-11-01T01:00:00Z' }],
    }))[0]
    expect([at('2026-11-10', 'active').label, at('2026-11-10', 'active').tone]).toEqual(['Live', 'waiting'])
    expect([at('2026-11-10', 'done').label, at('2026-11-10', 'done').tone]).toEqual(['Live', 'waiting'])
    expect(at('2026-11-08', 'active').label).toBe('In progress')
    expect(at('2026-11-13', 'done').label).toBe('Done')
    // Its minutes not approved yet: not live, whatever the day.
    expect(at('2026-11-10', 'waiting_pic').label).toBe('Waiting for PIC')
  })
})
