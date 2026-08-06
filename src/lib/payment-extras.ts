// Synthetic payment rows — money paid out OUTSIDE the PV voucher flow.
// Mirror of receipt-extras (user 2026-08-06: "不能像reciept 这样显示全部吗？").
// Shared by /payments (VoucherLedger) and /payments/export so the page and its
// Excel/PDF always agree. Two kinds:
//   1. Direct fund-source repayments (还 loan in) recorded without a PV — rows
//      carrying payment_voucher_id are SKIPPED (their PV already shows in the
//      list; verified live 2026-08-06: every executed fund-source PV has its
//      linked rows, so the split is clean).
//   2. Loan OUT disbursements — loans whose money left without a disbursement
//      PV (no non-voided reference_type='loan' voucher), dated
//      disbursement_date. Loans that DO have a disbursement PV show as that PV.

import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/paginate'
import type { VoucherRow } from '@/app/(portal)/payments/_components/VouchersTable'

export async function fetchPaymentExtras(supabase: SupabaseClient): Promise<VoucherRow[]> {
  const [
    fsReps,
    { data: fsrcs },
    { data: comps },
    { data: dirs },
    { data: depts },
    { data: loans },
    { data: loanPvs },
  ] = await Promise.all([
    fetchAllRows((lo, hi) => supabase
      .from('fund_source_repayments')
      .select('*')
      .is('payment_voucher_id', null)
      .order('payment_date', { ascending: false })
      .range(lo, hi)),
    supabase
      .from('fund_sources')
      .select('id, source_type, from_company_id, from_director_id, from_department_id, from_freetext_name'),
    supabase.from('companies').select('id, name, short_code'),
    supabase.from('directors').select('id, name'),
    supabase.from('departments').select('id, name'),
    supabase
      .from('loans')
      .select('id, company_id, principal, disbursement_date, status')
      .in('status', ['active', 'fully_repaid']),
    supabase
      .from('payment_vouchers')
      .select('reference_id')
      .eq('reference_type', 'loan')
      .neq('status', 'voided'),
  ])

  const compById = new Map((comps ?? []).map((c: { id: string; name: string }) => [c.id, c]))
  const dirById = new Map((dirs ?? []).map((d: { id: string; name: string }) => [d.id, d]))
  const deptById = new Map((depts ?? []).map((d: { id: string; name: string }) => [d.id, d]))
  const fsById = new Map(
    (fsrcs ?? []).map((s: {
      id: string
      from_company_id: string | null
      from_director_id: string | null
      from_department_id: string | null
      from_freetext_name: string | null
    }) => [s.id, s]),
  )

  const fsCounterparty = (fsId: string): string => {
    const s = fsById.get(fsId)
    if (!s) return '—'
    return s.from_company_id
      ? (compById.get(s.from_company_id)?.name ?? '—')
      : s.from_department_id
        ? (deptById.get(s.from_department_id)?.name ?? '—')
        : s.from_freetext_name
          ? s.from_freetext_name
          : s.from_director_id
            ? (dirById.get(s.from_director_id)?.name ?? '—')
            : '—'
  }

  const out: VoucherRow[] = []

  for (const r of (fsReps ?? []) as Array<{
    id: string
    fund_source_id: string
    amount: number
    payment_type: string
    payment_date: string
    notes: string | null
  }>) {
    const who = fsCounterparty(r.fund_source_id)
    out.push({
      id: `fsr-${r.id}`,
      voucher_no: null,
      direction: 'debit',
      amount: Number(r.amount),
      payee_name: who,
      status: 'paid',
      catLabel: `还款 · ${r.payment_type}`,
      poolLabel: '—',
      description: r.notes ?? `Fund-source ${r.payment_type} repayment — ${who}`,
      paymentOrCreatedDate: r.payment_date,
      href: `/fund-in/${r.fund_source_id}`,
    })
  }

  const loanHasPv = new Set((loanPvs ?? []).map((p: { reference_id: string | null }) => p.reference_id))
  for (const l of (loans ?? []) as Array<{
    id: string
    company_id: string | null
    principal: number
    disbursement_date: string | null
  }>) {
    if (loanHasPv.has(l.id) || !l.disbursement_date) continue
    const c = l.company_id ? compById.get(l.company_id) : null
    out.push({
      id: `lout-${l.id}`,
      voucher_no: null,
      direction: 'debit',
      amount: Number(l.principal),
      payee_name: c?.name ?? 'Borrower',
      status: 'paid',
      catLabel: 'Loan OUT · 借出',
      poolLabel: '—',
      description: `Loan disbursed${c ? ` — ${c.name}` : ''}`,
      paymentOrCreatedDate: l.disbursement_date,
      href: `/fund-out/${l.id}`,
    })
  }

  return out
}
