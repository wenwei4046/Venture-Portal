'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'

interface DisbursementResult {
  group_id: string
  scope: string
  count: number
  total: number
}

export type PayrollScope = 'staff' | 'directors'
export type StatutoryScheme = 'KWSP' | 'SOCSO' | 'EIS' | 'PCB' | 'SKBBK'

/**
 * Mig 20260721000000 — HR runs the payroll payments. Staff and directors are
 * generated as SEPARATE batches (they may be paid on different days), each
 * with HR's chosen payment date stamped on every voucher (drives the GL date
 * at approval).
 */
export async function createPayrollDisbursement(
  period: string,
  scope: PayrollScope,
  paymentDate: string,
): Promise<DisbursementResult> {
  await requirePermission('hr_costing')
  const supabase = await createClient()

  if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
    throw new Error('Pick the payment date (the day the bank file goes out)')
  }

  // database.types.ts not regenerated for the new signature (same escape
  // hatch as before).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)(
    'create_payroll_disbursement_vouchers',
    { p_period: period, p_scope: scope, p_payment_date: paymentDate },
  )

  if (error) throw new Error(error.message)

  const result = data as unknown as DisbursementResult

  revalidatePath('/hr-costing/payment')
  revalidatePath('/approvals')
  revalidatePath('/payments')
  revalidatePath('/dashboard')

  return result
}

/**
 * One statutory voucher per call — the bodies are paid one institution at a
 * time, each on its own date. Date may be left blank and set later.
 */
export async function generateStatutoryScheme(
  period: string,
  scheme: StatutoryScheme,
  paymentDate?: string,
): Promise<void> {
  await requirePermission('hr_costing', 'treasury')
  const supabase = await createClient()

  if (paymentDate && !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
    throw new Error('Invalid payment date')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.rpc as any)('create_payroll_statutory_vouchers', {
    p_period: period,
    p_scheme: scheme,
    p_payment_date: paymentDate ?? null,
    p_bank_account_id: null, // auto-picks the Alliance payroll bank
  })

  if (error) throw new Error(error.message)

  revalidatePath('/hr-costing/payment')
  revalidatePath('/payments/payroll-requests')
  revalidatePath('/payments')
  revalidatePath('/approvals')
}

/**
 * Director-only statutory top-up (mig 20260731050000). For a period whose
 * scheme voucher was generated BEFORE the director InfoTech actuals existed
 * (Jun 2026: the five staff-only vouchers), this raises a second voucher
 * carrying just the director share — amounts from director_monthly_payroll,
 * the same source the payroll funding request summed ("request fund" 算法,
 * user 2026-07-31). The RPC refuses when the share is already carried.
 */
export async function generateStatutoryDirectorTopup(
  period: string,
  scheme: StatutoryScheme,
  paymentDate?: string,
): Promise<void> {
  await requirePermission('hr_costing', 'treasury')
  const supabase = await createClient()

  if (paymentDate && !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
    throw new Error('Invalid payment date')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.rpc as any)('create_payroll_statutory_director_topup', {
    p_period: period,
    p_scheme: scheme,
    p_payment_date: paymentDate ?? null,
    p_bank_account_id: null, // auto-picks the Alliance payroll bank
  })

  if (error) throw new Error(error.message)

  revalidatePath('/hr-costing/payment')
  revalidatePath('/payments/payroll-requests')
  revalidatePath('/payments')
  revalidatePath('/approvals')
}

/**
 * HR sets/changes the payment date on a PENDING payroll voucher (the /payments
 * editor is Finance-gated, but payroll payment dates are HR's knowledge).
 */
export async function setPayrollPvDate(voucherId: string, paymentDate: string): Promise<void> {
  await requirePermission('hr_costing', 'treasury')
  const supabase = await createClient()

  if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) throw new Error('Invalid payment date')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.rpc as any)('set_payroll_pv_payment_date', {
    p_voucher_id: voucherId,
    p_payment_date: paymentDate,
  })

  if (error) throw new Error(error.message)

  revalidatePath('/hr-costing/payment')
  revalidatePath('/payments')
}
