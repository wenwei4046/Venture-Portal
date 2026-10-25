import { describe, expect, it } from 'vitest'
import {
  calendarItems, calendarMessage, calendarMonths, calendarUrl, campaignsRunning, legendOf, listDays, monthWeeks, picCalBanner,
  picCalendarFromRow, rangeWords, type PicCalendar,
} from './pic-calendar'

// 2026-10-24 — ⑤-2: the PIC's own calendar (`PIC Calendar.dc.html`, the prototype's "Calendar link (Carres · Kelvin)") —
// what mkt_pic_calendar answers, read; its items; the list's days; the month's weeks and their campaign bars; the
// campaigns running; the banner; the legend. What the database keeps from a PIC is validate-marketing-pic-calendar.mjs's.

const C1 = 'c'.repeat(32)
const C2 = 'd'.repeat(32)
const row = (over: Record<string, unknown> = {}) => ({
  today: '2026-11-10', from: '2026-10-01', to: '2027-02-28',
  sub: { name: 'Carres', dot: 'oklch(0.70 0.12 235)' }, pic: 'Kelvin Tan',
  dates: [
    { day: '2026-11-11', kind: 'post', field: 'Post day', title: 'Teaser 1/2', product: 'Year-End Video', code: C1, done: false, posted: null },
    { day: '2026-11-12', kind: 'post', field: 'Post day', title: 'Teaser 2/2', product: 'Year-End Video', code: C1, done: true, posted: null },
    { day: '2026-11-09', kind: 'post', field: 'Post day', title: 'Reel', product: 'Nov content', code: C2, done: true,
      posted: { at: '2026-11-09T02:00:00Z', link: 'https://instagram.com/p/x' } },
    { day: '2026-11-14', kind: 'shoot', field: 'Showroom shoot', title: 'Year-End Video', product: 'Year-End Video', code: C1, done: false, posted: null },
    { day: '2026-11-20', kind: 'ads_live', field: 'Ads go-live', title: 'Ads 1/1', product: '11.11 Deal', code: null, done: false, posted: null },
    { day: '2027-01-15', kind: 'post', field: 'Post day', title: 'New year post', product: 'Year-End Sale', code: C1, done: false, posted: null },
  ],
  approvals: [
    { day: '2026-11-11', title: 'Teaser 1/2', product: 'Year-End Video', stage: 'Client review', code: C1, waiting: false },
    { day: '2026-11-05', title: 'Reel', product: 'Nov content', stage: 'Approval', code: C2, waiting: true },
    { day: '2026-11-25', title: 'Dec plan', product: 'Dec content', stage: 'Plan review', code: C2, waiting: false },
  ],
  minutes: [],
  campaigns: [
    { title: '11.11 Deal', from: '2026-11-09', until: '2026-11-12', code: C1 },
    { title: 'Showroom Weekends', from: '2026-11-07', until: '2026-11-29', code: C2 },
    { title: 'Year-End Sale', from: '2026-12-01', until: '2026-12-31', code: C1 },
    { title: 'Raya', from: '2027-02-01', until: '2027-02-10', code: null },
    { title: 'Past', from: '2026-10-01', until: '2026-10-05', code: null },
  ],
  holidays: [{ day: '2026-11-08', name: 'Deepavali' }, { day: '2026-11-11', name: 'Singles Day sale' }, { day: '2026-11-30', name: 'Payday' }],
  ...over,
})
const cal = (over: Record<string, unknown> = {}) => picCalendarFromRow(row(over)) as PicCalendar
const byKey = (c: PicCalendar, now: Date | null = null) => new Map(calendarItems(c, now).map(i => [i.key, i]))

describe('what the calendar link reads', () => {
  it('nothing, or not a calendar: closed', () => {
    for (const v of [null, undefined, 'x', [], {}, { today: '2026-11-10' }, { today: 'x', from: '2026-10-01', to: '2027-02-28' }]) {
      expect(picCalendarFromRow(v)).toBeNull()
    }
  })

  it('its sub, its PIC and what was sent to them — a kind, a day, a code, a post’s link it does not know left out', () => {
    const c = picCalendarFromRow(row({
      sub: { name: 'Carres', dot: 'red' },
      dates: [
        { day: '2026-11-11', kind: 'post', field: 'Post day', title: 'A', product: 'P', code: C1, done: true, posted: { at: 'x', link: 'javascript:alert(1)' } },
        { day: '2026-11-11', kind: 'party', field: 'X', title: 'B', product: 'P', code: C1 },
        { day: 'soon', kind: 'post', field: 'X', title: 'C', product: 'P', code: C1 },
        { day: '2026-11-12', kind: 'report', field: 'Report day', title: 'D', product: 'P', code: 'not-a-code' },
      ],
      campaigns: [{ title: 'Backwards', from: '2026-11-12', until: '2026-11-09', code: C1 }],
    }))!
    expect([c.today, c.from, c.to, c.pic, c.sub]).toEqual(['2026-11-10', '2026-10-01', '2027-02-28', 'Kelvin Tan', { name: 'Carres', dot: 'oklch(0.62 0.02 60)' }])
    expect(c.dates.map(d => [d.title, d.kind, d.code, d.posted])).toEqual([['A', 'post', C1, null], ['D', 'report', null, null]])
    expect(c.campaigns).toEqual([])
    expect(cal().approvals[1]).toEqual({ day: '2026-11-05', title: 'Reel', product: 'Nov content', stage: 'Approval', code: C2, waiting: true })
  })

  it('a product project’s name without the subsidiary’s in front — the whole page is the subsidiary’s', () => {
    const c = cal({
      dates: [{ day: '2026-11-11', kind: 'post', field: 'Post day', title: 'Post 1/2', product: 'Carres · Social Media · Oct 2026', code: C1, done: false, posted: null }],
      approvals: [{ day: '2026-11-11', title: 'Carres · Social Media · Oct 2026', product: 'Carres · Social Media · Oct 2026', stage: 'S', code: C1, waiting: true }],
      minutes: [{ title: 'Carres · Social Media · Oct 2026', code: C1, sentAt: null }],
      campaigns: [{ title: 'Carres · 11.11 Deal · Nov 2026', from: '2026-11-09', until: '2026-11-12', code: C1 }, { title: 'Carresville sale', from: '2026-11-09', until: '2026-11-12', code: C1 }],
    })
    expect([c.dates[0].product, c.approvals[0].title, c.approvals[0].product, c.minutes[0].title, c.campaigns.map(x => x.title)])
      .toEqual(['Social Media · Oct 2026', 'Social Media · Oct 2026', 'Social Media · Oct 2026', 'Social Media · Oct 2026', ['11.11 Deal · Nov 2026', 'Carresville sale']])
  })

  it('its address, and WhatsApp’s words with it', () => {
    expect(calendarUrl('https://erp.example/', C1)).toBe(`https://erp.example/cal/${C1}`)
    expect(calendarMessage('Kelvin', 'Carres', 'u')).toBe('Hi Kelvin, Carres’s marketing calendar — what is coming up, and what waits for your approval: u')
    expect(calendarMessage('', 'Carres', 'u')).toMatch(/^Hi there, /)
  })
})

describe('its items', () => {
  it('a date: its kind’s words, a post’s state, the field when it says more, the product — and its tracking page', () => {
    const it = byKey(cal())
    expect(['d0', 'd1', 'd2', 'd3', 'd4'].map(k => [it.get(k)!.label, it.get(k)!.glyph, it.get(k)!.note, it.get(k)!.href, it.get(k)!.postLink])).toEqual([
      ['Post', 'P', 'Year-End Video', `/t/${C1}`, null],
      ['Post', 'P', 'Scheduled · Year-End Video', `/t/${C1}`, null],
      ['Post', 'P', 'Posted · Nov content', `/t/${C2}`, 'https://instagram.com/p/x'],
      ['Shoot day', 'S', 'Showroom shoot', `/t/${C1}`, null],
      ['Go live', '▶', '11.11 Deal', null, null],
    ])
  })

  it('an approval by its deadline — due tomorrow, a deadline; one waiting since a day gone by on today', () => {
    const it = byKey(cal())
    expect(['a0', 'a1', 'a2'].map(k => [it.get(k)!.day, it.get(k)!.label, it.get(k)!.note, it.get(k)!.waiting, it.get(k)!.urgent])).toEqual([
      ['2026-11-11', 'Your approval due tomorrow', 'Client review · Year-End Video', false, true],
      ['2026-11-10', 'Waiting for your approval', 'Approval · Nov content · Was due 5 Nov', true, true],
      ['2026-11-25', 'Your approval deadline', 'Plan review · Dec content', false, false],
    ])
    expect(byKey(cal({ approvals: [{ day: '2026-11-10', title: 'T', product: 'T', stage: 'S', code: C1, waiting: false }] })).get('a0')!.label)
      .toBe('Your approval due today')
  })

  it('the minutes waiting for them on today — overdue once they have waited 4 working hours (the user’s answer 2)', () => {
    const c = cal({ minutes: [{ title: 'Nov content', code: C2, sentAt: '2026-11-09T01:00:00Z' }] })
    const at = (iso: string | null) => byKey(c, iso ? new Date(iso) : null).get('m0')!
    expect([at(null).day, at(null).label, at(null).note, at(null).waiting, at(null).overdue]).toEqual(['2026-11-10', 'Waiting for your approval', 'Meeting minutes', true, false])
    expect(at('2026-11-09T02:00:00Z').overdue).toBe(false)
    expect([at('2026-11-09T06:30:00Z').label, at('2026-11-09T06:30:00Z').overdue]).toEqual(['Overdue — please review', true])
  })
})

describe('the list: what is coming up', () => {
  it('each day from today to 60 days on — waiting and due first — and the key dates while they are on', () => {
    const c = cal()
    const days = listDays(c, calendarItems(c), true)
    expect(days.map(d => [d.day, d.wd, d.n, d.mon, d.flags.map(f => f.name), d.items.map(i => i.key)])).toEqual([
      ['2026-11-10', 'Today', 10, 'Nov', [], ['a1']],
      ['2026-11-11', 'Wed', 11, 'Nov', ['Singles Day sale'], ['a0', 'd0']],
      ['2026-11-12', 'Thu', 12, 'Nov', [], ['d1']],
      ['2026-11-14', 'Sat', 14, 'Nov', [], ['d3']],
      ['2026-11-20', 'Fri', 20, 'Nov', [], ['d4']],
      ['2026-11-25', 'Wed', 25, 'Nov', [], ['a2']],
      ['2026-11-30', 'Mon', 30, 'Nov', ['Payday'], []],
    ])
    expect(listDays(c, calendarItems(c), false).map(d => [d.day, d.flags.length])).toEqual([
      ['2026-11-10', 0], ['2026-11-11', 0], ['2026-11-12', 0], ['2026-11-14', 0], ['2026-11-20', 0], ['2026-11-25', 0],
    ])
  })

  it('a run in short words', () => {
    expect([rangeWords('2026-11-09', '2026-11-09'), rangeWords('2026-11-09', '2026-11-12'), rangeWords('2026-11-28', '2026-12-03'),
      rangeWords('2026-12-28', '2027-01-03')]).toEqual(['9 Nov', '9 – 12 Nov', '28 Nov – 3 Dec', '28 Dec 2026 – 3 Jan 2027'])
  })

  it('the campaigns running, and those starting within 30 days — how far through each is', () => {
    expect(campaignsRunning(cal())).toEqual([
      { key: 'c0', title: '11.11 Deal', range: '9 – 12 Nov · running', pct: 50, href: `/t/${C1}`, tone: 0 },
      { key: 'c1', title: 'Showroom Weekends', range: '7 – 29 Nov · running', pct: 17, href: `/t/${C2}`, tone: 1 },
      { key: 'c2', title: 'Year-End Sale', range: '1 – 31 Dec · starts soon', pct: 0, href: `/t/${C1}`, tone: 0 },
    ])
  })
})

describe('its own key dates (2026-10-25)', () => {
  it('read beside HR’s holidays — flagged first, every year’s on its day — in the list and the month', () => {
    const c = cal({ keyDates: [
      { day: '2025-12-12', name: '12.12 sale day', short: '12.12', yearly: true },
      { day: '2026-11-21', name: 'New Carres showroom opens (Puchong)', short: 'Showroom', yearly: false },
      { day: '2026-11-08', name: 'Payday', short: null, yearly: false },
      { day: 'soon', name: 'Not a day' },
    ] })
    expect(c.keyDates.map(k => k.name)).toEqual(['12.12 sale day', 'New Carres showroom opens (Puchong)', 'Payday'])
    expect(listDays(c, calendarItems(c), true).filter(d => d.flags.length).map(d => [d.day, d.flags.map(f => f.short)])).toEqual([
      ['2026-11-11', ['Singles']], ['2026-11-21', ['Showroom']], ['2026-11-30', ['Payday']], ['2026-12-12', ['12.12']],
    ])
    expect(monthWeeks(c, calendarItems(c), '2026-11-01', true)[1].days[6].flags.map(f => [f.name, f.own])).toEqual([['Payday', true], ['Deepavali', false]])
    expect(listDays(c, calendarItems(c), false).some(d => d.day === '2026-11-21')).toBe(false)
    // Before the database sent them: none.
    expect(cal().keyDates).toEqual([])
  })
})

describe('the month', () => {
  it('the months it holds: last month to three ahead', () => {
    expect(calendarMonths(cal())).toEqual(['2026-10-01', '2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01'])
  })

  it('its weeks, Monday first — each day’s items, the key dates, today — with the campaigns as bars across their days', () => {
    const c = cal()
    const weeks = monthWeeks(c, calendarItems(c), '2026-11-01', true)
    expect(weeks.map(w => w.days[0].day)).toEqual(['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'])
    expect([weeks[0].days[0].out, weeks[0].days[6].out, weeks[5].days[1].out]).toEqual([true, false, true])
    expect(weeks[0].bars).toEqual([])
    const [wk2, wk3] = [weeks[1], weeks[2]]
    expect(wk2.days[6].flags.map(f => f.name)).toEqual(['Deepavali'])
    expect(wk2.bars.map(b => [b.label, Math.round(b.left), Math.round(b.width), b.row, b.start, b.end])).toEqual([['Showroom Weekends · 7 – 29 Nov', 71, 29, 0, true, false]])
    expect(wk3.bars.map(b => [b.label, Math.round(b.left), Math.round(b.width), b.row, b.start, b.end, b.href, b.tone])).toEqual([
      ['11.11 Deal · 9 – 12 Nov', 0, 57, 0, true, true, `/t/${C1}`, 0],
      ['Showroom Weekends · 7 – 29 Nov', 0, 100, 1, false, false, `/t/${C2}`, 1],
    ])
    expect([wk3.days[1].today, wk3.days[1].items.map(i => i.key), wk3.days[2].items.map(i => i.key)]).toEqual([true, ['a1'], ['a0', 'd0']])
    expect(monthWeeks(c, calendarItems(c), '2026-11-01', false)[1].days[6].flags).toEqual([])
    expect(monthWeeks(c, calendarItems(c), '2027-01-01', true).flatMap(w => w.days.flatMap(d => d.items.map(i => i.title)))).toEqual(['New year post'])
  })
})

describe('the banner and the legend', () => {
  it('what waits for them — the overdue first, the rest counted — else an approval due by tomorrow, else nothing', () => {
    const c = cal()
    expect(picCalBanner(c, calendarItems(c))).toEqual({ tone: 'waiting', title: 'Waiting for your approval', text: 'Reel · Approval · Nov content · Was due 5 Nov', href: `/t/${C2}` })
    const late = cal({ minutes: [{ title: 'Nov content', code: C2, sentAt: '2026-11-09T01:00:00Z' }] })
    expect(picCalBanner(late, calendarItems(late, new Date('2026-11-09T06:30:00Z')))).toEqual({
      tone: 'red', title: 'Overdue — please review', text: 'Nov content · Meeting minutes · 1 more waiting', href: `/t/${C2}`,
    })
    const soon = cal({ approvals: [{ day: '2026-11-11', title: 'Teaser 1/2', product: 'Year-End Video', stage: 'Client review', code: C1, waiting: false }] })
    expect(picCalBanner(soon, calendarItems(soon))).toEqual({ tone: 'waiting', title: 'Your approval due tomorrow', text: 'Teaser 1/2 · 11 Nov', href: `/t/${C1}` })
    const calm = cal({ approvals: [] })
    expect(picCalBanner(calm, calendarItems(calm))).toBeNull()
  })

  it('the handoff’s four kinds and the key date — another kind only when it is on the calendar', () => {
    const c = cal()
    expect(legendOf(calendarItems(c)).map(l => [l.glyph, l.label])).toEqual([['P', 'Post'], ['▶', 'Go live'], ['S', 'Shoot day'], ['!', 'Your approval'], ['⚑', 'Key date']])
    const more = cal({ dates: [{ day: '2026-11-11', kind: 'report', field: 'Report day', title: 'R', product: 'R', code: C1, done: false, posted: null }] })
    expect(legendOf(calendarItems(more)).map(l => l.label)).toEqual(['Post', 'Go live', 'Shoot day', 'Your approval', 'Report', 'Key date'])
  })
})
