// Wipe all transactional / test data, then seed 20,000 into each of the 5
// Department Pools (HR / Finance / Director Office / Director / Marketing).
//
// Preserves structural data: users, companies, departments, directors,
// hr_staff_costs, bank_accounts, treasury_config, categories, statutory
// lookups, chart of accounts, etc.
//
// Run with: node --env-file=.env.local scripts/wipe-and-seed.mjs

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env')
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY)

// Tables to wipe, in FK-safe order (children first).
const WIPE_ORDER = [
  'payment_attachments',
  'payment_voucher_sources',
  'credit_notes',
  'monthly_statement_lines',
  'monthly_statements',
  'repayments',
  'fund_source_repayments',
  'overdue_records',
  'claims',
  // payment_vouchers needs the voided-status flip first (pvs-sum trigger);
  // handled separately in main().
  'invoices',
  'service_contracts',
  'loans',
  'fund_sources',
  'hr_monthly_payroll',
  'director_payouts',
  'payroll_payment_requests',
  'payroll_runs',
  'hr_cost_submissions',
  'monthly_headcounts',
  'approval_requests',
  'venture_pool',
  'operating_pools',
  'dept_pools',
  'invoice_payout_pool',
  'access_log',
]

async function safeDelete(table) {
  // Use id-based predicate (every table has id UUID PK).
  const { error } = await admin.from(table).delete().not('id', 'is', null)
  if (error) {
    // Treat "table doesn't exist" as OK (schema evolution).
    if (/42P01|Not Found/i.test(error.message)) {
      console.log(`  — ${table}: skipped (table not found)`)
      return
    }
    console.log(`  ⚠ ${table}: ${error.message}`)
    return
  }
  console.log(`  ✓ ${table} cleared`)
}

async function countTables() {
  const out = {}
  for (const t of WIPE_ORDER) {
    const { count, error } = await admin.from(t).select('*', { count: 'exact', head: true })
    out[t] = error ? `err` : (count ?? 0)
  }
  return out
}

async function resetBanks() {
  const { data: banks } = await admin
    .from('bank_accounts')
    .select('id, bank_name, current_balance')
  for (const b of banks ?? []) {
    await admin.from('bank_accounts').update({ current_balance: 0 }).eq('id', b.id)
    console.log(`  ${b.bank_name}: ${Number(b.current_balance).toLocaleString()} → 0`)
  }
}

async function seedDeptPools() {
  // Get a Principal user for created_by (required on operating_pools + dept_pools).
  const { data: principal } = await admin
    .from('users')
    .select('id, email')
    .eq('role', 'principal')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (!principal) {
    throw new Error('No active Principal user found — cannot seed pools without created_by')
  }

  const period = new Date().toISOString().slice(0, 7) + '-01' // first of this month

  // Get department IDs for Director + Marketing (for dept_pools seed).
  const { data: depts } = await admin
    .from('departments')
    .select('id, name')
    .in('name', ['Director', 'Marketing'])

  const deptByName = new Map((depts ?? []).map((d) => [d.name, d.id]))

  const seedAmount = 20000
  const seedDesc = 'Seed — E2E testing starter balance'

  // operating_pools: hr_opex, finance_opex, director_opex
  for (const poolType of ['hr_opex', 'finance_opex', 'director_opex']) {
    const { error } = await admin.from('operating_pools').insert({
      pool_type: poolType,
      transaction_type: 'adjustment',
      amount: seedAmount,
      period_month: period,
      description: seedDesc,
      created_by: principal.id,
    })
    if (error) console.log(`  ⚠ ${poolType}: ${error.message}`)
    else console.log(`  ✓ ${poolType}: +RM ${seedAmount.toLocaleString()}`)
  }

  // dept_pools: Director, Marketing
  for (const deptName of ['Director', 'Marketing']) {
    const deptId = deptByName.get(deptName)
    if (!deptId) {
      console.log(`  ⚠ ${deptName} dept not found — skipping`)
      continue
    }
    const { error } = await admin.from('dept_pools').insert({
      department_id: deptId,
      transaction_type: 'np_in',
      amount: seedAmount,
      period_month: period,
      description: seedDesc,
      created_by: principal.id,
    })
    if (error) console.log(`  ⚠ dept_pool_${deptName.toLowerCase()}: ${error.message}`)
    else console.log(`  ✓ dept_pool_${deptName.toLowerCase()}: +RM ${seedAmount.toLocaleString()}`)
  }
}

async function main() {
  console.log('=== BEFORE ===')
  const before = await countTables()
  for (const [t, c] of Object.entries(before)) console.log(`  ${t}: ${c}`)

  console.log('\n=== WIPING (FK-safe order) ===')

  // Flip all payment_vouchers to voided first — pvs_sum_matches_voucher trigger
  // blocks deletes on active vouchers because dropping pvs rows breaks the
  // sum invariant on the remaining voucher.
  const { error: voidErr } = await admin
    .from('payment_vouchers')
    .update({ status: 'voided' })
    .in('status', ['draft', 'pending_approval', 'approved', 'paid'])
  if (voidErr) console.log(`  ⚠ voiding vouchers: ${voidErr.message}`)
  else console.log('  ✓ vouchers flipped to voided (bypass pvs-sum trigger)')

  for (const t of WIPE_ORDER) {
    if (t === 'invoices') {
      // payment_vouchers must go before invoices (invoice_id FK). Delete now.
      await safeDelete('payment_vouchers')
    }
    await safeDelete(t)
  }

  console.log('\n=== RESETTING BANK BALANCES ===')
  await resetBanks()

  console.log('\n=== SEEDING 20,000 INTO EACH DEPT POOL ===')
  await seedDeptPools()

  console.log('\n=== AFTER ===')
  const after = await countTables()
  for (const [t, c] of Object.entries(after)) console.log(`  ${t}: ${c}`)

  console.log('\n=== DONE ===')
}

main().catch((e) => {
  console.error('FAIL:', e.message)
  console.error(e)
  process.exit(1)
})
