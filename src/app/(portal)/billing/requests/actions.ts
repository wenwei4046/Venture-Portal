'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'

export async function generateInvoicesFromRequest(requestId: string) {
  await requireRole(['finance', 'principal'])
  const supabase = await createClient()
  const { error } = await supabase.rpc('generate_invoices_from_request', { p_request_id: requestId })
  if (error) throw new Error(error.message)
  revalidatePath('/billing/requests')
  revalidatePath('/billing')
  revalidatePath('/dept-pool/marketing')
}

export async function rejectInvoiceRequest(requestId: string, reason: string) {
  await requireRole(['finance', 'principal'])
  const supabase = await createClient()
  if (!reason.trim()) throw new Error('Rejection reason is required')
  const { error } = await supabase.rpc('reject_invoice_request', {
    p_request_id: requestId,
    p_reason: reason.trim(),
  })
  if (error) throw new Error(error.message)
  revalidatePath('/billing/requests')
  revalidatePath('/dept-pool/marketing')
}
