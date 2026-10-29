import dayjs from 'dayjs'
import { canDo } from '@/lib/permission-actions'
import { canSeePayrollPayouts } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'
import { startRead } from '@/lib/start-read'
import { formatMoney } from '@/lib/utils'
import { officeDay, officeMonth, officeToday } from '@/lib/office-time'
import { claimReference, readClaimQueueRow } from '@/lib/claim-requests'
import type { User } from '@/types'
import { loadHubLedger, type HubLedger, type LedgerParams } from './hub-ledger'
import { loadCreatePaymentOptions, type CreatePaymentOptions } from './create-payment-options'

// Payments' hub, read (2026-10-14, the Finance revamp v2 — D02–D05; moved out
// of PaymentsHub on 2026-10-15 so the Finance phone app reads the same): the
// ledger read once, and what waits for a voucher — Dept Requests, Payroll
// Requests (the Payroll payouts right's, as its page), Claim Requests. Every
// read starts together (lib/start-read). The caller has asked the treasury.
// The desktop's Payment voucher asks without the requests (`requests: false`,
// 2026-10-29): they are Payments › Payment request's; the phone still lists them.

export interface RequestItem {
  key: string
  label: string
  sub: string
}

export interface PaymentsHubData {
  ledger: HubLedger
  canCreate: boolean
  /** Create payment's dialog (whoever may make a voucher): its line, today, and — arriving with ?new=1 — open with its lists. */
  create: { prefix: string; today: string; open: boolean; initial: CreatePaymentOptions | null } | null
  canSetDefault: boolean
  dept: RequestItem[]
  /** null without Payroll payouts: Payroll Requests is not theirs to open. */
  payroll: RequestItem[] | null
  claims: RequestItem[]
}

export async function loadPaymentsHub(user: User, params: LedgerParams, opts: { requests?: boolean } = {}): Promise<PaymentsHubData> {
  const requests = opts.requests !== false
  const supabase = await createClient()
  const seesPayroll = canSeePayrollPayouts(user)
  const canCreate = canDo(user, 'treasury', 'create')
  const canSetDefault = user.role === 'finance' || user.role === 'principal'

  const ledgerRead = startRead(loadHubLedger(supabase, user, 'debit', params))
  const deptRead = requests
    ? startRead(
        supabase
          .from('dept_payment_requests')
          .select('id, amount, payee_name, description, requested_at, departments (name)')
          .eq('status', 'pending_finance_pv')
          .order('requested_at', { ascending: false }),
      )
    : null
  const payrollRead = requests && seesPayroll
    ? startRead(
        supabase
          .from('payroll_payment_requests')
          .select('id, amount, requested_at, period_month, payroll_run_id, payroll_runs (period_month), users:requested_by (name)')
          .eq('status', 'submitted')
          .order('requested_at', { ascending: false }),
      )
    : null
  // Approved claims waiting for Finance's voucher — a menu, never a reason for the page not to open.
  const claimsRead = requests
    ? startRead(
        (async () => {
          try {
            const { data } = await supabase.rpc('claim_payment_queue')
            return ((data ?? []) as unknown as Array<Record<string, unknown>>).map(readClaimQueueRow).filter((r) => !r.voucherId)
          } catch {
            return []
          }
        })(),
      )
    : null

  // Arriving with Create payment open (the Overview's button): its lists come with the page, so nothing asks for them after the navigation.
  const createRead = canCreate && params.new === '1' ? startRead(loadCreatePaymentOptions(supabase).catch(() => null)) : null

  const ledger = await ledgerRead

  const { data: deptRows } = deptRead ? await deptRead : { data: [] }
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

  const claims: RequestItem[] = (claimsRead ? await claimsRead : []).map((r) => ({
    key: r.claimId,
    label: `${r.claimantName} · ${claimReference(r)}`,
    sub: `${formatMoney(r.amount)}${r.department ? ` · ${r.department}` : ''}`,
  }))

  return {
    ledger,
    canCreate,
    create: canCreate ? { prefix: `HV-PV-${officeMonth().replace('-', '')}`, today: officeToday(), open: params.new === '1', initial: createRead ? await createRead : null } : null,
    canSetDefault,
    dept,
    payroll,
    claims,
  }
}
