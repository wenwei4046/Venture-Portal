// Synthetic receipt rows — money received OUTSIDE the OR voucher flow.
// Shared by /receipts (VoucherLedger) and /payments/export so the page and
// its Excel/PDF always agree. Two kinds (user request 2026-07-24):
//   1. Direct loan repayments — recorded on the loan page, no OR exists.
//      Rows the approve RPCs auto-inserted for OR-driven repayments carry the
//      AUTO_SYNCED_PREFIX in notes and are SKIPPED (their HV-OR already shows).
//   2. Fund IN capital actually received — fund source approved
//      (active/matured/repaid), dated effective_date. The module mints no ORs.

import type { SupabaseClient } from '@supabase/supabase-js'
import dayjs from 'dayjs'
import { fetchAllRows } from '@/lib/paginate'
import type { VoucherRow } from '@/app/(portal)/payments/_components/VouchersTable'

export const AUTO_SYNCED_PREFIX = 'Auto-synced from voucher'

const FUND_SOURCE_TYPE_LABELS: Record<string, string> = {
  subsidiary: 'Subsidiary',
  director_loan: 'Director loan',
  department_pool: 'Dept pool',
  director_saving: 'Director saving',
  outsource: 'Outsource',
}

export async function fetchReceiptExtras(supabase: SupabaseClient): Promise<VoucherRow[]> {
  const [reps, { data: loans }, { data: comps }, { data: fsrcs }, { data: dirs }, { data: depts }] =
    await Promise.all([
      fetchAllRows((lo, hi) => supabase
        .from('repayments')
        .select('*')
        .order('payment_date', { ascending: false })
        .range(lo, hi)),
      supabase.from('loans').select('id, company_id'),
      supabase.from('companies').select('id, name, short_code'),
      supabase.from('fund_sources').select('*').in('status', ['active', 'matured', 'repaid']),
      supabase.from('directors').select('id, name, code'),
      supabase.from('departments').select('id, name'),
    ])

  const compById = new Map((comps ?? []).map((c: { id: string; name: string }) => [c.id, c]))
  const loanCompany = new Map(
    (loans ?? []).map((l: { id: string; company_id: string }) => [l.id, compById.get(l.company_id)])
  )
  const dirById = new Map((dirs ?? []).map((d: { id: string; name: string }) => [d.id, d]))
  const deptById = new Map((depts ?? []).map((d: { id: string; name: string }) => [d.id, d]))

  const out: VoucherRow[] = []

  for (const r of (reps ?? []) as Array<{
    id: string
    loan_id: string
    amount: number
    payment_type: string
    payment_date: string
    notes: string | null
  }>) {
    if ((r.notes ?? '').startsWith(AUTO_SYNCED_PREFIX)) continue // shown as its OR
    const c = loanCompany.get(r.loan_id)
    out.push({
      id: `rpy-${r.id}`,
      voucher_no: null,
      direction: 'credit',
      amount: Number(r.amount),
      payee_name: c ? c.name : 'Loan borrower',
      status: 'received',
      catLabel: `Loan repayment · ${r.payment_type}`,
      poolLabel: '—',
      description: r.notes ?? `Loan ${r.payment_type} repayment${c ? ` — ${c.name}` : ''}`,
      paymentOrCreatedDate: r.payment_date,
      href: `/fund-out/${r.loan_id}`,
      amendDate: { kind: 'repayment', id: r.id, date: r.payment_date.slice(0, 10) },
    })
  }

  for (const s of (fsrcs ?? []) as Array<{
    id: string
    source_type: string
    from_company_id: string | null
    from_director_id: string | null
    from_department_id: string | null
    from_freetext_name: string | null
    amount: number
    effective_date: string
    notes: string | null
  }>) {
    const from = s.from_company_id
      ? (compById.get(s.from_company_id)?.name ?? '—')
      : s.from_department_id
        ? (deptById.get(s.from_department_id)?.name ?? '—')
        : s.from_freetext_name
          ? s.from_freetext_name
          : s.from_director_id
            ? (dirById.get(s.from_director_id)?.name ?? '—')
            : '—'
    out.push({
      id: `fin-${s.id}`,
      voucher_no: null,
      direction: 'credit',
      amount: Number(s.amount),
      payee_name: from,
      status: 'received',
      catLabel: `Fund IN · ${FUND_SOURCE_TYPE_LABELS[s.source_type] ?? s.source_type}`,
      poolLabel: '—',
      description: s.notes ?? `Capital received — ${FUND_SOURCE_TYPE_LABELS[s.source_type] ?? s.source_type}`,
      paymentOrCreatedDate: s.effective_date,
      href: `/fund-in/${s.id}`,
    })
  }

  return out
}

export interface ReceiptExtraFilters {
  tab: string
  typeFilter: string
  poolFilter: string
  fromFilter: string
  toFilter: string
  minFilter: number | null
  maxFilter: number | null
  qFilter: string
}

// Same URL-param filters the voucher list applies. Synthetic rows are settled
// money → they surface under the All and Paid tabs; a voucher-type or pool
// filter excludes them (they have neither field) — the table's Category
// funnel narrows per kind instead.
export function filterReceiptExtras(rows: VoucherRow[], f: ReceiptExtraFilters): VoucherRow[] {
  return rows.filter((r) => {
    if (f.tab !== 'all' && f.tab !== 'paid') return false
    if (f.typeFilter || f.poolFilter) return false
    if (f.fromFilter && dayjs(r.paymentOrCreatedDate).isBefore(dayjs(f.fromFilter), 'day')) return false
    if (f.toFilter && dayjs(r.paymentOrCreatedDate).isAfter(dayjs(f.toFilter), 'day')) return false
    if (f.minFilter !== null && r.amount < f.minFilter) return false
    if (f.maxFilter !== null && r.amount > f.maxFilter) return false
    if (f.qFilter) {
      const hay = `${r.payee_name} ${r.description ?? ''} ${r.catLabel}`.toLowerCase()
      if (!hay.includes(f.qFilter)) return false
    }
    return true
  })
}
