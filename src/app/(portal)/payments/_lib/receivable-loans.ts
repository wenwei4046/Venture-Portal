import 'server-only'
import dayjs from 'dayjs'
import type { createClient } from '@/lib/supabase/server'
import { officeMonth } from '@/lib/office-time'
import { fundingSourceFromTerms } from '@/lib/utils'
import { fetchAllRows } from '@/lib/paginate'
import { loanInstallmentCount } from '@/lib/installment-count'
import { fetchTermsHistory, isLoanPrincipal, principalPaidByMonth, termsForLoan } from '@/lib/treasury-terms-data'
import type { LoanOption } from '../_components/LoanRepaymentReceivedForm'

// The loans a repayment can be received on (2026-10-14: moved word for word
// from /payments/new's loan_repayment mode, so the form page and Receipt's
// *Loan repayment* dialog list the same loans the same way): every active
// loan still owed, the biggest debt first, with its 期数 / 还剩 and — when the
// borrower's Interest-in-Suspense leaf holds a balance — the suspense route.

export interface ReceivableLoans {
  loans: LoanOption[]
  banks: Array<{ id: string; bank_name: string; account_number: string; current_balance: number }>
}

export async function loadReceivableLoans(supabase: Awaited<ReturnType<typeof createClient>>): Promise<ReceivableLoans> {
  const [{ data: loans }, { data: loanOut }, { data: cos }, { data: banks }, { data: suspenseAccts }, { data: suspenseLines }] = await Promise.all([
    supabase.from('loans').select('id, company_id, principal, effective_rate, tenure_months, repayment_terms, disbursement_date, compound_interest, repayment_start_month, terms_effective_from').eq('status', 'active'),
    supabase.from('loan_outstanding').select('loan_id, outstanding, total_principal_paid'),
    supabase.from('companies').select('id, short_code, name'),
    supabase.from('bank_accounts').select('id, bank_name, account_number, current_balance').eq('status', 'active').order('is_primary', { ascending: false }),
    // Interest-in-Suspense leaves + their live balances, so the form can
    // offer "draw down the suspense" instead of booking income twice.
    supabase.from('chart_of_accounts').select('code, name').eq('parent_code', '3060').eq('is_active', true),
    // Every suspense line ever posted, in 1000-row pages (2026-10-08): these
    // are running balances, and a balance summed from a read PostgREST
    // stopped at 1000 rows is short without a word. A failed read still
    // shows no suspense, as before.
    fetchAllRows((lo, hi) =>
      supabase
        .from('journal_lines')
        .select('account_code, debit, credit, journal_entries!inner(is_reversed)')
        .like('account_code', '306%')
        .order('id', { ascending: true })
        .range(lo, hi),
    ).then((data) => ({ data }), () => ({ data: null })),
  ])
  const suspenseBalance = new Map<string, number>()
  for (const l of (suspenseLines ?? []) as unknown as Array<{
    account_code: string; debit: number | null; credit: number | null
    journal_entries: { is_reversed: boolean }
  }>) {
    if (l.journal_entries?.is_reversed) continue
    const cur = suspenseBalance.get(l.account_code) ?? 0
    suspenseBalance.set(l.account_code, cur + Number(l.debit ?? 0) - Number(l.credit ?? 0))
  }
  // Match a suspense leaf to a borrower the same way resolveInterestSuspenseLeaf does.
  const suspenseFor = (co: { name?: string | null; short_code?: string | null } | null | undefined) => {
    if (!co) return null
    const hay = (s: string) => s.toLowerCase()
    return (suspenseAccts ?? []).find((a) => {
      const n = hay(a.name as string)
      return (co.name && n.includes(hay(co.name))) || (co.short_code && n.includes(hay(co.short_code)))
    }) ?? null
  }
  const outMap = new Map((loanOut ?? []).map((o) => [o.loan_id as string, Number(o.outstanding)]))
  const principalPaidMap = new Map((loanOut ?? []).map((o) => [o.loan_id as string, Number(o.total_principal_paid ?? 0)]))
  const coMap = new Map((cos ?? []).map((c) => [c.id as string, c]))
  // 期数 / 还剩 for the picker (2026-10-02). A loan whose terms changed
  // mid-life counts from the segment in force now, which needs its principal
  // repayments month by month — read only for those loans.
  const loanIds = (loans ?? []).map((l) => l.id as string)
  const termsHistory = await fetchTermsHistory(supabase, 'loan', loanIds)
  const changedIds = (loans ?? [])
    .filter((l) => termsHistory.has(l.id as string) || l.terms_effective_from != null)
    .map((l) => l.id as string)
  const changedRepayments =
    changedIds.length === 0
      ? []
      : await fetchAllRows((lo, hi) =>
          supabase
            .from('repayments')
            .select('loan_id, amount, payment_date, payment_type')
            .in('loan_id', changedIds)
            .order('id', { ascending: true })
            .range(lo, hi),
        )
  const principalByMonth = principalPaidByMonth(
    changedRepayments.map((rp) => ({
      id: rp.loan_id as string,
      amount: Number(rp.amount),
      payment_date: rp.payment_date as string,
      payment_type: (rp.payment_type as string | null) ?? 'principal',
    })),
    isLoanPrincipal,
  )
  const currentYM = officeMonth()
  const loanOptions = (loans ?? [])
    .map((l) => {
      const co = l.company_id ? coMap.get(l.company_id as string) : null
      const outstanding = outMap.get(l.id as string) ?? Number(l.principal)
      const susp = suspenseFor(co)
      // Same-company loans look identical — the SC (funding source) remark
      // and disbursement date tell them apart (user 2026-08-07: "不然我不
      // 知道要clear哪里一个").
      const src = fundingSourceFromTerms((l as { repayment_terms?: string | null }).repayment_terms ?? null)
      const disb = (l as { disbursement_date?: string | null }).disbursement_date
      const idBits = `${src ? ` · SC ${src}` : ''}${disb ? ` · ${dayjs(disb).format('D MMM YY')}` : ''}`
      return {
        id: l.id as string,
        outstanding,
        // The picker shows these as columns; the one-line label is kept for
        // anything that still wants a single string.
        borrower: (co?.name as string | undefined) ?? (co?.short_code as string | undefined) ?? '—',
        principal: Number(l.principal),
        ratePct: Math.round(Number(l.effective_rate) * 100 * 1000) / 1000,
        date: disb ?? null,
        source: src ?? null,
        // null = no fixed term (unscheduled, compounding): nothing to count.
        periods: loanInstallmentCount({
          terms: termsForLoan(l, termsHistory.get(l.id as string) ?? []),
          principalPaid: principalPaidMap.get(l.id as string) ?? 0,
          principalByMonth: principalByMonth.get(l.id as string),
          currentYM,
        }),
        label: `${co?.short_code ?? co?.name ?? '—'} · RM ${Number(l.principal).toLocaleString('en-MY', { minimumFractionDigits: 2 })} @ ${(Number(l.effective_rate) * 100).toFixed(3)}%/mo · 欠 ${outstanding.toLocaleString('en-MY', { minimumFractionDigits: 2 })}${idBits}`,
        // Offer the suspense route only when that leaf actually holds a balance.
        suspenseCode: susp && (suspenseBalance.get(susp.code as string) ?? 0) > 0.005 ? (susp.code as string) : null,
        suspenseName: susp?.name as string | undefined,
        suspenseBalance: susp ? Math.round((suspenseBalance.get(susp.code as string) ?? 0) * 100) / 100 : 0,
      }
    })
    .filter((l) => l.outstanding > 0)
    .sort((a, b) => b.outstanding - a.outstanding)

  return {
    loans: loanOptions,
    banks: (banks ?? []).map((b) => ({ id: b.id as string, bank_name: b.bank_name as string, account_number: (b.account_number as string | null) ?? '', current_balance: Number(b.current_balance ?? 0) })),
  }
}
