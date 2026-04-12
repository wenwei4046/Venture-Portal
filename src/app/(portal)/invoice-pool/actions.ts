'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'

// ─── Request invoice pool release (Finance) ─────────────────────────────────

export async function requestRelease(formData: FormData) {
  const user = await requireRole(['finance'])
  const supabase = await createClient()

  const amountRaw = (formData.get('amount') as string) ?? '0'
  const amount = parseFloat(amountRaw)
  const description = ((formData.get('description') as string) ?? '').trim()

  if (isNaN(amount) || amount <= 0) {
    throw new Error('Amount must be greater than 0')
  }
  if (!description) {
    throw new Error('Description is required')
  }

  // ─── Validate against current pool balance ───
  const { data: allTxns, error: txnError } = await supabase
    .from('invoice_payout_pool')
    .select('transaction_type, amount')

  if (txnError) {
    throw new Error(`Failed to fetch pool balance: ${txnError.message}`)
  }

  let balance = 0
  for (const t of allTxns ?? []) {
    const amt = Number(t.amount)
    if (t.transaction_type === 'accumulate') {
      balance += amt
    } else {
      balance -= amt
    }
  }

  if (amount > balance) {
    throw new Error(
      `Release amount (RM ${amount.toFixed(2)}) exceeds pool balance (RM ${balance.toFixed(2)})`
    )
  }

  // ─── Insert approval request ───
  const { error: approvalError } = await supabase.from('approval_requests').insert({
    request_type: 'invoice_pool_release' as const,
    submitted_by: user.id,
    description,
    amount,
    status: 'pending' as const,
    workflow_state: 'submitted' as const,
    reference_id: 'invoice_pool',
    reference_table: 'invoice_payout_pool',
  })

  if (approvalError) {
    throw new Error(`Failed to submit release request: ${approvalError.message}`)
  }

  revalidatePath('/invoice-pool')
  revalidatePath('/approvals')
}
