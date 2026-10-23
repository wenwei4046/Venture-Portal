import { describe, expect, it } from 'vitest'
import { boardFromRow } from './board'
import { calendarEvents } from './calendar'
import {
  agoLabel, feedLine, filterCount, keyDates, NO_FILTER, passesSub, subFeedFromRow, subProjects, subStats, timelineBars,
  timelineHeads, timelineLeft, timelineTitle, timelineWindow,
} from './subsidiary'

// 2026-10-23 — ④-2: a subsidiary's page (`Subsidiary Page.dc.html`), reckoned from the board and its feed.

const MEI = '00000000-0000-0000-0000-00000000000a'
const ALI = '00000000-0000-0000-0000-00000000000d'
const CAR = '10000000-0000-0000-0000-000000000001'
const HK = '10000000-0000-0000-0000-000000000004'
const id = (n: number) => `20000000-0000-0000-0000-${String(n).padStart(12, '0')}`

const board = boardFromRow({
  today: '2026-10-22',
  me: MEI,
  team: [{ id: MEI, full: 'Mei Ling', first: 'Mei' }, { id: ALI, full: 'Ali Hassan', first: 'Ali' }],
  subs: [{ id: CAR, code: 'CAR', name: 'Carres' }, { id: HK, code: 'HK', name: 'Hookka' }],
  projects: [
    { id: id(1), trackId: 'MKT-CAR-2610-007', kind: 'product', sub: CAR, title: 'Year-End Video', status: 'active', cur: 1, owner: MEI,
      startsOn: '2026-10-01', dueOn: '2026-10-28', createdAt: '2026-09-30T02:00:00Z', updatedAt: '2026-10-21T02:00:00Z' },
    { id: id(2), trackId: 'TSK-HK-2610-002', kind: 'quick', sub: HK, title: 'Hookka ad copy', status: 'active', cur: 0, updatedAt: '2026-10-22T01:00:00Z' },
    { id: id(3), trackId: 'MKT-CAR-2610-008', kind: 'product', sub: CAR, title: 'Sofa launch', status: 'waiting_pic', cur: 0, owner: ALI, pic: 'Mr Tan',
      createdAt: '2026-10-20T02:00:00Z', updatedAt: '2026-10-20T02:00:00Z' },
    // Made by the Principal (off Marketing's roster): its owner shows as whoever's stage it is at.
    { id: id(4), trackId: 'TSK-CAR-2610-003', kind: 'quick', sub: CAR, title: 'Banner resize', status: 'done', cur: 0, owner: 'ffffffff-0000-0000-0000-000000000001',
      dueOn: '2026-10-20', createdAt: '2026-10-15T02:00:00Z', doneAt: '2026-10-20T05:00:00Z', updatedAt: '2026-10-20T05:00:00Z' },
    // Done at 04:00 on the 1st in the office — this month, though UTC says September.
    { id: id(5), trackId: 'TSK-CAR-2609-001', kind: 'quick', sub: CAR, title: 'Old flyer', status: 'done', cur: 0,
      dueOn: '2026-09-30', createdAt: '2026-09-20T02:00:00Z', doneAt: '2026-09-30T20:00:00Z', updatedAt: '2026-09-30T20:00:00Z' },
    { id: id(6), trackId: 'TSK-CAR-2609-002', kind: 'quick', sub: CAR, title: 'Older flyer', status: 'done', cur: 0,
      dueOn: '2026-09-29', createdAt: '2026-09-20T02:00:00Z', doneAt: '2026-09-30T10:00:00Z', updatedAt: '2026-09-30T10:00:00Z' },
    { id: id(7), trackId: 'RCR-CAR-2610-001', kind: 'recurring', sub: CAR, title: 'Weekly reel', status: 'active', cur: 0,
      recur: { runs: ['2026-10-19', '2026-10-26', '2026-11-02'], status: 'active' } },
    { id: id(8), trackId: 'RCR-CAR-2610-001-R01', kind: 'recurring', sub: CAR, title: 'Weekly reel', status: 'active', cur: 0, series: id(7), run: 1,
      owner: MEI, createdAt: '2026-10-19T01:00:00Z', updatedAt: '2026-10-19T01:00:00Z' },
    // No start, no creation day: no bar, never an "Invalid Date" one.
    { id: id(9), trackId: 'TSK-CAR-2610-004', kind: 'quick', sub: CAR, title: 'Undated', status: 'paused', cur: 0, dueOn: '2026-10-30', updatedAt: '2026-10-01T01:00:00Z' },
  ],
  stages: [
    { project: id(1), idx: 0, name: 'Script', dept: 'content', owner: MEI, status: 'done', dueOn: '2026-10-14' },
    { project: id(1), idx: 1, name: 'Edit', dept: 'design', owner: ALI, status: 'accepted', dueOn: '2026-10-21' },
    { project: id(1), idx: 2, name: 'Final', dept: 'design', owner: ALI, status: 'planned', dueOn: '2026-10-28' },
    { project: id(2), idx: 0, name: 'Update ad set', dept: 'ads', owner: MEI, status: 'todo', dueOn: '2026-10-24' },
    { project: id(4), idx: 0, name: 'Resize', dept: 'design', owner: MEI, status: 'done', dueOn: '2026-10-20' },
    { project: id(7), idx: 0, name: 'Plan', dept: 'social', owner: MEI, status: 'planned', dueOn: '2026-10-20' },
    { project: id(8), idx: 0, name: 'Plan', dept: 'social', owner: MEI, status: 'accepted', dueOn: '2026-10-23' },
  ],
  holidays: [{ day: '2026-12-25', name: 'Christmas Day' }, { day: '2026-10-20', name: 'Deepavali' }],
})

const events = calendarEvents(board).filter(e => e.sub?.id === CAR)

describe('a subsidiary’s page', () => {
  it('opens on where its work stands — this week to Sunday, the office’s month, red only when overdue', () => {
    // Due this week: the run's stage on Friday the 23rd — not the 28th (next week), nor a run to come.
    expect(subStats(board, CAR, events).map(s => `${s.label} ${s.value}${s.sub ? ` ${s.sub}` : ''}${s.red ? ' red' : ''}`)).toEqual([
      'Projects running 3',
      'Waiting for PIC 1',
      'Due this week 1',
      'Done this month 2',
      'Overdue 1 needs action red',
    ])
    expect(subStats(board, HK, calendarEvents(board).filter(e => e.sub?.id === HK)).find(s => s.key === 'overdue')).toMatchObject({ value: 0, red: false, sub: '' })
  })

  it('filters by type, team and status', () => {
    const only = (f: Partial<typeof NO_FILTER>) => events.filter(e => passesSub(e, { ...NO_FILTER, ...f })).map(e => `${e.day} ${e.line2}`)
    expect(only({}).length).toBe(events.length)
    expect(only({ types: ['run'] })).toEqual(['2026-10-26 Run 2 opens · Plan', '2026-11-02 Run 3 opens · Plan'])
    expect(only({ teams: ['design'], statuses: ['red'] })).toEqual(['2026-10-21 Stage 2 · Edit'])
    expect(only({ teams: ['ads'] })).toEqual([])
    expect(filterCount({ types: ['due'], teams: ['design', 'social'], statuses: [] })).toBe(3)
  })

  it('flags HR’s holidays as key dates, in day order', () => {
    expect(keyDates(board)).toEqual([
      { day: '2026-10-20', name: 'Deepavali', short: 'Deepavali' },
      { day: '2026-12-25', name: 'Christmas Day', short: 'Christmas' },
    ])
  })

  it('lists its projects — open first — with the team of the stage each is at and how far it has come', () => {
    expect(subProjects(board, CAR).map(r => `${r.title} · ${r.team ?? '—'} · ${r.done}/${r.total} · ${r.owner} · ${r.label}`)).toEqual([
      'Year-End Video · design · 1/3 · Mei · Overdue · In progress',
      'Sofa launch · — · 0/0 · Ali · Waiting for PIC',
      'Weekly reel · social · 0/1 · Mei · In progress',
      'Undated · — · 0/0 · — · Paused',
      'Banner resize · design · 1/1 · Mei · Done',
      'Old flyer · — · 0/0 · — · Done',
      'Older flyer · — · 0/0 · — · Done',
    ])
  })

  it('draws ten weeks from the Monday two weeks back, each project’s span clipped to them', () => {
    const w = timelineWindow('2026-10-22')
    expect(w).toEqual({ start: '2026-10-05', days: 70 })
    expect(timelineTitle(w)).toBe('Oct – Dec 2026')
    expect(timelineLeft(w, '2026-10-22')).toBe(25)
    const bars = timelineBars(board, subProjects(board, CAR), w)
    // Sofa launch has no due day yet; the flyers ended before the window.
    // A bar too short for its span says its due day.
    expect(bars.map(b => `${b.title} ${b.range} ${b.left.toFixed(2)}+${b.width.toFixed(2)} "${b.label}"`)).toEqual([
      'Year-End Video 1 Oct – 28 Oct 0.00+34.29 "1 Oct – 28 Oct"',
      'Weekly reel 19 Oct – 23 Oct 20.00+7.14 "23 Oct"',
      'Banner resize 15 Oct – 20 Oct 14.29+8.57 "20 Oct"',
    ])
    const heads = timelineHeads(w)
    expect(heads.months.map(m => m.name)).toEqual(['Oct', 'November', 'December'])
    expect(heads.weeks.map(x => x.n)).toEqual([5, 12, 19, 26, 2, 9, 16, 23, 30, 7])
  })

  it('reads its feed and words each line as the project’s own trail does', () => {
    const feed = subFeedFromRow([
      { id: 9, at: '2026-10-22T09:48:00Z', actor: 'Mr Tan', action: 'pic approved', reason: 'Kick-off minutes',
        project: { id: id(3), track: 'MKT-CAR-2610-008', title: 'Sofa launch', kind: 'product' } },
      { id: '8', at: '2026-10-22T07:00:00Z', actor: 'Ali', action: 'submitted', stage: 1, stageName: 'Edit', fromTo: 'Mei', version: 'v2',
        project: { id: id(1), track: 'MKT-CAR-2610-007', title: 'Year-End Video', kind: 'product' } },
      { id: 7, at: '2026-10-21T15:00:00Z', actor: 'Mei', action: 'created', data: { product: 'Sofa kit', version: 2 },
        project: { id: id(3), track: 'MKT-CAR-2610-008', title: 'Sofa launch', kind: 'product' } },
      { id: 6, at: '2026-10-19T03:00:00Z', actor: 'Mei', action: 'accepted', stage: 0, stageName: 'Plan',
        project: { id: id(8), track: 'RCR-CAR-2610-001-R01', title: 'Weekly reel', kind: 'recurring' } },
      'not a row',
    ])
    expect(feed.map(e => feedLine(e))).toEqual([
      { key: '9', emoji: '🔗', text: 'Mr Tan approved Kick-off minutes on the link', href: '/marketing/projects/MKT-CAR-2610-008' },
      { key: '8', emoji: '📤', text: 'Ali submitted Edit v2 → Mei', href: '/marketing/projects/MKT-CAR-2610-007' },
      { key: '7', emoji: '✨', text: 'Mei started the project · Sofa kit v2', href: '/marketing/projects/MKT-CAR-2610-008' },
      { key: '6', emoji: '👍', text: 'Mei accepted Stage 1 · Plan', href: '/marketing/projects/RCR-CAR-2610-001-R01' },
    ])
  })

  it('says how long ago, by the office’s day', () => {
    const now = Date.parse('2026-10-22T10:00:00Z') // 18:00 in the office
    expect(agoLabel('2026-10-22T09:59:40Z', now, '2026-10-22')).toBe('just now')
    expect(agoLabel('2026-10-22T09:48:00Z', now, '2026-10-22')).toBe('12 min ago')
    expect(agoLabel('2026-10-22T07:00:00Z', now, '2026-10-22')).toBe('3h ago')
    // 01:00 on the 22nd in the office — today, though UTC says the 21st.
    expect(agoLabel('2026-10-21T17:00:00Z', now, '2026-10-22')).toBe('17h ago')
    expect(agoLabel('2026-10-21T15:00:00Z', now, '2026-10-22')).toBe('yesterday')
    expect(agoLabel('2026-10-19T03:00:00Z', now, '2026-10-22')).toBe('19 Oct')
    expect(agoLabel('x', now, '2026-10-22')).toBe('')
  })
})
