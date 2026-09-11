export type BankAccountSelection = 'account_1' | 'account_2'

/** Existing columns remain Account 1; the second pair is entirely optional. */
export interface StaffBankAccountFields {
  bank_name?: string | null
  bank_account_no?: string | null
  bank_name_2?: string | null
  bank_account_no_2?: string | null
}

function clean(value: string | null | undefined): string | null {
  return value?.trim() || null
}

function accountNumber(value: string | null | undefined): string | null {
  return value?.replace(/[\s-]/g, '') || null
}

function bankKey(value: string | null | undefined): string | null {
  return clean(value)?.replace(/\s+/g, ' ').toLowerCase() || null
}

/** An explicitly chosen Account 2 never falls back to Account 1. */
export function getStaffBankAccount(staff: StaffBankAccountFields, selection: BankAccountSelection = 'account_1') {
  if (selection !== 'account_1' && selection !== 'account_2') throw new Error('Choose Account 1 or Account 2')
  return selection === 'account_2'
    ? { bankName: clean(staff.bank_name_2), accountNo: accountNumber(staff.bank_account_no_2) }
    : { bankName: clean(staff.bank_name), accountNo: accountNumber(staff.bank_account_no) }
}

export function availableStaffBankAccounts(staff: StaffBankAccountFields) {
  return (['account_1', 'account_2'] as const).flatMap(selection => {
    const account = getStaffBankAccount(staff, selection)
    if (!account.bankName || !account.accountNo || !/^\d+$/.test(account.accountNo)) return []
    return [{ selection, label: selection === 'account_1' ? 'Account 1' : 'Account 2', bankName: account.bankName, accountNo: account.accountNo }]
  })
}

/** Validate the optional pair without changing or rejecting legacy Account 1 data. */
export function validateSecondaryStaffBankAccount(raw: {
  bankName?: string | null
  bankAccountNo?: string | null
  bankName2?: string | null
  bankAccountNo2?: string | null
}) {
  const bankName2 = clean(raw.bankName2)
  const bankAccountNo2 = accountNumber(raw.bankAccountNo2)
  if (!!bankName2 !== !!bankAccountNo2) {
    throw new Error('Account 2 requires both a bank and an account number')
  }
  if (bankAccountNo2 && !/^\d+$/.test(bankAccountNo2)) {
    throw new Error('Account 2 number must contain digits only')
  }
  if (bankName2 && bankAccountNo2 && bankKey(bankName2) === bankKey(raw.bankName)
    && bankAccountNo2 === accountNumber(raw.bankAccountNo)) {
    throw new Error('Account 2 must be different from Account 1')
  }
  return { bankName2, bankAccountNo2 }
}
