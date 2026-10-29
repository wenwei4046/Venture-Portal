'use server'

import { revalidatePath } from 'next/cache'
import { requireActionOn } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { checkRaiseClaimVoucher, type RaiseClaimVoucherInput } from '@/lib/claim-requests'

/**
 * Finance raises the voucher for an approved claim (2026-10-08): a member's
 * claim HR approved as a payment request, or a pool claim whose voucher was
 * voided. `claim_create_payment_voucher` does the work — the voucher, its
 * source row, the Principal's approval entry, the claim's link — in one
 * transaction. A refusal comes back as a reason: production hides a thrown
 * Server Action message behind a digest.
 */
export async function raiseClaimVoucher(
  input: RaiseClaimVoucherInput,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  await requireActionOn(['/payments/claim-requests', '/payments/requests'], 'treasury', 'create')
  const checked = checkRaiseClaimVoucher(input)
  if (!checked.ok) return checked

  const supabase = await createClient()
  const { error } = await supabase.rpc('claim_create_payment_voucher', {
    p_claim: checked.input.claimId,
    p_bank: checked.input.bankId,
    p_method: checked.input.method,
  })
  if (error) return { ok: false, reason: error.message }

  revalidatePath('/payments/claim-requests')
  revalidatePath('/payments/requests')
  revalidatePath('/payments')
  revalidatePath('/approvals')
  revalidatePath('/member-admin')
  return { ok: true }
}
