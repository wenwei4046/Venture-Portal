'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'

export async function submitClaim(formData: FormData) {
  const user = await requireRole(['principal', 'finance', 'hr', 'dept_manager'])
  const supabase = await createClient()

  const claimType = formData.get('claim_type') as 'project' | 'benefit'

  const { error } = await supabase.from('claims').insert({
    claim_type: claimType,
    claimant_name: formData.get('claimant_name') as string,
    department_id: (formData.get('department_id') as string) || null,
    amount: parseFloat(formData.get('amount') as string) || 0,
    description: formData.get('description') as string,
    created_by: user.id,
  })

  if (error) throw new Error(`Failed to submit claim: ${error.message}`)

  revalidatePath('/claims')
}

export async function approveClaim(claimId: string) {
  const user = await requireRole(['principal', 'finance', 'hr'])
  const supabase = await createClient()

  const { data: claim } = await supabase
    .from('claims')
    .select('claim_type, status, amount, claimant_name, description, created_by')
    .eq('id', claimId)
    .single()

  if (!claim) throw new Error('Claim not found')
  if (claim.status !== 'pending') throw new Error('Claim is not pending')

  // Security: prevent self-approval (defense in depth — RLS enforces too)
  if (claim.created_by === user.id) {
    throw new Error('Cannot approve your own claim')
  }

  // Finance approves pool claims, HR approves benefit claims
  if (claim.claim_type === 'project' && user.role !== 'finance' && user.role !== 'principal') {
    throw new Error('Only Finance or Principal can approve pool claims')
  }
  if (claim.claim_type === 'benefit' && user.role !== 'hr' && user.role !== 'principal') {
    throw new Error('Only HR or Principal can approve benefit claims')
  }

  const { error } = await supabase
    .from('claims')
    .update({ status: 'approved', approved_by: user.id, approved_at: new Date().toISOString() })
    .eq('id', claimId)

  if (error) throw new Error(`Failed to approve: ${error.message}`)

  // Pool claims (project type) deduct from Director Saving Pool.
  // hv_operating_fund has no period_month column — it's a running ledger,
  // balance = SUM(in types) − SUM(out types). reference_id ties back to the
  // approved claim for audit.
  if (claim.claim_type === 'project' && Number(claim.amount) > 0) {
    await supabase.from('hv_operating_fund').insert({
      transaction_type: 'claim_out',
      amount: Number(claim.amount),
      description: `Pool claim: ${claim.claimant_name} — ${claim.description ?? ''}`.trim(),
      reference_id: claimId,
      reference_table: 'claims',
    })
  }

  revalidatePath('/claims')
  revalidatePath('/director-pool')
}

export async function rejectClaim(claimId: string) {
  const user = await requireRole(['principal', 'finance', 'hr'])
  const supabase = await createClient()

  const { error } = await supabase
    .from('claims')
    .update({ status: 'rejected', approved_by: user.id, approved_at: new Date().toISOString() })
    .eq('id', claimId)

  if (error) throw new Error(`Failed to reject: ${error.message}`)

  revalidatePath('/claims')
}

export async function markClaimPaid(claimId: string) {
  const user = await requireRole(['principal', 'finance', 'hr'])
  const supabase = await createClient()

  const { data: claim } = await supabase
    .from('claims')
    .select('claim_type, status')
    .eq('id', claimId)
    .single()

  if (!claim) throw new Error('Claim not found')
  if (claim.status !== 'approved') throw new Error('Only approved claims can be marked as paid')

  // Finance marks project claims paid, HR marks benefit claims paid
  if (claim.claim_type === 'project' && user.role !== 'finance' && user.role !== 'principal') {
    throw new Error('Only Finance or Principal can mark project claims as paid')
  }
  if (claim.claim_type === 'benefit' && user.role !== 'hr' && user.role !== 'principal') {
    throw new Error('Only HR or Principal can mark benefit claims as paid')
  }

  const { error } = await supabase
    .from('claims')
    .update({ status: 'paid' })
    .eq('id', claimId)
    .eq('status', 'approved')

  if (error) throw new Error(`Failed to mark as paid: ${error.message}`)

  revalidatePath('/claims')
}
