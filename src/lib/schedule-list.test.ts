import { describe, expect, it } from 'vitest'
import type { CalendarEntry } from './repayment-calendar'
import { listTotals, scheduleList, statusWords, type ListDeal } from './schedule-list'

const entry = (over: Partial<CalendarEntry>): CalendarEntry => ({
  kind: 'collect',
  id: 'L1',
  name: 'CMI',
  href: '/fund-out/L1',
  rate: 0.005,
  principal: 80_000,
  date: '2026-11-01',
  amount: 1733.33,
  outstanding: 1733.33,
  status: 'overdue',
  no: 1,
  months: 60,
  instPrincipal: 1333.33,
  instInterest: 400,
  paid: 0,
  paidOn: null,
  rolled: 0,
  ...over,
})

const deals = new Map<string, ListDeal>([
  ['L1', { counterparty: 'CMI', detail: 'RM 80,000.00 @ 0.500%/mo · 60mo', source: 'MK' }],
  ['L2', { counterparty: 'CAR', detail: 'RM 200,000.00 @ 3.000%/mo · 8mo' }],
  ['C1', { counterparty: 'CONTS', detail: 'RM 60,000.00 @ 4.000%/mo · compounding since 2025-04' }],
  ['N1', { counterparty: '2990', detail: 'RM 80,002.00 @ 4.000%/mo · undecided' }],
])

const today = '2026-11-04'

describe('scheduleList — We collect / We pay a month at a time', () => {
  it('is one row an instalment, on its day, with its split, status and paid date', () => {
    const rows = scheduleList({
      entries: [
        entry({ id: 'L2', name: 'CAR', date: '2026-11-03', amount: 31_000, outstanding: 1000, status: 'partial', no: 2, months: 8, instPrincipal: 25_000, instInterest: 6000, paid: 30_000 }),
        entry({}),
      ],
      deals,
      compounding: new Set(),
      extras: [],
      month: '2026-11',
      today,
    })
    expect(rows.map((r) => [r.date, r.counterparty, r.status, r.no, r.months, r.due, r.received, r.owed])).toEqual([
      ['2026-11-01', 'CMI', 'overdue', 1, 60, 1733.33, 0, 1733.33],
      ['2026-11-03', 'CAR', 'partial', 2, 8, 31_000, 30_000, 1000],
    ])
    expect(rows[0]).toMatchObject({ principal: 1333.33, interest: 400, source: 'MK', detail: 'RM 80,000.00 @ 0.500%/mo · 60mo' })
  })

  it('a paid instalment keeps the day it was paid', () => {
    const [r] = scheduleList({
      entries: [entry({ outstanding: 0, status: 'paid', paid: 1733.33, paidOn: '2026-11-02' })],
      deals,
      compounding: new Set(),
      extras: [],
      month: '2026-11',
      today,
    })
    expect(r).toMatchObject({ status: 'paid', paidOn: '2026-11-02', owed: 0, received: 1733.33 })
  })

  it('a compounding month rolls into the balance — nothing owed in cash, left out of the cash totals', () => {
    const rows = scheduleList({
      entries: [
        entry({}),
        entry({ id: 'C1', name: 'CONTS', date: '2026-11-15', amount: 2447.38, outstanding: 2447.38, status: 'due', no: 20, months: null, instPrincipal: 0, instInterest: 2447.38 }),
      ],
      deals,
      compounding: new Set(['C1']),
      extras: [{ id: 'C1', interest: 2447.38, received: 0 }],
      month: '2026-11',
      today,
    })
    expect(rows).toHaveLength(2)
    const rolled = rows.find((r) => r.id === 'C1')!
    expect(rolled).toMatchObject({ status: 'rolled', owed: null, no: null })
    expect(statusWords(rolled, today)).toBe('Rolls in')
    expect(listTotals(rows, today)).toMatchObject({ due: 1733.33, owed: 1733.33, rolled: 2447.38, overdue: 1733.33, overdueCount: 1 })
  })

  it('a past month whose interest rolled says so, though its plan row owes nothing', () => {
    const [r] = scheduleList({
      entries: [entry({ id: 'C1', date: '2026-09-15', amount: 2300, outstanding: 0, status: 'paid', months: null, rolled: 2300 })],
      deals,
      compounding: new Set(['C1']),
      extras: [],
      month: '2026-09',
      today,
    })
    expect(r).toMatchObject({ status: 'rolled', owed: null, paidOn: null })
    expect(statusWords(r, today)).toBe('Rolled in')
  })

  it('a deal with no row in the month stands on its last day with the interest the page worked out', () => {
    const rows = scheduleList({
      entries: [],
      deals,
      compounding: new Set(['C1']),
      extras: [
        { id: 'N1', interest: 3200.08, received: 0 },
        { id: 'C1', interest: 2447.38, received: 0 },
      ],
      month: '2026-12',
      today,
    })
    expect(rows.map((r) => [r.date, r.counterparty, r.status, r.owed])).toEqual([
      ['2026-12-31', '2990', 'due', 3200.08],
      ['2026-12-31', 'CONTS', 'rolled', null],
    ])
  })

  it('says each status in words', () => {
    expect(statusWords({ status: 'overdue', date: '2026-11-01' }, today)).toBe('Overdue · 3d')
    expect(statusWords({ status: 'due', date: '2026-11-12' }, today)).toBe('Due in 8d')
    expect(statusWords({ status: 'due', date: today }, today)).toBe('Due today')
    expect(statusWords({ status: 'partial', date: '2026-11-03' }, today)).toBe('Part paid · 1d late')
  })
})
