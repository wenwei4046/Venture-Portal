'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireActionOn } from '@/lib/auth'

export async function generateDeptRequestPv(args: {
  requestId: string
  payFromAccountId: string
  paymentMethod: string
}) {
  await requireActionOn('/payments/dept-requests', 'treasury', 'create')
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

// Cancel a request whose pool was already reserved at stage-1. The RPC
// (mig 20260612030000) refunds the dept pool ('void_in'), reverses the
// stage-1 AP-accrual JE, voids a pending PV + its approval if one exists,
// and flips the request to cancelled. Refuses if the PV is already paid.
export async function cancelDeptRequest(formData: FormData) {
  await requireActionOn('/payments/dept-requests', 'treasury', 'void')
  const supabase = await createClient()

  const requestId = (formData.get('request_id') as string) ?? ''
  const reason = ((formData.get('reason') as string) ?? '').trim() || null
  if (!requestId) throw new Error('Request id is required')

  const { error } = await supabase.rpc('cancel_dept_payment_request' as never, {
    p_request_id: requestId,
    p_reason: reason,
  } as never)
  if (error) throw new Error(error.message)

  revalidatePath('/payments/dept-requests')
  revalidatePath('/payments')
  revalidatePath('/approvals')
  revalidatePath('/dept-pool')
}

/**
 * The two steps answered in words (2026-10-16, the Finance phone app's Dept
 * Payment Requests): production hides a thrown message behind a digest, so
 * each asks the same gate, calls the page's own action and says what it said.
 */
export type DeptRequestStepResult = { ok: true } | { ok: false; reason: string }
const refusalOf = (e: unknown, fallback: string): DeptRequestStepResult => ({
  ok: false,
  reason: e instanceof Error && e.message ? e.message : fallback,
})

export async function generateDeptRequestPvInWords(args: { requestId: string; payFromAccountId: string; paymentMethod: string }): Promise<DeptRequestStepResult> {
  await requireActionOn('/payments/dept-requests', 'treasury', 'create')
  try {
    await generateDeptRequestPv(args)
    return { ok: true }
  } catch (e) {
    return refusalOf(e, 'The voucher could not be generated.')
  }
}

export async function cancelDeptRequestInWords(requestId: string, reason: string | null): Promise<DeptRequestStepResult> {
  await requireActionOn('/payments/dept-requests', 'treasury', 'void')
  const fd = new FormData()
  fd.set('request_id', requestId)
  if (reason) fd.set('reason', reason)
  try {
    await cancelDeptRequest(fd)
    return { ok: true }
  } catch (e) {
    return refusalOf(e, 'The request could not be cancelled.')
  }
}
