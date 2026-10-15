import { describe, expect, it } from 'vitest'
import type { BankDay } from '@/lib/daily-bank'
import type { DailyBankData } from '@/lib/daily-bank-data'
import { dailyBankModel, dayWords, shiftDay } from './daily-bank-model'

// The Finance phone app's Daily Bank (2026-10-15, part 5): the desktop board's
// day as the app's hub — a card per bank, then Received today, Pending payment
// and Balance B/F — each card summing exactly what its list holds.

const COLS = [
  { key: 'venture', label: 'Venture' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'it', label: 'IT' },
]
const amt = (venture: number, marketing = 0, it = 0) => ({ venture, marketing, it })

const bank = (over: Partial<BankDay> & { bankId: string; bankName: string }): BankDay => ({
  glCode: '1100-01',
  bf: amt(0),
  inToday: amt(0),
  outToday: amt(0),
  current: amt(0),
  pending: [],
  pendingTotal: amt(0),
  available: amt(0),
  receipts: [],
  otherInToday: 0,
  ...over,
})

const DATA: DailyBankData = {
  date: '2026-10-15',
  columns: COLS,
  totals: { available: amt(0), grand: 0 },
  banks: [
    bank({
      bankId: 'hlb',
      bankName: 'Hong Leong Bank',
      bf: amt(100000, 20000, 5000),
      inToday: amt(3000, 0, 0),
      outToday: amt(1000, 0, 0),
      current: amt(102000, 20000, 5000),
      pending: [{ voucherNo: 'HV-PV-202610-0472', payee: 'CHEAH POO LIN', description: 'Office Rental', amounts: amt(7990), total: 7990 }],
      pendingTotal: amt(7990),
      available: amt(94010, 20000, 5000),
      receipts: [{ voucherNo: 'HV-OR-202610-0031', payer: 'Carres', description: 'Loan repayment', amount: 2500 }],
      otherInToday: 500,
    }),
    bank({ bankId: 'mbb', bankName: 'Maybank', bf: amt(-200), current: amt(-200), available: amt(-200) }),
  ],
}

describe('dailyBankModel', () => {
  const m = dailyBankModel(DATA, '2026-10-15')

  it('the day’s total available, said as today', () => {
    expect(m.hero).toEqual({ value: 'RM 118,810.00', label: 'Total available · Today · 15 Oct 2026' })
    expect(m.isToday).toBe(true)
  })

  it('a card per bank — what it has free, its walk — then what came in, what waits, what the day opened with', () => {
    expect(m.cards.map((c) => [c.key, c.label, c.sub, c.value, c.tone])).toEqual([
      ['bank:hlb', 'Hong Leong Bank', 'B/F 125,000.00 · +3,000.00 · −7,990.00', 'RM 119,010.00', 'all'],
      ['bank:mbb', 'Maybank', 'B/F -200.00', 'RM -200.00', 'company'],
      ['received', 'Received today', '1 receipt', 'RM 3,000.00', 'paid'],
      ['pending', 'Pending payment', '1 awaiting Principal', 'RM 7,990.00', 'pending_approval'],
      ['bf', 'Balance B/F', 'Start of the day', 'RM 124,800.00', 'quiet'],
    ])
  })

  it('a bank’s list: the day’s walk, its departments, what waits, what came in (money with no receipt said apart)', () => {
    const l = m.lists['bank:hlb']
    expect(l.title).toBe('Hong Leong Bank')
    expect(l.groups.map((g) => [g.title, g.count])).toEqual([
      ['The day', 'RM 119,010.00'],
      ['Departments', '3'],
      ['Pending · awaiting Principal', '1'],
      ['Received', '1'],
    ])
    expect(l.groups[0].lines.map((x) => [x.label, x.value])).toEqual([
      ['Balance B/F', '125,000.00'],
      ['Received', '+3,000.00'],
      ['Paid out', '−1,000.00'],
      ['Balance', '127,000.00'],
      ['Pending', '−7,990.00'],
      ['Available', '119,010.00'],
    ])
    expect(l.groups[1].lines.map((x) => [x.label, x.sub, x.value])).toEqual([
      ['Venture', 'B/F 100,000.00 · +3,000.00 · −7,990.00', '94,010.00'],
      ['Marketing', 'B/F 20,000.00', '20,000.00'],
      ['IT', 'B/F 5,000.00', '5,000.00'],
    ])
    expect(l.groups[2].lines[0]).toMatchObject({ label: 'CHEAH POO LIN', sub: 'HV-PV-202610-0472 · Office Rental · Venture', value: '−7,990.00', tone: 'alert' })
    expect(l.groups[3].lines.map((x) => [x.label, x.value])).toEqual([
      ['Carres', '+2,500.00'],
      ['Other (JV / transfer)', '+500.00'],
    ])
  })

  it('Received today holds the receipts and the money with none — what the card sums', () => {
    const lines = m.lists.received.groups.flatMap((g) => g.lines)
    expect(lines.reduce((t, l) => t + Number(l.value.replace(/[+,]/g, '')), 0)).toBe(3000)
    expect(m.lists.received.groups.map((g) => [g.title, g.count])).toEqual([
      ['Hong Leong Bank', 'RM 3,000.00'],
      ['Maybank', 'RM 0.00'],
    ])
  })

  it('another day is said by its date, with no Today', () => {
    const past = dailyBankModel({ ...DATA, date: '2026-10-14' }, '2026-10-15')
    expect(past.dayLabel).toBe('14 Oct 2026')
    expect(past.isToday).toBe(false)
  })
})

describe('days', () => {
  it('steps over a month’s end and is written as the desktop writes it', () => {
    expect(shiftDay('2026-10-31', 1)).toBe('2026-11-01')
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28')
    expect(dayWords('2026-10-05')).toBe('5 Oct 2026')
  })
})
