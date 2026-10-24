import { describe, expect, it } from 'vitest'
import { boardFromRow } from './board'
import { calendarEvents } from './calendar'
import {
  adsLive, agoLabel, campaignOverlaps, campaignsOn, feedLine, filterCount, keyDates, NO_FILTER, overlapNote, passesCampaign, passesSub, spanWords,
  subCampaigns, subFeedFromRow, subProjects, subStats, timelineBars, timelineCampaigns, timelineHeads, timelineLeft, timelineOverlaps,
  timelineTitle, timelineWindow,
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
  it('opens on the handoff’s five cards — red only when overdue', () => {
    // No campaign, post, shoot or ads date yet: the stage due on the 21st is late.
    expect(subStats(board, CAR, events).map(s => `${s.label} ${s.value}${s.sub ? ` ${s.sub}` : ''}${s.red ? ' red' : ''}`)).toEqual([
      'Campaigns running 0',
      'Posts 0',
      'Shoots 0',
      'Ads live 0',
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

  // 2026-10-24: a product project's work, months, billing and campaign period in the page's own words — not the raw action.
  it('words a product project’s own lines as its page does', () => {
    const p = { id: id(3), track: 'MKT-CAR-2610-008', title: 'Sofa launch', kind: 'product' }
    const feed = subFeedFromRow([
      { id: 15, at: '2026-10-22T09:00:00Z', actor: 'Mei', action: 'campaign period', data: { from: '2026-11-09', until: '2026-11-12' }, project: p },
      { id: 14, at: '2026-10-22T08:00:00Z', actor: 'Mei', action: 'campaign period', data: { from: null, until: null }, project: p },
      { id: 13, at: '2026-10-22T07:00:00Z', actor: 'Mei', action: 'work started', data: { deliverables: 2, runDay: 5 }, project: p },
      { id: 17, at: '2026-10-22T11:00:00Z', actor: 'Mei', action: 'runs resumed', data: { from: '2026-12', left: 1 }, project: p },
      { id: 16, at: '2026-10-22T10:00:00Z', actor: 'Mei', action: 'runs paused', data: null, project: p },
      { id: 12, at: '2026-10-22T06:00:00Z', actor: 'Someone', action: 'run made', data: { month: '2026-11', made: 2, toPlan: 1 }, project: p },
      { id: 11, at: '2026-10-22T05:00:00Z', actor: 'Mei', action: 'billing confirmed', data: { month: '2026-10' }, project: p },
      // A deliverable's post marked (④-2c) — the task's words.
      { id: 10, at: '2026-10-22T04:00:00Z', actor: 'Ali', action: 'posted', stage: 0, data: { field: 'Post day', link: 'https://x.my/1' },
        project: { id: id(4), track: 'MKT-CAR-2610-008-D01', title: 'Image post 1/1', kind: 'deliverable' } },
      // Opened from another (④-4c — answer 23): on the one it was opened from, and the new one's created record.
      { id: 9, at: '2026-10-22T03:00:00Z', actor: 'Mei', action: 'opened project', data: { id: id(5), track: 'TSK-CAR-2610-009', title: 'Teaser' }, project: p },
      { id: 8, at: '2026-10-22T03:00:00Z', actor: 'Mei', action: 'created', data: { kind: 'quick', stages: 2, from: 'MKT-CAR-2610-008' },
        project: { id: id(5), track: 'TSK-CAR-2610-009', title: 'Teaser', kind: 'quick' } },
    ])
    expect(feed.map(e => `${feedLine(e).emoji} ${feedLine(e).text}`)).toEqual([
      '📢 Mei set the campaign period · 9 – 12 Nov 2026',
      '📢 Mei took the campaign period off',
      '▶ Mei started the work · 2 deliverables · every month on the 5th',
      '▶ Mei resumed the monthly runs · from Dec 2026 · 1 month left out',
      '⏸ Mei paused the monthly runs',
      "🔁 Nov 2026's work made · 2 deliverables · 1 to plan",
      '💰 Mei confirmed the billing for Oct 2026',
      '📣 Ali marked Post day posted',
      '🔀 Mei opened TSK-CAR-2610-009 "Teaser" from this project',
      '✨ Mei created quick task "Teaser" · 2 stages · from MKT-CAR-2610-008',
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

// 2026-10-24 — ④-2b: its campaigns (the user's answer 13 — a product project with a run period; the timeline shows which
// runs when): the card, the days they run, the timeline's rows and overlaps, the filter.
describe('its campaigns', () => {
  const camp = (n: number, title: string, status: string, from: string, until: string, sub = CAR, extra: Record<string, unknown> = {}) => ({
    id: id(n), trackId: `MKT-CAR-2611-0${n}`, kind: 'product', sub, title, status, cur: 0, campaign: { from, until },
    createdAt: '2026-10-01T01:00:00Z', updatedAt: '2026-10-20T01:00:00Z', ...extra,
  })
  const cboard = (today: string) => boardFromRow({
    today,
    subs: [{ id: CAR, code: 'CAR', name: 'Carres' }, { id: HK, code: 'HK', name: 'Hookka' }],
    projects: [
      camp(21, 'Carres · 11.11 Rental Deal · Nov 2026', 'active', '2026-11-09', '2026-11-12'),
      camp(22, 'Carres · Showroom Weekends · Nov 2026', 'done', '2026-11-07', '2026-11-29'),
      camp(23, 'Carres · Year-End Sale · Dec 2026', 'approved', '2026-12-01', '2026-12-31'),
      camp(24, 'Carres · Cancelled deal · Nov 2026', 'cancelled', '2026-11-09', '2026-11-12'),
      camp(25, 'Hookka · Rug week · Nov 2026', 'active', '2026-11-09', '2026-11-12', HK),
      camp(26, 'Carres · Oct promo · Oct 2026', 'done', '2026-10-01', '2026-10-05'),
      // A half period never reaches the board as one.
      { ...camp(27, 'Carres · Half · Nov 2026', 'active', '2026-11-09', '2026-11-12'), campaign: { from: '2026-11-09', until: null } },
    ],
  })

  it('lists them by their first day — not a cancelled one, nor another company’s — and counts those running', () => {
    const b = cboard('2026-11-10')
    const list = subCampaigns(b, CAR)
    expect(list.map(c => `${c.short} ${c.from}–${c.until}${c.live ? ' live' : ''}${c.ran ? ' ran' : ''}`)).toEqual([
      'Oct promo · Oct 2026 2026-10-01–2026-10-05 ran',
      'Showroom Weekends · Nov 2026 2026-11-07–2026-11-29 live',
      '11.11 Rental Deal · Nov 2026 2026-11-09–2026-11-12 live',
      'Year-End Sale · Dec 2026 2026-12-01–2026-12-31',
    ])
    expect(subStats(b, CAR, [])[0]).toMatchObject({ key: 'campaigns', label: 'Campaigns running', value: 2, sub: '' })
    // None running: the next one's day.
    expect(subStats(cboard('2026-11-30'), CAR, [])[0]).toMatchObject({ value: 0, sub: 'next 1 Dec' })
    expect(subStats(cboard('2027-02-01'), CAR, [])[0]).toMatchObject({ value: 0, sub: '' })
    expect(campaignsOn(list, '2026-11-10').map(c => c.trackId)).toEqual(['MKT-CAR-2611-022', 'MKT-CAR-2611-021'])
    expect(campaignsOn(list, '2026-11-30')).toEqual([])
  })

  it('names the days two share, and draws them on the timeline’s weeks', () => {
    const list = subCampaigns(cboard('2026-11-10'), CAR)
    const ov = campaignOverlaps(list)
    expect(ov.map(o => `${o.a.trackId} ${o.b.trackId} ${o.from} ${o.until}`)).toEqual(['MKT-CAR-2611-022 MKT-CAR-2611-021 2026-11-09 2026-11-12'])
    expect(overlapNote([])).toBe('No campaign overlaps')
    expect(overlapNote(ov)).toBe('1 overlap: Showroom Weekends · Nov 2026 overlaps 11.11 Rental Deal · Nov 2026 (9 – 12 Nov)')
    expect(overlapNote([...ov, ...ov]).startsWith('2 overlaps: ')).toBe(true)
    const w = timelineWindow('2026-11-10')
    expect(w).toEqual({ start: '2026-10-26', days: 70 })
    const bars = timelineCampaigns(list, w)
    expect(bars.map(b => [b.trackId, +b.left.toFixed(2), +b.width.toFixed(2), b.range, b.label])).toEqual([
      ['MKT-CAR-2611-022', 17.14, 32.86, '7 – 29 Nov 2026', 'Showroom Weekends · Nov 2026 · 7 – 29 Nov'],
      ['MKT-CAR-2611-021', 20, 5.71, '9 – 12 Nov 2026', '11.11 Rental Deal · Nov 2026 · 9 – 12 Nov'],
      ['MKT-CAR-2611-023', 51.43, 44.29, '1 – 31 Dec 2026', 'Year-End Sale · Dec 2026 · 1 – 31 Dec'],
    ])
    expect(timelineOverlaps(ov, w).map(o => [+o.left.toFixed(2), +o.width.toFixed(2), o.title])).toEqual([[20, 5.71, 'Showroom Weekends · Nov 2026 overlaps 11.11 Rental Deal · Nov 2026 · 9 – 12 Nov']])
    // One past the window's end is clipped to it.
    expect(timelineCampaigns([{ ...list[3], until: '2027-02-01' }], w)[0].width).toBeCloseTo((34 / 70) * 100, 5)
    expect([spanWords('2026-11-28', '2026-12-03'), spanWords('2026-11-09', '2026-11-09')]).toEqual(['28 Nov – 3 Dec', '9 Nov'])
  })

  it('goes through the filter by type and status; a group asked hides it', () => {
    const [ran, live] = subCampaigns(cboard('2026-11-10'), CAR)
    expect(passesCampaign(live, NO_FILTER)).toBe(true)
    expect(passesCampaign(live, { ...NO_FILTER, types: ['due'] })).toBe(false)
    expect(passesCampaign(live, { ...NO_FILTER, types: ['campaign'] })).toBe(true)
    expect(passesCampaign(live, { ...NO_FILTER, teams: ['GRAPHIC DESIGNER'] })).toBe(false)
    expect([passesCampaign(ran, { ...NO_FILTER, statuses: ['done'] }), passesCampaign(live, { ...NO_FILTER, statuses: ['done'] })]).toEqual([true, false])
  })
})

// 2026-10-24 — ④-2c: its posts, shoots and ads on the cards (the handoff's five), and the filter's kinds of date.
describe('its task dates', () => {
  const D = (n: number) => `40000000-0000-0000-0000-${String(n).padStart(12, '0')}`
  const dboard = boardFromRow({
    today: '2026-11-10',
    subs: [{ id: CAR, code: 'CAR', name: 'Carres' }, { id: HK, code: 'HK', name: 'Hookka' }],
    projects: [
      { id: D(1), trackId: 'MKT-CAR-2611-001-D01', kind: 'deliverable', sub: CAR, title: 'Post 1', status: 'done', cur: 0 },
      { id: D(2), trackId: 'MKT-CAR-2611-001-D02', kind: 'deliverable', sub: CAR, title: 'Post 2', status: 'active', cur: 0 },
      { id: D(3), trackId: 'MKT-CAR-2611-002-D01', kind: 'deliverable', sub: CAR, title: 'Ads 1', status: 'active', cur: 0 },
      { id: D(4), trackId: 'MKT-CAR-2611-002-D02', kind: 'deliverable', sub: CAR, title: 'Ads 2', status: 'active', cur: 0 },
      { id: D(5), trackId: 'MKT-HK-2611-001-D01', kind: 'deliverable', sub: HK, title: 'Hookka post', status: 'active', cur: 0 },
      { id: D(6), trackId: 'MKT-CAR-2611-003-D01', kind: 'deliverable', sub: CAR, title: 'Cancelled', status: 'cancelled', cur: 0 },
    ],
    dates: [
      { project: D(1), stage: 0, field: 'Post day', kind: 'post', day: '2026-11-03', posted: { at: 'x', name: 'Ali', link: 'https://x.my/1' } },
      { project: D(2), stage: 0, field: 'Post day', kind: 'post', day: '2026-11-20' },
      { project: D(2), stage: 0, field: 'Post day 2', kind: 'post', day: '2026-12-01' },
      { project: D(2), stage: 0, field: 'Shoot day', kind: 'shoot', day: '2026-11-04' },
      { project: D(3), stage: 0, field: 'Ads go-live', kind: 'ads_live', day: '2026-11-01' },
      { project: D(3), stage: 0, field: 'Ads end', kind: 'ads_end', day: '2026-11-30' },
      { project: D(4), stage: 0, field: 'Ads go-live', kind: 'ads_live', day: '2026-11-01' },
      { project: D(4), stage: 0, field: 'Ads end', kind: 'ads_end', day: '2026-11-05' },
      { project: D(5), stage: 0, field: 'Post day', kind: 'post', day: '2026-11-12' },
      { project: D(6), stage: 0, field: 'Post day', kind: 'post', day: '2026-11-12' },
    ],
  })

  it('counts this month’s posts and how many are posted, its shoots, its ads live — never another company’s or a cancelled one', () => {
    expect(subStats(dboard, CAR, []).map(s => `${s.label} ${s.value}${s.sub ? ` ${s.sub}` : ''}`)).toEqual([
      'Campaigns running 0', 'Posts 2 1 posted', 'Shoots 1', 'Ads live 1', 'Overdue 0'])
  })

  it('ads live: gone live on or before today, not ended before today', () => {
    const d = (kind: 'ads_live' | 'ads_end', day: string, project = 'p') => ({ project, stage: 0, field: kind, kind, day, pic: false, posted: null })
    expect(adsLive([d('ads_live', '2026-11-10')], '2026-11-10')).toBe(1)
    expect(adsLive([d('ads_live', '2026-11-11')], '2026-11-10')).toBe(0)
    expect(adsLive([d('ads_live', '2026-11-01'), d('ads_end', '2026-11-10')], '2026-11-10')).toBe(1) // ends today: still live
    expect(adsLive([d('ads_live', '2026-11-01'), d('ads_end', '2026-11-09')], '2026-11-10')).toBe(0)
    expect(adsLive([d('ads_live', '2026-11-01'), d('ads_end', '2026-11-03'), d('ads_live', '2026-11-08')], '2026-11-10')).toBe(1) // live again
    expect(adsLive([d('ads_end', '2026-11-30')], '2026-11-10')).toBe(0)
    expect(adsLive([d('ads_live', '2026-11-01', 'a'), d('ads_live', '2026-11-02', 'b')], '2026-11-10')).toBe(2)
  })

  it('filters by its kinds of date', () => {
    const evs = calendarEvents(dboard).filter(e => e.sub?.id === CAR)
    const only = (types: string[]) => evs.filter(e => passesSub(e, { ...NO_FILTER, types: types as never })).map(e => `${e.kind} ${e.line2}`)
    expect(only(['post'])).toEqual(['post Post day · Posted', 'post Post day · In production', 'post Post day 2 · In production'])
    expect(only(['meet'])).toEqual(['meet Shoot day'])
    expect(only(['ads']).length).toBe(4)
    expect(only(['due'])).toEqual([])
  })
})
