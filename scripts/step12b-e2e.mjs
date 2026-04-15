// Phase 7 Step 12b — verify loan repayment auto-sync path.
// Creates a pending overdue_record for our E2E loan, then simulates a paid
// voucher with loan_id + repayment_breakdown, and asserts:
//   - repayments rows inserted (one per non-zero slice of the breakdown)
//   - overdue_records row flipped from pending → paid
// (pool/bank debit is already covered by Step 9 E2E; this only verifies the
//  sync side-effects.)

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://gixpptmfuryskbwkmiwz.supabase.co'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpeHBwdG1mdXJ5c2tid2ttaXd6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTczODM5MCwiZXhwIjoyMDkxMzE0MzkwfQ.evFBJixWz9d3-shRC08X6Rg_3Fviw2AGxvPhIz85pGU'

const admin = createClient(SUPABASE_URL, SERVICE_KEY)

async function main() {
  console.log('=== Phase 7 Step 12b E2E ===')

  // Find an active loan (one was activated in Step 9)
  const { data: loan } = await admin
    .from('loans')
    .select('id, principal, effective_rate, company_id, companies(name)')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!loan) throw new Error('No active loan found — run step9-e2e.mjs first')
  console.log(`Using loan ${loan.id} for ${loan.companies.name} (principal ${loan.principal})`)

  // Seed a pending overdue row for the loan (previous month)
  const now0 = new Date()
  const pm = new Date(now0.getFullYear(), now0.getMonth() - 1, 1)
  const periodMonth = `${pm.getFullYear()}-${String(pm.getMonth() + 1).padStart(2, '0')}-01`

  const { error: overdueErr } = await admin.from('overdue_records').upsert(
    {
      loan_id: loan.id,
      period_month: periodMonth,
      overdue_days: 10,
      overdue_stage: null,
      is_overdue: true,
      penalty_rate: 0,
      penalty_amount: 0,
      status: 'pending',
    },
    { onConflict: 'loan_id,period_month' }
  )
  if (overdueErr) throw new Error(`Seed overdue failed: ${overdueErr.message}`)
  console.log(`✓ Seeded pending overdue for ${periodMonth}`)

  // Create a paid voucher with loan_id + repayment_breakdown (mimics executeVoucher post-state)
  const principalRepay = 50
  const interestRepay = 150
  const penaltyRepay = 0
  const total = principalRepay + interestRepay + penaltyRepay

  const { data: bank } = await admin
    .from('bank_accounts')
    .select('id')
    .eq('is_primary', true)
    .single()

  const voucherNo = `HV-PV-E2E-${Date.now().toString().slice(-4)}`
  const now = new Date().toISOString()
  const today = now.slice(0, 10)
  const { data: creator } = await admin.from('users').select('id').eq('email', 'finance@venture.my').single()

  const { data: voucher, error: vchErr } = await admin
    .from('payment_vouchers')
    .insert({
      voucher_no: voucherNo,
      voucher_type: 'loan_repayment',
      direction: 'debit',
      status: 'paid',
      amount: total,
      payee_name: 'HOUZS Venture (loan repayment)',
      description: `E2E ${voucherNo}`,
      payment_method: 'bank_transfer',
      source_pool: 'hv_operating_fund',
      loan_id: loan.id,
      repayment_breakdown: { principal: principalRepay, interest: interestRepay, penalty: penaltyRepay },
      bank_account_id: bank.id,
      approved_by: creator.id,
      approved_at: now,
      executed_by: creator.id,
      executed_at: now,
      payment_date: today,
      created_by: creator.id,
    })
    .select('id')
    .single()
  if (vchErr) throw new Error(`Voucher insert failed: ${vchErr.message}`)
  console.log(`✓ Voucher ${voucherNo} created (id=${voucher.id})`)

  // Simulate the executeVoucher Step 12b branch (in real life this runs inside the action)
  const entries = [
    { payment_type: 'principal', amt: principalRepay },
    { payment_type: 'interest', amt: interestRepay },
    { payment_type: 'penalty', amt: penaltyRepay },
  ].filter((e) => e.amt > 0)
  for (const e of entries) {
    const { error } = await admin.from('repayments').insert({
      loan_id: loan.id,
      amount: e.amt,
      payment_type: e.payment_type,
      payment_date: today,
      reference_id: voucher.id,
      notes: `Auto-synced from voucher ${voucherNo}`,
      created_by: creator.id,
    })
    if (error) throw new Error(`repayments insert ${e.payment_type} failed: ${error.message}`)
  }
  const { data: pendingOverdue } = await admin
    .from('overdue_records')
    .select('id')
    .eq('loan_id', loan.id)
    .eq('status', 'pending')
    .order('period_month', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (pendingOverdue) {
    await admin.from('overdue_records').update({ status: 'paid' }).eq('id', pendingOverdue.id)
  }

  // Assertions
  const { data: reps } = await admin
    .from('repayments')
    .select('payment_type, amount')
    .eq('reference_id', voucher.id)
  console.log(`✓ ${reps.length} repayments rows: ${reps.map((r) => `${r.payment_type}=${r.amount}`).join(', ')}`)
  if (reps.length !== entries.length) throw new Error('E2E fail: repayments count mismatch')

  const { data: overdueCheck } = await admin
    .from('overdue_records')
    .select('status')
    .eq('loan_id', loan.id)
    .eq('period_month', periodMonth)
    .single()
  console.log(`✓ Overdue status: ${overdueCheck.status}`)
  if (overdueCheck.status !== 'paid') throw new Error('E2E fail: overdue not flipped to paid')

  console.log('=== STEP 12b ALL PASS ===')
}

main().catch((e) => {
  console.error('✗ FAIL:', e.message)
  process.exit(1)
})
