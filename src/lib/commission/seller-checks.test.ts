import { describe, expect, it } from 'vitest'
import { answered, isWaiting, sellerAnswerFromRow, sellerCheckFromRow, sellerChecksFromRow, sharedPapers, sourceLabel } from './seller-checks'

// `revenue_seller_checks` as the PGlite run of 20261031030000 answers it (tests/member-sql/validate-whose-sale.mjs):
// SHAWN's HC-SO-2610-241 re-keyed STEPHY's HC12110 (HC-SO-008712, 22 Oct 2025), STEPHY left, SHAWN on its Shared with.
const STEPHY = {
  orderId: 'o-241', orderNo: 'HC-SO-2610-241', refNo: 'HC12110', orderDate: '2026-10-20', periodMonth: '2026-10-01',
  customer: 'MS CHAN', total: '7794.00', staffId: 'shawn', staffName: 'SHAWN', kind: 'paper', status: 'waiting',
  evidence: {
    orders: [{ source: 'erp', docNo: 'HC-SO-008712', papers: ['HC12110'], soldOn: '2025-10-22', month: null, seller: 'STEPHY',
      sellerLeft: true, handledBySeller: true, total: 7794, cancelled: false }],
    booth: null,
  },
  sellerName: 'STEPHY', askedAt: '2026-10-31T01:00:00+00:00', decidedByName: null, decidedAt: null, note: null,
  counts: false, held: true,
}
// WEI HOW's ZNT6186: the August claim form paid it; the Mid Valley booth listed Wei How and Zack.
const WEI_HOW = {
  ...STEPHY, orderId: 'o-307', orderNo: 'HC-SO-2610-307', refNo: 'HC77777+ZNT6186', total: 4288, sellerName: 'WEI HOW',
  evidence: {
    orders: [{ source: 'claim_form', docNo: 'ZNT6186', papers: ['ZNT6186'], soldOn: '2026-08-15', month: '2026-08-01',
      seller: 'WEI HOW', sellerLeft: true, handledBySeller: false, total: 4288, cancelled: false }],
    booth: { fair: 'KUALA LUMPUR [ZANOTTI] PERFECT LIFESTYLE @ MID VALLEY', staff: ['Wei How', 'Zack'] },
  },
}

describe('sellerChecksFromRow', () => {
  it('reads a question: the bill, whose order the paper was on, that they left and that the salesperson looks after it', () => {
    const [c] = sellerChecksFromRow([STEPHY])
    expect(c).toMatchObject({
      orderNo: 'HC-SO-2610-241', refNo: 'HC12110', staffName: 'SHAWN', total: 7794, status: 'waiting', sellerName: 'STEPHY',
      counts: false, held: true, booth: null,
    })
    expect(c.orders).toEqual([{ source: 'erp', docNo: 'HC-SO-008712', papers: ['HC12110'], soldOn: '2025-10-22', month: null,
      seller: 'STEPHY', sellerLeft: true, handledBySeller: true, total: 7794, cancelled: false }])
  })

  it('reads the booth beside a claim form', () => {
    const c = sellerCheckFromRow(WEI_HOW)!
    expect(c.orders[0]).toMatchObject({ source: 'claim_form', month: '2026-08-01', seller: 'WEI HOW', handledBySeller: false })
    expect(c.booth).toEqual({ fair: 'KUALA LUMPUR [ZANOTTI] PERFECT LIFESTYLE @ MID VALLEY', staff: ['Wei How', 'Zack'] })
  })

  it('drops what is not a question, and an order of a source it does not know', () => {
    expect(sellerChecksFromRow([null, { orderId: 'x' }, { ...STEPHY, status: 'maybe' }, 'HC'])).toEqual([])
    expect(sellerChecksFromRow(null)).toEqual([])
    const odd = { ...STEPHY, evidence: { orders: [{ source: 'whatsapp', docNo: 'X' }, ...STEPHY.evidence.orders] } }
    expect(sellerCheckFromRow(odd)!.orders.map(o => o.docNo)).toEqual(['HC-SO-008712'])
  })

  it('a bill counted again by hand still waits for its answer', () => {
    const c = sellerCheckFromRow({ ...STEPHY, counts: true, held: false })!
    expect([isWaiting(c), c.counts, c.held]).toEqual([true, true, false])
  })
})

describe('the answer', () => {
  it('reads what answering did', () => {
    expect(sellerAnswerFromRow({ orderNo: 'HC-SO-2610-241', status: 'not_theirs', counts: false }))
      .toEqual({ orderNo: 'HC-SO-2610-241', status: 'not_theirs', counts: false })
    expect(sellerAnswerFromRow({ orderNo: 'HC-SO-2610-241', status: 'waiting', counts: false })).toBeNull()
    expect(sellerAnswerFromRow(null)).toBeNull()
  })

  it('their own sale counts it; not theirs keeps it out', () => {
    const c = sellerCheckFromRow(STEPHY)!
    expect(answered(c, { orderNo: c.orderNo, status: 'theirs', counts: true })).toMatchObject({ status: 'theirs', counts: true, held: false })
    expect(answered(c, { orderNo: c.orderNo, status: 'not_theirs', counts: false })).toMatchObject({ status: 'not_theirs', counts: false, held: true })
  })
})

describe('words', () => {
  it('names where the order was found — the ERP’s Shared with is never one of them', () => {
    expect(['bill', 'claim_form', 'erp'].map(s => sourceLabel(s as 'bill'))).toEqual(['ERP bill', 'Claim form', 'ERP order'])
  })

  it('lists each paper the bill shares once', () => {
    const c = sellerCheckFromRow({ ...STEPHY, evidence: { orders: [
      { source: 'erp', docNo: 'HC-SO-009430', papers: ['HC9882', 'ZNT4864'] },
      { source: 'bill', docNo: 'HC-SO-013090', papers: ['ZNT4864'] },
    ] } })!
    expect(sharedPapers(c)).toEqual(['HC9882', 'ZNT4864'])
  })
})
