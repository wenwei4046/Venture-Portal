// scripts/wipe-payroll-test-data.mjs
//
// One-off data reset for the payroll flow refactor (approve_payroll_run
// becomes data-only in migration 142). All existing portal records in
// payroll-related tables are test data — safe to wipe.
//
// Usage:
//   node --env-file=.env.local scripts/wipe-payroll-test-data.mjs
//
// Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
//
// What this wipes (scope approved 2026-04-17):
//   - payment_vouchers WHERE voucher_type IN ('salary_payout', 'payroll_bank_transfer')
//     + cascade on payment_voucher_sources
//   - alliance_bank_pool (all rows)
//   - hr_monthly_payroll (all rows)
//   - approval_requests WHERE request_type IN ('payroll_run', 'hr_costing', 'payroll_bank_transfer')
//   - payroll_runs (all rows)
//   - hr_cost_submissions (all rows)
//
// NOT touched (preserved):
//   - hr_staff_costs (staff master)
//   - director_payouts, director_ctc (director salary flow — separate cleanup if needed)
//   - dept_pools, hv_operating_fund
//   - bank_accounts, companies
//   - payment_vouchers of other types (loan_repayment, billing_payment, etc.)

import { createClient } from '@supabase/supabase-js'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('✗ Missing env vars (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function countTable(table, filter) {
  let q = supabase.from(table).select('*', { count: 'exact', head: true })
  if (filter) q = filter(q)
  const { count, error } = await q
  if (error) {
    console.error(`  ✗ Count ${table}: ${error.message}`)
    return null
  }
  return count ?? 0
}

async function survey() {
  console.log('\n═══ Current data (what will be deleted) ═══\n')
  const rows = [
    ['payroll_runs', await countTable('payroll_runs')],
    ['hr_monthly_payroll', await countTable('hr_monthly_payroll')],
    ['hr_cost_submissions', await countTable('hr_cost_submissions')],
    ['alliance_bank_pool', await countTable('alliance_bank_pool')],
    [
      'payment_vouchers (salary_payout + payroll_bank_transfer)',
      await countTable('payment_vouchers', q =>
        q.in('voucher_type', ['salary_payout', 'payroll_bank_transfer'])
      ),
    ],
    [
      'approval_requests (payroll_run + hr_costing + payroll_bank_transfer)',
      await countTable('approval_requests', q =>
        q.in('request_type', ['payroll_run', 'hr_costing', 'payroll_bank_transfer'])
      ),
    ],
  ]
  for (const [label, count] of rows) {
    console.log(`  ${label.padEnd(62)} ${count === null ? '???' : String(count).padStart(5)}`)
  }
  console.log('')
}

async function wipe() {
  // Order respects FK constraints:
  //   payment_voucher_sources → payment_vouchers (CASCADE handled by DB)
  //   alliance_bank_pool references payment_vouchers via reference_id (TEXT, no FK)
  //   approval_requests.reference_id similar, no FK
  //   payroll_runs.approval_id → approval_requests (SET NULL on delete? depends on schema)
  //
  // Safe order: leaves → root
  const steps = [
    {
      label: 'alliance_bank_pool',
      run: () => supabase.from('alliance_bank_pool').delete().gte('amount', 0),
    },
    {
      label: 'hr_monthly_payroll',
      run: () =>
        supabase
          .from('hr_monthly_payroll')
          .delete()
          .gte('basic_salary', 0),
    },
    {
      label: 'payment_vouchers (salary_payout, payroll_bank_transfer)',
      run: () =>
        supabase
          .from('payment_vouchers')
          .delete()
          .in('voucher_type', ['salary_payout', 'payroll_bank_transfer']),
    },
    {
      label: 'payroll_runs',
      run: () =>
        supabase
          .from('payroll_runs')
          .delete()
          .gte('total_amount', 0),
    },
    {
      label: 'hr_cost_submissions',
      run: () =>
        supabase
          .from('hr_cost_submissions')
          .delete()
          .not('id', 'is', null),
    },
    {
      label: 'approval_requests (payroll_run, hr_costing, payroll_bank_transfer)',
      run: () =>
        supabase
          .from('approval_requests')
          .delete()
          .in('request_type', ['payroll_run', 'hr_costing', 'payroll_bank_transfer']),
    },
  ]

  console.log('═══ Wiping ═══\n')
  for (const step of steps) {
    process.stdout.write(`  ${step.label.padEnd(62)}`)
    const { error } = await step.run()
    if (error) {
      console.log(' ✗ ' + error.message)
    } else {
      console.log(' ✓')
    }
  }
  console.log('')
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log(' Payroll flow refactor — test data reset')
  console.log(' Target: ' + SUPABASE_URL)
  console.log('═══════════════════════════════════════════════════════════')

  await survey()

  const rl = readline.createInterface({ input, output })
  const answer = await rl.question('Type "WIPE" to confirm deletion (anything else aborts): ')
  rl.close()

  if (answer.trim() !== 'WIPE') {
    console.log('\nAborted. No data deleted.')
    process.exit(0)
  }

  await wipe()

  console.log('═══ Post-wipe counts ═══\n')
  await survey()

  console.log('Done. Next:')
  console.log('  1. Apply migration 142 (supabase db push or CI/CD)')
  console.log('  2. Test the new data-only approve_payroll_run flow as HR → Principal')
}

main().catch(err => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
