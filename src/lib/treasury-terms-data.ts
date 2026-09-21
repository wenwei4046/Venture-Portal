// Loader side of lib/treasury-terms: read the terms history for a batch of
// loans / fund sources and shape a record + its history into PositionTerms.

import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveFirstDueYM, type PositionTerms, type TermsHistoryRow } from '@/lib/treasury-terms'

export type TermsRecordKind = 'loan' | 'fund_source'

// treasury_terms_history is newer than the generated database.types.ts —
// one localized structural cast, same pattern as lib/report-layouts.
interface HistoryClient {
  from: (t: string) => {
    select: (c: string) => {
      eq: (k: string, v: string) => {
        in: (k: string, v: string[]) => {
          order: (k: string, o: { ascending: boolean }) => Promise<{
            data:
              | {
                  record_id: string
                  valid_from: string
                  valid_to: string
                  rate: number | string
                  months: number | null
                  compound_interest: boolean
                  reason: string | null
                }[]
              | null
            error: { message: string } | null
          }>
        }
      }
    }
  }
}

const ym = (d: string) => d.slice(0, 7)
const r2 = (n: number) => Math.round(n * 100) / 100

/** record id → its earlier segments (oldest first). Records with no change
 *  simply aren't in the map. */
export async function fetchTermsHistory(
  supabase: SupabaseClient,
  kind: TermsRecordKind,
  ids: string[],
): Promise<Map<string, TermsHistoryRow[]>> {
  const out = new Map<string, TermsHistoryRow[]>()
  if (ids.length === 0) return out
  const client = supabase as unknown as HistoryClient
  const { data, error } = await client
    .from('treasury_terms_history')
    .select('record_id, valid_from, valid_to, rate, months, compound_interest, reason')
    .eq('record_kind', kind)
    .in('record_id', ids)
    .order('valid_from', { ascending: true })
  if (error) throw new Error(`fetchTermsHistory: ${error.message}`)
  for (const h of data ?? []) {
    const rows = out.get(h.record_id) ?? []
    rows.push({
      validFrom: ym(h.valid_from),
      validTo: ym(h.valid_to),
      rate: Number(h.rate),
      months: h.months == null ? null : Number(h.months),
      compounding: h.compound_interest === true,
      reason: h.reason,
    })
    out.set(h.record_id, rows)
  }
  return out
}

/** Principal repaid per calendar month, per record — what a later segment
 *  re-bases on. `isPrincipal` decides which payment types count (loans:
 *  'principal'; fund sources: 'principal' + 'netting', the view's rule). */
export function principalPaidByMonth(
  reps: readonly { id: string; amount: number | string; payment_date: string; payment_type: string }[],
  isPrincipal: (type: string) => boolean,
): Map<string, Record<string, number>> {
  const out = new Map<string, Record<string, number>>()
  for (const r of reps) {
    if (!isPrincipal(r.payment_type)) continue
    const m = out.get(r.id) ?? {}
    const k = ym(r.payment_date)
    m[k] = r2((m[k] ?? 0) + Number(r.amount))
    out.set(r.id, m)
  }
  return out
}

/** Principal + interest repaid per month, per record — the 已付 side of a
 *  change comparison. Anything that isn't principal counts as interest
 *  (interest, penalty), matching the schedule's 已收/已付 rows. */
export function paidByMonthByType(
  reps: readonly { id: string; amount: number | string; payment_date: string; payment_type: string }[],
  isPrincipal: (type: string) => boolean,
): Map<string, Record<string, { principal: number; interest: number }>> {
  const out = new Map<string, Record<string, { principal: number; interest: number }>>()
  for (const r of reps) {
    const m = out.get(r.id) ?? {}
    const k = ym(r.payment_date)
    const cur = m[k] ?? { principal: 0, interest: 0 }
    if (isPrincipal(r.payment_type)) cur.principal = r2(cur.principal + Number(r.amount))
    else cur.interest = r2(cur.interest + Number(r.amount))
    m[k] = cur
    out.set(r.id, m)
  }
  return out
}

export const isLoanPrincipal = (t: string) => t === 'principal'
export const isFundSourcePrincipal = (t: string) => t === 'principal' || t === 'netting'

export function termsForLoan(
  l: {
    principal: number | string
    effective_rate: number | string
    tenure_months: number | string | null
    compound_interest?: boolean | null
    disbursement_date: string | null
    repayment_start_month?: string | null
    terms_effective_from?: string | null
  },
  history: TermsHistoryRow[] = [],
): PositionTerms {
  const start = l.disbursement_date ? ym(l.disbursement_date) : null
  return {
    principal: Number(l.principal),
    startYM: start,
    firstDueYM: resolveFirstDueYM(l.repayment_start_month ?? null, l.disbursement_date),
    current: {
      rate: Number(l.effective_rate),
      months: l.tenure_months == null || Number(l.tenure_months) <= 0 ? null : Number(l.tenure_months),
      compounding: l.compound_interest === true,
      effectiveFrom: l.terms_effective_from ? ym(l.terms_effective_from) : null,
    },
    history,
  }
}

export function termsForFundSource(
  s: {
    amount: number | string
    cost_rate: number | string
    lock_in_months: number | string | null
    compound_interest?: boolean | null
    effective_date: string | null
    repayment_start_month?: string | null
    terms_effective_from?: string | null
  },
  history: TermsHistoryRow[] = [],
): PositionTerms {
  const start = s.effective_date ? ym(s.effective_date) : null
  return {
    principal: Number(s.amount),
    startYM: start,
    firstDueYM: resolveFirstDueYM(s.repayment_start_month ?? null, s.effective_date),
    current: {
      rate: Number(s.cost_rate),
      months: s.lock_in_months == null || Number(s.lock_in_months) <= 0 ? null : Number(s.lock_in_months),
      compounding: s.compound_interest === true,
      effectiveFrom: s.terms_effective_from ? ym(s.terms_effective_from) : null,
    },
    history,
  }
}
