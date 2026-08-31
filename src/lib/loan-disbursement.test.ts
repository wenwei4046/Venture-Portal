import { describe, it, expect } from 'vitest'
import {
  bsAccountsForDisbursement,
  validateDisbursementAccount,
  type RawAccountRow,
} from './loan-disbursement'

const rows: RawAccountRow[] = [
  { code: '3030', name: 'Accounts Receivable — Subs', account_type: 'asset', is_active: true, parent_code: null },
  { code: '2000', name: 'Equipment / Computer', account_type: 'fixed_asset', is_active: true, parent_code: null },
  { code: '4000', name: 'Fund Sources Payable', account_type: 'liability', is_active: true, parent_code: null },
  { code: '1010', name: 'HV Operating Fund', account_type: 'equity', is_active: true, parent_code: null },
  { code: '9020', name: 'Office Rental', account_type: 'expense', is_active: true, parent_code: null },
  { code: '5000', name: 'Service revenue', account_type: 'revenue', is_active: true, parent_code: null },
  { code: '6000', name: 'Cost of services', account_type: 'cost', is_active: true, parent_code: null },
  { code: '7000', name: 'Penalty Income', account_type: 'other_income', is_active: true, parent_code: null },
  { code: '3099', name: 'Old asset code', account_type: 'asset', is_active: false, parent_code: null },
]

describe('bsAccountsForDisbursement', () => {
  it('keeps only active asset / fixed_asset / liability / equity accounts', () => {
    const out = bsAccountsForDisbursement(rows)
    expect(out.map((c) => c.code)).toEqual(['3030', '2000', '4000', '1010'])
  })

  it('drops revenue, cost, other_income, expense, and inactive rows', () => {
    const out = bsAccountsForDisbursement(rows)
    const codes = out.map((c) => c.code)
    expect(codes).not.toContain('9020')
    expect(codes).not.toContain('5000')
    expect(codes).not.toContain('6000')
    expect(codes).not.toContain('7000')
    expect(codes).not.toContain('3099')
  })
})

describe('validateDisbursementAccount', () => {
  it('returns null when the code is a valid active BS account', () => {
    expect(validateDisbursementAccount('3030', rows)).toBeNull()
    expect(validateDisbursementAccount('2000', rows)).toBeNull()
    expect(validateDisbursementAccount('4000', rows)).toBeNull()
    expect(validateDisbursementAccount('1010', rows)).toBeNull()
  })

  it('rejects empty code', () => {
    expect(validateDisbursementAccount('', rows)).toBe('Disbursement account is required')
  })

  it('rejects unknown code', () => {
    expect(validateDisbursementAccount('does_not_exist', rows)).toMatch(/not found/)
  })

  it('rejects inactive code', () => {
    expect(validateDisbursementAccount('3099', rows)).toMatch(/inactive/)
  })

  it('rejects P&L-classified accounts', () => {
    expect(validateDisbursementAccount('9020', rows)).toMatch(/balance-sheet/)
    expect(validateDisbursementAccount('5000', rows)).toMatch(/balance-sheet/)
    expect(validateDisbursementAccount('6000', rows)).toMatch(/balance-sheet/)
    expect(validateDisbursementAccount('7000', rows)).toMatch(/balance-sheet/)
  })
})
