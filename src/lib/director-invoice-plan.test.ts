import { describe, expect, it } from 'vitest'
import { directorInvoicePlan, type DirectorInvoiceSource } from './director-invoice-plan'

// 2026-11-04 — the user: "做进去payroll 按， 但分开按generate director payroll invoice 可以吗？" → Payroll ▾ ›
// Generate director payroll invoices: one draft a company, HR's director CTC itemised as HR keyed it (the Director
// OPEX invoices August and September went out as), the companies ticked, none for a company already billed.

const ROWS: DirectorInvoiceSource[] = [
  { companyId: 'co-2990', shortCode: '2990', name: '2990', totalCtc: 7405.88, basic: 2500, kpi: 0, allowance: 4533.13, epf: 325, socso: 42.85, eis: 4.9 },
  { companyId: 'co-hk', shortCode: 'HK', name: 'Hookka', totalCtc: 11316.05, basic: 10000, kpi: 0, allowance: 0, epf: 1200, socso: 104.15, eis: 11.9 },
  { companyId: 'co-zero', shortCode: 'ZR', name: 'Zero', totalCtc: 0, basic: 0, kpi: 0, allowance: 0, epf: 0, socso: 0, eis: 0 },
]

describe('directorInvoicePlan', () => {
  it('drafts one invoice a company, itemised as HR keyed it, on the account picked', () => {
    const plan = directorInvoicePlan({ rows: ROWS, month: '2026-10', picked: null, billed: new Set(), account: '5050' })
    expect(plan.invoices.map((i) => [i.companyId, i.total])).toEqual([
      ['co-2990', 7405.88],
      ['co-hk', 11316.05],
    ])
    expect(plan.invoices[0].lines).toEqual([
      { description: "Salary - Oct'26", amount: 2500, categoryCode: '5050' },
      { description: "Allowance - Oct'26", amount: 4533.13, categoryCode: '5050' },
      { description: "EPF - Oct'26", amount: 325, categoryCode: '5050' },
      { description: "SOCSO - Oct'26", amount: 42.85, categoryCode: '5050' },
      { description: "EIS - Oct'26", amount: 4.9, categoryCode: '5050' },
    ])
    expect(plan.description).toBe('Director salary CTC — October 2026')
    expect(plan.total).toBe(18721.93)
  })

  it('leaves out a company not ticked, and one already billed this month', () => {
    const plan = directorInvoicePlan({ rows: ROWS, month: '2026-10', picked: new Set(['co-2990', 'co-hk']), billed: new Set(['co-hk']), account: '5050' })
    expect(plan.invoices.map((i) => i.companyId)).toEqual(['co-2990'])
    expect(plan.skipped).toEqual([{ companyId: 'co-hk', name: 'Hookka', reason: 'billed' }])
  })
})
