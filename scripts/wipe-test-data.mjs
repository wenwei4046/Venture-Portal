// Wipe all transactional / test data while preserving structural rows
// (companies, users, departments, directors, bank accounts, base rate,
//  treasury config, categories, chart of accounts, hr_staff_costs).
//
// Order matters due to FK constraints. Children first, then parents.

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://gixpptmfuryskbwkmiwz.supabase.co'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpeHBwdG1mdXJ5c2tid2ttaXd6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTczODM5MCwiZXhwIjoyMDkxMzE0MzkwfQ.evFBJixWz9d3-shRC08X6Rg_3Fviw2AGxvPhIz85pGU'

const admin = createClient(SUPABASE_URL, SERVICE_KEY)

async function countAll() {
  const tables = [
    'approval_requests',
    'payment_attachments',
    'payment_voucher_sources',
    'payment_vouchers',
    'repayments',
    'overdue_records',
    'loans',
    'fund_source_repayments',
    'fund_sources',
    'hr_cost_submissions',
    'monthly_headcounts',
    'monthly_statement_lines',
    'monthly_statements',
    'invoices',
    'claims',
    'director_payouts',
    'invoice_payout_pool',
    'dept_pools',
    'hv_operating_fund',
    'journal_lines',
    'journal_entries',
  ]
  const counts = {}
  for (const t of tables) {
    const { count, error } = await admin.from(t).select('*', { count: 'exact', head: true })
    counts[t] = error ? `error:${error.code}` : count
  }
  return counts
}

async function deleteAll(table) {
  // DELETE with no predicate via .neq of a column that's always NOT NULL — use id
  const { error } = await admin.from(table).delete().gte('created_at', '1900-01-01')
  if (error && !/Not Found|42P01/.test(error.message)) {
    // fallback for tables without created_at
    const { error: e2 } = await admin.from(table).delete().not('id', 'is', null)
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
  // Step 1: flip all vouchers to voided so pvs sum trigger doesn't block deletes
  await admin.from('payment_vouchers').update({ status: 'voided' }).in('status', ['draft', 'pending_approval', 'approved', 'paid'])
  console.log('  ✓ vouchers flipped to voided (bypass pvs trigger)')

  // Step 2: lightweight leaf tables
  await deleteAll('payment_attachments')
  await deleteAll('payment_voucher_sources')
  await deleteAll('repayments')
  await deleteAll('overdue_records')
  await deleteAll('fund_source_repayments')
  await deleteAll('monthly_statement_lines')
  await deleteAll('invoice_payout_pool')
  await deleteAll('journal_lines')
  await deleteAll('director_payouts')
  await deleteAll('dept_pools') // must precede approval_requests (approval_id FK)
  await deleteAll('claims')     // must precede payment_vouchers (voucher_id FK)

  // Step 3: payment_vouchers (drops loan_id / invoice_id / journal_entry_id FKs)
  await deleteAll('payment_vouchers')

  // Step 4: parents that vouchers used to reference
  await deleteAll('loans')
  await deleteAll('fund_sources')
  await deleteAll('monthly_statements')
  await deleteAll('invoices')
  await deleteAll('journal_entries')

  // Step 5: approval_requests (now unreferenced)
  await deleteAll('approval_requests')

  // Step 6: standalone
  await deleteAll('hr_cost_submissions')
  await deleteAll('monthly_headcounts')
  await deleteAll('hv_operating_fund')

  console.log('\n=== RESETTING BANK BALANCES TO 0 ===')
  const { data: banks } = await admin.from('bank_accounts').select('id, bank_name, current_balance')
  for (const b of banks ?? []) {
    await admin.from('bank_accounts').update({ current_balance: 0 }).eq('id', b.id)
    console.log(`  ${b.bank_name}: ${b.current_balance} → 0`)
  }

  console.log('\n=== AFTER ===')
  const after = await countAll()
  for (const [t, c] of Object.entries(after)) console.log(`  ${t}: ${c}`)

  console.log('\n=== DONE ===')
}

main().catch((e) => {
  console.error('FAIL:', e.message)
  process.exit(1)
})
