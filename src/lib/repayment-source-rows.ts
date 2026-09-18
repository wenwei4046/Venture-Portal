// Source rows for a fund-source repayment PV, derived from the principal /
// interest / penalty split (user 2026-09-18: "做，自动带出账户").
//
// Before this the repayment box only set fund_source_id + the split; the
// GL leg still came from whatever account Finance typed on each source row,
// and twice it went astray — Kingsley's 100,000 principal to 1010 HV
// Operating Fund, the directors' 750 interest to 5027 Loan Interest (income).
// Now each component gets its own row with the right account by default:
//   principal → the fund source's own account (4054 / 4055 / 4058 …)
//   interest  → 6000 Interest Expense - Fund Sources
//   penalty   → 9096 Penalty Expense
// Finance can still change a row's account or pool; a hand-picked account
// survives later split edits, an auto one follows the fund source.

export const INTEREST_EXPENSE_ACCOUNT = '6000'
export const PENALTY_EXPENSE_ACCOUNT = '9096'
export const DEFAULT_REPAYMENT_POOL = 'venture_pool'

export type RepaymentRole = 'principal' | 'interest' | 'penalty'

export interface RepaymentSplit {
  principal: number
  interest: number
  penalty: number
}

export interface RepaymentSourceRow {
  role: RepaymentRole
  pool: string
  amount: string
  account_code: string
  /** true while the account is the default we chose; false once Finance picks one. */
  autoAccount: boolean
}

const ROLES: RepaymentRole[] = ['principal', 'interest', 'penalty']

export function buildRepaymentSourceRows(
  prev: readonly Partial<RepaymentSourceRow>[],
  split: RepaymentSplit,
  fundSourceAccount: string | null | undefined,
  hasAccount: (code: string) => boolean,
): RepaymentSourceRow[] {
  const defaultFor = (role: RepaymentRole): string => {
    const code =
      role === 'principal' ? fundSourceAccount ?? '' : role === 'interest' ? INTEREST_EXPENSE_ACCOUNT : PENALTY_EXPENSE_ACCOUNT
    return code && hasAccount(code) ? code : ''
  }
  const rows: RepaymentSourceRow[] = []
  for (const role of ROLES) {
    const amount = Math.round((split[role] || 0) * 100) / 100
    if (amount < 0.005) continue
    const existing = prev.find((r) => r.role === role)
    const keepManual = !!existing && existing.autoAccount === false && !!existing.account_code
    rows.push({
      role,
      pool: existing?.pool || DEFAULT_REPAYMENT_POOL,
      amount: amount.toFixed(2),
      account_code: keepManual ? existing!.account_code! : defaultFor(role),
      autoAccount: !keepManual,
    })
  }
  return rows
}
