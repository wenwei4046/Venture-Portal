// A deal's terms change filed for the Principal (2026-10-24 — the user: "finance manager 可以改条款，但是经过principal
// approve 不就可以了？", mig 20261025110000): what Finance asked, read off `treasury_terms_requests` — the month, the
// rate, the months left or no fixed term, what the interest is on, the reason — and what it does, worked out as
// amend_fund_source_from / amend_loan_from will apply it once approved: the terms that month runs on now beside the
// terms it asks from then. The deal's page says it while it waits (and for a month once decided); the Approvals
// request lays the two side by side.

import type { SupabaseClient } from '@supabase/supabase-js'
import { formatMoneyBare } from '@/lib/utils'
import { addMonthsYM, buildTermsSegments, currentSegment, monthsBetweenYM, segmentAt, type PositionTerms, type TermsSegment } from '@/lib/treasury-terms'
import { historyRowOf, isFundSourcePrincipal, isLoanPrincipal, principalPaidByMonth, termsForFundSource, termsForLoan, type TermsRecordKind } from '@/lib/treasury-terms-data'

export type TermsRequestStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn'

/** What a filed change asks — the amend's own parameters. */
export interface TermsAsk {
  /** 'YYYY-MM' it takes effect. */
  fromYM: string
  /** The monthly rate asked; null = as it is. */
  rate: number | null
  /** Months left from `fromYM`; null = the end month as it is. */
  remainingMonths: number | null
  /** null = as it is. */
  compounding: boolean | null
  noFixedTerm: boolean
  interestOnOriginal: boolean
  interestKeepsBase: boolean
  /**
   * The terms in force recalculated from when they began (2026-10-27, "From the first instalment"): `fromYM` is that
   * month and `remainingMonths` the terms' periods, instead of new terms from a later month. Absent = a later month.
   */
  wholeDeal?: boolean
  /** A fixed principal a month (2026-10-27, Repayment type); null = as it is, or the months asked. */
  principalPerMonth?: number | null
  /** 'YYYY-MM' — the fixed term ends then, the interest kept on the same amount (BI#7's October, asked with January's terms). */
  openFromYM?: string | null
}

/** A `treasury_terms_requests` row. */
export interface TermsRequestRow {
  id: string
  record_kind: TermsRecordKind
  record_id: string
  effective_from: string
  rate: number | string | null
  remaining_months: number | null
  compound_interest: boolean | null
  no_fixed_term: boolean
  interest_on_original: boolean
  interest_keeps_base: boolean
  reason: string | null
  status: TermsRequestStatus
  approval_id: string | null
  created_by: string | null
  created_at: string
  decided_by: string | null
  decided_at: string | null
  decision_note: string | null
  /** mig 20261027140000; absent on a row read before it. */
  whole_deal?: boolean
  /** mig 20261027210000. */
  principal_per_month?: number | string | null
  open_from?: string | null
}

const COLUMNS =
  'id, record_kind, record_id, effective_from, rate, remaining_months, compound_interest, no_fixed_term, interest_on_original, interest_keeps_base, reason, status, approval_id, created_by, created_at, decided_by, decided_at, decision_note, whole_deal, principal_per_month, open_from'

/** A decided request stays on its deal's page this long. */
export const DECIDED_SHOWN_DAYS = 30

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** 'YYYY-MM' → "Oct 2026". */
export const monthWords = (ym: string) => (/^\d{4}-\d{2}$/.test(ym) ? `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}` : ym)
const pct = (r: number) => `${(r * 100).toFixed(3)}%`
const rm = (n: number) => `RM ${formatMoneyBare(n)}`

export function askOf(r: TermsRequestRow): TermsAsk {
  return {
    fromYM: r.effective_from.slice(0, 7),
    rate: r.rate == null ? null : Number(r.rate),
    remainingMonths: r.remaining_months == null ? null : Number(r.remaining_months),
    compounding: r.compound_interest ?? null,
    noFixedTerm: r.no_fixed_term === true,
    interestOnOriginal: r.interest_on_original === true,
    interestKeepsBase: r.interest_keeps_base === true,
    wholeDeal: r.whole_deal === true,
    principalPerMonth: r.principal_per_month == null || !(Number(r.principal_per_month) > 0) ? null : Number(r.principal_per_month),
    openFromYM: r.open_from ? r.open_from.slice(0, 7) : null,
  }
}

/** Where it asks from, in words: "from Oct 2026", or "whole deal from Apr 2026" for the terms in force recalculated. */
export const askScope = (a: Pick<TermsAsk, 'fromYM' | 'wholeDeal'>): string => `${a.wholeDeal ? 'whole deal from' : 'from'} ${monthWords(a.fromYM)}`

/** What it asks, in words — off the row alone (the queue's title says the same). */
export function askWords(a: TermsAsk): string {
  const scope = askScope(a)
  return [
    scope.charAt(0).toUpperCase() + scope.slice(1),
    a.rate != null ? `${pct(a.rate)} /mo` : null,
    a.noFixedTerm
      ? 'no fixed term'
      : a.principalPerMonth != null
        ? `${rm(a.principalPerMonth)} a month`
        : a.remainingMonths != null
          ? `${a.remainingMonths} months${a.wholeDeal ? '' : ' left'}`
          : null,
    a.openFromYM ? `no fixed term from ${monthWords(a.openFromYM)}` : null,
    a.compounding === true ? 'compounding' : a.compounding === false ? 'not compounding' : null,
    a.interestOnOriginal ? 'interest on the original principal' : a.interestKeepsBase ? 'interest on the principal it was on before' : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

/**
 * The deal's terms once the change is applied — the amend's arithmetic: the terms now close the month before; from
 * the month on the record carries the rate, months and compounding asked. Months left not asked keep the end month;
 * a loan once without a fixed term stays so (its terms' words say it, and the amend never takes them back).
 */
export function termsAfterAsk(kind: TermsRecordKind, t: PositionTerms, ask: TermsAsk): PositionTerms {
  // A loan once without a fixed term stays so; otherwise an amount a month asked, or — neither months nor no fixed
  // term asked — the one the terms had (the amend keeps it).
  const open = ask.noFixedTerm || (kind === 'loan' && t.current.months == null)
  const fixed = open || ask.remainingMonths != null ? null : (ask.principalPerMonth ?? t.current.principalPerMonth ?? null)
  if (ask.wholeDeal) {
    // The terms in force themselves, from when they began (amend_fund_source / amend_loan): no new segment, no history.
    const months = open ? null : (ask.remainingMonths ?? t.current.months)
    const whole = { ...t, current: { ...t.current, rate: ask.rate ?? t.current.rate, months, compounding: ask.compounding ?? t.current.compounding, principalPerMonth: fixed } }
    return ask.openFromYM ? endsFixedTermFrom(whole, ask.openFromYM) : whole
  }
  const segFrom = t.current.effectiveFrom ?? t.firstDueYM ?? t.startYM ?? ask.fromYM
  const kept = t.current.months ? Math.max(1, monthsBetweenYM(ask.fromYM, addMonthsYM(segFrom, t.current.months - 1)) + 1) : null
  const months = open ? null : (ask.remainingMonths ?? kept)
  const next: PositionTerms = {
    ...t,
    current: { rate: ask.rate ?? t.current.rate, months, compounding: ask.compounding ?? t.current.compounding, effectiveFrom: ask.fromYM, principalPerMonth: fixed },
    history: [
      ...t.history,
      {
        validFrom: segFrom,
        validTo: addMonthsYM(ask.fromYM, -1),
        rate: t.current.rate,
        months: t.current.months,
        compounding: t.current.compounding,
        principalPerMonth: t.current.principalPerMonth ?? null,
        nextInterestOnOriginal: ask.interestOnOriginal,
        nextInterestKeepsBase: ask.interestKeepsBase,
      },
    ],
  }
  return ask.openFromYM ? endsFixedTermFrom(next, ask.openFromYM) : next
}

/** The terms' fixed term ended from `ym` — what the approval's second amend does: no principal falls due from then,
 *  the interest kept on the amount it was on (amend_*_from with no fixed term, keeping the base). */
function endsFixedTermFrom(t: PositionTerms, ym: string): PositionTerms {
  const segFrom = t.current.effectiveFrom ?? t.firstDueYM ?? t.startYM ?? ym
  return {
    ...t,
    current: { rate: t.current.rate, months: null, compounding: t.current.compounding, effectiveFrom: ym, principalPerMonth: null },
    history: [
      ...t.history,
      {
        validFrom: segFrom,
        validTo: addMonthsYM(ym, -1),
        rate: t.current.rate,
        months: t.current.months,
        compounding: t.current.compounding,
        principalPerMonth: t.current.principalPerMonth ?? null,
        nextInterestOnOriginal: false,
        nextInterestKeepsBase: true,
      },
    ],
  }
}

export type TermsAskView = { ok: true; before: TermsSegment; after: TermsSegment } | { ok: false; why: string }

/**
 * The terms the month asked runs on, and the terms it asks from then. Waiting (or turned down), on the deal as it
 * stands — the principal still owed counted from what is repaid so far; approved, the two segments the change made.
 */
export function termsAskView(
  kind: TermsRecordKind,
  t: PositionTerms,
  principalByMonth: Record<string, number>,
  ask: TermsAsk,
  status: TermsRequestStatus,
): TermsAskView {
  if (ask.wholeDeal) {
    // Applied, the terms in force read as asked and what they were is not kept; waiting, the terms in force beside them recalculated.
    if (status === 'approved') return { ok: false, why: 'Applied — the terms in force now read as asked.' }
    const now = buildTermsSegments(t, principalByMonth)
    const next = buildTermsSegments(termsAfterAsk(kind, t, ask), principalByMonth)
    if (!now.length || !next.length) return { ok: false, why: 'The deal has no start date yet.' }
    // The terms asked are the ones from the month — a fixed term ended later follows them.
    return { ok: true, before: now[now.length - 1], after: segmentAt(next, ask.fromYM) ?? next[next.length - 1] }
  }
  if (status === 'approved') {
    const segs = buildTermsSegments(t, principalByMonth)
    const k = segs.findIndex((s, i) => i > 0 && s.changed && s.fromYM === ask.fromYM)
    return k > 0 ? { ok: true, before: segs[k - 1], after: segs[k] } : { ok: false, why: 'The change was taken back since.' }
  }
  const segFrom = t.current.effectiveFrom ?? t.firstDueYM ?? t.startYM
  if (!segFrom) return { ok: false, why: 'The deal has no start date yet.' }
  if (ask.fromYM <= segFrom) return { ok: false, why: `Its terms changed from ${monthWords(segFrom)} since — the month asked has to come after that.` }
  const now = buildTermsSegments(t, principalByMonth)
  const next = buildTermsSegments(termsAfterAsk(kind, t, ask), principalByMonth)
  return { ok: true, before: segmentAt(now, ask.fromYM) ?? currentSegment(now, ask.fromYM), after: segmentAt(next, ask.fromYM) ?? next[next.length - 1] }
}

/** The new terms in a line: "0.833% /mo · no fixed term · interest RM 424.83 a month on RM 51,000.00 as before". */
export function askLine(s: TermsSegment): string {
  const parts = [`${pct(s.rate)} /mo`, s.months == null ? 'no fixed term' : s.fixedPrincipal != null ? `${rm(s.fixedPrincipal)} a month, ${s.months} months` : `${s.months} months`]
  if (s.compounding) {
    parts.push('compounding')
  } else {
    const base = s.interestBase ?? s.base
    const on = s.interestOnOriginal ? `on the original ${rm(base)}` : s.interestKeepsBase ? `on ${rm(base)} as before` : `on ${rm(base)}`
    parts.push(s.months ? `${rm(s.principalPerMonth)} + ${formatMoneyBare(s.interestPerMonth)} a month · interest ${on}` : `interest ${rm(s.interestPerMonth)} a month ${on}`)
  }
  return parts.join(' · ')
}

/** One side of the comparison, read from the month asked. */
export interface TermsFigures {
  rate: number
  /** Months left counting the month asked; null = no fixed term. */
  months: number | null
  /** Its last instalment, 'YYYY-MM'. */
  endYM: string | null
  compounding: boolean
  principalPerMonth: number
  interestPerMonth: number
  /** What the flat interest is on. */
  interestBase: number
  basis: 'owed' | 'original' | 'kept'
}

export function figuresAt(s: TermsSegment, fromYM: string, endsBefore: string | null = null): TermsFigures {
  // A fixed term ended from a later month (`endsBefore`) runs to the month before it.
  const own = s.months == null ? null : s.scheduledEndYM
  const end = own && endsBefore && addMonthsYM(endsBefore, -1) < own ? addMonthsYM(endsBefore, -1) : own
  return {
    rate: s.rate,
    months: end == null ? null : Math.max(0, monthsBetweenYM(fromYM, end) + 1),
    endYM: end,
    compounding: s.compounding,
    principalPerMonth: s.months == null ? 0 : s.principalPerMonth,
    interestPerMonth: s.interestPerMonth,
    interestBase: s.interestBase ?? s.base,
    basis: s.interestOnOriginal ? 'original' : s.interestKeepsBase ? 'kept' : 'owed',
  }
}

/** The Approvals request's table: each line now and as asked, and whether the change moves it. */
export function comparisonRows(now: TermsFigures, asked: TermsFigures, openFromYM: string | null = null): Array<{ label: string; now: string; asked: string; changed: boolean }> {
  const term = (f: TermsFigures, left: boolean) => (f.months == null ? 'No fixed term' : `${f.months} months${left ? ' left' : ''}${f.endYM ? ` · to ${monthWords(f.endYM)}` : ''}`)
  const principal = (f: TermsFigures) => (f.months == null ? 'None falls due' : rm(f.principalPerMonth))
  const interest = (f: TermsFigures) =>
    f.compounding ? 'Compounds monthly' : `${rm(f.interestPerMonth)} on ${rm(f.interestBase)}${f.basis === 'kept' ? ' as before' : f.basis === 'original' ? ' (the original)' : ''}`
  const each = (f: TermsFigures) => (f.compounding ? '—' : rm(Math.round((f.principalPerMonth + f.interestPerMonth) * 100) / 100))
  const rows: Array<[string, string, string]> = [
    ['Rate', `${pct(now.rate)} /mo`, `${pct(asked.rate)} /mo`],
    ['Term', term(now, true), term(asked, false)],
    ['Principal a month', principal(now), principal(asked)],
    ['Interest a month', interest(now), interest(asked)],
    ['Each month', each(now), each(asked)],
  ]
  if (openFromYM) rows.push(['After that', '—', `No fixed term from ${monthWords(openFromYM)} · interest ${rm(asked.interestPerMonth)} a month on ${rm(asked.interestBase)}`])
  return rows.map(([label, n, a]) => ({ label, now: n, asked: a, changed: n !== a }))
}

// ─── Reads ────────────────────────────────────────────────────────────────────
// treasury_terms_requests postdates database.types.ts — asked through the untyped client.

/** The deal's latest request, whatever became of it. */
export async function latestTermsRequest(supabase: SupabaseClient, kind: TermsRecordKind, id: string): Promise<TermsRequestRow | null> {
  const { data } = await supabase
    .from('treasury_terms_requests')
    .select(COLUMNS)
    .eq('record_kind', kind)
    .eq('record_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as TermsRequestRow | null) ?? null
}

/** What the deal's page says of its latest request: waiting, or decided within the month. Withdrawn, nothing. */
export interface TermsRequestNote {
  id: string
  approvalId: string | null
  status: 'pending' | 'approved' | 'rejected'
  fromYM: string
  /** The terms in force recalculated from `fromYM`, not new terms from a later month. */
  whole: boolean
  /** What it asks from then, in a line. */
  line: string
  reason: string | null
  by: string
  /** `DD MMM YYYY · HH:mm`. */
  at: string
  decidedBy: string | null
  decidedAt: string | null
  /** The Principal's words on deciding — a rejection's reason. */
  note: string | null
  /** Whoever filed it, or the Principal, while it waits. */
  mayWithdraw: boolean
  /** The reader decides it in Approvals (the queue's Approve), while it waits. */
  decides: boolean
}

export function termsRequestNote(args: {
  row: TermsRequestRow | null
  kind: TermsRecordKind
  terms: PositionTerms
  principalByMonth: Record<string, number>
  nameOf: (id: string | null) => string | null
  stamp: (iso: string) => string
  /** The reader: who filed it may withdraw it, so may the queue's Approve. */
  readerId: string
  readerApprovesAll: boolean
  now?: Date
}): TermsRequestNote | null {
  const { row } = args
  if (!row || row.status === 'withdrawn') return null
  if (row.status !== 'pending') {
    const decided = row.decided_at ? new Date(row.decided_at).getTime() : 0
    if ((args.now ?? new Date()).getTime() - decided > DECIDED_SHOWN_DAYS * 86400000) return null
  }
  const ask = askOf(row)
  const view = termsAskView(args.kind, args.terms, args.principalByMonth, ask, row.status)
  return {
    id: row.id,
    approvalId: row.approval_id,
    status: row.status,
    fromYM: ask.fromYM,
    whole: ask.wholeDeal === true,
    line: view.ok
      ? askLine(view.after) + (ask.openFromYM ? ` · no fixed term from ${monthWords(ask.openFromYM)}` : '')
      : askWords(ask).replace(/^(?:Whole deal from|From) [A-Za-z]{3} \d{4}(?: · )?/, ''),
    reason: row.reason,
    by: args.nameOf(row.created_by) ?? 'Finance',
    at: args.stamp(row.created_at),
    decidedBy: args.nameOf(row.decided_by),
    decidedAt: row.decided_at ? args.stamp(row.decided_at) : null,
    note: row.decision_note,
    mayWithdraw: row.status === 'pending' && (row.created_by === args.readerId || args.readerApprovesAll),
    decides: row.status === 'pending' && args.readerApprovesAll && !!row.approval_id,
  }
}

/** The Approvals request's terms change: what it asks, beside the terms that month runs on now. */
export interface TermsChangeContext {
  kind: TermsRecordKind
  dealId: string
  status: TermsRequestStatus
  fromYM: string
  /** "Oct 2026". */
  fromLabel: string
  /** "from Oct 2026", or "whole deal from Apr 2026" — what the request's heads say. */
  scope: string
  reason: string | null
  /** The ask in words — there whether or not the figures could be laid out. */
  words: string
  rows: Array<{ label: string; now: string; asked: string; changed: boolean }>
  /** Why the figures are not laid out (the deal changed since, the change was taken back). */
  why: string | null
}

/**
 * The request's terms change for the Approvals request (any of its three views). Read for whoever may: a reader the
 * deal is not open to (its row policies show nothing) gets the ask in words, the figures left out.
 */
export async function readTermsChange(supabase: SupabaseClient, approvalId: string): Promise<TermsChangeContext | null> {
  const { data } = await supabase.from('treasury_terms_requests').select(COLUMNS).eq('approval_id', approvalId).maybeSingle()
  const row = (data as TermsRequestRow | null) ?? null
  if (!row) return null
  const ask = askOf(row)
  const base = {
    kind: row.record_kind,
    dealId: row.record_id,
    status: row.status,
    fromYM: ask.fromYM,
    fromLabel: monthWords(ask.fromYM),
    scope: askScope(ask),
    reason: row.reason,
    words: askWords(ask),
  }

  const loan = row.record_kind === 'loan'
  const [{ data: deal }, { data: history }, { data: reps }] = await Promise.all([
    loan
      ? supabase.from('loans').select('principal, effective_rate, tenure_months, compound_interest, disbursement_date, repayment_start_month, terms_effective_from, repayment_terms, principal_per_month').eq('id', row.record_id).maybeSingle()
      : supabase.from('fund_sources').select('amount, cost_rate, lock_in_months, compound_interest, effective_date, repayment_start_month, terms_effective_from, principal_per_month').eq('id', row.record_id).maybeSingle(),
    supabase
      .from('treasury_terms_history')
      .select('record_id, valid_from, valid_to, rate, months, compound_interest, reason, next_interest_on_original, next_interest_keeps_base, principal_per_month')
      .eq('record_kind', row.record_kind)
      .eq('record_id', row.record_id)
      .order('valid_from', { ascending: true }),
    loan
      ? supabase.from('repayments').select('amount, payment_date, payment_type').eq('loan_id', row.record_id)
      : supabase.from('fund_source_repayments').select('amount, payment_date, payment_type').eq('fund_source_id', row.record_id),
  ])
  if (!deal) return { ...base, rows: [], why: 'The deal is not open to you, or is gone.' }
  const hist = ((history ?? []) as Array<Parameters<typeof historyRowOf>[0]>).map(historyRowOf)
  const terms = loan ? termsForLoan(deal as Parameters<typeof termsForLoan>[0], hist) : termsForFundSource(deal as Parameters<typeof termsForFundSource>[0], hist)
  const paid = principalPaidByMonth(
    ((reps ?? []) as Array<{ amount: number | string; payment_date: string; payment_type: string }>).map((r) => ({ ...r, id: row.record_id })),
    loan ? isLoanPrincipal : isFundSourcePrincipal,
  ).get(row.record_id) ?? {}
  const view = termsAskView(row.record_kind, terms, paid, ask, row.status)
  if (!view.ok) return { ...base, rows: [], why: view.why }
  return { ...base, rows: comparisonRows(figuresAt(view.before, ask.fromYM), figuresAt(view.after, ask.fromYM, ask.openFromYM ?? null), ask.openFromYM ?? null), why: null }
}
