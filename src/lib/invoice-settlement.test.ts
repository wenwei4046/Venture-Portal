import { describe, it, expect } from 'vitest'
import { payeeKey, validateConsolidation, type SettleableInvoice } from './invoice-settlement'

function inv(over: Partial<SettleableInvoice>): SettleableInvoice {
  return {
    id: 'i1',
    status: 'issued',
    billable_to_type: 'subsidiary',
    company_id: 'c1',
    billable_to_freetext_name: null,
    total_amount: 100,
    ...over,
  }
}

describe('payeeKey', () => {
  it('uses company_id when present', () => {
    expect(payeeKey(inv({ company_id: 'cX' }))).toBe('company:cX')
  })
  it('falls back to freetext name when no company', () => {
    expect(payeeKey(inv({ company_id: null, billable_to_freetext_name: 'Acme' }))).toBe('freetext:Acme')
  })
})

describe('validateConsolidation', () => {
  it('rejects empty selection', () => {
    expect(validateConsolidation([])).toEqual({ ok: false, error: 'No invoices selected' })
  })

  it('rejects a non-issued invoice', () => {
    const r = validateConsolidation([inv({ id: 'iA', status: 'draft' })])
    expect(r.ok).toBe(false)
  })

  it('rejects dept_pool (inter-billing) invoices', () => {
    const r = validateConsolidation([inv({ billable_to_type: 'dept_pool' })])
    expect(r.ok).toBe(false)
  })

  it('rejects a cross-company selection', () => {
    const r = validateConsolidation([inv({ id: 'a', company_id: 'c1' }), inv({ id: 'b', company_id: 'c2' })])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('同一家公司')
  })

  it('accepts same-company invoices and sums (rounded) total', () => {
    const r = validateConsolidation([
      inv({ id: 'a', company_id: 'c1', total_amount: 100.005 }),
      inv({ id: 'b', company_id: 'c1', total_amount: 50.1 }),
    ])
    expect(r).toEqual({ ok: true, payeeKey: 'company:c1', total: 150.11 })
  })
})
