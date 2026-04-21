// One-shot cleanup for tables not covered by wipe-test-data.mjs or
// wipe-hr-test-data.mjs after the Phase 4 refactor:
//   - hr_staff_allocation (new, blocks hr_staff_costs delete)
//   - hr_staff_costs (staff master)
//   - dept_payment_requests (new, mig 173)
//   - invoice_submission_requests (new, mig 177)
//   - approval_requests (remaining rows not tied to payroll_runs)

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://gixpptmfuryskbwkmiwz.supabase.co'
const SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpeHBwdG1mdXJ5c2tid2ttaXd6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTczODM5MCwiZXhwIjoyMDkxMzE0MzkwfQ.evFBJixWz9d3-shRC08X6Rg_3Fviw2AGxvPhIz85pGU'

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
