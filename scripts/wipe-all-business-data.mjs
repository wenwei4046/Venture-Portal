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
//   payment_attachments, payment_voucher_sources,
//   claims, payment_vouchers, invoices,
//   fund_source_repayments, repayments, overdue_records, loans, fund_sources,
//   monthly_statement_lines, monthly_statements,
//   credit_notes, dept_payment_requests, invoice_submission_requests,
//   access_log, commission_inputs,
//   dept_pools, operating_pools, venture_pool, invoice_payout_pool,
//   alliance_bank_pool, hv_operating_fund,
//   operating_fund_transactions (alias for operating_pools txns),
//   director_payouts, director_ctc, salary_pool, payroll_payment_requests,
//   payroll_runs, hr_staff_allocation, hr_pool_allocation, hr_staff_costs,
//   hr_monthly_payroll, hr_staff_salary_history, monthly_headcounts,
//   hr_cost_submissions, approval_requests,
//   base_rate_history, config_audit_log
//
// FK NOTES (why this exact order matters):
//   - payment_vouchers.loan_id (mig 110) and .fund_source_id (mig 118) have
//     no ON DELETE clause → loans/fund_sources can't be deleted while PVs
//     still reference them. So PVs must go first.
//   - claims.voucher_id → payment_vouchers(id) (mig 111) has no ON DELETE →
//     claims must go before payment_vouchers.
//   - invoices may be referenced by credit_notes / monthly_statement_lines,
//     and credit_notes.invoice_id is checked first → invoices after PVs but
//     before credit_notes (handled inline below).
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
//
// CRITICAL ORDER (FK-safe):
//   1. journal_lines (child of journal_entries, no other dependents)
//   2. payment_attachments → payment_voucher_sources (PV children)
//   3. claims (claims.voucher_id → payment_vouchers — must go BEFORE PVs)
//   4. payment_vouchers (special: void-flip first to bypass pvs-sum trigger)
//   5. invoices (PVs may reference invoices via reference_id/reference_type)
//   6. journal_entries (PVs reference JEs via journal_entry_id, no ON DELETE;
//      JEs can only go after PVs are deleted)
//   7. fund_source_repayments → repayments → overdue_records
//   8. loans → fund_sources (PV.loan_id / PV.fund_source_id had to be gone)
//   9. rest unchanged
const WIPE_TABLES = [
  // 1. GL line items (no dependents)
  'journal_lines',
  // 2. PV children
  'payment_attachments',
  'payment_voucher_sources',
  // 3. claims (must precede payment_vouchers — FK voucher_id, mig 111)
  'claims',
  // 4. payment_vouchers — handled inline below (sentinel triggers void-flip +
  //    delete of payment_vouchers AND invoices, so loans/fund_sources are
  //    safe to delete in step 7).
  // 5. Statements / billing children
  'monthly_statement_lines',
  'monthly_statements',
  'credit_notes',
  // 6. Treasury children
  'fund_source_repayments',
  'repayments',
  'overdue_records',
  // 7. Treasury parents (PVs gone by now, so FKs hold)
  'loans',
  'fund_sources',
  // 8. Payment requests (mig 173/177)
  'dept_payment_requests',
  'invoice_submission_requests',
  // 9. Pools (children before parents)
  'dept_pools',
  'operating_pools',
  'alliance_bank_pool',
  'hv_operating_fund',
  'venture_pool',
  'invoice_payout_pool',
  // 10. Director salary
  'director_payouts',
  'director_ctc',
  'salary_pool',
  // 11. HR / payroll
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
  // 12. Approvals (after every reference_id row is gone)
  'approval_requests',
  // 13. Misc transactional logs
  'access_log',
  'base_rate_history',
  'config_audit_log',
]

// Sentinel marker — the loop in step 2 of `main()` injects payment_vouchers +
// invoices deletion AFTER 'claims' (claims FK PV) and BEFORE 'monthly_statement_lines'
// (so that statement_line.invoice_id FK stays valid until invoices go).
const PV_INVOICE_SENTINEL_AFTER = 'claims'

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
  if (before === 0) {
    console.log(`  ✓ ${table}: 0 → 0 (already empty)`)
    return { table, before: 0, after: 0 }
  }

  // `.select('id')` is load-bearing: without it, supabase-js sends
  // `Prefer: return=minimal` and the DELETE silently no-ops on header
  // tables (payment_vouchers, invoices, journal_entries, fund_sources)
  // — error is null, 0 rows affected, no signal. Appending `.select(…)`
  // forces `Prefer: return=representation`, which both makes the DELETE
  // actually run AND returns the deleted rows so we can count them.
  // Reproduced 2026-05-14 against test project kylcwsxugfbwcofgzhfm.
  const { data: deleted, error } = await admin
    .from(table)
    .delete()
    .not('id', 'is', null)
    .select('id')
  if (error) {
    if (/42P01|Not Found/i.test(error.message)) {
      console.log(`  — ${table}: skipped (table not found)`)
      return { table, before, after: before, skipped: true }
    }
    console.log(`  ⚠ ${table} (before=${before}): ${error.message}`)
    return { table, before, after: before, error: error.message }
  }

  const after = await rowCount(table)
  const afterCount = typeof after === 'number' ? after : 0
  const deletedCount = deleted?.length ?? 0

  // Fail loud if rows remain after a no-error DELETE. This catches the
  // silent-failure mode the .select('id') chain is supposed to fix —
  // if it ever resurfaces (different table, new trigger, PostgREST
  // upgrade), the final assertion in main() will exit non-zero.
  if (afterCount > 0) {
    console.log(`  ⚠ ${table}: ${before} → ${afterCount}  SILENT FAILURE (deleted ${deletedCount}, ${afterCount} rows still present)`)
    return { table, before, after: afterCount, error: 'silent-zero' }
  }

  console.log(`  ✓ ${table}: ${before} → 0 (deleted ${deletedCount})`)
  return { table, before, after: 0, deletedCount }
}

async function safeDeleteCreatedAt(table) {
  // For tables without a guaranteed-NOT-NULL `id` column — delete via created_at
  const before = await rowCount(table)
  if (before === null) {
    console.log(`  — ${table}: skipped (table not found)`)
    return { table, before: 0, after: 0, skipped: true }
  }
  if (typeof before === 'string') {
    console.log(`  ⚠ ${table}: count error — ${before}`)
    return { table, before: 0, after: 0, error: before }
  }
  if (before === 0) {
    console.log(`  ✓ ${table}: 0 → 0 (already empty)`)
    return { table, before: 0, after: 0 }
  }
  const { data: deleted, error } = await admin
    .from(table)
    .delete()
    .gte('created_at', '1900-01-01')
    .select('created_at')
  if (error) {
    console.log(`  ⚠ ${table}: ${error.message}`)
    return { table, before, after: before, error: error.message }
  }
  const after = await rowCount(table)
  const afterCount = typeof after === 'number' ? after : 0
  if (afterCount > 0) {
    console.log(`  ⚠ ${table}: ${before} → ${afterCount}  SILENT FAILURE (deleted ${deleted?.length ?? 0})`)
    return { table, before, after: afterCount, error: 'silent-zero' }
  }
  console.log(`  ✓ ${table}: ${before} → 0 (deleted ${deleted?.length ?? 0})`)
  return { table, before, after: 0 }
}

async function safeDeletePeriodLocks() {
  // period_locks PK is (period_month) — no `id` and no `created_at`. Delete
  // every row by filtering on period_month (a date column, NOT NULL).
  const table = 'period_locks'
  const before = await rowCount(table)
  if (before === null) {
    console.log(`  — ${table}: skipped (table not found)`)
    return { table, before: 0, after: 0, skipped: true }
  }
  if (typeof before === 'string') {
    console.log(`  ⚠ ${table}: count error — ${before}`)
    return { table, before: 0, after: 0, error: before }
  }
  if (before === 0) {
    console.log(`  ✓ ${table}: 0 → 0 (already empty)`)
    return { table, before: 0, after: 0 }
  }
  const { data: deleted, error } = await admin
    .from(table)
    .delete()
    .gte('period_month', '1900-01-01')
    .select('period_month')
  if (error) {
    console.log(`  ⚠ ${table}: ${error.message}`)
    return { table, before, after: before, error: error.message }
  }
  const after = await rowCount(table)
  const afterCount = typeof after === 'number' ? after : 0
  if (afterCount > 0) {
    console.log(`  ⚠ ${table}: ${before} → ${afterCount}  SILENT FAILURE (deleted ${deleted?.length ?? 0})`)
    return { table, before, after: afterCount, error: 'silent-zero' }
  }
  console.log(`  ✓ ${table}: ${before} → 0 (deleted ${deleted?.length ?? 0})`)
  return { table, before, after: 0 }
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
      'journal_entries',
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
    'journal_entries',
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
    await safeDelete(t)
    if (t === PV_INVOICE_SENTINEL_AFTER) {
      // claims are gone → delete payment_vouchers (its child sources rows are
      // already gone from step 1, and the trigger was disarmed via the
      // void-flip above). Then invoices, before monthly_statement_lines and
      // credit_notes which may FK into invoices. THEN journal_entries — PVs
      // reference JEs via journal_entry_id (no ON DELETE), so JEs can only
      // be safely deleted after PVs are gone.
      await safeDelete('payment_vouchers')
      await safeDelete('invoices')
      await safeDelete('journal_entries')
    }
  }

  // Step 3: Wipe period_locks (uses period_month column, no created_at)
  await safeDeletePeriodLocks()

  // --- AFTER counts + assertion ---
  // Every wipe target must be at 0 rows. If any aren't, the silent-failure
  // mode resurfaced — exit non-zero so callers (CI, manual cycles, wrapper
  // scripts) don't proceed to re-enter data on top of orphans.
  console.log()
  console.log('=== AFTER ===')
  const orphans = []
  for (const t of ALL_TABLES) {
    const c = await rowCount(t)
    if (c === null) console.log(`  — ${t}: (table not found)`)
    else if (typeof c === 'string') console.log(`  ⚠ ${t}: ${c}`)
    else {
      console.log(`  ${t}: ${c}`)
      if (c > 0) orphans.push({ table: t, count: c })
    }
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

  if (orphans.length > 0) {
    console.log()
    console.log('=== FATAL: wipe completed but rows remain ===')
    for (const o of orphans) console.log(`  ${o.table}: ${o.count} rows`)
    console.log('Future re-entry of financial data will collide with these orphans.')
    console.log('Investigate before re-running. (Exit 2.)')
    process.exit(2)
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
