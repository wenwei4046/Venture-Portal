// Phase 7 Step 9 — E2E verification script.
// Signs in as Finance, calls create_loan_with_approval RPC, asserts
// 2 grouped approval_requests + 1 pending voucher + 1 pvs row + bank unchanged.
// Then signs in as Principal, calls approveRequestGroup equivalent via direct SQL
// assertion on DB state (UI approval tested separately via Preview MCP).

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://gixpptmfuryskbwkmiwz.supabase.co'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpeHBwdG1mdXJ5c2tid2ttaXd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MzgzOTAsImV4cCI6MjA5MTMxNDM5MH0.7ahinbJZ7VpxeSiOpWznmbTdc_agDQ5kNkaPqPbFe6k'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpeHBwdG1mdXJ5c2tid2ttaXd6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTczODM5MCwiZXhwIjoyMDkxMzE0MzkwfQ.evFBJixWz9d3-shRC08X6Rg_3Fviw2AGxvPhIz85pGU'

const admin = createClient(SUPABASE_URL, SERVICE_KEY)

async function signIn(email, password) {
  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`Sign in failed: ${error.message}`)
  return { client, userId: data.user.id }
}

async function getState(tag) {
  const [bank, pendingGroups, ventureNet] = await Promise.all([
    admin.from('bank_accounts').select('bank_name,current_balance').eq('is_primary', true).single(),
    admin.from('approval_requests').select('id,request_type,group_id,reference_id').eq('status', 'pending').not('group_id', 'is', null),
    admin.rpc('dashboard_summary'),
  ])
  const vp = ventureNet.data?.free_cash ?? 'n/a'
  console.log(`[${tag}] bank=${bank.data?.current_balance}  venture_free=${vp}  pending_groups=${pendingGroups.data?.length}`)
  return {
    bank: Number(bank.data?.current_balance ?? 0),
    pendingGroups: pendingGroups.data ?? [],
  }
}

async function main() {
  console.log('=== Phase 7 Step 9 E2E ===')

  const before = await getState('BEFORE')

  // ── Criterion A: Finance submits Loan OUT ────────────────────────────────
  const { client: finance } = await signIn('finance@venture.my', '123456')

  // Look up active base rate
  const { data: base } = await finance
    .from('base_rate_history')
    .select('base_rate')
    .not('approved_at', 'is', null)
    .order('effective_from', { ascending: false })
    .limit(1)
    .single()

  const companyId = '24204cca-7dfe-43c7-b12c-9ac660ba75f9' // Hookka (HK)
  const principal = 500
  const customRate = 0.015 // 1.5% /mo
  const effectiveRate = Number(base.base_rate) + customRate

  const { data: loanId, error: rpcErr } = await finance.rpc('create_loan_with_approval', {
    p_company_id: companyId,
    p_principal: principal,
    p_base_rate: Number(base.base_rate),
    p_risk_premium: customRate,
    p_effective_rate: effectiveRate,
    p_repayment_terms: 'Step 9 E2E test',
    p_company_name: 'Hookka',
  })

  if (rpcErr) throw new Error(`RPC failed: ${rpcErr.message}`)
  console.log(`✓ RPC returned loan_id: ${loanId}`)

  // Assert 2 approval_requests share a group_id
  const { data: reqs } = await admin
    .from('approval_requests')
    .select('id,request_type,group_id,reference_id,status,amount')
    .or(`reference_id.eq.${loanId}`)
    .in('request_type', ['new_loan'])

  if (!reqs || reqs.length !== 1) throw new Error('A: no loan approval_request found')
  const groupId = reqs[0].group_id
  if (!groupId) throw new Error('A: loan approval_request has no group_id')

  const { data: group } = await admin
    .from('approval_requests')
    .select('id,request_type,group_id,reference_id,status,amount')
    .eq('group_id', groupId)

  console.log(`✓ Group has ${group.length} requests:`)
  for (const r of group) console.log(`    - ${r.request_type} ref=${r.reference_id} amt=${r.amount}`)

  if (group.length !== 2) throw new Error(`A: expected 2 group members, got ${group.length}`)
  const voucherReq = group.find((r) => r.request_type === 'payment_voucher')
  if (!voucherReq) throw new Error('A: missing payment_voucher approval in group')

  // Assert voucher + source row
  const { data: voucher } = await admin
    .from('payment_vouchers')
    .select('*')
    .eq('id', voucherReq.reference_id)
    .single()
  console.log(`✓ Voucher ${voucher.voucher_no} status=${voucher.status} amount=${voucher.amount}`)
  if (voucher.status !== 'pending_approval') throw new Error(`A: voucher status ${voucher.status} != pending_approval`)

  const { data: sources } = await admin
    .from('payment_voucher_sources')
    .select('*')
    .eq('voucher_id', voucher.id)
  if (!sources || sources.length !== 1) throw new Error(`A: expected 1 pvs row, got ${sources?.length}`)
  if (sources[0].pool !== 'hv_operating_fund') throw new Error(`A: pvs pool wrong: ${sources[0].pool}`)
  if (Number(sources[0].amount) !== principal) throw new Error(`A: pvs amount wrong: ${sources[0].amount}`)
  console.log(`✓ pvs row: pool=${sources[0].pool} amt=${sources[0].amount}`)

  // Assert bank unchanged
  const afterSubmit = await getState('AFTER_SUBMIT')
  if (afterSubmit.bank !== before.bank) {
    throw new Error(`A: bank moved on submit (${before.bank} → ${afterSubmit.bank})`)
  }
  console.log(`✓ Bank unchanged: ${before.bank}`)

  // ── Criterion C: Principal approves group ────────────────────────────────
  const { client: principalC, userId: principalId } = await signIn('principal@venture.my', '123456')
  console.log(`✓ Signed in as Principal (${principalId})`)

  // Invoke the same UPDATE sequence that approveRequestGroup() runs.
  // (We mimic the server action body directly via REST.)
  const now = new Date().toISOString()
  const today = now.slice(0, 10)

  // 1) Flip both approval_requests
  const { error: e1 } = await principalC
    .from('approval_requests')
    .update({
      status: 'approved',
      workflow_state: 'approved',
      approved_by: principalId,
      approved_at: now,
      notes: 'Step 9 E2E approve',
    })
    .eq('group_id', groupId)
    .eq('status', 'pending')
  if (e1) throw new Error(`C1 approve group failed: ${e1.message}`)

  // 2) Activate loan
  const { error: e2 } = await principalC
    .from('loans')
    .update({
      status: 'active',
      approved_by: principalId,
      approved_at: now,
      disbursement_date: today,
    })
    .eq('id', loanId)
    .eq('status', 'pending_approval')
  if (e2) throw new Error(`C2 activate loan failed: ${e2.message}`)

  // 3) Flip voucher to paid
  const { error: e3 } = await principalC
    .from('payment_vouchers')
    .update({
      status: 'paid',
      approved_by: principalId,
      approved_at: now,
      executed_by: principalId,
      executed_at: now,
      payment_date: today,
    })
    .eq('id', voucher.id)
    .eq('status', 'pending_approval')
  if (e3) throw new Error(`C3 voucher execute failed: ${e3.message}`)

  // 4) hv_fund fund_out ledger
  const { error: e4 } = await principalC.from('hv_operating_fund').insert({
    transaction_type: 'fund_out',
    amount: principal,
    description: `${voucher.voucher_no}: Loan disbursement to Hookka`,
    reference_id: loanId,
    reference_table: 'loans',
    created_by: principalId,
  })
  if (e4) throw new Error(`C4 fund_out ledger failed: ${e4.message}`)

  // 5) Bank debit
  const { data: primaryBank } = await admin
    .from('bank_accounts')
    .select('id,current_balance')
    .eq('is_primary', true)
    .single()
  const { error: e5 } = await principalC
    .from('bank_accounts')
    .update({ current_balance: Number(primaryBank.current_balance) - principal })
    .eq('id', primaryBank.id)
  if (e5) throw new Error(`C5 bank debit failed: ${e5.message}`)

  const afterApprove = await getState('AFTER_APPROVE')
  if (afterApprove.bank !== before.bank - principal) {
    throw new Error(`C: bank delta wrong. Expected ${before.bank - principal}, got ${afterApprove.bank}`)
  }
  console.log(`✓ Bank -${principal}: ${before.bank} → ${afterApprove.bank}`)

  // Verify loan + voucher final states
  const { data: loanFinal } = await admin.from('loans').select('status,disbursement_date').eq('id', loanId).single()
  const { data: vchFinal } = await admin.from('payment_vouchers').select('status,executed_by').eq('id', voucher.id).single()
  const { data: reqsFinal } = await admin.from('approval_requests').select('status').eq('group_id', groupId)
  console.log(`✓ Loan: ${loanFinal.status} disb=${loanFinal.disbursement_date}`)
  console.log(`✓ Voucher: ${vchFinal.status} executed_by=${vchFinal.executed_by}`)
  console.log(`✓ All group reqs approved: ${reqsFinal.every((r) => r.status === 'approved')}`)

  if (loanFinal.status !== 'active') throw new Error('C: loan not active')
  if (vchFinal.status !== 'paid') throw new Error('C: voucher not paid')
  if (!reqsFinal.every((r) => r.status === 'approved')) throw new Error('C: some reqs not approved')

  console.log('=== ALL CRITERIA PASS ===')
}

main().catch((e) => {
  console.error('✗ FAIL:', e.message)
  process.exit(1)
})
