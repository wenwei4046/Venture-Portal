import { describe, expect, it } from 'vitest'
import { invoiceSummary, payrollBasisSummary, payrollBillingLines, statementsSummary } from './billing-sheet'

// 2026-10-07 — Service Billing and the monthly Statements on the sheet (the
// user approved the Invoice / Statements sample, v6). The figures behind the
// summary cards and the folded "Payroll basis" line, worked out here so the
// pages only draw them.

const inv = (id: string, status: string, total: number, mode = 'venture_attribution') => ({ id, status, total_amount: total, billing_mode: mode })

describe('invoiceSummary', () => {
  const invoices = [
    inv('a', 'issued', 11316.05, 'director_attribution'),
    inv('b', 'issued', 25768.1, 'director_attribution'),
    inv('c', 'paid', 2850, 'marketing_project'),
    inv('d', 'paid_via_netting', 860.4),
    inv('e', 'voided', 2166.62),
    inv('f', 'draft', 500),
  ]

  it('counts what was invoiced without the voided, what is still out, and what came in', () => {
    const s = invoiceSummary(invoices)
    expect(s).toEqual({
      invoiced: 41294.55,
      invoicedCount: 5,
      voidedCount: 1,
      draftCount: 1,
      outstanding: 37084.15,
      issuedCount: 2,
      partPaidCount: 0,
      received: 3710.4,
      paidCount: 2,
    })
  })

  it('a part-payment on an issued invoice counts as received and leaves the balance outstanding', () => {
    const s = invoiceSummary(invoices, { a: 1316.05 }, { b: 768.1 })
    expect(s.outstanding).toBe(35000) // 11,316.05 − 1,316.05 + 25,768.10 − 768.10
    expect(s.received).toBe(5026.45) // 3,710.40 + 1,316.05
    expect(s.partPaidCount).toBe(1)
  })

  it('is empty-safe', () => {
    expect(invoiceSummary([])).toMatchObject({ invoiced: 0, invoicedCount: 0, outstanding: 0, received: 0 })
  })
})

describe('payrollBillingLines', () => {
  // September 2026: HR, Finance, Director Office and IT are billed through the
  // consolidated payroll invoices (one per subsidiary, lines by segment);
  // Director through director_attribution; Marketing through its projects.
  const invoices = [
    inv('c1', 'issued', 8641.63, 'payroll_consolidated'),
    inv('c2', 'paid', 10666.79, 'payroll_consolidated'),
    inv('d1', 'issued', 9642.13, 'director_attribution'),
    inv('d2', 'issued', 15817.92, 'director_attribution'),
    inv('m1', 'paid', 2850, 'marketing_project'),
    inv('h0', 'voided', 1500, 'hr_attribution'), // voided: not billed
    inv('v1', 'issued', 742.32), // office rental: not payroll
  ]
  const lines = [
    { invoice_id: 'c1', amount: 1352.45, segment: 'hr' },
    { invoice_id: 'c1', amount: 2128.67, segment: 'finance' },
    { invoice_id: 'c1', amount: 2174.63, segment: 'director_office' },
    { invoice_id: 'c1', amount: 2985.88, segment: 'it' },
    { invoice_id: 'c2', amount: 1352.45, segment: 'hr' },
    { invoice_id: 'c2', amount: 4153.83, segment: 'finance' },
    { invoice_id: 'c2', amount: 2174.63, segment: 'director_office' },
    { invoice_id: 'c2', amount: 2985.88, segment: 'it' },
    { invoice_id: 'v1', amount: 742.32, segment: null },
  ]
  const fromPayroll = { hr: 5797.05, finance: 26636.73, director_office: 7415.8, it: 5971.75, revenue: 0, director: 76996.25, marketing: 59697.96 }

  it('pairs each department’s payroll cost with what its invoices bill, counting the consolidated lines by segment', () => {
    const rows = payrollBillingLines({ fromPayroll, invoices, lines })
    expect(rows).toEqual([
      { key: 'hr', label: 'HR', required: 5797.05, billed: 2704.9, invoices: 2 },
      { key: 'finance', label: 'Finance', required: 26636.73, billed: 6282.5, invoices: 2 },
      { key: 'director_office', label: 'Director Office', required: 7415.8, billed: 4349.26, invoices: 2 },
      { key: 'it', label: 'IT', required: 5971.75, billed: 5971.76, invoices: 2 },
      { key: 'director', label: 'Director', required: 76996.25, billed: 25460.05, invoices: 2 },
      { key: 'marketing', label: 'Marketing', required: 59697.96, billed: 2850, invoices: 1 },
    ])
  })

  it('leaves out a department with nothing from payroll and nothing billed', () => {
    const rows = payrollBillingLines({ fromPayroll: { ...fromPayroll, it: 0 }, invoices: invoices.filter((i) => i.billing_mode !== 'payroll_consolidated'), lines: [] })
    expect(rows.map((r) => r.key)).toEqual(['hr', 'finance', 'director_office', 'director', 'marketing'])
  })

  it('sums the line in words, whole ringgit, a tick where it matches', () => {
    expect(payrollBasisSummary([
      { key: 'hr', label: 'HR', required: 5797.05, billed: 4057.35, invoices: 3 },
      { key: 'director', label: 'Director', required: 76996.25, billed: 76996.25, invoices: 5 },
      { key: 'it', label: 'IT', required: 5971.75, billed: 5971.76, invoices: 2 },
    ])).toBe('HR 4,057 / 5,797 · Director 76,996 ✓ · IT 5,972 ✓')
    expect(payrollBasisSummary([])).toBe('')
  })
})

describe('statementsSummary', () => {
  const statements = [
    { period_month: '2026-09-01', status: 'draft', total_invoice: 22507.9, total_contra: 600, net_amount: 21907.9 },
    { period_month: '2026-09-01', status: 'draft', total_invoice: 0, total_contra: 4400, net_amount: -4400 },
    { period_month: '2026-05-01', status: 'issued', total_invoice: 31225.39, total_contra: 0, net_amount: 31225.39 },
    { period_month: '2026-05-01', status: 'paid', total_invoice: 100, total_contra: 0, net_amount: 100 },
  ]
  it('names the latest period and totals it, and counts every statement by status', () => {
    expect(statementsSummary(statements)).toEqual({
      latestPeriod: '2026-09-01',
      latestCount: 2,
      latestInvoice: 22507.9,
      latestContra: 5000,
      latestNet: 17507.9,
      draft: 2,
      issued: 1,
      paid: 1,
      total: 4,
    })
  })
  it('is empty-safe', () => {
    expect(statementsSummary([])).toMatchObject({ latestPeriod: null, latestCount: 0, total: 0 })
  })
})
