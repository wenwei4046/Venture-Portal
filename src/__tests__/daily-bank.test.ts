import { describe, it, expect } from 'vitest'
import {
  buildBankDay,
  columnForPool,
  columnForSegment,
  emptyAmounts,
  sumAmounts,
  totalsAcrossBanks,
  type PendingItem,
  type SegAmounts,
} from '@/lib/daily-bank'

const amounts = (patch: Partial<SegAmounts>): SegAmounts => ({ ...emptyAmounts(), ...patch })

describe('column mapping', () => {
  it('maps JE segments — corporate is Venture, oddballs land in Unassigned', () => {
    expect(columnForSegment('corporate')).toBe('venture')
    expect(columnForSegment('director')).toBe('director')
    expect(columnForSegment('director_office')).toBe('director_office')
    expect(columnForSegment('finance')).toBe('finance')
    expect(columnForSegment('hr')).toBe('hr')
    expect(columnForSegment('marketing')).toBe('marketing')
    expect(columnForSegment('treasury')).toBe('unassigned')
    expect(columnForSegment('unallocated')).toBe('unassigned')
    expect(columnForSegment(null)).toBe('unassigned')
  })

  it('maps PVS pools — both venture pools collapse into Venture', () => {
    expect(columnForPool('venture_pool')).toBe('venture')
    expect(columnForPool('dept_pool_venture_office')).toBe('venture')
    expect(columnForPool('dept_pool_director')).toBe('director')
    expect(columnForPool('dept_pool_marketing')).toBe('marketing')
    expect(columnForPool('corporate')).toBe('unassigned')
    expect(columnForPool(null)).toBe('unassigned')
  })
})

describe('buildBankDay', () => {
  const pending: PendingItem[] = [
    {
      voucherNo: 'HV-PV-202608-0223',
      payee: 'Job Street',
      description: 'Job Street',
      amounts: amounts({ venture: 7654.37 }),
      total: 7654.37,
    },
    {
      voucherNo: 'HV-PV-202608-0225',
      payee: 'KHO WEI JIE',
      description: 'Computer',
      amounts: amounts({ venture: 3000, marketing: 1556.23 }),
      total: 4556.23,
    },
  ]

  it('walks B/F + in − out − pending to available, per column and in total', () => {
    const day = buildBankDay({
      bankId: 'b1',
      bankName: 'Hong Leong Bank',
      glCode: '3000',
      bf: amounts({ venture: 40591.93, marketing: 2029.51 }),
      inToday: amounts({ marketing: 1230 }),
      outToday: amounts({ venture: 100 }),
      pending,
      receipts: [{ voucherNo: 'HV-OR-1', payer: 'Online', description: '', amount: 1230 }],
    })
    expect(day.current.venture).toBe(40491.93)
    expect(day.current.marketing).toBe(3259.51)
    expect(day.pendingTotal.venture).toBe(10654.37)
    expect(day.pendingTotal.marketing).toBe(1556.23)
    expect(day.available.venture).toBe(29837.56)
    expect(day.available.marketing).toBe(1703.28)
    expect(sumAmounts(day.available)).toBeCloseTo(
      sumAmounts(day.current) - sumAmounts(day.pendingTotal),
      2,
    )
  })

  it('otherInToday = GL in minus itemised receipts (JV/transfer remainder)', () => {
    const day = buildBankDay({
      bankId: 'b1',
      bankName: 'HL',
      glCode: '3000',
      bf: emptyAmounts(),
      inToday: amounts({ venture: 500, unassigned: 250 }),
      outToday: emptyAmounts(),
      pending: [],
      receipts: [{ voucherNo: 'HV-OR-2', payer: 'HC', description: '', amount: 500 }],
    })
    expect(day.otherInToday).toBe(250)
  })

  it('handles float dust with cent rounding', () => {
    const day = buildBankDay({
      bankId: 'b1',
      bankName: 'HL',
      glCode: '3000',
      bf: amounts({ finance: 0.1 }),
      inToday: amounts({ finance: 0.2 }),
      outToday: emptyAmounts(),
      pending: [],
      receipts: [],
    })
    expect(day.current.finance).toBe(0.3)
  })
})

describe('totalsAcrossBanks', () => {
  it('adds every bank available per column into the grand total', () => {
    const a = buildBankDay({
      bankId: 'a',
      bankName: 'HL',
      glCode: '3000',
      bf: amounts({ venture: 100, hr: 50 }),
      inToday: emptyAmounts(),
      outToday: emptyAmounts(),
      pending: [],
      receipts: [],
    })
    const b = buildBankDay({
      bankId: 'b',
      bankName: 'Alliance',
      glCode: '3010',
      bf: amounts({ venture: -460, hr: 25 }),
      inToday: emptyAmounts(),
      outToday: emptyAmounts(),
      pending: [],
      receipts: [],
    })
    const t = totalsAcrossBanks([a, b])
    expect(t.available.venture).toBe(-360)
    expect(t.available.hr).toBe(75)
    expect(t.grand).toBe(-285)
  })
})
