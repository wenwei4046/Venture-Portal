import { describe, it, expect } from 'vitest'
import {
  ACCOUNT_TYPES,
  CASH_FLOW_CATEGORIES,
  rangeFor,
  defaultCashFlowCategoryFor,
  typeLabel,
} from './coa'

describe('coa', () => {
  it('lists 8 account types in canonical order', () => {
    expect(ACCOUNT_TYPES).toEqual([
      'equity', 'fixed_asset', 'asset', 'liability',
      'revenue', 'cost', 'other_income', 'expense',
    ])
  })

  it('lists 3 cash flow categories', () => {
    expect(CASH_FLOW_CATEGORIES).toEqual(['operating', 'investing', 'financing'])
  })

  it('rangeFor returns [start, end] for each type', () => {
    expect(rangeFor('equity')).toEqual([1000, 1999])
    expect(rangeFor('fixed_asset')).toEqual([2000, 2999])
    expect(rangeFor('asset')).toEqual([3000, 3999])
    expect(rangeFor('liability')).toEqual([4000, 4999])
    expect(rangeFor('revenue')).toEqual([5000, 5999])
    expect(rangeFor('cost')).toEqual([6000, 6999])
    expect(rangeFor('other_income')).toEqual([7000, 7999])
    expect(rangeFor('expense')).toEqual([9000, 9999])
  })

  it('defaultCashFlowCategoryFor maps type → default category', () => {
    expect(defaultCashFlowCategoryFor('equity')).toBe('financing')
    expect(defaultCashFlowCategoryFor('liability')).toBe('financing')
    expect(defaultCashFlowCategoryFor('fixed_asset')).toBe('investing')
    expect(defaultCashFlowCategoryFor('asset')).toBe('operating')
    expect(defaultCashFlowCategoryFor('revenue')).toBe('operating')
    expect(defaultCashFlowCategoryFor('cost')).toBe('operating')
    expect(defaultCashFlowCategoryFor('other_income')).toBe('operating')
    expect(defaultCashFlowCategoryFor('expense')).toBe('operating')
  })

  it('typeLabel returns human-readable labels', () => {
    expect(typeLabel('fixed_asset')).toBe('Fixed Asset')
    expect(typeLabel('other_income')).toBe('Other Income')
    expect(typeLabel('expense')).toBe('Expense')
  })
})
