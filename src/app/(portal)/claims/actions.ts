'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { assertPeriodOpen } from '@/lib/period-lock'

export async function submitClaim(formData: FormData) {
  const user = await requireRole(['principal', 'finance', 'hr', 'dept_manager'])
  const supabase = await createClient()

  const claimType = formData.get('claim_type') as 'project' | 'benefit'
  // Phase 7 Step 13: claimant picks a source pool. Defaults to Venture Pool
  // if omitted (keeps submit working for legacy forms).
  const sourcePool = (formData.get('source_pool') as string) || 'venture_pool'

  const { error } = await supabase.from('claims').insert({
    claim_type: claimType,
    claimant_name: formData.get('claimant_name') as string,
    department_id: (formData.get('department_id') as string) || null,
    amount: parseFloat(formData.get('amount') as string) || 0,
    description: formData.get('description') as string,
    source_pool: sourcePool,
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
    .select('claim_type, status, amount, claimant_name, description, created_by, source_pool')
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

  await assertPeriodOpen(supabase, new Date())

  // Finance/HR approves the claim → system drafts a payment_voucher in
  // pending_approval (one pvs row using the claimant's chosen pool) +
  // links an approval_request of type payment_voucher. Principal then
  // approves the voucher through the normal approvals queue — approve is
  // now a single-step action that pays immediately (bank debit, pool
  // adjust, GL journal all fire in approveVoucher itself).
  const { error: claimErr } = await supabase
    .from('claims')
    .update({ status: 'approved', approved_by: user.id, approved_at: new Date().toISOString() })
    .eq('id', claimId)

  if (claimErr) throw new Error(`Failed to approve: ${claimErr.message}`)

  // BOTH claim types draft a voucher (2026-06-12 — benefit claims previously
  // terminated at status flips with no voucher, no pool debit, no GL).
  // Money moves when Principal approves the PV, same as every other payout.
  if (Number(claim.amount) > 0) {
    const amount = Number(claim.amount)
    const sourcePool = claim.source_pool ?? 'venture_pool'
    const { count } = await supabase
      .from('payment_vouchers')
      .select('*', { count: 'exact', head: true })
    const period = new Date().toISOString().slice(0, 7).replace('-', '')
    const voucherNo = `HV-PV-${period}-${String((count ?? 0) + 1).padStart(4, '0')}`

    // Default the paying bank to primary — a debit PV approved with NO bank
    // posts the GL bank credit (fallback 3000) without debiting the cache.
    // Finance can switch the bank on the PV edit page before approval.
    const { data: primaryBank } = await supabase
      .from('bank_accounts')
      .select('id')
      .eq('is_primary', true)
      .eq('status', 'active')
      .maybeSingle()

    const { data: voucher, error: vchErr } = await supabase
      .from('payment_vouchers')
      .insert({
        voucher_no: voucherNo,
        voucher_type: 'claim_payout',
        direction: 'debit',
        status: 'pending_approval',
        amount,
        payee_name: claim.claimant_name,
        bank_account_id: primaryBank?.id ?? null,
        description: `Claim payout: ${claim.claimant_name} — ${claim.description ?? ''}`.trim(),
        payment_method: 'bank_transfer',
        source_pool: sourcePool,
        reference_type: 'claim',
        reference_id: claimId,
        created_by: user.id,
      })
      .select('id')
      .single()

    if (vchErr) throw new Error(`Failed to draft claim voucher: ${vchErr.message}`)

    // Post-mig 238: PVS rows must reference a chart_of_accounts code via
    // account_code (NOT NULL). Claims book to G&A Expenses (9000) by default
    // — Principal can override at approval time if needed.
    const { error: pvsErr } = await supabase.from('payment_voucher_sources').insert({
      voucher_id: voucher.id,
      pool: sourcePool,
      amount,
      account_code: '9000',
    })
    if (pvsErr) throw new Error(`Claim voucher ${voucherNo} drafted but source row failed: ${pvsErr.message}`)

    const { error: apprErr } = await supabase.from('approval_requests').insert({
      request_type: 'payment_voucher',
      reference_id: voucher.id,
      reference_table: 'payment_vouchers',
      submitted_by: user.id,
      description: `${voucherNo}: Claim payout — ${claim.claimant_name}`,
      amount,
      status: 'pending',
      workflow_state: 'submitted',
    })
    if (apprErr) throw new Error(`Claim voucher ${voucherNo} drafted but approval queue entry failed: ${apprErr.message}`)

    const { error: linkErr } = await supabase
      .from('claims')
      .update({ voucher_id: voucher.id })
      .eq('id', claimId)
    if (linkErr) throw new Error(`Claim voucher ${voucherNo} drafted but linking back to the claim failed: ${linkErr.message}`)
  }

  revalidatePath('/claims')
  revalidatePath('/approvals')
  revalidatePath('/payments')
  revalidatePath('/dashboard')
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

  // Finance marks pool claims paid, HR marks benefit claims paid
  if (claim.claim_type === 'project' && user.role !== 'finance' && user.role !== 'principal') {
    throw new Error('Only Finance or Principal can mark pool claims as paid')
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
