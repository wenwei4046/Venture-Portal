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
    .select('claim_type, status, amount, claimant_name, description')
    .eq('id', claimId)
    .single()

  if (!claim) throw new Error('Claim not found')
  if (claim.status !== 'pending') throw new Error('Claim is not pending')

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

  // Pool claims (project type) deduct from Director Saving Pool
  if (claim.claim_type === 'project' && Number(claim.amount) > 0) {
    await supabase.from('hv_operating_fund').insert({
      transaction_type: 'claim_out',
      amount: Number(claim.amount),
      description: `Pool claim: ${claim.claimant_name} — ${claim.description ?? ''}`.trim(),
      period_month: new Date().toISOString().slice(0, 8) + '01',
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
