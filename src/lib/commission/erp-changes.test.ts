import { describe, expect, it } from 'vitest'
import {
  adjustmentLabel,
  changeFor,
  commissionNote,
  describeChange,
  earnsDelta,
  firstPayableMonth,
  kindLabel,
  kindTone,
  lineChanges,
  movesMoney,
  parseState,
  payableIn,
  settledWord,
  statusWord,
  toErpChange,
  type ErpChange,
  type ErpChangeRow,
  type ErpDocLine,
  type ErpDocState,
} from './erp-changes'

// The ERP's audit trail, kept by the portal (2026-10-13; the user: "只要他开了
// 单，任何改动只要一按 save 他的 sales order，我这边都要能 track 到 … 判断是
// upsell 还是 drop sales or cancelation").

const line = (over: Partial<ErpDocLine> = {}): ErpDocLine => ({
  lineNo: 1, itemGroup: 'MATTRESS', itemCode: 'AKEMI ULTIMATE MATT (K)', description: 'AKEMI ULTIMATE MATT (K)',
  variant: null, qty: 2, unitPrice: 8194, amount: 16388, ...over,
})
const state = (over: Partial<ErpDocState> = {}): ErpDocState => ({
  status: 'CONFIRMED', onHold: false, deleted: false, total: 16388, balance: 1000, commissionable: 16388,
  salespersonId: 'sp-1', salesperson: 'Chea Huan', customer: 'A CUSTOMER', orderDate: '2026-08-21',
  venue: 'MID VALLEY', fairDate: '2026-08-16', lines: [line()], ...over,
})
const change = (over: Partial<ErpChange> = {}): ErpChange => ({
  id: 'c1', orderNo: 'HC-SO-013335', orderId: 'o1', savedAt: '2026-09-30T02:45:18Z', receivedAt: '2026-09-30T02:45:19Z',
  outcome: 'held', periodMonth: '2026-08-01', kind: 'drop', totalBefore: 16388, totalAfter: 8194,
  commissionableBefore: 16388, commissionableAfter: 8194, statusBefore: 'CONFIRMED', statusAfter: 'CONFIRMED',
  before: state(), after: state({ total: 8194, commissionable: 8194, lines: [line({ unitPrice: 4097, amount: 8194 })] }),
  settledAmount: 16388, settledPeriod: '2026-08-01', settledBy: 'hand', adjustmentId: 'a1', ...over,
})

describe('what a change is called', () => {
  it('in the user\'s words: upsell, drop sales, cancellation', () => {
    expect(kindLabel('upsell')).toBe('Upsell')
    expect(kindLabel('drop')).toBe('Drop sales')
    expect(kindLabel('cancelled')).toBe('Cancelled')
    expect(kindLabel('deleted')).toBe('Deleted in the ERP')
    expect(kindLabel('on_hold', 'CONFIRMED')).toBe('On hold')
    expect(kindLabel('on_hold', 'DRAFT')).toBe('Back to draft')
    expect(kindLabel('reinstated')).toBe('Reinstated')
    expect(kindLabel('opened')).toBe('Opened')
    expect(kindLabel('changed')).toBe('Changed')
  })

  it('wears green for more, red for less, grey for the same', () => {
    expect(kindTone('upsell')).toBe('ledger')
    expect(kindTone('drop')).toBe('danger')
    expect(kindTone('cancelled')).toBe('danger')
    expect(kindTone('on_hold')).toBe('alert')
    expect(kindTone('changed')).toBe('info')
  })

  it('a drop or an upsell the ERP found says why when its figure stopped counting', () => {
    expect(adjustmentLabel('drop', 'cancelled')).toBe('Cancelled')
    expect(adjustmentLabel('drop', 'deleted')).toBe('Deleted in the ERP')
    expect(adjustmentLabel('upsale', 'reinstated')).toBe('Reinstated')
    expect(adjustmentLabel('drop', 'amount')).toBe('Drop sales')
    expect(adjustmentLabel('upsale', null)).toBe('Upsell')
    expect(adjustmentLabel('drop', undefined)).toBe('Drop sales')
  })

  it('names what gave the commission', () => {
    expect(settledWord('close', '2026-09-01')).toBe('Closed · Sep 2026')
    expect(settledWord('hand', '2026-08-01')).toBe('Claim form · Aug 2026')
    expect(settledWord('run', '2026-09-01')).toBe('Paid by run · Sep 2026')
    expect(settledWord('frozen', '2026-07-01')).toBe('Settled by hand · Jul 2026')
    expect(settledWord(null, null)).toBe('—')
  })

  it('reads a status as words', () => {
    expect(statusWord('IN_PRODUCTION')).toBe('In production')
    expect(statusWord('READY_TO_SHIP')).toBe('Ready to ship')
    expect(statusWord(null)).toBe('—')
  })
})

describe('when a change may be paid', () => {
  // A September close already counts the bill as the ERP has it now: paying
  // its change into September as well would count it twice (23ADJ).
  it('only in a month after the one that gave the commission', () => {
    expect(firstPayableMonth('2026-09-01')).toBe('2026-10-01')
    expect(firstPayableMonth('2026-12-01')).toBe('2027-01-01')
    expect(firstPayableMonth(null)).toBeNull()
    expect(payableIn('2026-09-01', '2026-09-01')).toBe(false)
    expect(payableIn('2026-10-01', '2026-09-01')).toBe(true)
    expect(payableIn('2026-09-01', '2026-08-01')).toBe(true)
    expect(payableIn('2026-09-01', null)).toBe(true)
  })
})

describe('what one save changed, in words', () => {
  it('a price cut on a line — HC-SO-013335, 30 Sep: 2 × RM 8,194 → 2 × RM 4,097', () => {
    const c = change()
    expect(describeChange(c.before, c.after)).toEqual(['AKEMI ULTIMATE MATT (K): RM 16,388.00 → RM 8,194.00'])
  })

  it('a product swapped — HC-SO-013305, 10 Oct: TRION (A)-(K) at RM 2,100 for TRION (A) (HB STR)-(K) at RM 0', () => {
    const before = state({ lines: [line({ itemCode: 'TRION (A)-(K)', description: 'TRION (A)-(K)', itemGroup: 'BEDFRAME', qty: 1, unitPrice: 2100, amount: 2100 })] })
    const after = state({ lines: [line({ itemCode: 'TRION (A) (HB STR)-(K)', description: 'TRION (A) (HB STR)-(K)', itemGroup: 'BEDFRAME', qty: 1, unitPrice: 0, amount: 0 })] })
    expect(describeChange(before, after)).toEqual([
      'Removed TRION (A)-(K) · RM 2,100.00',
      'Added TRION (A) (HB STR)-(K) · RM 0.00',
    ])
  })

  it('a quantity, a variant, a status, a hold and a payment', () => {
    const before = state()
    const after = state({
      status: 'IN_PRODUCTION', onHold: true, balance: 0,
      lines: [line({ qty: 1, amount: 8194, variant: 'FABRIC GREY' })],
    })
    expect(describeChange(before, after)).toEqual([
      'AKEMI ULTIMATE MATT (K): RM 16,388.00 → RM 8,194.00 · qty 2 → 1 · — → FABRIC GREY',
      'Status Confirmed → In production',
      'Put on hold',
      'Paid RM 1,000.00 · balance RM 1,000.00 → RM 0.00',
    ])
  })

  // The live E2E on 2026-10-12: a bill cut from RM 5,100 to RM 4,100 with
  // nothing paid read "Paid RM 1,000.00" — its balance fell with its total.
  it('a balance that moves with the total is no payment', () => {
    const before = state({ total: 5100, balance: 5100, lines: [line({ qty: 1, unitPrice: 5000, amount: 5000 })] })
    const after = state({ total: 4100, balance: 4100, lines: [line({ qty: 1, unitPrice: 4000, amount: 4000 })] })
    expect(describeChange(before, after)).toEqual(['AKEMI ULTIMATE MATT (K): RM 5,000.00 → RM 4,000.00'])
    expect(describeChange(before, { ...before, balance: 3100 })).toEqual(['Paid RM 2,000.00 · balance RM 5,100.00 → RM 3,100.00'])
    expect(describeChange({ ...before, balance: 3100 }, before)).toEqual(['RM 2,000.00 of payments taken off · balance RM 3,100.00 → RM 5,100.00'])
    expect(describeChange({ ...before, balance: null }, before)).toEqual(['Balance — → RM 5,100.00'])
  })

  it('who sold it, to whom, when and where', () => {
    const after = state({ salespersonId: 'sp-2', salesperson: 'Anthony', customer: 'B CUSTOMER', orderDate: '2026-08-22', fairDate: '2026-08-17', venue: 'MITC' })
    expect(describeChange(state(), after)).toEqual([
      'Salesperson Chea Huan → Anthony',
      'Customer A CUSTOMER → B CUSTOMER',
      'Order date 21 Aug 2026 → 22 Aug 2026',
      'Fair day 16 Aug 2026 → 17 Aug 2026',
      'Venue MID VALLEY → MITC',
    ])
  })

  it('an opening, and a deletion', () => {
    expect(describeChange(null, state())).toEqual(['Opened at RM 16,388.00 · 1 line'])
    expect(describeChange(null, state({ total: 16688, lines: [line(), line({ lineNo: 2, itemGroup: 'SERVICE', itemCode: 'TRANSPORT', amount: 300 })] })))
      .toEqual(['Opened at RM 16,688.00 (RM 16,388.00 earns) · 2 lines'])
    expect(describeChange(state(), state({ deleted: true, commissionable: 0 }))).toEqual(['Deleted in the ERP'])
  })

  it('matches a line to the same product, wherever the ERP moved it', () => {
    const a = line({ lineNo: 1, itemCode: 'A', description: 'A', amount: 100 })
    const b = line({ lineNo: 2, itemCode: 'B', description: 'B', amount: 200 })
    expect(lineChanges([a, b], [{ ...b, lineNo: 1 }, { ...a, lineNo: 2 }])).toEqual([])
    expect(lineChanges([a, b], [a])).toEqual([{ kind: 'removed', before: b }])
    expect(lineChanges([a], [a, b])).toEqual([{ kind: 'added', after: b }])
    // Two of the same product: the one whose price is unchanged is not news.
    const a2 = { ...a, lineNo: 3, amount: 150 }
    expect(lineChanges([a, a2], [a, { ...a2, amount: 120 }])).toEqual([{ kind: 'changed', before: a2, after: { ...a2, amount: 120 } }])
  })
})

describe('reading the trail', () => {
  it('reads a stored state defensively', () => {
    expect(parseState(null)).toBeNull()
    expect(parseState({ total: '16388.00', lines: [{ itemCode: 'X', amount: '100' }, null] })).toMatchObject({
      status: 'CONFIRMED', total: 16388, commissionable: 0, lines: [{ itemCode: 'X', amount: 100, itemGroup: 'UNGROUPED' }],
    })
  })

  it('turns a row into a change', () => {
    const row: ErpChangeRow = {
      id: 'c1', order_no: 'HC-SO-013367', order_id: null, saved_at: null, received_at: '2026-10-12T06:41:57Z', outcome: 'held',
      period_month: '2026-08-01', kind: 'cancelled', total_before: '10399.00', total_after: '10399.00',
      commissionable_before: '10399.00', commissionable_after: '0.00', status_before: 'CONFIRMED', status_after: 'CANCELLED',
      state_before: null, state_after: { status: 'CANCELLED' }, settled_amount: '10399.00', settled_period: '2026-08-01',
      settled_by: 'hand', adjustment_id: null,
    }
    expect(toErpChange(row)).toMatchObject({ kind: 'cancelled', outcome: 'held', commissionableAfter: 0, settledBy: 'hand', settledAmount: 10399 })
    expect(earnsDelta(toErpChange(row))).toBe(-10399)
    expect(toErpChange({ ...row, kind: 'nonsense', outcome: 'x', settled_by: 'x' })).toMatchObject({ kind: 'changed', outcome: 'applied', settledBy: null })
  })

  it('moves money when what earns moved, or the bill\'s total', () => {
    expect(movesMoney({ kind: 'drop', totalBefore: 1, totalAfter: 1 })).toBe(true)
    expect(movesMoney({ kind: 'changed', totalBefore: 4100, totalAfter: 4250 })).toBe(true)
    expect(movesMoney({ kind: 'changed', totalBefore: 4100, totalAfter: 4100 })).toBe(false)
    expect(movesMoney({ kind: 'opened', totalBefore: null, totalAfter: 4100 })).toBe(false)
  })

  it('finds the save a drop or an upsell is about', () => {
    const status = change({ id: 'c3', kind: 'changed', totalBefore: 8194, totalAfter: 8194, adjustmentId: null })
    const drop = change({ id: 'c2', adjustmentId: 'a1' })
    const older = change({ id: 'c1', kind: 'upsell', adjustmentId: 'a0' })
    expect(changeFor('a1', [status, drop, older])?.id).toBe('c2')
    expect(changeFor('a0', [status, drop, older])?.id).toBe('c1')
    expect(changeFor('zz', [status, drop, older])?.id).toBe('c2')
    expect(changeFor('zz', [status])?.id).toBe('c3')
    expect(changeFor('zz', [])).toBeNull()
  })
})

describe('what a change meant for commission', () => {
  it('nothing given yet: its own month counts it as it is now', () => {
    expect(commissionNote(change({ settledAmount: null, periodMonth: '2026-10-01' }), null))
      .toBe('Not given yet — Oct 2026 counts it as it is now')
    expect(commissionNote(change({ kind: 'opened', periodMonth: '2026-10-01' }), null)).toBe('Counts in Oct 2026')
  })

  it('given: where its drop or upsell stands', () => {
    const c = change({ settledBy: 'close', settledPeriod: '2026-09-01' })
    expect(commissionNote(c, { id: 'a1', status: 'pending', periodMonth: '2026-10-01', amount: -1000 }))
      .toBe('Given (Closed · Sep 2026) — RM (1,000.00) waiting for an answer')
    expect(commissionNote(c, { id: 'a1', status: 'confirmed', periodMonth: '2026-11-01', amount: -1000 }))
      .toBe('Given (Closed · Sep 2026) — RM (1,000.00) paid in Nov 2026')
    expect(commissionNote(c, { id: 'a1', status: 'dismissed', periodMonth: '2026-10-01', amount: -1000 }))
      .toBe('Given (Closed · Sep 2026) — let stand (Not a change)')
    expect(commissionNote(c, null)).toBe('Given (Closed · Sep 2026) — nothing to pay now')
  })

  // HC-SO-013335 on production: a save three minutes after the drop moved only
  // the fair's day — it is no part of the question the drop opened.
  it('a save that moved nothing that earns is no part of a question', () => {
    const c = change({ kind: 'changed', settledBy: 'hand', settledPeriod: '2026-08-01' })
    expect(commissionNote(c, { id: 'a1', status: 'pending', periodMonth: '2026-10-01', amount: -8194 }))
      .toBe('Given (Claim form · Aug 2026) — earns the same')
  })
})
