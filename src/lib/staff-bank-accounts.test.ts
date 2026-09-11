import { describe, expect, it } from 'vitest'
import { availableStaffBankAccounts, getStaffBankAccount, validateSecondaryStaffBankAccount, type BankAccountSelection } from './staff-bank-accounts'

describe('optional second staff bank account', () => {
  it('retains the existing primary account as the default and leaves it untouched', () => {
    const staff = { bank_name: ' Maybank ', bank_account_no: '0012 3456-7890' }
    expect(getStaffBankAccount(staff)).toEqual({ bankName: 'Maybank', accountNo: '001234567890' })
    expect(staff.bank_account_no).toBe('0012 3456-7890')
    expect(availableStaffBankAccounts(staff)).toEqual([
      { selection: 'account_1', label: 'Account 1', bankName: 'Maybank', accountNo: '001234567890' },
    ])
  })

  it('never falls back to Account 1 when Account 2 is explicitly chosen', () => {
    const staff = { bank_name: 'Maybank', bank_account_no: '1234567890' }
    expect(getStaffBankAccount(staff, 'account_2')).toEqual({ bankName: null, accountNo: null })
    expect(() => getStaffBankAccount(staff, 'invalid' as BankAccountSelection)).toThrow('Choose Account 1 or Account 2')
  })

  it('normalizes Account 2 while preserving leading zeros', () => {
    expect(validateSecondaryStaffBankAccount({ bankName2: ' CIMB ', bankAccountNo2: ' 0012-3456 78 ' })).toEqual({
      bankName2: 'CIMB', bankAccountNo2: '0012345678',
    })
    expect(validateSecondaryStaffBankAccount({ bankName: 'Old bank', bankAccountNo: 'legacy-value' })).toEqual({ bankName2: null, bankAccountNo2: null })
    expect(validateSecondaryStaffBankAccount({ bankName2: ' ', bankAccountNo2: ' - ' })).toEqual({ bankName2: null, bankAccountNo2: null })
  })

  it('rejects either half of an incomplete second pair and non-digit account numbers', () => {
    expect(() => validateSecondaryStaffBankAccount({ bankName2: 'Maybank' })).toThrow('Account 2 requires both')
    expect(() => validateSecondaryStaffBankAccount({ bankAccountNo2: '123456' })).toThrow('Account 2 requires both')
    for (const invalid of ['123ABC', '123.45', '+123', '123/45']) {
      expect(() => validateSecondaryStaffBankAccount({ bankName2: 'Maybank', bankAccountNo2: invalid })).toThrow('digits only')
    }
  })

  it('rejects a duplicate even when whitespace, separators and case differ', () => {
    expect(() => validateSecondaryStaffBankAccount({
      bankName: 'Hong  Leong Bank', bankAccountNo: '0012-3456 78',
      bankName2: ' hong leong bank ', bankAccountNo2: '0012345678',
    })).toThrow('Account 2 must be different from Account 1')
    expect(validateSecondaryStaffBankAccount({
      bankName: 'Maybank', bankAccountNo: '123456', bankName2: 'CIMB', bankAccountNo2: '123456',
    }).bankAccountNo2).toBe('123456')
  })

  it('only offers complete valid receiving accounts', () => {
    const staff = { bank_name: 'Maybank', bank_account_no: '123456', bank_name_2: 'CIMB', bank_account_no_2: '009876' }
    expect(availableStaffBankAccounts(staff).map(account => account.selection)).toEqual(['account_1', 'account_2'])
    expect(getStaffBankAccount(staff, 'account_2')).toEqual({ bankName: 'CIMB', accountNo: '009876' })
    expect(availableStaffBankAccounts({ ...staff, bank_account_no_2: null })).toHaveLength(1)
    expect(availableStaffBankAccounts({ ...staff, bank_account_no_2: 'invalid' })).toHaveLength(1)
  })
})
