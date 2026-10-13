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

// ─── HOUZS Venture's share of the directors' CTC (2026-10-13) ──────────────
// HR keeps it on Director Salary's Pool Breakdown with the departments that
// pay it; Finance's Transfer moves it into the Director pool —
// director_hv_share_transfer writes each department's inter-billing (the
// invoice to its pool, issued, and its receipt by netting) — and Undo takes
// it all back. A refusal comes back in words: production hides a thrown one.

export type HvTransferResult = { ok: true; documents: string[] } | { ok: false; reason: string }

function documentsOf(data: unknown): string[] {
  const d = (data ?? {}) as { invoices?: unknown; receipts?: unknown }
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  return [...list(d.invoices), ...list(d.receipts)]
}

function revalidateHvShare() {
  for (const path of ['/payments/dept-requests', '/payments', '/receipts', '/billing', '/dept-pool', '/director-salary', '/dashboard']) {
    revalidatePath(path)
  }
}

export async function transferHvShare(shareId: string, transferDate: string): Promise<HvTransferResult> {
  await requireActionOn('/payments/dept-requests', 'treasury', 'create')
  const supabase = await createClient()

  if (!shareId) return { ok: false, reason: 'Pick a share to transfer' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(transferDate ?? '')) return { ok: false, reason: 'Pick the transfer date' }

  const { data, error } = await supabase.rpc('director_hv_share_transfer', {
    p_share_id: shareId,
    p_date: transferDate,
  })
  if (error) return { ok: false, reason: error.message }

  revalidateHvShare()
  return { ok: true, documents: documentsOf(data) }
}

export async function undoHvShareTransfer(shareId: string): Promise<HvTransferResult> {
  await requireActionOn('/payments/dept-requests', 'treasury', 'void')
  const supabase = await createClient()

  if (!shareId) return { ok: false, reason: 'Pick a share to undo' }

  const { data, error } = await supabase.rpc('director_hv_share_undo', { p_share_id: shareId })
  if (error) return { ok: false, reason: error.message }

  revalidateHvShare()
  return { ok: true, documents: documentsOf(data) }
}
