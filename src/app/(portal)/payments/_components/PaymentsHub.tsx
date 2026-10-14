import dayjs from 'dayjs'
import { requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { canSeePayrollPayouts } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'
import { startRead } from '@/lib/start-read'
import { formatMoney } from '@/lib/utils'
import { officeDay } from '@/lib/office-time'
import { claimReference, readClaimQueueRow } from '@/lib/claim-requests'
import { loadHubLedger, type LedgerParams } from '../_lib/hub-ledger'
import PaymentsHubClient, { type RequestItem } from './PaymentsHubClient'

// Payments (2026-10-14, the Finance revamp v2 — D02–D05): the ledger read
// once, and what waits for a voucher — Dept Requests, Payroll Requests (the
// Payroll payouts right's, as its page), Claim Requests — each a menu in the
// head. Every read starts together (lib/start-read).

export default async function PaymentsHub({ params }: { params: LedgerParams }) {
  const user = await requirePermission('treasury')
  const supabase = await createClient()
  const seesPayroll = canSeePayrollPayouts(user)

  const ledgerRead = startRead(loadHubLedger(supabase, user, 'debit', params))
  const deptRead = startRead(
    supabase
      .from('dept_payment_requests')
      .select('id, amount, payee_name, description, requested_at, departments (name)')
      .eq('status', 'pending_finance_pv')
      .order('requested_at', { ascending: false }),
  )
  const payrollRead = seesPayroll
    ? startRead(
        supabase
          .from('payroll_payment_requests')
          .select('id, amount, requested_at, period_month, payroll_run_id, payroll_runs (period_month), users:requested_by (name)')
          .eq('status', 'submitted')
          .order('requested_at', { ascending: false }),
      )
    : null
  // Approved claims waiting for Finance's voucher — a menu, never a reason for the page not to open.
  const claimsRead = startRead(
    (async () => {
      try {
        const { data } = await supabase.rpc('claim_payment_queue')
        return ((data ?? []) as unknown as Array<Record<string, unknown>>).map(readClaimQueueRow).filter((r) => !r.voucherId)
      } catch {
        return []
      }
    })(),
  )

  const ledger = await ledgerRead

  const { data: deptRows } = await deptRead
  const dept: RequestItem[] = ((deptRows ?? []) as unknown as Array<{
    id: string
    amount: number | string
    payee_name: string | null
    description: string | null
    requested_at: string
    departments: { name: string } | null
  }>).map((r) => ({
    key: r.id,
    label: `${r.departments?.name ?? 'Department'} · ${r.description?.trim() || r.payee_name || 'Payment request'}`,
    sub: `${formatMoney(Number(r.amount))} · requested ${officeDay(r.requested_at).format('DD MMM')}`,
  }))

  let payroll: RequestItem[] | null = null
  if (payrollRead) {
    const { data } = await payrollRead
    payroll = ((data ?? []) as unknown as Array<{
      id: string
      amount: number | string
      period_month: string | null
      payroll_run_id: string | null
      payroll_runs: { period_month: string | null } | null
      users: { name: string | null } | null
    }>).map((r) => {
      const period = r.payroll_runs?.period_month ?? r.period_month
      return {
        key: r.id,
        label: `${r.payroll_run_id ? 'Payroll' : 'Director salary'}${period ? ` ${dayjs(period).format('MMM YYYY')}` : ''}`,
        sub: `${formatMoney(Number(r.amount))} · from ${r.users?.name ?? 'HR'}`,
      }
    })
  }

  const claims: RequestItem[] = (await claimsRead).map((r) => ({
    key: r.claimId,
    label: `${r.claimantName} · ${claimReference(r)}`,
    sub: `${formatMoney(r.amount)}${r.department ? ` · ${r.department}` : ''}`,
  }))

  return (
    <PaymentsHubClient
      ledger={ledger}
      canCreate={canDo(user, 'treasury', 'create')}
      canSetDefault={user.role === 'finance' || user.role === 'principal'}
      dept={dept}
      payroll={payroll}
      claims={claims}
    />
  )
}
