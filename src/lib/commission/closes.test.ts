import { describe, expect, it } from 'vitest'
import {
  closeDrift, closeSnapshots, closeSummary, nextOpenPerson, parseCloseSummary, salespersonFigures,
  splitSelection, totalsThatMoved, type SalespersonClose,
} from './closes'
import { upsalesToOrders } from './upsales'
import type { EngineInput, Rank, SalesOrder } from './types'
import { buildCommissionWorkbench } from './workbench'

const rank = (rankKey: string, productRate: number, sortOrder: number): Rank => ({
  rankKey, productRate, sortOrder, titleId: rankKey, titleLabel: `${rankKey} title`, label: `${productRate * 100}%`,
  canRecruit: true, groupSalesThreshold: null, personalSalesThreshold: null, consecutiveMonths: null,
})

function sale(id: string, amount = 1_000, extra: Partial<SalesOrder> = {}): SalesOrder {
  return {
    id, orderNo: `SO-${id}`, staffId: 'agent', periodMonth: '2026-09-01',
    orderDate: '2026-09-12', eventDate: '2026-09-12', orderTotal: amount, paidAmount: amount,
    lines: [
      { id: `${id}-goods`, itemGroup: 'SOFA', productCode: 'SOFA', brandCode: 'AKEMI', qty: 1, lineAmount: amount, costAmount: amount * 0.6 },
      { id: `${id}-trans`, itemGroup: 'TRANS', productCode: 'TRANSPORT', qty: 1, lineAmount: 0, costAmount: 0 },
    ], ...extra,
  }
}

function input(extra: Partial<EngineInput> = {}): EngineInput {
  return {
    periodMonth: '2026-09-01',
    scheme: {
      overrideIncludesKpi: false,
      enableProductRevenue: true, enableKpi: false, enableOverride: true,
      enableMarginPenalty: false, enableMarginIncentive: false,
      itemGroups: [{ group: 'SOFA', commissionable: true }, { group: 'TRANS', commissionable: false }],
      depositThresholdPct: 0.3, defaultRateMode: 'fixed',
    },
    ranks: [rank('agent', 0.06, 1), rank('leader', 0.09, 2)],
    hierarchy: [
      { staffId: 'agent', uplineStaffId: 'leader', baseRankKey: 'agent', titleId: 'agent', rateMode: 'fixed' },
      { staffId: 'leader', uplineStaffId: null, baseRankKey: 'leader', titleId: 'leader', rateMode: 'fixed' },
    ],
    orders: [
      sale('one'),
      sale('two', 2_000),
      // Below the 30% deposit: held, not released.
      sale('held', 5_000, { paidAmount: 100 }),
      // What the customer took off an earlier bill.
      ...upsalesToOrders([{ id: 'drop-1', staff_id: 'agent', amount: -500, sold_on: '2026-09-20', original_ref: 'HC13052', kind: 'drop' }], '2026-09-01'),
    ],
    kpiItems: [], kpiThresholds: [], marginBands: [], priorMonths: [],
    ...extra,
  }
}

const people = [{ staffId: 'agent', name: 'MELVIN CHONG' }, { staffId: 'leader', name: 'KAR JUN' }]

function board(source = input()) {
  return buildCommissionWorkbench(source, { people })
}

function closeOf(source: EngineInput, staffId: string): SalespersonClose {
  const [snap] = closeSnapshots(source, board(source), [staffId])
  return {
    staffId, closedAt: '2026-09-15T08:00:00Z', closedByName: 'Principal',
    total: snap.total_commission,
    // Through JSON, as it comes back from the table.
    summary: parseCloseSummary(JSON.parse(JSON.stringify(snap.summary)), staffId),
  }
}

describe('the salesperson row', () => {
  it('counts bills, not upsales or drops, and keeps drops negative', () => {
    const melvin = board().people.find(p => p.staffId === 'agent')!
    expect(salespersonFigures(melvin)).toMatchObject({
      name: 'MELVIN CHONG', orders: 3, salesValue: 8_000, commissionable: 8_000,
      upsell: 0, dropped: -500,
      // 6% of 1,000 + 2,000 − 500; the held bill earns nothing yet.
      personal: 150, overriding: 0, total: 150,
    })
  })
})

describe('what a close keeps', () => {
  it('is the person’s own slice of the run payload, adding up to the figure on screen', () => {
    const source = input()
    const [melvin, karJun] = closeSnapshots(source, board(source), ['agent', 'leader'])

    expect(melvin.total_commission).toBe(150)
    expect(melvin.personal_commission + melvin.override_commission + melvin.group_incentive).toBe(melvin.total_commission)
    expect(melvin.statement).toMatchObject({ staff_id: 'agent', total_commission: 150, product_rate: 0.06 })
    // Released: the two paid bills — the held one waits, the drop is not a bill.
    expect(melvin.released_orders.map(r => r.order_no).sort()).toEqual(['SO-one', 'SO-two'])
    expect(melvin.deferred_orders.map(d => d.orderNo)).toEqual(['SO-held'])
    // The bills an edit would be refused on: every own bill, never the drop's row.
    expect(melvin.order_ids.sort()).toEqual(['held', 'one', 'two'])
    expect(melvin.summary.bills.map(b => [b.no, b.status, b.total])).toEqual([
      ['SO-one', 'eligible', 60], ['SO-two', 'eligible', 120], ['SO-held', 'deposit_pending', 0], ['DROP HC13052', 'eligible', -30],
    ])

    // The upline's override on the same bills (9% − 6% = 3% of 2,500).
    expect(karJun.total_commission).toBe(75)
    expect(karJun.summary.overrides).toEqual([{ staffId: 'agent', name: 'MELVIN CHONG', amount: 75 }])
    expect(karJun.released_orders).toEqual([])
    expect(karJun.order_ids).toEqual([])
  })

  it('refuses somebody who is not on the month', () => {
    const source = input()
    expect(() => closeSnapshots(source, board(source), ['nobody'])).toThrow(/not on this month/)
  })

  it('reads back a summary written by an older version without failing the page', () => {
    const summary = parseCloseSummary({ total: '12.50', bills: [{ id: 'x', total: 3 }, { nope: 1 }], overrides: 'bad' }, 'ADRIAN')
    // A close from before director pay (2026-09-27) reads it as nothing.
    expect(summary).toMatchObject({ name: 'ADRIAN', total: 12.5, personal: 0, marginPct: null, groupRevenue: null, directorPay: 0 })
    expect(parseCloseSummary({ total: 43_000, directorPay: '43000' }, 'KRIS').directorPay).toBe(43_000)
    expect(summary.bills).toEqual([{ id: 'x', no: 'x', status: 'eligible', total: 3 }])
    expect(summary.overrides).toEqual([])
    expect(parseCloseSummary(null, 'ADRIAN').total).toBe(0)
  })

  it('names each downline the override came from, summed per person', () => {
    const source = input()
    const leader = board(source).people.find(p => p.staffId === 'leader')!
    const summary = closeSummary(leader, id => (id === 'agent' ? 'MELVIN CHONG' : id))
    expect(summary.overrides).toEqual([{ staffId: 'agent', name: 'MELVIN CHONG', amount: 75 }])
  })
})

describe('has a closed month moved since', () => {
  it('says nothing while the live month still agrees', () => {
    const source = input()
    const close = closeOf(source, 'agent')
    expect(closeDrift(close, board(source).people.find(p => p.staffId === 'agent')!)).toBeNull()
  })

  it('names the bill that arrived, the bill that changed and the bill that went', () => {
    const source = input()
    const close = closeOf(source, 'agent')
    const later = input({
      orders: [
        // 'one' went (moved to another month); 'two' was re-saved smaller;
        // a new bill arrived after the close.
        sale('two', 1_500),
        sale('held', 5_000, { paidAmount: 100 }),
        sale('late', 3_000),
        ...upsalesToOrders([{ id: 'drop-1', staff_id: 'agent', amount: -500, sold_on: '2026-09-20', original_ref: 'HC13052', kind: 'drop' }], '2026-09-01'),
      ],
    })
    const drift = closeDrift(close, board(later).people.find(p => p.staffId === 'agent')!)
    expect(drift).toMatchObject({ closedTotal: 150, liveTotal: 240, delta: 90 })
    expect(drift!.bills).toEqual([
      { id: 'late', no: 'SO-late', closed: null, live: 180 },
      { id: 'one', no: 'SO-one', closed: 60, live: null },
      { id: 'two', no: 'SO-two', closed: 120, live: 90 },
    ])
  })

  it('sees an upline’s override move when a downline’s bill changes', () => {
    const source = input()
    const close = closeOf(source, 'leader')
    const later = input({ orders: [sale('one'), sale('two', 3_000)] })
    const drift = closeDrift(close, board(later).people.find(p => p.staffId === 'leader')!)
    expect(drift).toMatchObject({ closedTotal: 75, liveTotal: 120, delta: 45 })
    expect(drift!.overrides).toEqual([{ staffId: 'agent', name: 'MELVIN CHONG', closed: 75, live: 120 }])
  })

  it('treats somebody who has left the month as everything gone', () => {
    const source = input()
    const drift = closeDrift(closeOf(source, 'agent'), null)
    expect(drift).toMatchObject({ closedTotal: 150, liveTotal: 0, delta: -150 })
    expect(drift!.bills.map(b => b.no)).toEqual(['DROP HC13052', 'SO-one', 'SO-two'])
  })
})

describe('closing several at once', () => {
  const rows = [{ staffId: 'a' }, { staffId: 'b' }, { staffId: 'c' }]

  it('splits a tick selection into who closes and who reopens', () => {
    const { toClose, toReopen } = splitSelection(rows, new Set(['a', 'b']), new Set(['b', 'c']))
    expect(toClose.map(r => r.staffId)).toEqual(['a'])
    expect(toReopen.map(r => r.staffId)).toEqual(['b'])
  })

  it('opens the next person still open, wrapping to the first one skipped', () => {
    const order = ['a', 'b', 'c', 'd']
    expect(nextOpenPerson(order, 'b', new Set(['b', 'c']))).toBe('d')
    expect(nextOpenPerson(order, 'd', new Set(['b', 'c', 'd']))).toBe('a')
    expect(nextOpenPerson(order, 'a', new Set(['a', 'b', 'c', 'd']))).toBeNull()
  })

  it('refuses a close whose figure moved since the page showed it', () => {
    const b = board()
    expect(totalsThatMoved([{ staffId: 'agent', expectedTotal: 150 }], b)).toEqual([])
    expect(totalsThatMoved([{ staffId: 'agent', expectedTotal: 149.99 }, { staffId: 'ghost', expectedTotal: 0 }], b)).toEqual([
      { staffId: 'agent', name: 'MELVIN CHONG', expected: 149.99, now: 150 },
      { staffId: 'ghost', name: 'ghost', expected: 0, now: null },
    ])
  })
})
