// Amend terms — a booked deal's terms changed by whoever holds Treasury ·
// Approve (2026-09-21): the two ways its form offers — from a month on (the
// months before keep their terms; the new rate and the months left apply from
// it, on the principal still owed then) or the whole deal recalculated (a
// keying-error fix) — and what each sends to the page's actions. Since
// 2026-10-16 only what was changed is sent (the user's rule of 2026-10-14:
// the shared logins open one deal on two screens, and a form sent whole puts
// back what the other changed); the four RPCs keep whatever is not sent. The
// form's own names, so `amendLoan` / `amendLoanFrom` / `amendFundSource` /
// `amendFundSourceFrom` read what they always read. Pure — the desktop's two
// forms and the Finance phone app's sheet send through it.

export type DealSide = 'out' | 'in'
export type AmendMode = 'from' | 'whole'

/** A deal's terms as its edit page starts the form. */
export interface AmendTerms {
  /** %/month as the form shows it, e.g. "1.25". */
  ratePct: string
  /** A loan's tenure, a fund source's periods ('' = no fixed term), in months. */
  months: string
  /** A loan's disbursement date, a fund source's repayment start — `YYYY-MM-DD`. */
  start: string
  compound: boolean
  /** A loan's repayment terms (words), a fund source's notes. */
  text: string
  /** `YYYY-MM` the terms in force took effect, when they were changed before. */
  termsFrom: string | null
  /** `YYYY-MM` — the from-month the form starts on: next month. */
  nextMonth: string
}

/** What the form holds while it is filled. */
export interface AmendDraft {
  mode: AmendMode
  /** `YYYY-MM`. */
  effectiveFrom: string
  ratePct: string
  /** From a month: the months left from it ('' = the maturity month stays). */
  remaining: string
  /** From a month: no monthly principal from it on — repaid in any size. */
  noFixedTerm: boolean
  months: string
  start: string
  compound: boolean
  reason: string
  text: string
}

const NAMES = {
  out: { id: 'loan_id', rate: 'effective_rate_percent', months: 'tenure_months', start: 'disbursement_date', text: 'repayment_terms' },
  in: { id: 'fund_source_id', rate: 'cost_rate_percent', months: 'lock_in_months', start: 'repayment_date', text: 'notes' },
} as const

/** The form as it opens: from next month, the terms in force. */
export const amendDraftOf = (t: AmendTerms): AmendDraft => ({
  mode: 'from',
  effectiveFrom: t.nextMonth,
  ratePct: t.ratePct,
  remaining: '',
  noFixedTerm: false,
  months: t.months,
  start: t.start,
  compound: t.compound,
  reason: '',
  text: t.text,
})

/** Two rates the same — "1.25" and "1.250" (a typed rate against the stored one, its float left as it is). */
function sameRate(a: string, b: string): boolean {
  const x = a.trim()
  const y = b.trim()
  if (x === y) return true
  if (x === '' || y === '') return false
  const p = Number(x)
  const q = Number(y)
  return Number.isFinite(p) && Number.isFinite(q) && Math.abs(p - q) < 1e-9
}

/** What the page's action is sent: the deal, and only what changed (a from-month always says its month). */
export function amendFormData(side: DealSide, id: string, was: AmendTerms, d: AmendDraft): FormData {
  const n = NAMES[side]
  const fd = new FormData()
  fd.set(n.id, id)
  if (!sameRate(d.ratePct, was.ratePct)) fd.set(n.rate, d.ratePct.trim())
  if (d.compound !== was.compound) fd.set('compound_interest', d.compound ? 'on' : 'off')
  if (d.mode === 'from') {
    fd.set('effective_from', d.effectiveFrom)
    if (d.noFixedTerm) fd.set('no_fixed_term', 'on')
    else if (d.remaining.trim()) fd.set('remaining_months', d.remaining.trim())
    if (d.reason.trim()) fd.set('reason', d.reason.trim())
    return fd
  }
  if (d.months.trim() !== was.months.trim()) fd.set(n.months, d.months.trim())
  if (d.start !== was.start) fd.set(n.start, d.start)
  if (d.text.trim() !== was.text.trim()) fd.set(n.text, d.text.trim())
  return fd
}

/** The whole deal's form sends nothing but the deal: nothing to save. */
export function amendsNothing(fd: FormData): boolean {
  return [...fd.keys()].every((k) => k === 'loan_id' || k === 'fund_source_id')
}

/** The desktop form's fields, read back as a draft — its inputs keep the form's names. */
export function draftOfForm(side: DealSide, fd: FormData, mode: AmendMode, was: AmendTerms): AmendDraft {
  const n = NAMES[side]
  const s = (k: string) => (fd.get(k) as string | null) ?? ''
  const whole = mode === 'whole'
  return {
    mode,
    effectiveFrom: s('effective_from'),
    ratePct: s(n.rate),
    remaining: s('remaining_months'),
    noFixedTerm: fd.get('no_fixed_term') === 'on',
    months: whole ? s(n.months) : was.months,
    start: whole ? s(n.start) : was.start,
    compound: fd.get('compound_interest') === 'on',
    reason: s('reason'),
    text: whole ? s(n.text) : was.text,
  }
}

/** The compound switch as sent: on, off, or — not sent — left as it is. */
export function compoundSent(fd: FormData): boolean | null {
  return fd.has('compound_interest') ? fd.get('compound_interest') === 'on' : null
}
