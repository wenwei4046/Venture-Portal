// Pure-logic helpers for loan disbursement classification.
//
// Loan-disbursement PVs must carry a Balance-Sheet-classified account so the
// principal can never leak into the P&L. The unified COA has 4 BS-side types:
//   - asset       (e.g. 3030 Accounts Receivable, 3020 Loans Receivable)
//   - fixed_asset (e.g. 2000 Equipment)
//   - liability   (e.g. 4050 Accounts Payable — General)
//   - equity      (e.g. 1010 HV Operating Fund — rare for a disbursement)
//
// Note: type list expanded from the pre-unified-COA pair (asset/liability)
// because the new enum splits assets into asset + fixed_asset and equity is
// occasionally legitimate for an internal-funds disbursement.

export type LoanDisbursementAccountType =
  | 'asset'
  | 'fixed_asset'
  | 'liability'
  | 'equity'

const ALLOWED_TYPES: ReadonlyArray<LoanDisbursementAccountType> = [
  'asset',
  'fixed_asset',
  'liability',
  'equity',
]

export interface BsAccountOption {
  code: string
  name: string
  account_type: string
}

export interface RawAccountRow {
  code: string
  name: string
  account_type: string
  is_active: boolean
}

// Filter the full chart_of_accounts list down to the accounts Finance is
// allowed to pick on the new-loan form: active rows classified as
// asset / fixed_asset / liability / equity.
export function bsAccountsForDisbursement(rows: RawAccountRow[]): BsAccountOption[] {
  return rows
    .filter((r) => r.is_active && ALLOWED_TYPES.includes(r.account_type as LoanDisbursementAccountType))
    .map((r) => ({ code: r.code, name: r.name, account_type: r.account_type }))
}

// Server-side validation: the chosen account must exist in the supplied list
// and must be BS-classified. Returns null on success, an error message string
// otherwise. (Keeping the return shape simple so call sites can `if (err)
// return { error: err }` without further plumbing.)
export function validateDisbursementAccount(
  code: string,
  allAccounts: RawAccountRow[],
): string | null {
  if (!code) return 'Disbursement account is required'
  const found = allAccounts.find((r) => r.code === code)
  if (!found) return `Disbursement account "${code}" not found`
  if (!found.is_active) return `Disbursement account "${code}" is inactive`
  if (!ALLOWED_TYPES.includes(found.account_type as LoanDisbursementAccountType)) {
    return `Disbursement account "${code}" must be a balance-sheet type (asset / fixed_asset / liability / equity) — got "${found.account_type ?? 'null'}"`
  }
  return null
}
