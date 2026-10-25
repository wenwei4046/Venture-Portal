import { describe, expect, it } from 'vitest'
import { boardFromRow } from './board'
import { ALL_LAYERS, addMonths, calendarEvents, eventRows, LAYERS, listDays, monthCells, passes, postState, readWindow, weekCells, weekLabel } from './calendar'

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
    expect(only({ layers: { post: true, due: false, meet: true, ads: true } })).toBe(0)
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

// 2026-10-24 — ④-2c: a task's dates marked for the calendar (answers 15, 16) — posts, shoots and meetings, ads and reports,
// each in its layer; a post's state.
describe('a task’s dates on the Calendar', () => {
  const D1 = '30000000-0000-0000-0000-000000000001'
  const D2 = '30000000-0000-0000-0000-000000000002'
  const dboard = boardFromRow({
    today: '2026-11-08',
    me: MEI,
    team: [{ id: MEI, full: 'Mei Ling', first: 'Mei' }, { id: ALI, full: 'Ali Hassan', first: 'Ali' }],
    subs: [{ id: CAR, code: 'CAR', name: 'Carres' }],
    projects: [
      { id: D1, trackId: 'MKT-CAR-2611-001-D01', kind: 'deliverable', sub: CAR, title: 'Image post 1/1', status: 'active', cur: 0, owner: MEI },
      { id: D2, trackId: 'MKT-CAR-2611-001-D02', kind: 'deliverable', sub: CAR, title: 'Image post 2/2', status: 'done', cur: 0, owner: MEI },
    ],
    stages: [
      { project: D1, idx: 0, name: 'Schedule', owner: ALI, status: 'accepted', dept: 'SOCIAL MEDIA SPECIALIST' },
      { project: D2, idx: 0, name: 'Schedule', owner: ALI, status: 'done' },
    ],
    dates: [
      { project: D1, stage: 0, field: 'Post day', kind: 'post', day: '2026-11-09', pic: true },
      { project: D1, stage: 0, field: 'Shoot day', kind: 'shoot', day: '2026-11-02', pic: false },
      { project: D1, stage: 0, field: 'Ads go-live', kind: 'ads_live', day: '2026-11-10', pic: false },
      { project: D1, stage: 0, field: 'Report day', kind: 'report', day: '2026-11-01', pic: false },
      { project: D2, stage: 0, field: 'Post day', kind: 'post', day: '2026-11-05', pic: true, posted: { at: '2026-11-05T02:00:00Z', name: 'Ali', link: 'https://instagram.com/p/abc' } },
      // Not a kind, not a day, no project: dropped.
      { project: D1, stage: 0, field: 'X', kind: 'party', day: '2026-11-03' },
      { project: D1, stage: 0, field: 'Y', kind: 'post', day: 'soon' },
      { stage: 0, field: 'Z', kind: 'post', day: '2026-11-04' },
    ],
  })

  it('reads them — a known kind, a day, its project — and draws each in its layer', () => {
    expect(dboard.dates.map(d => d.field)).toEqual(['Post day', 'Shoot day', 'Ads go-live', 'Report day', 'Post day'])
    const evs = calendarEvents(dboard)
    expect(evs.map(e => `${e.day} ${e.kind} ${e.icon} ${e.title} · ${e.line2} · ${e.label} · ${e.tone}`)).toEqual([
      '2026-11-01 ads 📊 Image post 1/1 · Report day · Schedule · Report day · done',
      '2026-11-02 meet 🎬 Image post 1/1 · Shoot day · Schedule · Shoot day · meet',
      '2026-11-05 post 📣 Image post 2/2 · Post day · Posted · Posted · done',
      '2026-11-09 post 📣 Image post 1/1 · Post day · In production · In production · waiting',
      '2026-11-10 ads 📈 Image post 1/1 · Ads go-live · Schedule · Ads go-live · waiting',
    ])
    const posted = evs.find(e => e.postLink)!
    expect([posted.postLink, posted.who, posted.people, posted.team]).toEqual(['https://instagram.com/p/abc', 'Ali', [ALI], null])
    expect(eventRows(posted, () => '')).toContainEqual({ k: 'Posted', v: 'https://instagram.com/p/abc' })
    expect(eventRows(evs[0], () => '')).toContainEqual({ k: 'Date', v: 'Report day · Schedule' })
    expect(LAYERS.map(l => l.key)).toEqual(['post', 'due', 'meet', 'ads'])
    expect(evs.filter(e => passes(e, { layers: { ...ALL_LAYERS, ads: false }, subs: [], who: null })).map(e => e.kind)).toEqual(['meet', 'post', 'post'])
  })

  it('a post’s state: Posted, Scheduled, Draft, Overdue, In production', () => {
    const at = (status: string, day: string, posted = false) => postState({ status } as never, { day, posted: posted ? { at: '', name: 'Ali', link: 'https://x.my' } : null }, '2026-11-08').label
    expect([at('done', '2026-11-01', true), at('done', '2026-11-01'), at('planning', '2026-11-01'), at('active', '2026-11-01'), at('active', '2026-11-08'), at('active', '2026-11-09')])
      .toEqual(['Posted', 'Scheduled', 'Draft', 'Overdue', 'In production', 'In production'])
  })
})

// ⑤-3c — the user, asked whether an Ads report should put its Report day on the calendars: "can do".
describe('an Ads report’s Report days', () => {
  const A = '40000000-0000-0000-0000-000000000001'
  const B = '40000000-0000-0000-0000-000000000002'
  const C = '40000000-0000-0000-0000-000000000003'
  const aboard = boardFromRow({
    today: '2026-11-04',
    me: MEI,
    team: [{ id: MEI, full: 'Mei Ling', first: 'Mei' }, { id: ALI, full: 'Ali Hassan', first: 'Ali' }],
    subs: [{ id: CAR, code: 'CAR', name: 'Carres' }, { id: HK, code: 'HK', name: 'Hookka' }],
    projects: [
      // Its work done, its ads run on.
      { id: A, trackId: 'TSK-CAR-2610-010', kind: 'quick', sub: CAR, title: 'Raya ads', status: 'done', cur: 2, owner: MEI },
      { id: B, trackId: 'MKT-HK-2610-011', kind: 'product', sub: HK, title: 'Hookka · Media buying', status: 'active', cur: 0, owner: ALI },
      { id: C, trackId: 'TSK-CAR-2610-012', kind: 'quick', sub: CAR, title: 'Cancelled ads', status: 'cancelled', cur: 0, owner: MEI },
    ],
    ads: [
      { project: A, every: '2w', startsOn: '2026-10-06', lastNo: 3, published: [1] },
      { project: B, every: '1m', startsOn: '2026-10-01', lastNo: null, published: [] },
      { project: C, every: '1w', startsOn: '2026-10-01', published: [] },
      // Not a cadence, no first day, no project: dropped.
      { project: A, every: 'daily', startsOn: '2026-10-01' }, { project: A, every: '1w' }, { every: '1w', startsOn: '2026-10-01' },
    ],
  })
  const evs = calendarEvents(aboard)

  it('reads each schedule — a cadence, a first day, its project', () => {
    expect(aboard.ads).toEqual([
      { project: A, every: '2w', startsOn: '2026-10-06', lastNo: 3, published: [1] },
      { project: B, every: '1m', startsOn: '2026-10-01', lastNo: null, published: [] },
      { project: C, every: '1w', startsOn: '2026-10-01', lastNo: null, published: [] },
    ])
  })

  it('dates each the day after its period’s last — published, overdue once its day has passed, else due; to its last report', () => {
    expect(evs.filter(e => e.trackId === 'TSK-CAR-2610-010').map(e => `${e.day} ${e.kind} ${e.icon} ${e.title} · ${e.line2} · ${e.label} · ${e.tone}`)).toEqual([
      '2026-10-20 ads 📊 Raya ads · Report #1 · 6 – 19 Oct · Published · done',
      '2026-11-03 ads 📊 Raya ads · Report #2 · 20 Oct – 2 Nov · Overdue · Mei · red',
      '2026-11-17 ads 📊 Raya ads · Report #3 · 3 – 16 Nov · Due · Mei · waiting',
    ])
    const r1 = evs.find(e => e.id === `a:${A}:1`)!
    expect([r1.kindLabel, r1.people, r1.sub?.code, r1.quick, r1.team]).toEqual(['Report day', [MEI], 'CAR', true, null])
    expect(eventRows(r1, () => '')).toContainEqual({ k: 'Date', v: 'Report #1 · 6 – 19 Oct' })
  })

  it('reports on without a last — a year ahead; never a cancelled project’s', () => {
    const b = evs.filter(e => e.trackId === 'MKT-HK-2610-011')
    expect([b.length, b[0].day, b[0].line2, b[0].label, b[0].tone, b.at(-1)?.day]).toEqual([13, '2026-11-01', 'Report #1 · 1 – 31 Oct', 'Overdue · Ali', 'red', '2027-11-01'])
    expect(evs.some(e => e.trackId === 'TSK-CAR-2610-012')).toBe(false)
  })

  it('goes with the Ads & reports layer, its subsidiary, its owner', () => {
    const n = (f: Partial<Parameters<typeof passes>[1]>) => evs.filter(e => passes(e, { layers: ALL_LAYERS, subs: [], who: null, ...f })).length
    expect([n({}), n({ layers: { ...ALL_LAYERS, ads: false } }), n({ subs: [CAR] }), n({ who: ALI })]).toEqual([16, 0, 3, 13])
  })
})
