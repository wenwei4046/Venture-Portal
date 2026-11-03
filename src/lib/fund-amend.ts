// Amend terms — a booked deal's terms changed by whoever holds Treasury ·
// Approve (2026-09-21), or filed for them by Treasury · Edit (a later month
// since 2026-10-24, the whole terms since 2026-10-27): the two ways its form
// offers — from a later month (the months before keep their terms; the new
// rate and the months left apply from it, on the amount the interest is
// charged on) or the terms in force recalculated from when they began ("From
// the first instalment") — and what each sends to the page's actions. Since
// 2026-10-16 only what was changed is sent (the user's rule of 2026-10-14:
// the shared logins open one deal on two screens, and a form sent whole puts
// back what the other changed); the four RPCs keep whatever is not sent. The
// form's own names, so `amendLoan` / `amendLoanFrom` / `amendFundSource` /
// `amendFundSourceFrom` read what they always read. Pure — the desktop's two
// forms and the Finance phone app's sheet send through it.

export type DealSide = 'out' | 'in'
export type AmendMode = 'from' | 'whole'
/**
 * How the principal is repaid (2026-10-27, Repayment type — the mockups principal-input-mockup.html and
 * fund-forms-desktop-mockup.html, "照这个样稿做"): a fixed amount a month, over a number of months, or none.
 */
export type RepaymentChoice = 'amount' | 'months' | 'none'

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
  /** From a month: the interest is on the original principal, not on what is still owed then. */
  interestOnOriginal: boolean
  /** From a month: the interest stays on the base the terms before used (one or the other, never both). */
  interestKeepsBase: boolean
  months: string
  start: string
  compound: boolean
  reason: string
  text: string
  /**
   * The desktop form's Repayment type (2026-10-27). Left out — the Finance phone app's sheet, or nothing chosen — the
   * months and no-fixed-term fields above say it, as they always did; chosen, it decides what is sent.
   */
  repayment?: RepaymentChoice | null
  /** A fixed principal a month, with `repayment` 'amount'. */
  principalPerMonth?: string
  /** `YYYY-MM`: no fixed term from then on, the interest kept on the same amount — with an amount or months; '' none. */
  openFrom?: string
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
  interestOnOriginal: false,
  interestKeepsBase: false,
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
    if (d.repayment) repaymentSent(fd, d, 'remaining_months')
    else if (d.noFixedTerm) fd.set('no_fixed_term', 'on')
    else if (d.remaining.trim()) fd.set('remaining_months', d.remaining.trim())
    if (d.interestOnOriginal) fd.set('interest_on_original', 'on')
    else if (d.interestKeepsBase) fd.set('interest_keeps_base', 'on')
    if (d.reason.trim()) fd.set('reason', d.reason.trim())
    return fd
  }
  if (d.repayment) repaymentSent(fd, d, n.months)
  else if (d.months.trim() !== was.months.trim()) fd.set(n.months, d.months.trim())
  if (d.start !== was.start) fd.set(n.start, d.start)
  if (d.text.trim() !== was.text.trim()) fd.set(n.text, d.text.trim())
  // A filed whole-terms change says why, as a from-month one does (the Principal's own save has no reason to keep).
  if (d.reason.trim()) fd.set('reason', d.reason.trim())
  return fd
}

/**
 * A Repayment type chosen, as the actions read it: no fixed term (a later month's switch, or a whole-terms periods
 * sent blank), the months (`monthsName` — a later month's months left, a whole-terms periods / tenure — sent even when
 * unchanged, so an amount a month gives way to them), or the amount a month; with either of the last two, the month the
 * fixed term ends.
 */
function repaymentSent(fd: FormData, d: AmendDraft, monthsName: string): void {
  if (d.repayment === 'none') {
    if (monthsName === 'remaining_months') fd.set('no_fixed_term', 'on')
    else fd.set(monthsName, '')
    return
  }
  if (d.repayment === 'months') {
    const months = (monthsName === 'remaining_months' ? d.remaining : d.months).trim()
    if (months) fd.set(monthsName, months)
  } else if (d.repayment === 'amount' && (d.principalPerMonth ?? '').trim()) {
    fd.set('principal_per_month', (d.principalPerMonth ?? '').replace(/[,\s]/g, ''))
  }
  if ((d.openFrom ?? '').trim()) fd.set('open_from', (d.openFrom ?? '').trim())
}

/** The amount a month an action was sent: none, a figure above 0, or a refusal in words. */
export function principalPerMonthSent(fd: FormData): { ok: true; value: number | null } | { ok: false; error: string } {
  const raw = ((fd.get('principal_per_month') as string | null) ?? '').replace(/[,\s]/g, '')
  if (raw === '') return { ok: true, value: null }
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return { ok: false, error: 'The principal a month is an amount above 0.' }
  return { ok: true, value: Math.round(n * 100) / 100 }
}

/** The month the fixed term ends an action was sent (`YYYY-MM`), or null. */
export function openFromSent(fd: FormData): string | null {
  const raw = ((fd.get('open_from') as string | null) ?? '').trim()
  return /^\d{4}-\d{2}$/.test(raw) ? raw : null
}

/**
 * Where a deal's terms can change from (2026-10-27, the user: "表格也写清楚最早能选哪个月"): the terms in force
 * began at the first instalment — or the month they were last changed from — and a change from a later month starts
 * the month after that at the earliest (file_terms_change / amend_*_from refuse anything earlier). Recalculating the
 * terms in force themselves is the other choice, from the month they began.
 */
export interface AmendWindow {
  /** `YYYY-MM` the first instalment falls in. */
  firstDueYM: string
  /** `YYYY-MM` the terms in force began. */
  termsFromYM: string
  /** They were changed before: they began after the first instalment. */
  changed: boolean
  /** `YYYY-MM` — the earliest month a change from a later month may take effect. */
  earliestYM: string
}

const nextYM = (ym: string): string => {
  const [y, m] = ym.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

export function amendWindow(firstDueYM: string, termsEffectiveFrom: string | null | undefined): AmendWindow {
  const changed = !!termsEffectiveFrom && termsEffectiveFrom.slice(0, 7) !== firstDueYM
  const termsFromYM = termsEffectiveFrom ? termsEffectiveFrom.slice(0, 7) : firstDueYM
  return { firstDueYM, termsFromYM, changed, earliestYM: nextYM(termsFromYM) }
}

/** What the Amend terms page knows of the deal for its form. */
export interface AmendFacts {
  /** A fund source's lender, a loan's borrower. */
  party: string
  /** `YYYY-MM-DD` the money moved: a fund source received, a loan disbursed. */
  moneyDate: string | null
  /** `YYYY-MM-DD` the first instalment falls due. */
  firstDue: string | null
  window: AmendWindow
  /** The deal's amount. */
  principal: number
  /** Principal repaid in each month, `YYYY-MM` → amount: what is owed at the start of a month follows. */
  paidByMonth: Record<string, number>
  /** What the interest in force is worked out on. */
  currentBase: number
}

/** Principal still owed when a month starts: the amount less what was repaid in the months before it. */
export function owedAtStart(f: Pick<AmendFacts, 'principal' | 'paidByMonth'>, ym: string): number {
  const paid = Object.entries(f.paidByMonth).reduce((s, [m, v]) => (m < ym ? s + v : s), 0)
  return Math.round(Math.max(0, f.principal - paid) * 100) / 100
}

/** What the whole-terms choice is called on a deal: from its first instalment, or from when its terms were last changed. */
export const wholeChoiceName = (w: Pick<AmendWindow, 'changed'>): string => (w.changed ? 'From when these terms began' : 'From the first instalment')

/** The later of two `YYYY-MM` — the form's month starts on next month, never before the earliest it may take. */
export const laterYM = (a: string, b: string): string => (a >= b ? a : b)

const MONTH_WORDS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** `YYYY-MM` → "Apr 2026". */
export const amendMonthWords = (ym: string): string =>
  /^\d{4}-\d{2}$/.test(ym) ? `${MONTH_WORDS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}` : ym

/**
 * The database's refusal of a month too early, in words a reader can act on — the form keeps the month from going
 * earlier, so this is the fallback. Null when the message is some other refusal.
 */
export function explainAmendRefusal(message: string): string | null {
  const m = /Effective month (\d{4}-\d{2}) must be after the month the current terms took effect \((\d{4}-\d{2})\)/.exec(message)
  if (!m) return null
  const began = m[2]
  return `${amendMonthWords(began)} is when the terms in force began, so a change from a later month can start ${amendMonthWords(nextYM(began))} at the earliest. To change from ${amendMonthWords(began)} itself, choose the option that recalculates the terms in force.`
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
  // The Repayment type, when one was chosen; none chosen leaves the principal as it is.
  const choice = s('repayment_type')
  const repayment: RepaymentChoice | null = choice === 'amount' || choice === 'months' || choice === 'none' ? choice : null
  return {
    mode,
    effectiveFrom: s('effective_from'),
    ratePct: s(n.rate),
    remaining: s('remaining_months'),
    noFixedTerm: repayment ? repayment === 'none' : fd.get('no_fixed_term') === 'on',
    interestOnOriginal: fd.get('interest_on_original') === 'on',
    interestKeepsBase: fd.get('interest_keeps_base') === 'on',
    // A field the form did not show (a filed whole-terms change leaves the start and the words alone) stays as it was.
    months: whole && fd.has(n.months) ? s(n.months) : was.months,
    start: whole && fd.has(n.start) ? s(n.start) : was.start,
    compound: fd.get('compound_interest') === 'on',
    reason: s('reason'),
    text: whole && fd.has(n.text) ? s(n.text) : was.text,
    repayment,
    principalPerMonth: s('principal_per_month'),
    openFrom: s('open_from'),
  }
}

/** The compound switch as sent: on, off, or — not sent — left as it is. */
export function compoundSent(fd: FormData): boolean | null {
  return fd.has('compound_interest') ? fd.get('compound_interest') === 'on' : null
}
