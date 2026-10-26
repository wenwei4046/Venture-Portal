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
  /** The line's own words (2026-10-22), kept with its part. */
  description?: string
}

const ROLES: RepaymentRole[] = ['principal', 'interest', 'penalty']

const r2 = (n: number) => Math.round(n * 100) / 100

/** Default account for a component: principal on the lender's own account,
 *  interest on 6000, penalty on 9096 — blank when the code isn't an active
 *  COA account, so the picker shows empty instead of a dead code. */
export function defaultRepaymentAccount(
  role: RepaymentRole,
  fundSourceAccount: string | null | undefined,
  hasAccount: (code: string) => boolean,
): string {
  const code =
    role === 'principal' ? fundSourceAccount ?? '' : role === 'interest' ? INTEREST_EXPENSE_ACCOUNT : PENALTY_EXPENSE_ACCOUNT
  return code && hasAccount(code) ? code : ''
}

/** Give SAVED draft rows (no roles yet — the edit form) their roles by matching
 *  each split component to a row of the same amount, keeping that row's pool
 *  and account (flagged auto when it already equals the default). If the saved
 *  rows don't line up with the split — one lump row, a stale amount — they
 *  are rebuilt from the split with the default accounts. */
export function seedRepaymentSourceRows(
  saved: readonly { pool: string; amount: string; account_code: string; description?: string }[],
  split: RepaymentSplit,
  fundSourceAccount: string | null | undefined,
  hasAccount: (code: string) => boolean,
): RepaymentSourceRow[] {
  const unmatched = saved.map((s) => ({ ...s, amt: r2(parseFloat(s.amount) || 0) }))
  const rows: RepaymentSourceRow[] = []
  for (const role of ROLES) {
    const amount = r2(split[role] || 0)
    if (amount < 0.005) continue
    const i = unmatched.findIndex((s) => Math.abs(s.amt - amount) < 0.005)
    if (i < 0) return buildRepaymentSourceRows([], split, fundSourceAccount, hasAccount)
    const [s] = unmatched.splice(i, 1)
    const def = defaultRepaymentAccount(role, fundSourceAccount, hasAccount)
    const code = s.account_code || def
    rows.push({ role, pool: s.pool || DEFAULT_REPAYMENT_POOL, amount: amount.toFixed(2), account_code: code, autoAccount: code === def, description: s.description || undefined })
  }
  // Anything left over means the draft was split some other way — rebuild.
  if (unmatched.length > 0) return buildRepaymentSourceRows([], split, fundSourceAccount, hasAccount)
  return rows
}

export function buildRepaymentSourceRows(
  prev: readonly Partial<RepaymentSourceRow>[],
  split: RepaymentSplit,
  fundSourceAccount: string | null | undefined,
  hasAccount: (code: string) => boolean,
): RepaymentSourceRow[] {
  const rows: RepaymentSourceRow[] = []
  for (const role of ROLES) {
    const amount = r2(split[role] || 0)
    if (amount < 0.005) continue
    const existing = prev.find((r) => r.role === role)
    const keepManual = !!existing && existing.autoAccount === false && !!existing.account_code
    rows.push({
      role,
      pool: existing?.pool || DEFAULT_REPAYMENT_POOL,
      amount: amount.toFixed(2),
      account_code: keepManual ? existing!.account_code! : defaultRepaymentAccount(role, fundSourceAccount, hasAccount),
      autoAccount: !keepManual,
      description: existing?.description || undefined,
    })
  }
  return rows
}
