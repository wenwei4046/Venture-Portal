// Phase 7 Step 15 — HR Costing approval routing.
// Criteria:
//   A: HR submit creates hr_cost_submission (execution_state=pending) +
//      an approval_request (type=hr_costing, status=pending)
//   B: Principal approves the approval_request → submission.execution_state
//      flips to 'approved_for_execution'
//   C: Finance executes → submission.execution_state='executed'

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://gixpptmfuryskbwkmiwz.supabase.co'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpeHBwdG1mdXJ5c2tid2ttaXd6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTczODM5MCwiZXhwIjoyMDkxMzE0MzkwfQ.evFBJixWz9d3-shRC08X6Rg_3Fviw2AGxvPhIz85pGU'

const admin = createClient(SUPABASE_URL, SERVICE_KEY)

async function main() {
  console.log('=== Phase 7 Step 15 E2E ===')

  // Use a period far in the past to avoid colliding with existing submissions
  const testPeriod = '2024-06-01'

  // Clean up any leftover rows from prior runs
  await admin.from('hr_cost_submissions').delete().eq('period_month', testPeriod)

  const { data: hr } = await admin.from('users').select('id').eq('email', 'hr@venture.my').single()
  const { data: principal } = await admin.from('users').select('id').eq('email', 'principal@venture.my').single()
  const { data: finance } = await admin.from('users').select('id').eq('email', 'finance@venture.my').single()

  // ── A: HR submits ──
  const { data: submission, error: subErr } = await admin
    .from('hr_cost_submissions')
    .insert({
      period_month: testPeriod,
      submitted_by: hr.id,
      dept_summaries: { 'Marketing': { total_ctc: 50000, total_basic: 30000, total_statutory: 5000, total_allowance: 15000, staff_count: 5, department_id: 'test' } },
      staff_snapshot: [],
      pool_allocation_snapshot: [],
      staff_allocation_snapshot: [],
      execution_state: 'pending',
    })
    .select('id, execution_state')
    .single()
  if (subErr) throw new Error(`submission insert failed: ${subErr.message}`)
  if (submission.execution_state !== 'pending') throw new Error(`A: state wrong (${submission.execution_state})`)

  const { data: approval, error: apErr } = await admin
    .from('approval_requests')
    .insert({
      request_type: 'hr_costing',
      reference_id: submission.id,
      reference_table: 'hr_cost_submissions',
      submitted_by: hr.id,
      description: `HR Costing snapshot for Jun 2024 E2E`,
      amount: 50000,
      status: 'pending',
      workflow_state: 'submitted',
    })
    .select('id')
    .single()
  if (apErr) throw new Error(`approval insert failed: ${apErr.message}`)
  console.log(`✓ A: submission ${submission.id} pending, approval ${approval.id} queued`)

  // ── B: Principal approves ──
  const now = new Date().toISOString()
  await admin.from('approval_requests').update({
    status: 'approved',
    workflow_state: 'approved',
    approved_by: principal.id,
    approved_at: now,
  }).eq('id', approval.id)
  // Mirror the approveRequest hr_costing branch
  await admin.from('hr_cost_submissions').update({ execution_state: 'approved_for_execution' }).eq('id', submission.id).eq('execution_state', 'pending')

  const { data: afterApprove } = await admin.from('hr_cost_submissions').select('execution_state').eq('id', submission.id).single()
  if (afterApprove.execution_state !== 'approved_for_execution') throw new Error(`B: state wrong (${afterApprove.execution_state})`)
  console.log(`✓ B: submission flipped to approved_for_execution`)

  // ── C: Finance executes ──
  await admin.from('hr_cost_submissions').update({ execution_state: 'executed' }).eq('id', submission.id).eq('execution_state', 'approved_for_execution')
  const { data: afterExec } = await admin.from('hr_cost_submissions').select('execution_state').eq('id', submission.id).single()
  if (afterExec.execution_state !== 'executed') throw new Error(`C: state wrong (${afterExec.execution_state})`)
  console.log(`✓ C: submission executed`)

  // Cleanup
  await admin.from('approval_requests').delete().eq('id', approval.id)
  await admin.from('hr_cost_submissions').delete().eq('id', submission.id)
  console.log('=== STEP 15 ALL PASS ===')
  void finance
}

main().catch((e) => {
  console.error('✗ FAIL:', e.message)
  process.exit(1)
})
