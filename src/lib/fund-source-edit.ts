import dayjs from 'dayjs'

// A fund source still waiting for the Principal, edited (Treasury · Edit —
// `updateFundSource`): its amount, rate, periods, effective day, first
// repayment, notes, the account it is owed on and the bank it lands in. Since
// 2026-10-16 only what was changed is sent, and only that is written (the
// user's rule of 2026-10-14: the shared logins open one record on two
// screens, and a form written back whole puts back what the other changed);
// the rules are checked on the row as it will stand. The form's own names, so
// the desktop's form and the Finance phone app's sheet send alike. Pure.

export interface SourceEditFields {
  /** RM, as typed. */
  amount: string
  /** %/month, as typed. */
  ratePct: string
  /** Periods in months — '' for no fixed term. */
  months: string
  /** `YYYY-MM-DD`. */
  effectiveDate: string
  /** The first repayment, `YYYY-MM-DD`. */
  repaymentDate: string
  notes: string
  /** '' — the umbrella *4000 Fund Sources Payable*. */
  accountCode: string
  /** '' — the primary bank, at approval. */
  bankId: string
}

type Key = keyof SourceEditFields

const NAMES: Record<Key, string> = {
  amount: 'amount',
  ratePct: 'cost_rate_percent',
  months: 'lock_in_months',
  effectiveDate: 'effective_date',
  repaymentDate: 'repayment_date',
  notes: 'notes',
  accountCode: 'account_code',
  bankId: 'bank_account_id',
}
const NUMBERS = new Set<Key>(['amount', 'ratePct', 'months'])

function same(key: Key, a: string, b: string): boolean {
  const x = a.trim()
  const y = b.trim()
  if (x === y) return true
  if (!NUMBERS.has(key) || x === '' || y === '') return false
  const p = Number(x)
  const q = Number(y)
  return Number.isFinite(p) && Number.isFinite(q) && Math.abs(p - q) < 1e-9
}

/** What `updateFundSource` is sent: the source, and only the fields changed. */
export function sourceEditForm(id: string, was: SourceEditFields, now: SourceEditFields): FormData {
  const fd = new FormData()
  fd.set('id', id)
  for (const key of Object.keys(NAMES) as Key[]) {
    if (!same(key, was[key], now[key])) fd.set(NAMES[key], now[key].trim())
  }
  return fd
}

/** The edit sends nothing but the source: nothing to save. */
export const sourceEditsNothing = (fd: FormData) => [...fd.keys()].every((k) => k === 'id')

/** The desktop form's fields, read back by their names. */
export function sourceEditFieldsOf(fd: FormData): SourceEditFields {
  const s = (k: string) => (fd.get(k) as string | null) ?? ''
  return {
    amount: s('amount'),
    ratePct: s('cost_rate_percent'),
    months: s('lock_in_months'),
    effectiveDate: s('effective_date'),
    repaymentDate: s('repayment_date'),
    notes: s('notes'),
    accountCode: s('account_code'),
    bankId: s('bank_account_id'),
  }
}

/** The source as it stands — what the edit is checked against. */
export interface SourceEditRow {
  amount: number
  cost_rate: number
  lock_in_months: number | null
  effective_date: string
  repayment_date: string | null
}

export type SourceEditPatch =
  | { ok: false; reason: string }
  | {
      ok: true
      /** Only the columns sent (and what moves with them), `updated_at` with them. */
      patch: Record<string, string | number | null>
      /** The amount and rate as they will stand — the approval request's line. */
      amount: number
      ratePct: number
      /** The effective day as it will stand — its period must be open. */
      effectiveDate: string
    }

/** The fields sent over the row: checked as it will stand, written only where sent. */
export function sourceEditPatch(row: SourceEditRow, fd: FormData, today: string, now: string): SourceEditPatch {
  const sent = (k: string) => fd.has(k)
  const s = (k: string) => ((fd.get(k) as string | null) ?? '').trim()
  const patch: Record<string, string | number | null> = {}

  let amount = Number(row.amount)
  if (sent('amount')) {
    amount = parseFloat(s('amount'))
    if (isNaN(amount) || amount <= 0) return { ok: false, reason: 'Amount must be greater than 0' }
    patch.amount = amount
  }
  let ratePct = Number(row.cost_rate) * 100
  if (sent('cost_rate_percent')) {
    ratePct = parseFloat(s('cost_rate_percent'))
    if (isNaN(ratePct) || ratePct < 0 || ratePct >= 100) return { ok: false, reason: 'Interest rate must be between 0 and 100%' }
    patch.cost_rate = ratePct / 100
  }
  if (sent('lock_in_months')) {
    // Blank — no fixed term, as Record fund in has it.
    const raw = s('lock_in_months')
    const months = raw === '' ? null : parseInt(raw, 10)
    if (months !== null && (isNaN(months) || months < 1)) return { ok: false, reason: 'Repayment period must be at least 1 month' }
    patch.lock_in_months = months
  }
  const effectiveDate = sent('effective_date') ? s('effective_date') : row.effective_date
  if (sent('effective_date')) {
    if (!effectiveDate) return { ok: false, reason: 'Effective date is required' }
    if (dayjs(effectiveDate).isAfter(today, 'day')) return { ok: false, reason: 'Effective date cannot be in the future' }
    patch.effective_date = effectiveDate
  }
  const repaymentDate = sent('repayment_date') ? s('repayment_date') : row.repayment_date
  if (sent('repayment_date')) {
    if (!repaymentDate) return { ok: false, reason: 'Repayment date is required' }
    patch.repayment_date = repaymentDate
    // The Expected repayment is the repayment start: its month moves with it (2026-10-12, user: 应该要一样).
    patch.repayment_start_month = dayjs(repaymentDate).startOf('month').format('YYYY-MM-DD')
    patch.maturity_date = repaymentDate
  }
  if ((sent('repayment_date') || sent('effective_date')) && repaymentDate && dayjs(repaymentDate).isBefore(dayjs(effectiveDate), 'day')) {
    return { ok: false, reason: 'Repayment date must be on or after effective date' }
  }
  if (sent('notes')) patch.notes = s('notes') || null
  // Mig 247: an empty account is the umbrella 4000 at approval; an empty bank, the primary.
  if (sent('account_code')) patch.account_code = s('account_code') || null
  if (sent('bank_account_id')) patch.bank_account_id = s('bank_account_id') || null

  patch.updated_at = now
  return { ok: true, patch, amount, ratePct, effectiveDate }
}
