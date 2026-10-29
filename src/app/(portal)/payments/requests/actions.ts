'use server'

import { revalidatePath } from 'next/cache'
import { requireActionOn, requireAnyActionOn, requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { parseRequests, type PaymentRequest } from '@/lib/payment-requests/model'

// Payments › Payment request's own steps (2026-10-29, PR ① of docs/module-spec-payment-requests.md): a member's claim
// returned to HR, and its invoice opened. Each answers in words — production hides a thrown Server Action message
// behind a digest. The payroll's and a claim's voucher are their own pages' actions (payroll-requests, claim-requests).
// PR ②: a staff request's Bill back? answered, the request rejected back to its requester, and what its Create PV
// starts from (its voucher is made by payments/actions › createPaymentForRequests).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Return to HR: a member's claim HR approved for payment, with no voucher, goes back to HR's Member services
 * (`finance_return_member_claim`) — Treasury · Void or Approve, as Send back to HR on a payroll. The reason is HR's.
 */
export async function returnMemberClaim(claimId: string, reason: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  await requireAnyActionOn('/payments/requests', ['treasury', 'void'], ['treasury', 'approve'])
  if (typeof claimId !== 'string' || !UUID.test(claimId)) return { ok: false, reason: 'Which claim? Reload the page and try again.' }
  const words = typeof reason === 'string' ? reason.trim().slice(0, 500) : ''
  if (!words) return { ok: false, reason: 'Say why the claim goes back to HR.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('finance_return_member_claim', { p_claim: claimId, p_reason: words })
  if (error) return { ok: false, reason: error.message }

  revalidatePath('/payments/requests')
  revalidatePath('/payments/claim-requests')
  revalidatePath('/member-admin')
  return { ok: true }
}

/**
 * A member claim's invoice for Finance: a two-minute link, once HR approved the claim to be paid by Finance — the
 * database names the file (`finance_member_claim_invoice`) and its policy lets the link be signed.
 */
export async function openMemberClaimInvoice(claimId: string): Promise<{ ok: true; url: string; name: string } | { ok: false; reason: string }> {
  await requirePermission('treasury')
  if (typeof claimId !== 'string' || !UUID.test(claimId)) return { ok: false, reason: 'Which claim? Reload the page and try again.' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('finance_member_claim_invoice', { p_claim: claimId })
  if (error) return { ok: false, reason: error.message }
  const file = (data ?? [])[0]
  if (!file) return { ok: false, reason: 'This claim has no invoice — an outstation claim by road is paid by its rate.' }
  const signed = await supabase.storage.from('member-invoices').createSignedUrl(file.object_path, 120)
  if (signed.error || !signed.data) return { ok: false, reason: 'The invoice could not be opened. Try again.' }
  return { ok: true, url: signed.data.signedUrl, name: file.file_name }
}

/**
 * Reject a staff request back to its requester with a reason they read on the Claim page (`payment_request_reject`) —
 * Treasury · Void or Approve, as Return to HR. Only while it waits for Finance, before its voucher.
 */
export async function rejectPaymentRequest(requestId: string, reason: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  await requireAnyActionOn('/payments/requests', ['treasury', 'void'], ['treasury', 'approve'])
  if (typeof requestId !== 'string' || !UUID.test(requestId)) return { ok: false, reason: 'Which request? Reload the page and try again.' }
  const words = typeof reason === 'string' ? reason.trim().slice(0, 500) : ''
  if (!words) return { ok: false, reason: 'Say why — the requester reads it to fix the request.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('payment_request_reject', { p_request: requestId, p_reason: words })
  if (error) return { ok: false, reason: error.message }

  revalidatePath('/payments/requests')
  revalidatePath('/claims')
  return { ok: true }
}

/** Bill back? — Finance's answer on one share of a request (`payment_request_bill_back`): Yes drafts its invoice with the PV. */
export async function answerBillBack(shareId: string, billBack: boolean): Promise<{ ok: true } | { ok: false; reason: string }> {
  await requireActionOn('/payments/requests', 'treasury', 'create')
  if (typeof shareId !== 'string' || !UUID.test(shareId)) return { ok: false, reason: 'Which share? Reload the page and try again.' }
  if (typeof billBack !== 'boolean') return { ok: false, reason: 'Answer Yes or No.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('payment_request_bill_back', { p_share: shareId, p_bill_back: billBack })
  if (error) return { ok: false, reason: error.message }

  revalidatePath('/payments/requests')
  return { ok: true }
}

/**
 * What Create PV starts from (`payment_requests_for_pv`): the requests — still with Finance, one payee into one
 * account, every share answered — asked before the window opens, so a refusal is said before anything is typed.
 */
export async function openRequestsForPv(requestIds: string[]): Promise<{ ok: true; requests: PaymentRequest[] } | { ok: false; reason: string }> {
  await requireActionOn('/payments/requests', 'treasury', 'create')
  const ids = (Array.isArray(requestIds) ? requestIds : []).filter((id) => typeof id === 'string' && UUID.test(id)).slice(0, 20)
  if (ids.length === 0) return { ok: false, reason: 'Which requests? Reload the page and try again.' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('payment_requests_for_pv', { p_ids: ids })
  if (error) return { ok: false, reason: error.message }
  const requests = parseRequests((data as { requests?: unknown } | null)?.requests)
  if (requests.length !== ids.length) return { ok: false, reason: 'A request is no longer waiting for Finance — reload and try again.' }
  return { ok: true, requests }
}
