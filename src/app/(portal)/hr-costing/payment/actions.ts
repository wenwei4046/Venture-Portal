'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireActionOn, requireAnyActionOn } from '@/lib/auth'
import { needsTick, sees } from '@/lib/sensitive'
import type { SalaryComponentSelection } from '@/lib/payment-cycle'

export interface DisbursementResult {
  group_id: string
  scope: string
  granularity: 'employee' | 'department'
  /** Vouchers raised. */
  count: number
  /** People covered by those vouchers. */
  people: number
  total: number
}

export type PayrollScope = 'staff' | 'directors'
export type PayrollGranularity = 'employee' | 'department'
export type StatutoryScheme = 'KWSP' | 'SOCSO' | 'EIS' | 'PCB' | 'SKBBK'

/** Institution remains the payee; employee selection controls contribution lines. */
export async function generateStatutorySelection(
  period: string,
  schemes: StatutoryScheme[],
  scope: PayrollScope,
  granularity: PayrollGranularity,
  departmentId: string | null,
  payrollRowIds: string[] | null,
  paymentDate?: string,
  expected?: { total: number; voucherCount: number },
): Promise<DisbursementResult> {
  await requireActionOn('/hr-costing/payment', 'hr_costing', 'create')
  if (!/^\d{4}-\d{2}-01$/.test(period)) throw new Error('Choose a payroll month')
  if (paymentDate && !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) throw new Error('Invalid payment date')
  if (!Array.isArray(schemes) || schemes.length === 0 || schemes.some(s => !['KWSP', 'SOCSO', 'EIS', 'PCB', 'SKBBK'].includes(s)) || new Set(schemes).size !== schemes.length) throw new Error('Choose valid contribution schemes')
  if (!['staff', 'directors'].includes(scope) || !['employee', 'department'].includes(granularity)) throw new Error('Choose a department or employees')
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (departmentId !== null && !uuid.test(departmentId)) throw new Error('Invalid department')
  if (payrollRowIds !== null && (!Array.isArray(payrollRowIds) || !payrollRowIds.length || payrollRowIds.some(id => typeof id !== 'string' || !uuid.test(id)) || new Set(payrollRowIds.map(id => id.toLowerCase())).size !== payrollRowIds.length)) throw new Error('Select each employee once')
  if (granularity === 'employee' && payrollRowIds === null) throw new Error('Select at least one employee')
  if (expected && (!Number.isFinite(expected.total) || expected.total <= 0 || !Number.isInteger(expected.voucherCount) || expected.voucherCount <= 0)) throw new Error('Refresh the payment preview')
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_payroll_statutory_selection', {
    p_period: period, p_schemes: schemes, p_scope: scope, p_granularity: granularity,
    p_department_id: departmentId, p_payroll_row_ids: payrollRowIds, p_payment_date: paymentDate || null,
    p_expected_total: expected?.total ?? null, p_expected_count: expected?.voucherCount ?? null,
  })
  if (error) throw new Error(error.message)
  for (const path of ['/hr-costing/payment', '/payments/payroll-requests', '/payments', '/approvals', '/dashboard']) revalidatePath(path)
  return data as unknown as DisbursementResult
}

/**
 * Mig 20260911101500 — HR compiles the salary PVs. `granularity` decides the
 * shape: 'employee' is one voucher per person (every month so far),
 * 'department' is ONE voucher per department with the people as lines.
 * `departmentId` pays one department on its own (staff only). `payrollRowIds`
 * selects exactly those people; null includes everyone still without a PV.
 * Each call is its own approval group with its own payment date, which drives
 * the GL date at approval. The database rejects stale selections atomically.
 */
export async function createPayrollDisbursement(
  period: string,
  scope: PayrollScope,
  paymentDate: string,
  granularity: PayrollGranularity = 'employee',
  departmentId: string | null = null,
  payrollRowIds: string[] | null = null,
  componentSelections: SalaryComponentSelection[] | null = null,
): Promise<DisbursementResult> {
  const user = await requireActionOn('/hr-costing/payment', 'hr_costing', 'create')
  // A salary PV carries each person's account number, and the preview it is
  // checked against showed them (2026-10-09, PR4): Bank accounts ticked. The
  // database refuses it too (create_payroll_disbursement_vouchers).
  if (!sees(user, 'bank')) throw new Error(needsTick('bank', 'Raising salary PVs'))
  const supabase = await createClient()

  if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
    throw new Error('Pick the payment date (the day the bank file goes out)')
  }
  if (granularity !== 'employee' && granularity !== 'department') {
    throw new Error('Choose one PV per department or one per employee')
  }
  if (departmentId && !/^[0-9a-f-]{36}$/i.test(departmentId)) {
    throw new Error('Invalid department')
  }
  if (payrollRowIds !== null) {
    if (!Array.isArray(payrollRowIds) || payrollRowIds.length === 0) {
      throw new Error('Select at least one employee to generate a payment voucher')
    }
    if (payrollRowIds.some(id => typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
      || new Set(payrollRowIds.map(id => id.toLowerCase())).size !== payrollRowIds.length) {
      throw new Error('Invalid employee selection. Select each employee once')
    }
  }

  if (componentSelections !== null) {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!Array.isArray(componentSelections) || !componentSelections.length || componentSelections.some(c =>
      !c || !uuid.test(c.payroll_row_id) || !['net', 'basic', 'commission'].includes(c.component) || !['account_1', 'account_2'].includes(c.account)
      || (c.expected_amount !== undefined && (!Number.isFinite(c.expected_amount) || c.expected_amount <= 0)))
      || new Set(componentSelections.map(c => `${c.payroll_row_id.toLowerCase()}:${c.component}`)).size !== componentSelections.length) {
      throw new Error('Select each valid salary payment and recipient account once')
    }
  }

  const { data, error } = await supabase.rpc(
    'create_payroll_disbursement_vouchers',
    {
      p_period: period,
      p_scope: scope,
      p_payment_date: paymentDate,
      p_granularity: granularity,
      p_department_id: departmentId,
      p_payroll_row_ids: payrollRowIds,
      p_component_selections: componentSelections === null ? null : componentSelections.map(c => ({ ...c })),
    },
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
  await requireAnyActionOn('/hr-costing/payment', ['hr_costing', 'create'], ['treasury', 'create'])
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
 * carrying just the director share. The RPC refuses when the share is
 * already carried.
 */
export async function generateStatutoryDirectorTopup(
  period: string,
  scheme: StatutoryScheme,
  paymentDate?: string,
): Promise<void> {
  await requireAnyActionOn('/hr-costing/payment', ['hr_costing', 'create'], ['treasury', 'create'])
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
  await requireAnyActionOn('/hr-costing/payment', ['hr_costing', 'edit'], ['treasury', 'edit'])
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
