import { canDo } from '@/lib/permission-actions'
import { canSeePayrollPayouts } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'
import { officeToday } from '@/lib/office-time'
import { fetchDeptRegistry } from '@/lib/dept-registry'
import { readClaimQueueRow } from '@/lib/claim-requests'
import { payrollRequestsModel } from '@/lib/fin-app/payroll-requests-model'
import type { User } from '@/types'
import { readPayrollRequests, type PayrollBank } from '../../payroll-requests/_lib/payroll-read'
import { claimRow, payrollRow, requestDepartments, sortRequests, type PaymentRequestRow, type RequestDepartment } from './requests-model'

// What Payments › Payment request reads (2026-10-29, PR ①): HR's payroll funding requests as Payroll Requests read
// them (`readPayrollRequests` — only for an account with Payroll payouts, as that page asked), the claims HR approved
// to be paid by Finance (`claim_payment_queue`, Treasury's), the departments their cards are, the active banks. The
// caller has asked for the page and the treasury.

export interface PaymentRequestsRead {
  rows: PaymentRequestRow[]
  departments: RequestDepartment[]
  banks: PayrollBank[]
  seesPayroll: boolean
  today: string
  can: {
    /** Treasury · Create: a claim's voucher, a payroll's funding round. */
    pay: boolean
    /** Treasury · Void or Approve: a payroll sent back, a member's claim returned to HR. */
    sendBack: boolean
  }
  canSetDefault: boolean
}

export async function readPaymentRequests(user: User): Promise<PaymentRequestsRead> {
  const supabase = await createClient()
  const seesPayroll = canSeePayrollPayouts(user)
  const [payroll, claims, registry, banks] = await Promise.all([
    seesPayroll ? readPayrollRequests(supabase) : Promise.resolve(null),
    supabase.rpc('claim_payment_queue'),
    fetchDeptRegistry(supabase),
    // Payroll Requests reads them too; without it, the claims still need a bank to be paid from.
    seesPayroll
      ? Promise.resolve(null)
      : supabase.from('bank_accounts').select('id, bank_name, current_balance, gl_account_code').eq('status', 'active').order('is_primary', { ascending: false }),
  ])

  const departments = requestDepartments(registry)
  const rows: PaymentRequestRow[] = []
  if (payroll) {
    const model = payrollRequestsModel({
      rows: payroll.rows,
      breakdown: Object.fromEntries(payroll.breakdownByRequest),
      funding: Object.fromEntries(payroll.fundingByRequest),
      statutory: [],
    })
    const byId = new Map(payroll.rows.map((r) => [r.id, r]))
    for (const line of [...model.fund, ...model.principal]) {
      const r = byId.get(line.id)
      if (r) rows.push(payrollRow(line, r))
    }
  }
  for (const raw of ((claims.data ?? []) as unknown as Record<string, unknown>[])) rows.push(claimRow(readClaimQueueRow(raw), departments))

  return {
    rows: sortRequests(rows),
    departments,
    banks:
      payroll?.banks ??
      (banks?.data ?? []).map((b) => ({
        id: b.id,
        bank_name: b.bank_name,
        current_balance: Number(b.current_balance ?? 0),
        gl_account_code: (b.gl_account_code as string | null) ?? '',
      })),
    seesPayroll,
    today: officeToday(),
    can: {
      pay: canDo(user, 'treasury', 'create'),
      sendBack: canDo(user, 'treasury', 'void') || canDo(user, 'treasury', 'approve'),
    },
    // Everyone's default arrangement, as Dept Pool and Invoice Financing offer it: whoever makes vouchers.
    canSetDefault: canDo(user, 'treasury', 'create'),
  }
}
