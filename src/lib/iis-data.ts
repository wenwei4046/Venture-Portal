// Interest in suspense — the month-end run's reads (2026-11-13, mig 20261113140000): every live deal that has its own
// accounts (made at the go-live, or as the deal started), with the terms, schedule and payments lib/iis needs, and what
// iis_postings already holds for it.

import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from './paginate'
import { loadRepaymentBook } from './repayment-book'
import { buildTermsSegments } from './treasury-terms'
import {
  fetchTermsHistory,
  isFundSourcePrincipal,
  isLoanPrincipal,
  principalPaidByMonth,
  termsForFundSource,
  termsForLoan,
} from './treasury-terms-data'
import type { IisDeal, IisPosted } from './iis'

type Row = Record<string, unknown>

export interface IisBookDeal {
  deal: IisDeal
  /** What the run calls it: "COMPANY [LO#7]". */
  label: string
  accounts: { deal: string; iis: string }
  posted: IisPosted & { lastAccrual: string | null }
}

const tagOf = (text: unknown) => String(text ?? '').match(/\[(LO|BI)[^\]]{0,20}\]/)?.[0] ?? ''

/** IIS's go-live date (null before it). */
export async function iisLiveFrom(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.rpc('iis_live_from' as never)
  if (error) throw new Error(`The go-live date could not be read: ${error.message}`)
  return (data as string | null) ?? null
}

/** Every live deal in suspense with its own accounts. */
export async function loadIisBook(supabase: SupabaseClient, today: string): Promise<IisBookDeal[]> {
  const [book, { data: loans, error: lErr }, { data: sources, error: sErr }, loanReps, sourceReps, postedRes] = await Promise.all([
    loadRepaymentBook(supabase, today),
    supabase.from('loans').select('*').eq('status', 'active'),
    supabase.from('fund_sources').select('*').in('status', ['active', 'matured']),
    fetchAllRows<Row>((lo, hi) => supabase.from('repayments').select('loan_id, amount, payment_date, payment_type').order('id', { ascending: true }).range(lo, hi)),
    fetchAllRows<Row>((lo, hi) =>
      supabase.from('fund_source_repayments').select('fund_source_id, amount, payment_date, payment_type').order('id', { ascending: true }).range(lo, hi),
    ),
    supabase.rpc('iis_posted' as never),
  ])
  if (lErr || sErr) throw new Error(`The deals could not be read: ${(lErr ?? sErr)!.message}`)
  if (postedRes.error) throw new Error(`What was posted could not be read: ${postedRes.error.message}`)
  const posted = new Map(
    ((postedRes.data ?? []) as Array<{ kind: string; id: string; accrued: number; last_accrual: string | null; recognized: Record<string, number> }>).map((p) => [
      `${p.kind}:${p.id}`,
      { accrued: Number(p.accrued) || 0, recognized: p.recognized ?? {}, lastAccrual: p.last_accrual ?? null },
    ]),
  )
  const planOf = new Map(book.map((b) => [`${b.kind === 'collect' ? 'loan' : 'fund_source'}:${b.id}`, b]))
  const loanList = ((loans ?? []) as Row[]).filter((l) => l.gl_account_code && l.iis_account_code)
  const sourceList = ((sources ?? []) as Row[]).filter((s) => s.account_code && s.iis_account_code)
  const [loanHist, sourceHist] = await Promise.all([
    fetchTermsHistory(supabase, 'loan', loanList.map((l) => l.id as string)),
    fetchTermsHistory(supabase, 'fund_source', sourceList.map((s) => s.id as string)),
  ])
  const repRows = (rows: Row[], key: string) =>
    rows.map((r) => ({ id: r[key] as string, amount: Number(r.amount), payment_date: String(r.payment_date).slice(0, 10), payment_type: r.payment_type as string }))
  const loanRepRows = repRows(loanReps, 'loan_id')
  const sourceRepRows = repRows(sourceReps, 'fund_source_id')
  const loanPaid = principalPaidByMonth(loanRepRows, isLoanPrincipal)
  const sourcePaid = principalPaidByMonth(sourceRepRows, isFundSourcePrincipal)
  const paysOf = (rows: typeof loanRepRows, id: string) => rows.filter((r) => r.id === id).map((r) => ({ date: r.payment_date, type: r.payment_type, amount: r.amount }))

  const out: IisBookDeal[] = []
  for (const l of loanList) {
    const id = l.id as string
    const b = planOf.get(`loan:${id}`)
    if (!b) continue
    const terms = termsForLoan(l as Parameters<typeof termsForLoan>[0], loanHist.get(id) ?? [])
    out.push({
      label: `${b.name}${tagOf(l.repayment_terms) ? ` ${tagOf(l.repayment_terms)}` : ''}`,
      accounts: { deal: l.gl_account_code as string, iis: l.iis_account_code as string },
      posted: posted.get(`loan:${id}`) ?? { accrued: 0, recognized: {}, lastAccrual: null },
      deal: {
        kind: 'loan',
        id,
        start: String(l.disbursement_date ?? '').slice(0, 10),
        principal: Number(l.principal),
        words: (l.repayment_terms as string | null) ?? null,
        segments: buildTermsSegments(terms, loanPaid.get(id) ?? {}),
        plan: b.plan,
        payments: paysOf(loanRepRows, id),
      },
    })
  }
  for (const s of sourceList) {
    const id = s.id as string
    const b = planOf.get(`fund_source:${id}`)
    if (!b) continue
    const terms = termsForFundSource(s as Parameters<typeof termsForFundSource>[0], sourceHist.get(id) ?? [])
    out.push({
      label: `${b.name}${tagOf(s.notes) ? ` ${tagOf(s.notes)}` : ''}`,
      accounts: { deal: s.account_code as string, iis: s.iis_account_code as string },
      posted: posted.get(`fund_source:${id}`) ?? { accrued: 0, recognized: {}, lastAccrual: null },
      deal: {
        kind: 'fund_source',
        id,
        start: String(s.effective_date ?? '').slice(0, 10),
        principal: Number(s.amount),
        words: (s.notes as string | null) ?? null,
        segments: buildTermsSegments(terms, sourcePaid.get(id) ?? {}),
        plan: b.plan,
        payments: paysOf(sourceRepRows, id),
      },
    })
  }
  return out.sort((a, b) => a.deal.kind.localeCompare(b.deal.kind) || a.label.localeCompare(b.label))
}
