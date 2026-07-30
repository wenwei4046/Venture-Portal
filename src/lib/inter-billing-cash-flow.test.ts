import { describe, it, expect } from 'vitest'
import { buildCashFlow, type GlLine, type CoaAccount } from './gl-reports'
import {
  buildInterBillingCashFlowLines,
  ensureInterBillCategory,
  interBillTransferAccount,
  payrollCustodyAccount,
  INTERBILL_TRANSFER_CODE,
  PAYROLL_XFER_CODE,
  type TransferSide,
} from './inter-billing-cash-flow'

const CUR = { from: '2026-07-01', to: '2026-07-31' }
const NONE = { from: '2999-01-01', to: '2999-01-31' }
const bankCodes = new Set(['3000'])

const accounts: CoaAccount[] = [
  { code: '3000', name: 'Hong Leong', type: 'asset', parent_code: null, cash_flow_category: null },
  { code: '5000', name: 'Revenue', type: 'revenue', parent_code: null, cash_flow_category: 'operating' },
  interBillTransferAccount,
  payrollCustodyAccount,
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

// Base GL: Marketing +100, Director Office +50 cash into Hong Leong.
const base: GlLine[] = [
  ln({ entry_id: 'm1', account_code: '3000', debit: 100, segment: 'marketing' }),
  ln({ entry_id: 'm1', account_code: '5000', credit: 100, segment: 'marketing' }),
  ln({ entry_id: 'd1', account_code: '3000', debit: 50, segment: 'director_office' }),
  ln({ entry_id: 'd1', account_code: '5000', credit: 50, segment: 'director_office' }),
]

// Marketing pays 30 to Venture (Office) [inter-billing]; Venture pays 8 back to
// Director Office [own-share].
const sides: TransferSide[] = [
  { deptName: 'Marketing', amount: 30, date: '2026-07-05', direction: 'out' },
  { deptName: 'Venture Office', amount: 30, date: '2026-07-05', direction: 'in' },
  { deptName: 'Venture Office', amount: 8, date: '2026-07-06', direction: 'out' },
  { deptName: 'Director Office', amount: 8, date: '2026-07-06', direction: 'in' },
]
const ib = buildInterBillingCashFlowLines(sides, '3000')

const cf = (lines: GlLine[], seg: string | string[] | undefined) =>
  buildCashFlow(lines, accounts, { current: CUR, previous: NONE, segment: seg }, bankCodes)

describe('buildInterBillingCashFlowLines', () => {
  it('maps out/in to bank credit/debit on the right segment', () => {
    const mktOut = ib.find((l) => l.segment === 'marketing' && l.account_code === '3000')!
    expect(mktOut.credit).toBe(30) // cash OUT of Marketing
    const doIn = ib.find((l) => l.segment === 'director_office' && l.account_code === '3000')!
    expect(doIn.debit).toBe(8) // cash INTO Director Office
    // Venture (Office) → corporate carries both a −30 receive... wait, it RECEIVES 30 and PAYS 8
    const corpBank = ib.filter((l) => l.segment === 'corporate' && l.account_code === '3000')
    expect(corpBank.reduce((s, l) => s + l.debit - l.credit, 0)).toBe(22) // +30 in − 8 out
  })

  it('skips unknown departments and non-positive amounts', () => {
    expect(buildInterBillingCashFlowLines([{ deptName: 'Nope', amount: 10, date: '2026-07-01', direction: 'out' }], '3000')).toHaveLength(0)
    expect(buildInterBillingCashFlowLines([{ deptName: 'HR', amount: 0, date: '2026-07-01', direction: 'in' }], '3000')).toHaveLength(0)
  })
})

describe('inter-billing + own-share folded into buildCashFlow', () => {
  it('paying segment (Marketing) closing cash drops by what it paid', () => {
    expect(cf(base, ['marketing']).closingCash.current).toBe(100)
    const after = cf([...base, ...ib], ['marketing'])
    expect(after.closingCash.current).toBe(70) // 100 − 30
    expect(after.check.current).toBe(0)
    expect(after.financing.nodes.find((n) => n.code === INTERBILL_TRANSFER_CODE)?.current).toBe(-30)
  })

  it('own-share receiver (Director Office) closing cash rises by what it got back', () => {
    expect(cf(base, ['director_office']).closingCash.current).toBe(50)
    expect(cf([...base, ...ib], ['director_office']).closingCash.current).toBe(58) // 50 + 8
  })

  it('Venture (Office) nets receive − pay', () => {
    // corporate has no base cash here → 0 + 30 (from Marketing) − 8 (to Director Office)
    expect(cf([...base, ...ib], ['corporate', 'treasury']).closingCash.current).toBe(22)
  })

  it('consolidated (all segments) closing cash is unchanged — every transfer nets to zero', () => {
    const before = cf(base, undefined).closingCash.current
    const after = cf([...base, ...ib], undefined).closingCash.current
    expect(after).toBe(before)
  })
})

describe('payroll custody bridge (mig 20260721)', () => {
  // June-style round: Marketing 38,545.39 + HR's own 19,628.33 (plus the two
  // small depts, omitted) → HR custody receives the FULL round.
  const pySides: TransferSide[] = [
    { deptName: 'Marketing', amount: 40, date: '2026-07-07', direction: 'out', kind: 'payroll' },
    { deptName: 'HR', amount: 20, date: '2026-07-07', direction: 'out', kind: 'payroll' },
    { deptName: 'HR', amount: 60, date: '2026-07-07', direction: 'in', kind: 'payroll' },
  ]
  const py = buildInterBillingCashFlowLines(pySides, '3000')

  it('uses the payroll pseudo account, not the inter-billing one', () => {
    expect(py.some((l) => l.account_code === PAYROLL_XFER_CODE)).toBe(true)
    expect(py.some((l) => l.account_code === INTERBILL_TRANSFER_CODE)).toBe(false)
  })

  it('payer segment closing cash drops by its contribution', () => {
    const after = cf([...base, ...py], ['marketing'])
    expect(after.closingCash.current).toBe(60) // 100 − 40
    expect(after.financing.nodes.find((n) => n.code === PAYROLL_XFER_CODE)?.current).toBe(-40)
  })

  it('HR nets custody-in minus its own contribution', () => {
    // HR has no base cash here → 0 − 20 own + 60 custody = +40
    expect(cf([...base, ...py], ['hr']).closingCash.current).toBe(40)
  })

  it('consolidated closing cash unchanged — custody nets to zero', () => {
    const before = cf(base, undefined).closingCash.current
    const after = cf([...base, ...py], undefined).closingCash.current
    expect(after).toBe(before)
  })
})

describe('paying side by nature (user 2026-07-30)', () => {
  // Marketing's internal recharge split into its real natures: rent + utilities.
  const sides: TransferSide[] = [
    { deptName: 'Marketing', amount: 30, date: '2026-07-03', direction: 'out', natureCode: '9094' },
    { deptName: 'Marketing', amount: 10, date: '2026-07-03', direction: 'out', natureCode: '9091' },
    { deptName: 'Venture Office', amount: 40, date: '2026-07-03', direction: 'in' },
  ]
  const lines = buildInterBillingCashFlowLines(sides, '3000')

  it('books the payer legs on the real expense accounts', () => {
    expect(lines.filter((l) => l.account_code === '9094').map((l) => l.debit)).toEqual([30])
    expect(lines.filter((l) => l.account_code === '9091').map((l) => l.debit)).toEqual([10])
  })

  it('leaves the receiving side on the pseudo transfer account', () => {
    const recv = lines.filter((l) => l.segment === 'corporate' && l.account_code === INTERBILL_TRANSFER_CODE)
    expect(recv).toHaveLength(1)
  })

  it("still moves the payer's cash by the full amount", () => {
    expect(cf([...base, ...lines], ['marketing']).closingCash.current).toBe(60) // 100 − 40
  })

  it('falls back to the pseudo account when no nature is known', () => {
    const plain = buildInterBillingCashFlowLines(
      [{ deptName: 'Marketing', amount: 40, date: '2026-07-03', direction: 'out' }],
      '3000',
    )
    expect(plain.some((l) => l.account_code === INTERBILL_TRANSFER_CODE)).toBe(true)
  })
})

describe('ensureInterBillCategory', () => {
  it('files the transfer account into the Financing category (so it is not "Unassigned")', () => {
    const layout = {
      categories: [
        { id: 'operating', name: 'Operating Activities', accounts: ['3030'] },
        { id: 'financing', name: 'Financing Activities', accounts: ['1900'] },
      ],
    }
    const out = ensureInterBillCategory(layout)
    const fin = out.categories.find((c) => c.id === 'financing')!
    expect(fin.accounts).toContain(INTERBILL_TRANSFER_CODE)
    expect(fin.accounts).toContain(PAYROLL_XFER_CODE)
    expect(layout.categories[1].accounts).not.toContain(INTERBILL_TRANSFER_CODE) // original untouched
  })

  it('matches a renamed financing category by name, and is idempotent', () => {
    const layout = { categories: [{ id: 'x', name: 'Financing / treasury', accounts: [] as string[] }] }
    const once = ensureInterBillCategory(layout)
    const twice = ensureInterBillCategory(once)
    expect(once.categories[0].accounts.filter((a) => a === INTERBILL_TRANSFER_CODE)).toHaveLength(1)
    expect(twice.categories[0].accounts.filter((a) => a === INTERBILL_TRANSFER_CODE)).toHaveLength(1)
    expect(twice.categories[0].accounts.filter((a) => a === PAYROLL_XFER_CODE)).toHaveLength(1)
  })

  it('creates a Financing category when none exists', () => {
    const out = ensureInterBillCategory({ categories: [{ id: 'operating', name: 'Operating', accounts: [] }] })
    const fin = out.categories.find((c) => c.accounts.includes(INTERBILL_TRANSFER_CODE))!
    expect(fin.name).toMatch(/financing/i)
  })
})
