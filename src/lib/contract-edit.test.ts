import { describe, expect, it } from 'vitest'
import { contractEditForm, contractEditsNothing, contractFieldsOf, contractNewForm, type ContractFields } from './contract-edit'

// A marketing contract's Edit sends only what changed (2026-10-16 — the
// user's rule of 2026-10-14); a new one sends every field.

const WAS: ContractFields = { companyId: 'co-hc', description: 'Marketing retainer — Q4', amount: '6000.00', startDate: '2026-10-01', endDate: '2026-12-31' }

describe('a marketing contract’s form', () => {
  it('an edit sends only the fields changed — an amount typed differently is no change', () => {
    expect(contractEditsNothing(contractEditForm('ct1', WAS, { ...WAS, amount: '6000' }))).toBe(true)
    const fd = contractEditForm('ct1', WAS, { ...WAS, amount: '6500', endDate: '' })
    expect(Object.fromEntries(fd.entries())).toEqual({ id: 'ct1', amount: '6500', end_date: '' })
  })

  it('a new one sends every field under the form’s names', () => {
    expect(Object.fromEntries(contractNewForm({ ...WAS, description: ' Rebranding ' }).entries())).toEqual({
      company_id: 'co-hc',
      description: 'Rebranding',
      amount: '6000.00',
      start_date: '2026-10-01',
      end_date: '2026-12-31',
    })
  })

  it('reads the desktop form back by its names', () => {
    const fd = new FormData()
    fd.set('id', 'ct1')
    fd.set('company_id', 'co-hc')
    fd.set('description', 'Marketing retainer — Q4')
    fd.set('amount', '6000')
    fd.set('start_date', '2026-10-01')
    fd.set('end_date', '2026-12-31')
    expect(contractEditsNothing(contractEditForm('ct1', WAS, contractFieldsOf(fd)))).toBe(true)
  })
})
