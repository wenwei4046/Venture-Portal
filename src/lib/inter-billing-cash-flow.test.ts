import { describe, it, expect } from 'vitest'
import { buildCashFlow, type GlLine, type CoaAccount } from './gl-reports'
import {
  buildInterBillingCashFlowLines,
  interBillTransferAccount,
  INTERBILL_TRANSFER_CODE,
} from './inter-billing-cash-flow'

const CUR = { from: '2026-07-01', to: '2026-07-31' }
const NONE = { from: '2999-01-01', to: '2999-01-31' }
const bankCodes = new Set(['3000'])

const accounts: CoaAccount[] = [
  { code: '3000', name: 'Hong Leong', type: 'asset', parent_code: null, cash_flow_category: null },
  { code: '5000', name: 'Revenue', type: 'revenue', parent_code: null, cash_flow_category: 'operating' },
  interBillTransferAccount,
]

function ln(p: Partial<GlLine>): GlLine {
  return {
    account_code: '',
    debit: 0,
    credit: 0,
    description: null,
    entry_id: '',
    date: '2026-07-01',
    entry_no: null,
    entry_description: null,
    segment: 'marketing',
    ref_type: null,
    ref_id: null,
    party: null,
    ...p,
  }
}

// Base GL: Marketing received RM 100 cash into Hong Leong.
const base: GlLine[] = [
  ln({ entry_id: 'e1', account_code: '3000', debit: 100, segment: 'marketing' }),
  ln({ entry_id: 'e1', account_code: '5000', credit: 100, segment: 'marketing' }),
]

// Marketing paid RM 30 inter-billing to Venture (Office).
const ib = buildInterBillingCashFlowLines([{ deptName: 'Marketing', amount: 30, date: '2026-07-05' }], '3000')

describe('buildInterBillingCashFlowLines', () => {
  it('emits a paired paying (marketing) + receiving (corporate) transfer', () => {
    expect(ib).toHaveLength(4)
    const payBank = ib.find((l) => l.segment === 'marketing' && l.account_code === '3000')!
    const payXfer = ib.find((l) => l.segment === 'marketing' && l.account_code === INTERBILL_TRANSFER_CODE)!
    const recBank = ib.find((l) => l.segment === 'corporate' && l.account_code === '3000')!
    const recXfer = ib.find((l) => l.segment === 'corporate' && l.account_code === INTERBILL_TRANSFER_CODE)!
    expect(payBank.credit).toBe(30) // cash OUT of Marketing
    expect(payXfer.debit).toBe(30)
    expect(recBank.debit).toBe(30) // cash INTO Venture (Office)
    expect(recXfer.credit).toBe(30)
  })

  it('skips unknown departments and non-positive amounts', () => {
    expect(buildInterBillingCashFlowLines([{ deptName: 'Nope', amount: 10, date: '2026-07-01' }], '3000')).toHaveLength(0)
    expect(buildInterBillingCashFlowLines([{ deptName: 'HR', amount: 0, date: '2026-07-01' }], '3000')).toHaveLength(0)
  })
})

describe('inter-billing folded into buildCashFlow', () => {
  const mkt = (lines: GlLine[]) =>
    buildCashFlow(lines, accounts, { current: CUR, previous: NONE, segment: ['marketing'] }, bankCodes)

  it("Marketing closing cash drops by the inter-billing it paid", () => {
    expect(mkt(base).closingCash.current).toBe(100)
    const after = mkt([...base, ...ib])
    expect(after.closingCash.current).toBe(70) // 100 − 30
    expect(after.check.current).toBe(0) // opening + net change still reconciles
    // the transfer shows as a Financing line
    const fin = after.financing.nodes.find((n) => n.code === INTERBILL_TRANSFER_CODE)
    expect(fin?.current).toBe(-30)
  })

  it('Venture (Office) closing cash rises by the same amount', () => {
    const venture = buildCashFlow(
      [...base, ...ib],
      accounts,
      { current: CUR, previous: NONE, segment: ['corporate', 'treasury'] },
      bankCodes,
    )
    expect(venture.closingCash.current).toBe(30)
  })

  it('consolidated (all segments) closing cash is unchanged — the two sides net to zero', () => {
    const before = buildCashFlow(base, accounts, { current: CUR, previous: NONE, segment: undefined }, bankCodes)
    const after = buildCashFlow([...base, ...ib], accounts, { current: CUR, previous: NONE, segment: undefined }, bankCodes)
    expect(after.closingCash.current).toBe(before.closingCash.current)
  })
})
