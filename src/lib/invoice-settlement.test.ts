import { describe, it, expect } from 'vitest'
import { payeeKey, validateConsolidation, poolAttributions, segmentForBillingMode, type SettleableInvoice } from './invoice-settlement'

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

  it('rejects an invoice with no company and no freetext name', () => {
    const r = validateConsolidation([inv({ company_id: null, billable_to_freetext_name: null })])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('no identifiable payee')
  })

  it('rejects an invalid total_amount', () => {
    const r = validateConsolidation([inv({ company_id: 'c1', total_amount: 'abc' as unknown as number })])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('invalid total_amount')
  })

  it('accepts a single same-company invoice', () => {
    const r = validateConsolidation([inv({ company_id: 'c1', total_amount: 42.5 })])
    expect(r).toEqual({ ok: true, payeeKey: 'company:c1', total: 42.5 })
  })
})

describe('poolAttributions', () => {
  const map: Record<string, string> = {
    marketing_project: 'dept_pool_marketing',
    hr_attribution: 'dept_pool_hr',
    venture_attribution: 'venture_pool',
  }

  it('attributes each invoice to its own pool by billing_mode', () => {
    const r = poolAttributions(
      [
        { id: 'a', invoice_no: 'INV-1', billing_mode: 'marketing_project', total_amount: 100 },
        { id: 'b', invoice_no: 'INV-2', billing_mode: 'venture_attribution', total_amount: 50 },
        { id: 'c', invoice_no: 'INV-3', billing_mode: 'hr_attribution', total_amount: 25.5 },
      ],
      map,
    )
    expect(r).toEqual([
      { pool: 'dept_pool_marketing', amount: 100, invoiceNo: 'INV-1' },
      { pool: 'venture_pool', amount: 50, invoiceNo: 'INV-2' },
      { pool: 'dept_pool_hr', amount: 25.5, invoiceNo: 'INV-3' },
    ])
  })

  it('does NOT lump a mixed-department selection into one pool (regression for OR-0001..0004)', () => {
    const r = poolAttributions(
      [
        { id: 'a', invoice_no: 'M', billing_mode: 'marketing_project', total_amount: 2183.04 },
        { id: 'b', invoice_no: 'V', billing_mode: 'venture_attribution', total_amount: 391.95 },
      ],
      map,
    )
    const pools = new Set(r.map((x) => x.pool))
    expect(pools).toEqual(new Set(['dept_pool_marketing', 'venture_pool']))
  })

  it('falls back to venture pool for an unmapped billing_mode', () => {
    const r = poolAttributions([{ id: 'x', invoice_no: null, billing_mode: 'weird', total_amount: 9 }], map)
    expect(r[0].pool).toBe('venture_pool')
    expect(r[0].invoiceNo).toBe('x')
  })
})

describe('segmentForBillingMode', () => {
  it('maps each billing mode to its GL segment (mirrors SQL billing_mode_to_segment)', () => {
    expect(segmentForBillingMode('marketing_project')).toBe('marketing')
    expect(segmentForBillingMode('hr_attribution')).toBe('hr')
    expect(segmentForBillingMode('finance_attribution')).toBe('finance')
    expect(segmentForBillingMode('director_office_attribution')).toBe('director_office')
    expect(segmentForBillingMode('director_attribution')).toBe('director_office')
  })
  it('falls back to corporate for venture_attribution and unknown modes', () => {
    expect(segmentForBillingMode('venture_attribution')).toBe('corporate')
    expect(segmentForBillingMode('weird')).toBe('corporate')
  })
})
