import { buildRepaymentSourceRows } from './repayment-source-rows'

// A fund source's repayment voucher (2026-10-02, moved here 2026-10-15 so the
// fund source's page and the Finance phone app's sheet file the SAME voucher):
// what Create payment sends in loan-repayment mode — the source already known,
// its principal on the lender's own account, interest on 6000, penalty on 9096,
// every line from the pool chosen — or why it cannot be filed yet. Money going
// out still needs the Principal: the voucher is saved as a draft and sent for
// approval from its own page.

export interface FundSourceRepayment {
  fundSourceId: string
  /** The lender, in full — the voucher's payee. */
  lender: string
  lenderCompanyId: string | null
  /** The account the source is owed on; the principal line's default. */
  accountCode: string | null
  outstanding: number
  /** Active chart-of-accounts codes among the three defaults. */
  activeAccounts: readonly string[]
  principal: string
  interest: string
  penalty: string
  /** YYYY-MM-DD. */
  paymentDate: string
  bankId: string
  pool: string
  /** Left blank: *Loan repayment — {lender}*. */
  description?: string
}

const figure = (s: string) => {
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

/** The voucher's total: principal + interest + penalty, to the sen. */
export function repaymentTotal(principal: string, interest: string, penalty: string): number {
  return Math.round((figure(principal) + figure(interest) + figure(penalty)) * 100) / 100
}

/**
 * The FormData Create payment sends in loan-repayment mode for this repayment
 * (written into `formData` — the page's form brings its own fields), or the
 * reason it cannot be filed.
 */
export function fundSourceRepaymentForm(
  r: FundSourceRepayment,
  formData: FormData = new FormData(),
): { ok: true; formData: FormData; total: number } | { ok: false; reason: string } {
  const p = figure(r.principal)
  const i = figure(r.interest)
  const pen = figure(r.penalty)
  const total = repaymentTotal(r.principal, r.interest, r.penalty)
  if (total <= 0) return { ok: false, reason: 'Enter at least one of principal, interest or penalty.' }
  if (p > r.outstanding + 0.005) return { ok: false, reason: `The principal ${r.principal} is more than the ${r.outstanding.toFixed(2)} still owed on it.` }
  if (!r.bankId) return { ok: false, reason: 'Pick the bank it is paid from.' }

  const active = new Set(r.activeAccounts)
  const rows = buildRepaymentSourceRows([], { principal: p, interest: i, penalty: pen }, r.accountCode, (c) => active.has(c))
  const missing = rows.find((row) => !row.account_code)
  if (missing) {
    return { ok: false, reason: `The ${missing.role} line has no account yet — record this one from Payments › Create payment, where its account can be picked.` }
  }

  // The same FormData Create payment sends in loan-repayment mode.
  formData.set('direction', 'debit')
  formData.set('voucher_type', 'expense')
  formData.set('payee_company_id', r.lenderCompanyId ?? '')
  formData.set('payee_name', r.lender)
  formData.set('reference_type', '')
  formData.set('reference_id', '')
  formData.set('amount', total.toFixed(2))
  formData.set('payment_method', 'bank_transfer')
  formData.set('payment_date', r.paymentDate)
  formData.set('bank_account_id', r.bankId)
  formData.set('target_pool', '')
  formData.set('fund_source_id', r.fundSourceId)
  formData.set('repayment_principal', r.principal)
  formData.set('repayment_interest', r.interest)
  formData.set('repayment_penalty', r.penalty)
  formData.set('source_rows_count', String(rows.length))
  rows.forEach((row, n) => {
    formData.set(`source_rows[${n}][pool]`, r.pool)
    formData.set(`source_rows[${n}][amount]`, row.amount)
    formData.set(`source_rows[${n}][account_code]`, row.account_code)
  })
  formData.set('source_pool', r.pool)
  formData.set('attachment_count', '0')
  const description = (r.description ?? String(formData.get('description') ?? '')).trim()
  formData.set('description', description || `Loan repayment — ${r.lender}`)
  return { ok: true, formData, total }
}
