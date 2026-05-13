import { describe, it, expect } from 'vitest'
import {
  bsCategoriesForDisbursement,
  validateDisbursementCategory,
  type RawCategoryRow,
} from './loan-disbursement'

const rows: RawCategoryRow[] = [
  { code: 'amount_due_from_to_2990', label: 'Amount due from / (to) — 2990', account_type: 'asset', is_active: true },
  { code: 'fund_sources_payable', label: 'Fund sources payable', account_type: 'liability', is_active: true },
  { code: 'office_rental', label: 'Office Rental', account_type: 'expense', is_active: true },
  { code: 'service_revenue', label: 'Service revenue', account_type: 'revenue', is_active: true },
  { code: 'paid_capital', label: 'Paid capital', account_type: 'equity', is_active: true },
  { code: 'inactive_asset', label: 'Old asset code', account_type: 'asset', is_active: false },
  { code: 'unclassified', label: 'Legacy unclassified', account_type: null, is_active: true },
]

describe('bsCategoriesForDisbursement', () => {
  it('keeps only active asset/liability categories', () => {
    const out = bsCategoriesForDisbursement(rows)
    expect(out.map((c) => c.code)).toEqual(['amount_due_from_to_2990', 'fund_sources_payable'])
  })

  it('drops revenue, expense, equity, inactive, and null-classified rows', () => {
    const out = bsCategoriesForDisbursement(rows)
    const codes = out.map((c) => c.code)
    expect(codes).not.toContain('office_rental')
    expect(codes).not.toContain('service_revenue')
    expect(codes).not.toContain('paid_capital')
    expect(codes).not.toContain('inactive_asset')
    expect(codes).not.toContain('unclassified')
  })
})

describe('validateDisbursementCategory', () => {
  it('returns null when the code is a valid active BS category', () => {
    expect(validateDisbursementCategory('amount_due_from_to_2990', rows)).toBeNull()
    expect(validateDisbursementCategory('fund_sources_payable', rows)).toBeNull()
  })

  it('rejects empty code', () => {
    expect(validateDisbursementCategory('', rows)).toBe('Disbursement category is required')
  })

  it('rejects unknown code', () => {
    expect(validateDisbursementCategory('does_not_exist', rows)).toMatch(/not found/)
  })

  it('rejects inactive code', () => {
    expect(validateDisbursementCategory('inactive_asset', rows)).toMatch(/inactive/)
  })

  it('rejects revenue / expense / equity / null classification', () => {
    expect(validateDisbursementCategory('office_rental', rows)).toMatch(/asset or liability/)
    expect(validateDisbursementCategory('service_revenue', rows)).toMatch(/asset or liability/)
    expect(validateDisbursementCategory('paid_capital', rows)).toMatch(/asset or liability/)
    expect(validateDisbursementCategory('unclassified', rows)).toMatch(/asset or liability/)
  })
})
