import { describe, expect, it } from 'vitest'
import { billingModeLabel, invoiceParty } from './invoice-labels'

// 2026-10-09 — an invoice's own page (the Finance revamp) names its billing
// mode in words and says who it bills, the way the prototype does:
// "HOUZS Century (HC) · Subsidiary", "INVOICE · HR ATTRIBUTION".

describe('billingModeLabel', () => {
  it('reads the core modes in words', () => {
    expect(billingModeLabel('hr_attribution')).toBe('HR attribution')
    expect(billingModeLabel('marketing_project')).toBe('Marketing project')
    expect(billingModeLabel('director_office_attribution')).toBe('Director Office OPEX')
    expect(billingModeLabel('payroll_consolidated')).toBe('Payroll (consolidated)')
    expect(billingModeLabel('it_attribution')).toBe('IT attribution')
  })

  it('takes a provisioned department’s own label, else the words of the key', () => {
    expect(billingModeLabel('ops_attribution', [{ value: 'ops_attribution', label: 'Operations Pool' }])).toBe('Operations Pool')
    expect(billingModeLabel('some_new_mode')).toBe('Some new mode')
    expect(billingModeLabel(null)).toBe('—')
  })
})

describe('invoiceParty', () => {
  const companies = new Map([['co-hc', { name: 'HOUZS Century', code: 'HC' }]])
  const departments = new Map([['d-mkt', 'Marketing']])
  const base = { company_id: null, billable_to_type: null, billable_to_department_id: null, billable_to_freetext_name: null }

  it('names a subsidiary with its code, a department pool, a director and a free-text party', () => {
    expect(invoiceParty({ ...base, company_id: 'co-hc', billable_to_type: 'subsidiary' }, companies, departments)).toEqual({ name: 'HOUZS Century (HC)', kind: 'Subsidiary' })
    expect(invoiceParty({ ...base, billable_to_type: 'dept_pool', billable_to_department_id: 'd-mkt' }, companies, departments)).toEqual({ name: 'Marketing', kind: 'Dept pool' })
    expect(invoiceParty({ ...base, billable_to_type: 'director', billable_to_freetext_name: 'Mr Lim' }, companies, departments)).toEqual({ name: 'Mr Lim', kind: 'Director' })
    expect(invoiceParty({ ...base, billable_to_type: 'freetext', billable_to_freetext_name: 'Rygis Private Gym' }, companies, departments)).toEqual({ name: 'Rygis Private Gym', kind: 'Free text' })
  })

  it('says so when it cannot tell', () => {
    expect(invoiceParty({ ...base, company_id: 'gone', billable_to_type: 'subsidiary' }, companies, departments)).toEqual({ name: '—', kind: 'Subsidiary' })
    expect(invoiceParty(base, companies, departments)).toEqual({ name: '—', kind: '—' })
  })
})
