// One-shot cleanup for tables not covered by wipe-test-data.mjs or
// wipe-hr-test-data.mjs after the Phase 4 refactor:
//   - hr_staff_allocation (new, blocks hr_staff_costs delete)
//   - hr_staff_costs (staff master)
//   - dept_payment_requests (new, mig 173)
//   - invoice_submission_requests (new, mig 177)
//   - approval_requests (remaining rows not tied to payroll_runs)

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    '✗ Missing env vars. Expected NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local'
  )
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY)

async function wipe(table, filter = (q) => q.not('id', 'is', null)) {
  const { count: before } = await admin.from(table).select('*', { count: 'exact', head: true })
  const { error } = await filter(admin.from(table).delete())
  if (error) {
    console.log(`  ⚠ ${table} (before=${before}): ${error.message}`)
    return
  }
  const { count: after } = await admin.from(table).select('*', { count: 'exact', head: true })
  console.log(`  ✓ ${table}: ${before} → ${after}`)
}

async function main() {
  console.log('=== REMAINING CLEANUP ===')
  await wipe('hr_staff_allocation')
  await wipe('hr_staff_costs')
  await wipe('dept_payment_requests')
  await wipe('invoice_submission_requests')
  await wipe('approval_requests')
  console.log('=== DONE ===')
}

main().catch((e) => {
  console.error('FAIL:', e.message)
  process.exit(1)
})
