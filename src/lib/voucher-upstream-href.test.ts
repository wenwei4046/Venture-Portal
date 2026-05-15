import { describe, it, expect } from 'vitest'
import { voucherUpstreamHref, voucherUpstreamLabel } from './voucher-upstream-href'

describe('voucherUpstreamHref', () => {
  const id = 'abc-123'

  it('returns /fund-out path for loan', () => {
    expect(voucherUpstreamHref('loan', id)).toBe(`/fund-out/${id}`)
  })

  it('returns null for invoice (no per-invoice detail page; lives in /statements?period= list)', () => {
    expect(voucherUpstreamHref('invoice', id)).toBeNull()
  })

  it('returns /fund-in path for fund_source', () => {
    expect(voucherUpstreamHref('fund_source', id)).toBe(`/fund-in/${id}`)
  })

  it('returns /approvals/payroll-run path for payroll_run', () => {
    expect(voucherUpstreamHref('payroll_run', id)).toBe(`/approvals/payroll-run/${id}`)
  })

  it('returns null for claim (no detail page)', () => {
    expect(voucherUpstreamHref('claim', id)).toBeNull()
  })

  it('returns null for hr_opex (no detail page)', () => {
    expect(voucherUpstreamHref('hr_opex', id)).toBeNull()
  })

  it('returns null for salary_payout (no generic id route)', () => {
    expect(voucherUpstreamHref('salary_payout', id)).toBeNull()
  })

  it('returns null for unknown reference_type', () => {
    expect(voucherUpstreamHref('mystery_type', id)).toBeNull()
  })

  it('returns null when referenceType is null', () => {
    expect(voucherUpstreamHref(null, id)).toBeNull()
  })

  it('returns null when referenceId is null', () => {
    expect(voucherUpstreamHref('loan', null)).toBeNull()
  })

  it('returns null when both are null', () => {
    expect(voucherUpstreamHref(null, null)).toBeNull()
  })

  it('returns null when referenceType is undefined', () => {
    expect(voucherUpstreamHref(undefined, id)).toBeNull()
  })
})

describe('voucherUpstreamLabel', () => {
  it('returns friendly label for known types', () => {
    expect(voucherUpstreamLabel('loan')).toBe('Loan')
    expect(voucherUpstreamLabel('invoice')).toBe('Invoice')
    expect(voucherUpstreamLabel('fund_source')).toBe('Fund source')
    expect(voucherUpstreamLabel('payroll_run')).toBe('Payroll run')
    expect(voucherUpstreamLabel('claim')).toBe('Claim')
    expect(voucherUpstreamLabel('hr_opex')).toBe('HR OPEX')
    expect(voucherUpstreamLabel('salary_payout')).toBe('Salary payout')
  })

  it('falls back to underscore-stripped type for unknown values', () => {
    expect(voucherUpstreamLabel('new_custom_type')).toBe('new custom type')
  })

  it('returns null for null input', () => {
    expect(voucherUpstreamLabel(null)).toBeNull()
  })
})
