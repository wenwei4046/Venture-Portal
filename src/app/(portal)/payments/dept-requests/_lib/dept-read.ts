import type { createClient } from '@/lib/supabase/server'

// What Payments › Dept Payment Requests reads (2026-10-16, lifted out of its
// page word for word so the Finance phone app reads the very same): the
// requests waiting for Finance's voucher or the Principal's approval, newest
// first, and the active banks a voucher may pay from.

type Client = Awaited<ReturnType<typeof createClient>>

export function deptRequestsRead(supabase: Client) {
  return Promise.all([
    supabase
      .from('dept_payment_requests')
      .select(
        `id, amount, payee_name, description, status, requested_at, pv_id, department_id,
         departments (name),
         users:requested_by (name),
         payment_vouchers:pv_id (voucher_no, status)`,
      )
      .in('status', ['pending_finance_pv', 'pending_principal_pv'])
      .order('requested_at', { ascending: false }),
    supabase
      .from('bank_accounts')
      .select('id, bank_name, current_balance')
      .eq('status', 'active')
      .order('is_primary', { ascending: false }),
  ])
}

export interface DeptRequestRow {
  id: string
  amount: number
  payee: string
  description: string | null
  status: 'pending_finance_pv' | 'pending_principal_pv'
  requestedAt: string
  pvId: string | null
  department: string
  requestedBy: string
  voucherNo: string | null
}

/** One embed, whichever shape PostgREST hands it in. */
const one = <T,>(v: unknown): T | null => ((Array.isArray(v) ? v[0] : v) as T | null) ?? null

/** The rows, typed for a reader that is not the page. */
export async function readDeptRequests(supabase: Client): Promise<{ rows: DeptRequestRow[]; banks: Array<{ id: string; bank_name: string; current_balance: number }> }> {
  const [{ data: requests }, { data: banks }] = await deptRequestsRead(supabase)
  return {
    rows: (requests ?? []).map((r) => ({
      id: r.id as string,
      amount: Number(r.amount),
      payee: (r.payee_name as string | null) ?? '—',
      description: (r.description as string | null) ?? null,
      status: r.status as DeptRequestRow['status'],
      requestedAt: r.requested_at as string,
      pvId: (r.pv_id as string | null) ?? null,
      department: one<{ name: string }>(r.departments)?.name ?? '—',
      requestedBy: one<{ name: string }>(r.users)?.name ?? '—',
      voucherNo: one<{ voucher_no: string | null }>(r.payment_vouchers)?.voucher_no ?? null,
    })),
    banks: (banks ?? []).map((b) => ({ id: b.id, bank_name: b.bank_name, current_balance: Number(b.current_balance ?? 0) })),
  }
}
