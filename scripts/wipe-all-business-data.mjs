// wipe-all-business-data.mjs
//
// Full wipe of all transactional / business data before re-entering the
// financial records under the new payment-category / P&L classification model.
//
// USAGE
//   node --env-file=.env.local scripts/wipe-all-business-data.mjs             (dry-run)
//   node --env-file=.env.local scripts/wipe-all-business-data.mjs --dry-run   (dry-run)
//   node --env-file=.env.local scripts/wipe-all-business-data.mjs --confirm   (REAL WIPE)
//
// FLAGS
//   --dry-run   (default) Print current row counts per table, delete nothing.
//   --confirm   Actually delete all rows in the tables below and zero bank
//               balances. Irreversible — use only after a full DB backup.
//
// TABLES WIPED (children-first FK order)
//   journal_lines, journal_entries,
//   payment_attachments, payment_voucher_sources, payment_vouchers,
//   fund_source_repayments, repayments, overdue_records, loans, fund_sources,
//   monthly_statement_lines, monthly_statements, invoices,
//   credit_notes, dept_payment_requests, invoice_submission_requests,
//   access_log, commission_inputs,
//   dept_pools, operating_pools, venture_pool, invoice_payout_pool,
//   alliance_bank_pool, hv_operating_fund,
//   operating_fund_transactions (alias for operating_pools txns),
//   director_payouts, director_ctc, salary_pool, payroll_payment_requests,
//   payroll_runs, hr_staff_allocation, hr_pool_allocation, hr_staff_costs,
//   hr_monthly_payroll, hr_staff_salary_history, monthly_headcounts,
//   hr_cost_submissions, claims, approval_requests,
//   base_rate_history, config_audit_log
//
// ALSO WIPED (special — no PK named id)
//   period_locks (if it has rows — cleared via is_locked predicate)
//
// TABLES KEPT (untouched rows)
//   users, companies, departments, directors, bank_accounts (rows kept,
//   only current_balance zeroed), payment_categories, treasury_config,
//   tier_config, overdue_config, epf_* / socso_* / eis_* / pcb_* lookup
//   tables, rent_splits, utility_splits, service_contracts,
//   chart_of_accounts, periods, commission_rules, hr_import_templates,
//   statement_categories, auth.* tables.

import { createClient } from '@supabase/supabase-js'

// ── env ─────────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env')
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY)

// ── flags ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const DRY_RUN = !args.includes('--confirm')

// ── wipe list (children before parents, FK-safe order) ──────────────────────
// All tables use `id` UUID PK — delete via .not('id', 'is', null).
const WIPE_TABLES = [
  // GL
  'journal_lines',
  'journal_entries',
  // Vouchers
  'payment_attachments',
  'payment_voucher_sources',
  // payment_vouchers handled specially below (pvs-sum trigger)
  // Treasury
  'fund_source_repayments',
  'repayments',
  'overdue_records',
  'loans',
  'fund_sources',
  // Statements / billing
  'monthly_statement_lines',
  'monthly_statements',
  'credit_notes',
  // invoices handled after payment_vouchers
  // Payment requests (mig 173/177)
  'dept_payment_requests',
  'invoice_submission_requests',
  // Pools (children before parents)
  'dept_pools',
  'operating_pools',
  'alliance_bank_pool',
  'hv_operating_fund',
  'venture_pool',
  'invoice_payout_pool',
  // Director salary
  'director_payouts',
  'director_ctc',
  'salary_pool',
  // HR / payroll
  'payroll_payment_requests',
  'payroll_runs',
  'hr_staff_allocation',
  'hr_pool_allocation',
  'hr_staff_costs',
  'hr_monthly_payroll',
  'hr_staff_salary_history',
  'monthly_headcounts',
  'hr_cost_submissions',
  'commission_inputs',
  // Claims & approvals
  'claims',
  'approval_requests',
  // Misc transactional logs
  'access_log',
  'base_rate_history',
  'config_audit_log',
]

// ── helpers ──────────────────────────────────────────────────────────────────
async function rowCount(table) {
  const { count, error } = await admin
    .from(table)
    .select('*', { count: 'exact', head: true })
  if (error) {
    // 42P01 = table does not exist
    if (/42P01|Not Found/i.test(error.message)) return null
    return `err:${error.code ?? error.message}`
  }
  return count ?? 0
}

async function safeDelete(table) {
  const before = await rowCount(table)
  if (before === null) {
    console.log(`  — ${table}: skipped (table not found)`)
    return { table, before: 0, after: 0, skipped: true }
  }
  if (typeof before === 'string') {
    console.log(`  ⚠ ${table}: count error — ${before}`)
    return { table, before: 0, after: 0, error: before }
  }

  const { error } = await admin.from(table).delete().not('id', 'is', null)
  if (error) {
    if (/42P01|Not Found/i.test(error.message)) {
      console.log(`  — ${table}: skipped (table not found)`)
      return { table, before, after: before, skipped: true }
    }
    console.log(`  ⚠ ${table} (before=${before}): ${error.message}`)
    return { table, before, after: before, error: error.message }
  }

  const after = await rowCount(table)
  console.log(`  ✓ ${table}: ${before} → ${after ?? 0}`)
  return { table, before, after: after ?? 0 }
}

async function safeDeleteCreatedAt(table) {
  // For tables without a guaranteed-NOT-NULL `id` column — delete via created_at
  const before = await rowCount(table)
  if (before === null) {
    console.log(`  — ${table}: skipped (table not found)`)
    return
  }
  const { error } = await admin.from(table).delete().gte('created_at', '1900-01-01')
  if (error) {
    console.log(`  ⚠ ${table}: ${error.message}`)
    return
  }
  const after = await rowCount(table)
  console.log(`  ✓ ${table}: ${before} → ${after ?? 0}`)
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (DRY_RUN) {
    console.log('╔══════════════════════════════════════════════════════════════╗')
    console.log('║  DRY-RUN — printing row counts only, nothing will be deleted  ║')
    console.log('║  Pass --confirm to actually wipe.                             ║')
    console.log('╚══════════════════════════════════════════════════════════════╝')
    console.log()
    console.log('=== CURRENT ROW COUNTS ===')

    // Full list to count (including tables handled specially)
    const ALL_TABLES = [
      ...WIPE_TABLES,
      'payment_vouchers',
      'invoices',
      'period_locks',
    ]

    let total = 0
    for (const t of ALL_TABLES) {
      const c = await rowCount(t)
      if (c === null) {
        console.log(`  — ${t}: (table not found)`)
      } else if (typeof c === 'string') {
        console.log(`  ⚠ ${t}: ${c}`)
      } else {
        console.log(`  ${t}: ${c}`)
        total += c
      }
    }
    console.log()
    console.log(`  TOTAL rows that would be deleted: ${total}`)
    console.log()
    console.log('Run with --confirm to perform the actual wipe.')
    return
  }

  // ── CONFIRM mode ──────────────────────────────────────────────────────────
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║  CONFIRM MODE — deleting all transactional data               ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log()

  // --- BEFORE counts ---
  console.log('=== BEFORE ===')
  const ALL_TABLES = [
    ...WIPE_TABLES,
    'payment_vouchers',
    'invoices',
    'period_locks',
  ]
  for (const t of ALL_TABLES) {
    const c = await rowCount(t)
    if (c === null) console.log(`  — ${t}: (table not found)`)
    else if (typeof c === 'string') console.log(`  ⚠ ${t}: ${c}`)
    else console.log(`  ${t}: ${c}`)
  }

  console.log()
  console.log('=== WIPING (FK-safe order) ===')

  // Step 1: Flip all active payment_vouchers to voided so the pvs_sum_matches
  //         trigger won't block the deletion of payment_voucher_sources rows.
  const { error: voidErr } = await admin
    .from('payment_vouchers')
    .update({ status: 'voided' })
    .in('status', ['draft', 'pending_approval', 'approved', 'paid'])
  if (voidErr) {
    console.log(`  ⚠ voiding vouchers: ${voidErr.message}`)
  } else {
    console.log('  ✓ vouchers flipped to voided (bypass pvs-sum trigger)')
  }

  // Step 2: Delete tables in FK-safe order
  for (const t of WIPE_TABLES) {
    if (t === 'credit_notes') {
      // Delete invoices before credit_notes (credit_notes may FK -> invoices)
      await safeDelete('payment_vouchers')
      await safeDelete('invoices')
    }
    await safeDelete(t)
  }

  // Step 3: Wipe period_locks (may not have id column — use created_at)
  await safeDeleteCreatedAt('period_locks')

  // --- AFTER counts ---
  console.log()
  console.log('=== AFTER ===')
  for (const t of ALL_TABLES) {
    const c = await rowCount(t)
    if (c === null) console.log(`  — ${t}: (table not found)`)
    else if (typeof c === 'string') console.log(`  ⚠ ${t}: ${c}`)
    else console.log(`  ${t}: ${c}`)
  }

  // Step 4: Zero bank balances
  console.log()
  console.log('=== RESETTING BANK BALANCES ===')
  const { data: banks, error: bankFetchErr } = await admin
    .from('bank_accounts')
    .select('id, bank_name, current_balance')
  if (bankFetchErr) {
    console.log(`  ⚠ fetching bank_accounts: ${bankFetchErr.message}`)
  } else {
    for (const b of banks ?? []) {
      const { error: updateErr } = await admin
        .from('bank_accounts')
        .update({ current_balance: 0 })
        .eq('id', b.id)
      if (updateErr) {
        console.log(`  ⚠ ${b.bank_name}: ${updateErr.message}`)
      } else {
        console.log(`  ✓ ${b.bank_name}: ${Number(b.current_balance).toLocaleString()} → 0`)
      }
    }
  }

  console.log()
  console.log('=== DONE ===')
  console.log('All transactional data wiped. Bank balances zeroed.')
  console.log('You may now re-enter data under the new classification model.')
}

main().catch((e) => {
  console.error('FATAL:', e.message)
  process.exit(1)
})
