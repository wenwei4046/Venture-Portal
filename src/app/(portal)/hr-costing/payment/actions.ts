'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'

interface DisbursementResult {
  group_id: string
  count: number
  total: number
}

export async function createPayrollDisbursement(
  period: string,
): Promise<DisbursementResult> {
  await requireRole(['hr', 'principal'])
  const supabase = await createClient()

  const { data, error } = await supabase.rpc(
    'create_payroll_disbursement_vouchers',
    { p_period: period },
  )

  if (error) throw new Error(error.message)

  const result = data as unknown as DisbursementResult

  revalidatePath('/hr-costing/payment')
  revalidatePath('/approvals')
  revalidatePath('/payments')
  revalidatePath('/dashboard')

  return result
}
