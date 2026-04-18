// Test-only: top up each Dept Pool to RM 100,000, funded from Hong Leong Bank.
// Used to set a clean starting state for E2E-testing the full HR payroll flow.
//
// What it does:
//   1. Reset HL Bank balance to RM 1,000,000 (float for the test run)
//   2. For each of the 5 Dept Pools (HR / Finance / Director Office /
//      Director / Marketing), insert a dept_pools np_in row bringing the
//      balance up to RM 100,000.
//   3. Debit HL Bank by the total top-up so bank + pool ledger tally.
//
// Usage: node --env-file=.env.local scripts/seed-pool-topup.mjs

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY)

const TARGET = 100000
const INITIAL_HL_FLOAT = 1000000
const DEPT_NAMES = ['HR', 'Finance', 'Director Office', 'Director', 'Marketing']

async function main() {
  // Fetch HL bank, departments, current balances, and an admin user id.
  const [{ data: hl }, { data: depts }, { data: balances }, { data: principal }] =
    await Promise.all([
      admin.from('bank_accounts').select('id, bank_name, current_balance')
        .eq('bank_name', 'Hong Leong Bank').single(),
      admin.from('departments').select('id, name').in('name', DEPT_NAMES),
      admin.from('dept_pool_balances').select('department_id, balance'),
      admin.from('users').select('id').eq('role', 'principal').limit(1).single(),
    ])

  if (!hl) throw new Error('Hong Leong Bank not found')
  if (!depts || depts.length !== DEPT_NAMES.length) {
    throw new Error(`Expected ${DEPT_NAMES.length} departments, found ${depts?.length ?? 0}`)
  }
  if (!principal) throw new Error('No principal user — needed for created_by')

  const balMap = new Map(
    (balances ?? []).map((b) => [b.department_id, Number(b.balance)])
  )

  console.log('=== BEFORE ===')
  console.log(`  ${hl.bank_name}: RM ${Number(hl.current_balance).toFixed(2)}`)
  for (const name of DEPT_NAMES) {
    const dept = depts.find((d) => d.name === name)
    const bal = dept ? balMap.get(dept.id) ?? 0 : 0
    console.log(`  ${name}: RM ${bal.toFixed(2)}`)
  }

  // Step 1: reset HL float
  const { error: hlErr1 } = await admin
    .from('bank_accounts')
    .update({ current_balance: INITIAL_HL_FLOAT })
    .eq('id', hl.id)
  if (hlErr1) throw new Error(`HL initial set: ${hlErr1.message}`)
  console.log(`\n=== HL Bank float set to RM ${INITIAL_HL_FLOAT.toLocaleString()} ===`)

  // Step 2: top up each pool to TARGET
  let totalTopup = 0
  console.log('\n=== TOPPING UP POOLS ===')
  for (const name of DEPT_NAMES) {
    const dept = depts.find((d) => d.name === name)
    if (!dept) continue
    const current = balMap.get(dept.id) ?? 0
    const delta = Math.round((TARGET - current) * 100) / 100
    if (delta <= 0) {
      console.log(`  ⊘ ${name}: already at RM ${current.toFixed(2)} (>= target)`)
      continue
    }
    const { error } = await admin.from('dept_pools').insert({
      department_id: dept.id,
      transaction_type: 'np_in',
      amount: delta,
      description: `Test top-up from Hong Leong Bank — bring ${name} pool to RM ${TARGET.toLocaleString()}`,
      created_by: principal.id,
    })
    if (error) {
      console.log(`  ⚠ ${name}: ${error.message}`)
      continue
    }
    console.log(`  ✓ ${name}: +RM ${delta.toFixed(2)} (${current.toFixed(2)} → ${TARGET.toFixed(2)})`)
    totalTopup += delta
  }

  // Step 3: debit HL by total top-up
  const finalHL = Math.round((INITIAL_HL_FLOAT - totalTopup) * 100) / 100
  const { error: hlErr2 } = await admin
    .from('bank_accounts')
    .update({ current_balance: finalHL })
    .eq('id', hl.id)
  if (hlErr2) throw new Error(`HL debit: ${hlErr2.message}`)

  // Verify
  const { data: afterBalances } = await admin
    .from('dept_pool_balances')
    .select('department_id, balance')
  const afterMap = new Map(
    (afterBalances ?? []).map((b) => [b.department_id, Number(b.balance)])
  )

  console.log('\n=== AFTER ===')
  console.log(`  ${hl.bank_name}: RM ${finalHL.toLocaleString()}`)
  let sumPools = 0
  for (const name of DEPT_NAMES) {
    const dept = depts.find((d) => d.name === name)
    const bal = dept ? afterMap.get(dept.id) ?? 0 : 0
    sumPools += bal
    console.log(`  ${name}: RM ${bal.toFixed(2)}`)
  }
  console.log(`  (sum of 5 pools = RM ${sumPools.toLocaleString()})`)

  console.log('\n=== TALLY CHECK ===')
  console.log(`  HL initial float:   RM ${INITIAL_HL_FLOAT.toLocaleString()}`)
  console.log(`  HL debit (top-ups): RM ${totalTopup.toFixed(2)}`)
  console.log(`  HL final balance:   RM ${finalHL.toLocaleString()}`)
  console.log(`  Pool total now:     RM ${sumPools.toLocaleString()}`)
  const reconcile = Math.abs(INITIAL_HL_FLOAT - finalHL - totalTopup) < 0.01
  console.log(`  HL decrease == top-up total? ${reconcile ? '✅' : '❌'}`)
}

main().catch((e) => {
  console.error('FAIL:', e.message)
  process.exit(1)
})
