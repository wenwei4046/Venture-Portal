// What an Amend terms page tells its form about the deal (2026-10-27, the mockup terms-first-month-mockup.html): when
// the money moved and the first instalment falls due, where the terms in force began — so the earliest month a change
// from a later month may take — and the three amounts the interest can be charged on (what is owed when the change
// starts, the original amount, the amount in force). Read under the page's own session, as the deal's page reads it.

import type { SupabaseClient } from '@supabase/supabase-js'
import { officeMonth } from '@/lib/office-time'
import { amendWindow, type AmendFacts } from '@/lib/fund-amend'
import { fundSourceStart, loanStart } from '@/lib/repayment-start'
import { buildTermsSegments, currentSegment, type PositionTerms } from '@/lib/treasury-terms'
import {
  fetchTermsHistory,
  isFundSourcePrincipal,
  isLoanPrincipal,
  principalPaidByMonth,
  termsForFundSource,
  termsForLoan,
} from '@/lib/treasury-terms-data'

type Rep = { amount: number | string; payment_date: string; payment_type: string }

function factsOf(args: {
  id: string
  party: string
  principal: number
  moneyDate: string | null
  firstDue: string | null
  termsEffectiveFrom: string | null
  terms: PositionTerms
  reps: Rep[]
  isPrincipal: (t: string) => boolean
}): AmendFacts {
  const paidByMonth = principalPaidByMonth(args.reps.map((r) => ({ ...r, id: args.id })), args.isPrincipal).get(args.id) ?? {}
  const segments = buildTermsSegments(args.terms, paidByMonth)
  const now = segments.length ? currentSegment(segments, officeMonth()) : null
  return {
    party: args.party,
    moneyDate: args.moneyDate,
    firstDue: args.firstDue,
    window: amendWindow(args.firstDue?.slice(0, 7) ?? officeMonth(), args.termsEffectiveFrom),
    principal: args.principal,
    paidByMonth,
    currentBase: now ? (now.interestBase ?? now.base) : args.principal,
  }
}

/** A fund source's (its `fund_sources` row as read with `*`). */
export async function fundSourceAmendFacts(
  supabase: SupabaseClient,
  source: Parameters<typeof termsForFundSource>[0] & { id: string; repayment_date?: unknown; repayment_start_month?: unknown; terms_effective_from?: string | null },
  party: string,
): Promise<AmendFacts> {
  const [history, { data: reps }] = await Promise.all([
    fetchTermsHistory(supabase, 'fund_source', [source.id]),
    supabase.from('fund_source_repayments').select('amount, payment_date, payment_type').eq('fund_source_id', source.id),
  ])
  return factsOf({
    id: source.id,
    party,
    principal: Number(source.amount),
    moneyDate: (source.effective_date as string | null) ?? null,
    firstDue: fundSourceStart(source).date,
    termsEffectiveFrom: source.terms_effective_from ?? null,
    terms: termsForFundSource(source, history.get(source.id) ?? []),
    reps: (reps ?? []) as Rep[],
    isPrincipal: isFundSourcePrincipal,
  })
}

/** A loan's (its `loans` row as read with `*`). */
export async function loanAmendFacts(
  supabase: SupabaseClient,
  loan: Parameters<typeof termsForLoan>[0] & { id: string; repayment_start_date?: unknown; repayment_start_month?: unknown; terms_effective_from?: string | null },
  party: string,
): Promise<AmendFacts> {
  const [history, { data: reps }] = await Promise.all([
    fetchTermsHistory(supabase, 'loan', [loan.id]),
    supabase.from('repayments').select('amount, payment_date, payment_type').eq('loan_id', loan.id),
  ])
  return factsOf({
    id: loan.id,
    party,
    principal: Number(loan.principal),
    moneyDate: loan.disbursement_date ?? null,
    firstDue: loanStart(loan).date,
    termsEffectiveFrom: loan.terms_effective_from ?? null,
    terms: termsForLoan(loan, history.get(loan.id) ?? []),
    reps: (reps ?? []) as Rep[],
    isPrincipal: isLoanPrincipal,
  })
}
