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

  // RPC was added in migration 148 but database.types.ts was last regenerated
  // before then. Running `supabase gen types typescript` removes the need for
  // this escape hatch.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)(
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
