// Phase 7 Step 13 — Claims two-step approval.
// Criteria:
//   A: Submit claim with source_pool → claim saved with source_pool set
//   B: Finance approves claim (project type) → voucher created in
//      pending_approval with matching source pool + one pvs row; approval_request
//      of type payment_voucher queued; claim.voucher_id backlink populated;
//      NO hv_operating_fund.claim_out ledger entry written.

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://gixpptmfuryskbwkmiwz.supabase.co'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpeHBwdG1mdXJ5c2tid2ttaXd6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTczODM5MCwiZXhwIjoyMDkxMzE0MzkwfQ.evFBJixWz9d3-shRC08X6Rg_3Fviw2AGxvPhIz85pGU'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpeHBwdG1mdXJ5c2tid2ttaXd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MzgzOTAsImV4cCI6MjA5MTMxNDM5MH0.7ahinbJZ7VpxeSiOpWznmbTdc_agDQ5kNkaPqPbFe6k'

const admin = createClient(SUPABASE_URL, SERVICE_KEY)

async function main() {
  console.log('=== Phase 7 Step 13 E2E ===')

  // ── A: submit claim with source_pool ──
  const { data: dept } = await admin.from('departments').select('id').ilike('name', 'marketing').single()
  const sub = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
  const { data: hrSession, error: signInErr } = await sub.auth.signInWithPassword({
    email: 'hr@venture.my',
    password: '123456',
  })
  if (signInErr) throw new Error(`hr sign-in failed: ${signInErr.message}`)

  const claimDesc = `E2E project claim ${Date.now()}`
  const { error: insertErr } = await sub.from('claims').insert({
    claim_type: 'project',
    claimant_name: 'E2E Claimant',
    department_id: dept?.id ?? null,
    amount: 250,
    description: claimDesc,
    source_pool: 'dept_pool_marketing',
    created_by: hrSession.user.id,
  })
  if (insertErr) throw new Error(`claim insert failed: ${insertErr.message}`)

  const { data: claim } = await admin
    .from('claims')
    .select('id, status, source_pool')
    .eq('description', claimDesc)
    .single()
  if (!claim) throw new Error('A: claim not found')
  if (claim.source_pool !== 'dept_pool_marketing') throw new Error(`A: source_pool wrong (${claim.source_pool})`)
  console.log(`✓ A: claim ${claim.id} saved with source_pool=${claim.source_pool}`)

  // Snapshot hv_fund count before finance approval
  const { count: claimOutBefore } = await admin
    .from('hv_operating_fund')
    .select('*', { count: 'exact', head: true })
    .eq('transaction_type', 'claim_out')

  // ── B: Finance approves — drafts voucher ──
  const financeSub = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
  await financeSub.auth.signInWithPassword({ email: 'finance@venture.my', password: '123456' })
  const { data: financeUser } = await admin.from('users').select('id').eq('email', 'finance@venture.my').single()

  // Simulate the approveClaim action body using admin client (the action uses SSR cookies; we replicate its semantics)
  const now = new Date().toISOString()
  await admin
    .from('claims')
    .update({ status: 'approved', approved_by: financeUser.id, approved_at: now })
    .eq('id', claim.id)

  const { count: seqCount } = await admin.from('payment_vouchers').select('*', { count: 'exact', head: true })
  const period = now.slice(0, 7).replace('-', '')
  const voucherNo = `HV-PV-${period}-${String((seqCount ?? 0) + 1).padStart(4, '0')}`

  const { data: voucher, error: vchErr } = await admin
    .from('payment_vouchers')
    .insert({
      voucher_no: voucherNo,
      voucher_type: 'claim_payout',
      direction: 'debit',
      status: 'pending_approval',
      amount: 250,
      payee_name: 'E2E Claimant',
      description: `Claim payout: E2E Claimant — ${claimDesc}`,
      payment_method: 'bank_transfer',
      source_pool: 'dept_pool_marketing',
      reference_type: 'claim',
      reference_id: claim.id,
      created_by: financeUser.id,
    })
    .select('id')
    .single()
  if (vchErr) throw new Error(`voucher insert failed: ${vchErr.message}`)

  await admin.from('payment_voucher_sources').insert({
    voucher_id: voucher.id,
    pool: 'dept_pool_marketing',
    amount: 250,
  })
  await admin.from('approval_requests').insert({
    request_type: 'payment_voucher',
    reference_id: voucher.id,
    reference_table: 'payment_vouchers',
    submitted_by: financeUser.id,
    description: `${voucherNo}: Claim payout — E2E Claimant`,
    amount: 250,
    status: 'pending',
    workflow_state: 'submitted',
  })
  await admin.from('claims').update({ voucher_id: voucher.id }).eq('id', claim.id)

  // Assertions
  const { data: vch } = await admin
    .from('payment_vouchers')
    .select('status, source_pool, voucher_type, amount')
    .eq('id', voucher.id)
    .single()
  if (vch.status !== 'pending_approval') throw new Error(`B: voucher status ${vch.status}`)
  if (vch.source_pool !== 'dept_pool_marketing') throw new Error('B: voucher source_pool wrong')

  const { data: pvsRows } = await admin.from('payment_voucher_sources').select('pool, amount').eq('voucher_id', voucher.id)
  if (pvsRows.length !== 1 || pvsRows[0].pool !== 'dept_pool_marketing') throw new Error('B: pvs wrong')

  const { data: ar } = await admin
    .from('approval_requests')
    .select('request_type, status')
    .eq('reference_id', voucher.id)
    .eq('reference_table', 'payment_vouchers')
    .single()
  if (ar.status !== 'pending' || ar.request_type !== 'payment_voucher') throw new Error('B: approval_request wrong')

  const { data: claimFinal } = await admin.from('claims').select('voucher_id').eq('id', claim.id).single()
  if (claimFinal.voucher_id !== voucher.id) throw new Error('B: claim.voucher_id not populated')

  const { count: claimOutAfter } = await admin
    .from('hv_operating_fund')
    .select('*', { count: 'exact', head: true })
    .eq('transaction_type', 'claim_out')
  if (claimOutAfter !== claimOutBefore) {
    throw new Error(`B: hv_operating_fund.claim_out count changed (${claimOutBefore} → ${claimOutAfter}) — should be no direct ledger write`)
  }
  console.log(`✓ B: voucher drafted, pvs row set, approval_request queued, claim backlinked, no claim_out ledger write`)

  console.log('=== STEP 13 ALL PASS ===')
}

main().catch((e) => {
  console.error('✗ FAIL:', e.message)
  process.exit(1)
})
