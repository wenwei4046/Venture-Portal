// src/lib/coa.ts
// Single source of truth for Chart-of-Accounts types and ranges. Maps the
// Postgres `account_type` enum to display labels, number ranges (used by
// next_account_code RPC and a DB trigger), and a default cash_flow_category
// for each type. Reports + Settings UI both import from here.

export const ACCOUNT_TYPES = [
  'equity', 'fixed_asset', 'asset', 'liability',
  'revenue', 'cost', 'other_income', 'expense',
] as const
export type AccountType = (typeof ACCOUNT_TYPES)[number]

export const CASH_FLOW_CATEGORIES = ['operating', 'investing', 'financing'] as const
export type CashFlowCategory = (typeof CASH_FLOW_CATEGORIES)[number]

// Each type owns a 1000-code range. 8000-8999 is reserved (gap).
const RANGES: Record<AccountType, readonly [number, number]> = {
  equity:        [1000, 1999],
  fixed_asset:   [2000, 2999],
  asset:         [3000, 3999],
  liability:     [4000, 4999],
  revenue:       [5000, 5999],
  cost:          [6000, 6999],
  other_income:  [7000, 7999],
  expense:       [9000, 9999],
}
export function rangeFor(type: AccountType): readonly [number, number] {
  return RANGES[type]
}

const DEFAULT_CFC: Record<AccountType, CashFlowCategory> = {
  equity:       'financing',
  fixed_asset:  'investing',
  asset:        'operating',
  liability:    'financing',
  revenue:      'operating',
  cost:         'operating',
  other_income: 'operating',
  expense:      'operating',
}
export function defaultCashFlowCategoryFor(type: AccountType): CashFlowCategory {
  return DEFAULT_CFC[type]
}

const LABELS: Record<AccountType, string> = {
  equity:       'Equity',
  fixed_asset:  'Fixed Asset',
  asset:        'Asset',
  liability:    'Liability',
  revenue:      'Revenue',
  cost:         'Cost',
  other_income: 'Other Income',
  expense:      'Expense',
}
export function typeLabel(type: AccountType): string {
  return LABELS[type]
}
