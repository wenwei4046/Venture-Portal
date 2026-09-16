import { describe, it, expect } from 'vitest'
import {
  isOpenBillRank,
  summariseOpenBill,
  type OpenBillOrderInput,
} from './open-bill-summary'

function order(over: Partial<OpenBillOrderInput> & { orderId: string }): OpenBillOrderInput {
  return {
    orderNo: `HC-SO-${over.orderId}`,
    orderDate: '2026-08-03',
    eventDate: '2026-08-03',
    customerName: 'A customer',
    venue: 'SPICE ARENA',
    venueGroupName: null,
    staffId: 'chea',
    employeeName: 'CHEA HUAN',
    agentName: 'CHEA',
    orderTotal: 10_000,
    commissionable: 10_000,
    depositMet: true,
    openBillRank: null,
    openBillAuto: null,
    ...over,
  }
}

const RATES = new Map([
  [1, 0.5],
  [2, 0.4],
  [3, 0.3],
])

describe('isOpenBillRank', () => {
  it('is 1, 2 or 3 and nothing else', () => {
    expect(isOpenBillRank(1)).toBe(true)
    expect(isOpenBillRank(3)).toBe(true)
    expect(isOpenBillRank(0)).toBe(false)
    expect(isOpenBillRank(4)).toBe(false)
    expect(isOpenBillRank(null)).toBe(false)
  })
})

describe('summariseOpenBill', () => {
  it('keeps only the picked bills, in the order the days wrote them', () => {
    const s = summariseOpenBill([
      order({ orderId: 'c', eventDate: '2026-08-05', openBillRank: 1 }),
      order({ orderId: 'b', eventDate: '2026-08-03', openBillRank: 2 }),
      order({ orderId: 'a', eventDate: '2026-08-03', openBillRank: 1 }),
      order({ orderId: 'none' }),
    ])
    expect(s.bills.map(b => b.orderId)).toEqual(['a', 'b', 'c'])
    expect(s.totals.bills).toBe(3)
  })

  it('counts each rank, its sales value and the uplift the scheme pays', () => {
    const s = summariseOpenBill(
      [
        order({ orderId: '1', openBillRank: 1, orderTotal: 9_500 }),
        order({ orderId: '2', openBillRank: 1, orderTotal: 500 }),
        order({ orderId: '3', openBillRank: 3, orderTotal: 7_000 }),
      ],
      { rates: RATES },
    )
    expect(s.byRank).toMatchObject([
      { rank: 1, pct: 0.5, bills: 2, salesValue: 10_000 },
      { rank: 2, pct: 0.4, bills: 0, salesValue: 0 },
      { rank: 3, pct: 0.3, bills: 1, salesValue: 7_000 },
    ])
    expect(s.totals.salesValue).toBe(17_000)
  })

  it('attaches what the run paid on each bill, and totals it by rank and by person', () => {
    const s = summariseOpenBill(
      [
        order({ orderId: '1', openBillRank: 1 }),
        order({ orderId: '2', openBillRank: 2, staffId: 'yuny', employeeName: 'YUNY' }),
      ],
      { paidByOrder: new Map([['1', 350.25], ['2', 280]]) },
    )
    expect(s.bills.find(b => b.orderId === '1')!.paid).toBe(350.25)
    expect(s.byRank[0].paid).toBe(350.25)
    expect(s.byRank[1].paid).toBe(280)
    expect(s.totals.paid).toBe(630.25)
    expect(s.byPerson.map(p => [p.name, p.paid])).toEqual([
      ['CHEA HUAN', 350.25],
      ['YUNY', 280],
    ])
  })

  it('leaves a bill the run never paid as null, not zero', () => {
    const s = summariseOpenBill([order({ orderId: '1', openBillRank: 1 })])
    expect(s.bills[0].paid).toBeNull()
    expect(s.totals.paid).toBe(0)
  })

  it('reports what the run paid on bills this month never wrote, separately', () => {
    // September's run pays August's bills when their deposits clear there —
    // the money is real, but it is not September's doing.
    const s = summariseOpenBill([order({ orderId: 'sep', openBillRank: 1 })], {
      paidByOrder: new Map([
        ['sep', 100],
        ['aug-1', 40.5],
        ['aug-2', 9.5],
      ]),
    })
    expect(s.totals.paid).toBe(100)
    expect(s.carriedIn).toEqual({ bills: 2, paid: 50 })
    expect(s.paidInAll).toBe(150)
  })

  it('groups a person by their bills, biggest payer first', () => {
    const s = summariseOpenBill(
      [
        order({ orderId: '1', openBillRank: 1, orderTotal: 1_000 }),
        order({ orderId: '2', openBillRank: 2, orderTotal: 2_000 }),
        order({ orderId: '3', openBillRank: 1, staffId: 'yuny', employeeName: 'YUNY', orderTotal: 8_000 }),
      ],
      { paidByOrder: new Map([['1', 10], ['2', 20], ['3', 500]]) },
    )
    expect(s.byPerson).toHaveLength(2)
    expect(s.byPerson[0]).toMatchObject({
      name: 'YUNY',
      bills: 1,
      salesValue: 8_000,
      paid: 500,
      byRank: { 1: 1, 2: 0, 3: 0 },
    })
    expect(s.byPerson[1]).toMatchObject({
      name: 'CHEA HUAN',
      bills: 2,
      salesValue: 3_000,
      paid: 30,
      byRank: { 1: 1, 2: 1, 3: 0 },
    })
  })

  it('falls back to the most picks when nothing has been paid yet', () => {
    const s = summariseOpenBill([
      order({ orderId: '1', openBillRank: 1 }),
      order({ orderId: '2', openBillRank: 2 }),
      order({ orderId: '3', openBillRank: 1, staffId: 'yuny', employeeName: 'YUNY' }),
    ])
    expect(s.byPerson.map(p => p.name)).toEqual(['CHEA HUAN', 'YUNY'])
  })

  it('names an unmatched agent as one, and keys them apart from the matched', () => {
    const s = summariseOpenBill([
      order({ orderId: '1', openBillRank: 1, staffId: null, employeeName: null, agentName: 'WHO' }),
    ])
    expect(s.byPerson[0]).toMatchObject({
      key: 'agent:WHO',
      name: 'WHO (unmatched)',
      matched: false,
      staffId: null,
    })
  })

  it('counts the picks still resting on the importer’s guess, and the held bills', () => {
    const s = summariseOpenBill([
      order({ orderId: '1', openBillRank: 1, openBillAuto: true }),
      order({ orderId: '2', openBillRank: 2, openBillAuto: false }),
      order({ orderId: '3', openBillRank: 3, openBillAuto: true, depositMet: false }),
    ])
    expect(s.totals.suggested).toBe(2)
    expect(s.byRank.map(r => r.suggested)).toEqual([1, 0, 1])
    expect(s.totals.held).toBe(1)
    expect(s.byPerson[0].held).toBe(1)
    expect(s.bills.find(b => b.orderId === '3')!.held).toBe(true)
  })

  it('separates a bill the run simply does not have from the ones it left alone on purpose', () => {
    // Only the first is worth acting on: the others earn nothing for a reason
    // the run already knows about.
    const s = summariseOpenBill(
      [
        order({ orderId: 'late', openBillRank: 1 }),
        order({ orderId: 'held', openBillRank: 2, depositMet: false }),
        order({ orderId: 'nobase', openBillRank: 3, commissionable: 0 }),
        order({
          orderId: 'unmatched',
          openBillRank: 1,
          staffId: null,
          employeeName: null,
          agentName: 'WHO',
        }),
        order({ orderId: 'paid', openBillRank: 2 }),
      ],
      { paidByOrder: new Map([['paid', 200]]) },
    )
    expect(s.totals.missingFromRun).toBe(1)
    expect(s.bills.filter(b => b.missingFromRun).map(b => b.orderId)).toEqual(['late'])
  })

  it('shows the place a spelling was merged into', () => {
    const s = summariseOpenBill([
      order({ orderId: '1', openBillRank: 1, venue: 'PISA SPICE ARENA', venueGroupName: 'SPICE ARENA' }),
      order({ orderId: '2', openBillRank: 2, venue: 'MID VALLEY', venueGroupName: null }),
    ])
    expect(s.bills.map(b => b.venue)).toEqual(['SPICE ARENA', 'MID VALLEY'])
  })

  it('is empty for a month with no picks', () => {
    const s = summariseOpenBill([order({ orderId: '1' })])
    expect(s.bills).toEqual([])
    expect(s.byPerson).toEqual([])
    expect(s.totals).toEqual({
      bills: 0,
      salesValue: 0,
      paid: 0,
      suggested: 0,
      held: 0,
      missingFromRun: 0,
    })
    expect(s.paidInAll).toBe(0)
  })
})
