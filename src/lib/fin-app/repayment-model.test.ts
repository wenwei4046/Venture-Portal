import { describe, expect, it } from 'vitest'
import type { RepaymentSchedule } from '@/app/(portal)/repayment-schedule/_lib/schedule-data'
import { askedScheduleMonth, entryHref, repaymentModel, repaymentPlace } from './repayment-model'

// Fund › Repayment Schedule in the Finance phone app (2026-10-15, part 5c): the
// desktop page's month — its cards' figures, its due tables, its Full plans,
// its calendar's days — as a page of the app, a deal opening in the app.

const ev = (over: Partial<RepaymentSchedule['events'][number]>): RepaymentSchedule['events'][number] => ({
  kind: 'collect',
  name: 'HC',
  href: '/fund-out/loan-a?from=calendar',
  rate: 0.01,
  principal: 12000,
  date: '2026-10-05',
  amount: 100,
  outstanding: 100,
  status: 'due',
  no: 1,
  months: 12,
  ...over,
})

const SCHEDULE: RepaymentSchedule = {
  currentYM: '2026-10',
  isCurrentMonth: true,
  today: '2026-10-15',
  collectRows: [
    { key: 'loan-a', counterparty: 'HC', detail: 'RM 12,000.00 @ 1.000%/mo · 12mo · 10 left', principalDue: 1000, interestDue: 100, totalDue: 1100, done: false, received: 0 },
    { key: 'loan-b', counterparty: 'HS', detail: 'RM 6,000.00 @ 1.000%/mo · 12mo · 4 left', principalDue: 500, interestDue: 50, totalDue: 550, done: true, received: 550, source: 'HV' },
  ],
  collectMin: [{ key: 'loan-c', counterparty: 'HM', detail: 'RM 20,000.00 @ 1.000%/mo', due: 200, paid: 50, shortfall: 150, met: false }],
  collectCompound: [{ key: 'loan-d', counterparty: 'HK', detail: 'RM 10,000.00 @ 1.000%/mo · compounding since 2026-06', balance: 10500, accrued: 500, thisMonthInterest: 105, received: 0 }],
  collectNoTerm: [{ key: 'loan-e', counterparty: 'HT', detail: 'RM 5,000.00 @ 1.000%/mo · undecided', outstanding: 5000, monthlyInterest: 50, received: 0 }],
  repayRows: [{ key: 'fs-f', counterparty: 'PETER', detail: 'RM 1,800.00 @ 0.800%/mo · pending PV-2026-0101', principalDue: 290, interestDue: 10, totalDue: 300, done: false, received: 0, pending: true }],
  repayMin: [],
  repayCompound: [],
  repayNoTerm: [],
  events: [
    ev({ name: 'HC', amount: 1100, outstanding: 1100, status: 'overdue', no: 3 }),
    ev({ kind: 'pay', name: 'PETER', href: '/fund-in/fs-f?from=calendar&month=2026-10', amount: 300, outstanding: 0, status: 'paid', no: 1, months: 6 }),
    ev({ name: 'HS', href: '/fund-out/loan-b?from=calendar', date: '2026-10-20', amount: 550, outstanding: 550, status: 'due', no: 9 }),
  ],
}

describe('repaymentModel', () => {
  const m = repaymentModel(SCHEDULE)
  const card = (k: string) => m.cards.find((c) => c.key === k)!

  it('the desktop page’s cards, figure for figure: to collect, to pay, net, done so far, overdue', () => {
    expect(m.hero).toEqual({ value: 'RM 1,350.00', label: 'Net to collect · October 2026' })
    expect(m.chip).toEqual({ text: '1,100.00 overdue', tone: 'danger' })
    expect(m.cards.map((c) => [c.label, c.sub, c.value])).toEqual([
      ['To collect', '2 instalments · Fund OUT', 'RM 1,650.00'],
      ['To pay', '1 instalment · Fund IN', 'RM 300.00'],
      ['Calendar', '2 days · October 2026', '3 instalments'],
      ['Done so far', 'Received 550.00 · paid 0.00', 'RM 550.00'],
      ['Overdue / short', 'Collect 1,100.00 · pay 0.00', 'RM 1,100.00'],
    ])
    expect(card('short').tone).toBe('issued')
  })

  it('a side’s card is its due table — each deal once, its type, short or clear, a PV awaiting approval — then the Full plans', () => {
    const c = card('collect')
    expect(c.groups.map((g) => [g.title, g.count])).toEqual([
      ['Due to collect', 'RM 2,005.00'],
      ['Minimum interest', 'short RM 150.00'],
      ['Compounding', 'RM 10,500.00'],
      ['No fixed term', 'RM 5,000.00'],
    ])
    expect(c.groups[0].lines.map((l) => [l.label, l.value, l.chip?.text ?? null])).toEqual([
      ['HC', '1,100.00', 'short 1,100.00'],
      ['HS', '550.00', 'clear'],
      ['HM', '200.00', 'short 150.00'],
      ['HK', '105.00', null],
      ['HT', '50.00', null],
    ])
    expect(c.groups[0].lines[1]).toMatchObject({ sub: 'principal + interest · RM 6,000.00 @ 1.000%/mo · 12mo · 4 left · SC HV', open: { href: '/fin-app/fund/out?id=loan-b' } })
    expect(card('pay').groups[0].lines[0]).toMatchObject({ label: 'PETER', chip: { text: 'pending PV', tone: 'wait' }, open: { href: '/fin-app/fund/in?id=fs-f' } })
  })

  it('a due line’s own screen is the table’s columns', () => {
    const d = card('collect').groups[0].lines[0].detail!
    expect(d.groups[0].lines.map((l) => [l.label, l.value ?? l.chip?.text])).toEqual([
      ['Principal', '1,000.00'],
      ['Interest', '100.00'],
      ['Total due', '1,100.00'],
      ['Received · Oct', '—'],
      ['Short', '-1,100.00'],
    ])
    expect(d.groups[1].lines[0].open).toEqual({ href: '/fin-app/fund/out?id=loan-a' })
  })

  it('the calendar as days: each day’s net, collections first, where each instalment stands', () => {
    const g = card('calendar').groups
    expect(g.map((x) => [x.title, x.count])).toEqual([
      ['Mon 5 Oct 2026', '+1,100.00  −300.00'],
      ['Tue 20 Oct 2026', '+550.00'],
    ])
    expect(g[0].lines.map((l) => [l.label, l.sub, l.chip?.text, l.open?.href])).toEqual([
      ['↓ HC', 'Collect · instalment 3 of 12', 'overdue', '/fin-app/fund/out?id=loan-a'],
      ['↑ PETER', 'Pay · instalment 1 of 6', 'paid', '/fin-app/fund/in?id=fs-f'],
    ])
  })

  it('done so far and overdue / short list their deals', () => {
    expect(card('done').groups.map((g) => [g.title, g.count, g.lines.map((l) => l.label)])).toEqual([
      ['Received', 'RM 550.00', ['HS']],
      ['Paid', 'RM 0.00', []],
    ])
    expect(card('short').groups[0].lines.map((l) => [l.label, l.sub, l.value])).toEqual([['↓ HC', 'Due 5 Oct 2026 · instalment 3 of 12', '1,100.00']])
  })

  it('a month with more to pay says so; nothing overdue, no chip and a pale card', () => {
    const quiet = repaymentModel({ ...SCHEDULE, isCurrentMonth: false, currentYM: '2026-11', events: [], collectRows: [] })
    expect(quiet.hero).toEqual({ value: 'RM 300.00', label: 'Net to pay · November 2026' })
    expect(quiet.chip).toBeNull()
    expect(quiet.eyebrow).toBe('Repayment · Schedule for · November 2026')
    expect(quiet.cards.find((c) => c.key === 'short')!.tone).toBe('quiet')
    expect(quiet.cards.find((c) => c.key === 'calendar')!.groups[0]).toMatchObject({ empty: 'Nothing due in November 2026.' })
  })
})

describe('the page’s month and its deals', () => {
  it('steps back and ahead without end; the office’s month is the bare address', () => {
    expect(repaymentPlace('2026-10', '2026-10')).toMatchObject({ keep: '', period: { label: 'October 2026', prev: 'm=2026-09', next: 'm=2026-11' } })
    expect(repaymentPlace('2026-09', '2026-10')).toMatchObject({ keep: 'm=2026-09', period: { prev: 'm=2026-08', next: '' } })
    expect(askedScheduleMonth('2027-01', '2026-10')).toBe('2027-01')
    expect(askedScheduleMonth('2026-13', '2026-10')).toBe('2026-10')
    expect(askedScheduleMonth(undefined, '2026-10')).toBe('2026-10')
  })
  it('a calendar entry’s deal, in the app', () => {
    expect(entryHref({ kind: 'collect', href: '/fund-out/loan-a?from=calendar&month=2026-10' })).toBe('/fin-app/fund/out?id=loan-a')
    expect(entryHref({ kind: 'pay', href: '/fund-in/fs-f?from=calendar' })).toBe('/fin-app/fund/in?id=fs-f')
    expect(entryHref({ kind: 'pay', href: '/elsewhere' })).toBeNull()
  })
})
