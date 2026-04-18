// Wipe HR module test data — staff master + payroll + payment flow + vouchers
// generated via the HR pipeline. Also wipes per-period Director Salary data
// (director_payouts + director_ctc) since those live in the same monthly
// cycle as HR payroll and otherwise block Save & Calculate on a fresh period.
// Does NOT touch master tables: departments, directors, users, bank account
// structure, or treasury config.
//
// Order: children → parents (FK-safe).
//
// Usage: node scripts/wipe-hr-test-data.mjs

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://gixpptmfuryskbwkmiwz.supabase.co'
const SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpeHBwdG1mdXJ5c2tid2ttaXd6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTczODM5MCwiZXhwIjoyMDkxMzE0MzkwfQ.evFBJixWz9d3-shRC08X6Rg_3Fviw2AGxvPhIz85pGU'

const admin = createClient(SUPABASE_URL, SERVICE_KEY)

async function countAll() {
  const tables = [
    'approval_requests',
    'payment_voucher_sources',
    'payment_vouchers',
    'payroll_payment_requests',
    'payroll_runs',
    'hr_monthly_payroll',
    'hr_staff_salary_history',
    'hr_staff_costs',
    'alliance_bank_pool',
    'hr_cost_submissions',
    'monthly_headcounts',
    'director_payouts',
    'director_ctc',
  ]
  const counts = {}
  for (const t of tables) {
    const { count, error } = await admin
      .from(t)
      .select('*', { count: 'exact', head: true })
    counts[t] = error ? `error:${error.code}` : count
  }
  return counts
}

async function deleteAll(table) {
  // Try delete by created_at first (most tables have it)
  const { error } = await admin
    .from(table)
    .delete()
    .gte('created_at', '1900-01-01')
  if (error && !/Not Found|42P01/.test(error.message)) {
    // Fallback: delete by id
    const { error: e2 } = await admin
      .from(table)
      .delete()
      .not('id', 'is', null)
    if (e2) console.log(`  ⚠ ${table}: ${e2.message}`)
    else console.log(`  ✓ ${table} cleared (fallback)`)
    return
  }
  if (error) {
    console.log(`  ⚠ ${table}: ${error.message}`)
    return
  }
  console.log(`  ✓ ${table} cleared`)
}

async function main() {
  console.log('=== BEFORE ===')
  const before = await countAll()
  for (const [t, c] of Object.entries(before)) console.log(`  ${t}: ${c}`)

  console.log('\n=== DELETING (FK-safe order) ===')

  // (1) Flip vouchers to voided so the pvs sum trigger doesn't block deletes.
  //     Only touch vouchers tied to payroll — leave any unrelated vouchers alone.
  const { data: payrollVouchers } = await admin
    .from('payment_vouchers')
    .select('id')
    .or(
      "voucher_type.eq.payroll_bank_transfer,reference_type.eq.payroll_disbursement,reference_type.eq.payroll_payment_request",
    )
  const voucherIds = (payrollVouchers ?? []).map((v) => v.id)
  if (voucherIds.length > 0) {
    await admin
      .from('payment_vouchers')
      .update({ status: 'voided' })
      .in('id', voucherIds)
      .in('status', ['draft', 'pending_approval', 'approved', 'paid'])
    console.log(`  ✓ ${voucherIds.length} payroll voucher(s) flipped to voided`)
  } else {
    console.log('  (no payroll vouchers to void)')
  }

  // (2) Voucher children first
  if (voucherIds.length > 0) {
    await admin
      .from('payment_voucher_sources')
      .delete()
      .in('voucher_id', voucherIds)
    console.log('  ✓ payment_voucher_sources (payroll) cleared')
  }

  // (3) Approval requests tied to these vouchers + payroll_runs
  if (voucherIds.length > 0) {
    await admin
      .from('approval_requests')
      .delete()
      .eq('reference_table', 'payment_vouchers')
      .in('reference_id', voucherIds)
    console.log('  ✓ approval_requests (payroll vouchers) cleared')
  }
  await admin
    .from('approval_requests')
    .delete()
    .in('reference_table', ['payroll_runs'])
  console.log('  ✓ approval_requests (payroll_runs) cleared')

  // (4) payroll_payment_requests (references payroll_runs + payment_vouchers)
  await deleteAll('payroll_payment_requests')

  // (5) Now safe to delete the vouchers themselves
  if (voucherIds.length > 0) {
    const { error } = await admin
      .from('payment_vouchers')
      .delete()
      .in('id', voucherIds)
    if (error) console.log(`  ⚠ payment_vouchers: ${error.message}`)
    else console.log(`  ✓ ${voucherIds.length} payment_vouchers (payroll) cleared`)
  }

  // (6) payroll_runs
  await deleteAll('payroll_runs')

  // (7) alliance_bank_pool (transfer_in / debit transactions from payroll flow)
  await deleteAll('alliance_bank_pool')

  // (8) hr_monthly_payroll
  await deleteAll('hr_monthly_payroll')

  // (9) hr_staff_salary_history
  await deleteAll('hr_staff_salary_history')

  // (10) hr_staff_costs — staff master
  await deleteAll('hr_staff_costs')

  // (11) Older HR cost submissions + headcounts
  await deleteAll('hr_cost_submissions')
  await deleteAll('monthly_headcounts')

  // (12) Director Salary per-period data. director_payouts references
  //      director_ctc rows indirectly via company_id — payouts first.
  await deleteAll('director_payouts')
  await deleteAll('director_ctc')

  console.log('\n=== AFTER ===')
  const after = await countAll()
  for (const [t, c] of Object.entries(after)) console.log(`  ${t}: ${c}`)

  console.log('\n=== DONE ===')
}

main().catch((e) => {
  console.error('FAIL:', e.message)
  process.exit(1)
})
