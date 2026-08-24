import { describe, it, expect } from 'vitest'
import {
  applyPoolAdjust,
  buildBankDay,
  columnForPool,
  columnForSegment,
  emptyAmounts,
  sumAmounts,
  totalsAcrossBanks,
  type PendingItem,
  type SegAmounts,
} from '@/lib/daily-bank'

const amounts = (patch: Record<string, number>): SegAmounts => ({ ...emptyAmounts(), ...patch })

describe('column mapping', () => {
  it('maps JE segments — corporate/treasury/untagged all land in Venture (dept-pool page parity)', () => {
    expect(columnForSegment('corporate')).toBe('venture')
    expect(columnForSegment('treasury')).toBe('venture')
    expect(columnForSegment('unallocated')).toBe('venture')
    expect(columnForSegment(null)).toBe('venture')
    expect(columnForSegment('director')).toBe('director')
    expect(columnForSegment('director_office')).toBe('director_office')
    expect(columnForSegment('finance')).toBe('finance')
    expect(columnForSegment('hr')).toBe('hr')
    expect(columnForSegment('marketing')).toBe('marketing')
  })

  it('maps PVS pools — venture pools and unknowns collapse into Venture', () => {
    expect(columnForPool('venture_pool')).toBe('venture')
    expect(columnForPool('dept_pool_venture_office')).toBe('venture')
    expect(columnForPool('corporate')).toBe('venture')
    expect(columnForPool(null)).toBe('venture')
    expect(columnForPool('dept_pool_director')).toBe('director')
    expect(columnForPool('dept_pool_marketing')).toBe('marketing')
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
      inToday: amounts({ venture: 500, hr: 250 }),
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

describe('applyPoolAdjust', () => {
  it('folds each dept pool-vs-GL gap and the venture overlay into the primary bank only', () => {
    const hl = buildBankDay({
      bankId: 'hl',
      bankName: 'HL',
      glCode: '3000',
      bf: amounts({ hr: 20000, venture: 100000 }),
      inToday: emptyAmounts(),
      outToday: emptyAmounts(),
      pending: [
        {
          voucherNo: 'PV-1',
          payee: 'X',
          description: '',
          amounts: amounts({ hr: 1000 }),
          total: 1000,
        },
      ],
      receipts: [],
    })
    const alliance = buildBankDay({
      bankId: 'al',
      bankName: 'Alliance',
      glCode: '3010',
      bf: amounts({ hr: 300 }),
      inToday: emptyAmounts(),
      outToday: emptyAmounts(),
      pending: [],
      receipts: [],
    })
    // Pool says HR really holds 24,220.27 (GL slice across banks = 20,300)
    const out = applyPoolAdjust([hl, alliance], { hr: 24220.27 }, 11949.9, 'hl')
    const outHl = out[0]
    const outAl = out[1]
    expect(outHl.current.hr).toBe(23920.27) // 20,000 + gap 3,920.27
    expect(outHl.bf.hr).toBe(23920.27)
    expect(outHl.available.hr).toBe(22920.27) // − pending 1,000
    expect(outHl.current.venture).toBe(111949.9) // + overlay
    expect(outAl.current.hr).toBe(300) // untouched
    expect(outHl.current.hr + outAl.current.hr).toBe(24220.27) // ties to pool
  })

  it('returns banks unchanged when the primary bank id is unknown', () => {
    const hl = buildBankDay({
      bankId: 'hl',
      bankName: 'HL',
      glCode: '3000',
      bf: amounts({ finance: 10 }),
      inToday: emptyAmounts(),
      outToday: emptyAmounts(),
      pending: [],
      receipts: [],
    })
    expect(applyPoolAdjust([hl], { finance: 999 }, 0, 'nope')).toEqual([hl])
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
