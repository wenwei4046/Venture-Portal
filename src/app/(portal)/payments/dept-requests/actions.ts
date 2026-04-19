'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'

export async function generateDeptRequestPv(args: {
  requestId: string
  payFromAccountId: string
  paymentMethod: string
}) {
  await requireRole(['finance'])
  const supabase = await createClient()

  if (!args.payFromAccountId) throw new Error('Bank account is required')

  const { error } = await supabase.rpc('generate_pv_for_dept_request', {
    p_request_id: args.requestId,
    p_pay_from_account_id: args.payFromAccountId,
    p_payment_method: args.paymentMethod,
  })
  if (error) throw new Error(error.message)

  revalidatePath('/payments/dept-requests')
  revalidatePath('/payments')
  revalidatePath('/approvals')
}
