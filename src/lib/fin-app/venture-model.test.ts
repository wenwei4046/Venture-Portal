import { describe, expect, it } from 'vitest'
import type { VenturePoolRead } from '@/app/(portal)/venture-pool/_lib/venture-read'
import { venturePoolModel } from './venture-model'

// Department › Venture Pool in the Finance phone app (2026-10-15, part E3): the
// desktop page's figures — the running balance, the month's net, twelve months
// of in and out, the ledger month by month in the desktop table's order.

const trend = (pairs: Array<[number, number]>) => pairs.map(([i, o], k) => ({ label: `M${k}`, in: i, out: o }))

const READ: VenturePoolRead = {
  balance: 93830.78,
  monthIn: 112739.42,
  monthOut: 55125.14,
  netChange: 57614.28,
  // Twelve months to October 2026, oldest first, as the desktop's bars.
  trend: trend([
    [0, 0], [0, 0], [0, 0], [0, 0.4], [305000, 300000], [219733.57, 192690.95],
    [408599.65, 433876.22], [299446.52, 321298.95], [915436.22, 888937.21], [882508.17, 866517.79], [139976.11, 131162.22], [112739.42, 55125.14],
  ]),
  // As read: by id, the desktop table's tie order.
  lines: [
    { id: 'a1', date: '2026-10-13', type: 'Payment voucher', dir: 'in', description: 'Bank deposit — HV-OR-202610-0535', amount: 1159.9 },
    { id: 'a2', date: '2026-10-07', type: 'Loan', dir: 'out', description: 'Bank — loan disbursement HV-PV-202610-0475', amount: -40000 },
    { id: 'a3', date: '2026-10-13', type: 'Payment voucher', dir: 'in', description: 'Bank deposit — HV-OR-202610-0534', amount: 844.61 },
    { id: 'a4', date: '2026-09-30', type: 'Manual JV', dir: 'out', description: 'Bank charges', amount: -12.5 },
    { id: 'a5', date: '2026-10-07', type: 'Payment voucher', dir: 'out', description: 'Bank payment - HV-PV-202610-0477', amount: -4400 },
  ],
}

describe('Venture Pool on the phone', () => {
  const m = venturePoolModel(READ, '2026-10')

  it('opens on the running balance, the month net as its chip', () => {
    expect(m.hero).toEqual({ value: 'RM 93,830.78', label: 'Running balance · all-time' })
    expect(m.chip).toEqual({ text: '+57,614.28 this month', tone: 'ledger' })
    expect(m.cards.map((c) => [c.label, c.sub, c.value])).toEqual([
      ['This month', 'In 112,739.42 · Out 55,125.14', 'RM 57,614.28'],
      ['12 months', 'In 3,283,439.66 · Out 3,189,608.88', 'RM 93,830.78'],
      ['Pool ledger', '5 entries', 'RM 93,830.78'],
    ])
  })

  it('a month lists its lines newest day first, a day in the order read (the desktop table’s)', () => {
    const month = m.cards[0].groups![0]
    expect(month.title).toBe('October 2026')
    expect(month.count).toBe('4 entries')
    expect(month.lines.map((l) => l.key)).toEqual(['a1', 'a3', 'a2', 'a5'])
    expect(month.lines[2]).toMatchObject({ label: 'Bank — loan disbursement HV-PV-202610-0475', sub: '7 Oct 2026 · Loan', value: '−40,000.00', tone: 'out' })
    expect(month.lines[0]).toMatchObject({ value: '+1,159.90', tone: 'ledger' })
  })

  it('twelve months read newest first, each month its own net', () => {
    const lines = m.cards[1].groups![0].lines
    expect(lines).toHaveLength(12)
    expect(lines[0]).toMatchObject({ label: 'October 2026', sub: 'In 112,739.42 · Out 55,125.14', value: '+57,614.28', tone: 'ledger' })
    expect(lines[4]).toMatchObject({ label: 'June 2026', value: '−21,852.43', tone: 'out' })
    expect(lines[11].label).toBe('November 2025')
  })

  it('the ledger groups by month with each month’s net', () => {
    const groups = m.cards[2].groups!
    expect(groups.map((g) => [g.title, g.count, g.lines.length])).toEqual([
      ['October 2026', '−42,395.49', 4],
      ['September 2026', '−12.50', 1],
    ])
  })

  it('a falling month turns the chip and an empty pool says so', () => {
    const down = venturePoolModel({ ...READ, netChange: -50, lines: [] }, '2026-10')
    expect(down.chip).toEqual({ text: '−50.00 this month', tone: 'danger' })
    expect(down.cards[0].groups![0].empty).toBe('No movements this month.')
    expect(down.cards[2].groups![0]).toMatchObject({ title: 'Pool ledger', count: '0', empty: 'No movements yet.' })
  })
})
