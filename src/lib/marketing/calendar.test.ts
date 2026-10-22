import { describe, expect, it } from 'vitest'
import { boardFromRow } from './board'
import { ALL_LAYERS, addMonths, calendarEvents, listDays, monthCells, passes, readWindow, weekCells, weekLabel } from './calendar'

const MEI = '00000000-0000-0000-0000-00000000000a'
const ALI = '00000000-0000-0000-0000-00000000000d'
const CAR = '10000000-0000-0000-0000-000000000001'
const HK = '10000000-0000-0000-0000-000000000004'
const P1 = '20000000-0000-0000-0000-000000000001'
const P2 = '20000000-0000-0000-0000-000000000002'
const S1 = '20000000-0000-0000-0000-000000000003'
const R1 = '20000000-0000-0000-0000-000000000004'

const board = boardFromRow({
  today: '2026-10-22',
  me: MEI,
  team: [{ id: MEI, full: 'Mei Ling', first: 'Mei' }, { id: ALI, full: 'Ali Hassan', first: 'Ali' }],
  subs: [{ id: CAR, code: 'CAR', name: 'Carres' }, { id: HK, code: 'HK', name: 'Hookka' }],
  projects: [
    { id: P1, trackId: 'MKT-CAR-2610-007', kind: 'product', sub: CAR, title: 'Carres Year-End Video', status: 'active', cur: 1 },
    { id: P2, trackId: 'TSK-HK-2610-002', kind: 'quick', sub: HK, title: 'Amend Hookka ad copy', status: 'active', cur: 0 },
    { id: S1, trackId: 'RCR-CAR-2610-001', kind: 'recurring', sub: CAR, title: 'Weekly reel', status: 'active', cur: 0,
      recur: { runs: ['2026-10-19', '2026-10-26', '2026-11-02'], status: 'active' } },
    { id: R1, trackId: 'RCR-CAR-2610-001-R01', kind: 'recurring', sub: CAR, title: 'Weekly reel', status: 'active', cur: 0, series: S1, run: 1 },
  ],
  stages: [
    { project: P1, idx: 0, name: 'Script', owner: MEI, status: 'done', dueOn: '2026-10-14' },
    { project: P1, idx: 1, name: 'Edit', owner: ALI, status: 'accepted', dueOn: '2026-10-21' },
    { project: P1, idx: 2, name: 'Final', owner: ALI, status: 'planned', dueOn: '2026-10-28' },
    { project: P2, idx: 0, name: 'Update ad set', owner: MEI, status: 'todo', dueOn: '2026-10-24' },
    { project: S1, idx: 0, name: 'Plan', owner: MEI, status: 'planned', dueOn: '2026-10-20' },
    { project: R1, idx: 0, name: 'Plan', owner: MEI, status: 'accepted', dueOn: '2026-10-23' },
  ],
})

describe('the Calendar', () => {
  const events = calendarEvents(board)

  it('dates every stage: done, late, due — a series by its runs to come, not its pattern', () => {
    expect(events.map(e => `${e.day} ${e.icon} ${e.title} · ${e.line2} · ${e.label}`)).toEqual([
      '2026-10-14 ⏱ Carres Year-End Video · Stage 1 · Script · Completed',
      '2026-10-21 ⏱ Carres Year-End Video · Stage 2 · Edit · Overdue · Ali',
      '2026-10-23 ⚡ Weekly reel · Stage 1 · Plan · Due · Mei',
      '2026-10-24 ⚡ Amend Hookka ad copy · Stage 1 · Update ad set · Due · Mei',
      '2026-10-26 🔁 Weekly reel · Run 2 opens · Plan · Scheduled · Mei',
      '2026-10-28 ⏱ Carres Year-End Video · Stage 3 · Final · Due · Ali',
      '2026-11-02 🔁 Weekly reel · Run 3 opens · Plan · Scheduled · Mei',
    ])
  })

  it('filters by layer, subsidiary and person', () => {
    const only = (f: Partial<Parameters<typeof passes>[1]>) =>
      events.filter(e => passes(e, { layers: ALL_LAYERS, subs: [], who: null, ...f })).length
    expect(only({})).toBe(7)
    expect(only({ subs: [HK] })).toBe(1)
    expect(only({ who: ALI })).toBe(2)
    expect(only({ layers: { post: true, due: false, meet: true } })).toBe(0)
  })

  it('lays a month out Monday first, with its neighbours greyed', () => {
    const cells = monthCells('2026-10-01', events, '2026-10-22')
    // 1 Oct 2026 is a Thursday: Mon 28 Sep opens the grid; five weeks to Sun 1 Nov.
    expect(cells.length).toBe(35)
    expect(cells[0]).toMatchObject({ day: '2026-09-28', out: true })
    expect(cells[3]).toMatchObject({ day: '2026-10-01', out: false })
    expect(cells.find(c => c.today)?.day).toBe('2026-10-22')
    expect(cells.find(c => c.day === '2026-10-21')?.events.length).toBe(1)
  })

  it('draws a week and a list', () => {
    expect(weekCells('2026-10-22', events, '2026-10-22').map(c => c.day)).toEqual([
      '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25',
    ])
    expect(weekLabel('2026-10-22')).toBe('19 Oct – 25 Oct 2026')
    expect(listDays('2026-10-01', events, '2026-10-22').map(d => `${d.wd} ${d.label} ${d.events.length}`)).toEqual([
      'Wed 14 Oct 1', 'Wed 21 Oct 1', 'Fri 23 Oct 1', 'Sat 24 Oct 1', 'Mon 26 Oct 1', 'Wed 28 Oct 1',
    ])
  })

  it('reads at most 400 days around the month it opens on', () => {
    const w = readWindow('2026-10-22')
    expect(w).toEqual({ from: '2026-06-01', to: '2027-06-30' })
    expect((Date.parse(w.to) - Date.parse(w.from)) / 864e5).toBeLessThanOrEqual(400)
    expect(addMonths('2026-12-01', 1)).toBe('2027-01-01')
    expect(addMonths('2026-01-01', -1)).toBe('2025-12-01')
  })
})
