// Pure-logic helpers for loan disbursement classification.
//
// Loan-disbursement PVs must carry a Balance-Sheet-classified category so the
// principal can never leak into the P&L. Allowed account types are `asset`
// (e.g. "Amount due from / (to) — 2990" → 1020 Loans Receivable) and
// `liability` (rare; only if the borrowing side already had a credit balance
// on the inter-company account that needs to be cleared). `equity` is not
// allowed for a disbursement — equity moves go through a different code
// path.

export type LoanDisbursementCategoryAccountType = 'asset' | 'liability'

export interface BsCategoryOption {
  code: string
  label: string
  account_type: string
}

export interface RawCategoryRow {
  code: string
  label: string
  account_type: string | null
  is_active: boolean
}

// Filter the full payment_categories list down to the categories Finance is
// allowed to pick on the new-loan form: active rows classified as asset or
// liability.
export function bsCategoriesForDisbursement(rows: RawCategoryRow[]): BsCategoryOption[] {
  return rows
    .filter((r) => r.is_active && (r.account_type === 'asset' || r.account_type === 'liability'))
    .map((r) => ({ code: r.code, label: r.label, account_type: r.account_type as string }))
}

// Server-side validation: the chosen category must exist in the supplied list
// and must be BS-classified. Returns null on success, an error message string
// otherwise. (Keeping the return shape simple so call sites can `if (err)
// return { error: err }` without further plumbing.)
export function validateDisbursementCategory(
  code: string,
  allCategories: RawCategoryRow[],
): string | null {
  if (!code) return 'Disbursement category is required'
  const found = allCategories.find((r) => r.code === code)
  if (!found) return `Disbursement category "${code}" not found`
  if (!found.is_active) return `Disbursement category "${code}" is inactive`
  if (found.account_type !== 'asset' && found.account_type !== 'liability') {
    return `Disbursement category "${code}" must be an asset or liability (got "${found.account_type ?? 'null'}")`
  }
  return null
}
