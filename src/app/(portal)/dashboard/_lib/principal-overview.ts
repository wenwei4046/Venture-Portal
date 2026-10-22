import type { SupabaseClient } from '@supabase/supabase-js'
import { readApprovalsWaiting } from '@/lib/approvals-waiting'
import { startRead } from '@/lib/start-read'
import type { User } from '@/types'

// The Principal's own view on Finance's Overview (2026-10-17). The user chose
// Finance's Overview for it, with an Approvals tile ("usually i use that"),
// and then — warned the treasury dashboard's figures would go — kept "一排金额卡":
// the Venture Pool, the Pool, what is lent out and this month's interest, each
// opening its page; the margin panel stays off. The figures are the treasury
// dashboard's own (`dashboard_summary`), so the two never disagree.

export interface PrincipalFigures {
  /** The Venture Pool's live balance (the dashboard's `hv_fund_balance`). */
  venturePool: number
  /** The department pools and the Venture Pool together (`total_pool`). */
  pool: number
  /** Loans outstanding (`loans_outstanding`). */
  lentOut: number
  /** This month's interest: earned, paid, and what is left (`net_interest_income`). */
  interest: { income: number; expense: number; net: number }
}

export interface PrincipalOverview {
  /** The queue's items this reader may decide (lib/approvals-waiting); null when it could not be read. */
  waiting: number | null
  figures: PrincipalFigures | null
}

type Summary = {
  hv_fund_balance?: number | string | null
  total_pool?: number | string | null
  loans_outstanding?: number | string | null
  monthly_interest_income?: number | string | null
  monthly_interest_expense?: number | string | null
  net_interest_income?: number | string | null
  error?: string
}

const num = (v: number | string | null | undefined) => Number(v ?? 0) || 0

/** The four figures out of the dashboard's summary — null when it said nothing (an error, a refusal). Pure. */
export function figuresOf(summary: unknown): PrincipalFigures | null {
  if (!summary || typeof summary !== 'object') return null
  const s = summary as Summary
  if (s.error) return null
  return {
    venturePool: num(s.hv_fund_balance),
    pool: num(s.total_pool),
    lentOut: num(s.loans_outstanding),
    interest: { income: num(s.monthly_interest_income), expense: num(s.monthly_interest_expense), net: num(s.net_interest_income) },
  }
}

/** Both reads, asked together. A part that cannot be read says nothing. */
export async function loadPrincipalOverview(supabase: SupabaseClient, user: User): Promise<PrincipalOverview> {
  const summaryRead = startRead(
    (supabase as unknown as { rpc: (fn: string) => PromiseLike<{ data: unknown; error: unknown }> }).rpc('dashboard_summary'),
  )
  const waitingRead = startRead(readApprovalsWaiting(supabase, user))
  const [{ data, error }, waiting] = await Promise.all([summaryRead, waitingRead])
  return { waiting, figures: error ? null : figuresOf(data) }
}
