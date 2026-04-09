// Seed test data for Step 8 E2E testing:
// - Backdate existing loan to make it late_2 (45 days overdue)
// - Create second backdated loan landing in escalation stage
// - Add a subsidiary_savings fund source so statements have savings_interest contra lines

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(l => l.includes('='))
    .map(l => {
      const idx = l.indexOf('=')
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()]
    })
)

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
)

// ───────────── 1. Backdate existing HOUZS Century loan → late_2 (45 days overdue)
const { data: existingLoans } = await supabase
  .from('loans')
  .select('id, company_id, principal, companies(name)')
  .eq('status', 'active')

console.log(`Found ${existingLoans?.length ?? 0} active loans`)

if (existingLoans && existingLoans.length > 0) {
  const loan = existingLoans[0]
  // 45 days overdue = 75 days ago disbursement = 2026-01-25
  const { error } = await supabase
    .from('loans')
    .update({ disbursement_date: '2026-01-25' })
    .eq('id', loan.id)
  if (error) console.error('Backdate error:', error.message)
  else console.log(`✓ Backdated ${loan.companies?.name} to 2026-01-25 (late_2 stage)`)
}

// ───────────── 2. Create escalation-stage loan on a different company
const { data: companies } = await supabase
  .from('companies')
  .select('id, name, short_code, tier')
  .order('short_code')

const { data: principalUser } = await supabase
  .from('users')
  .select('id')
  .eq('role', 'principal')
  .limit(1)
  .single()

const { data: financeUser } = await supabase
  .from('users')
  .select('id')
  .eq('role', 'finance')
  .limit(1)
  .single()

const existingCompanyIds = new Set(existingLoans?.map(l => l.company_id) ?? [])
const targetCompany = companies?.find(c => !existingCompanyIds.has(c.id))

if (!targetCompany) {
  console.log('No available company for escalation test loan')
} else {
  const { data: existing } = await supabase
    .from('loans')
    .select('id')
    .eq('company_id', targetCompany.id)
    .eq('principal', 80000)

  if (existing && existing.length > 0) {
    console.log(`✓ Escalation loan already exists for ${targetCompany.name} (${existing.length})`)
  } else {
    // 70 days overdue = 100 days ago = 2025-12-31
    const { error } = await supabase
      .from('loans')
      .insert({
        company_id: targetCompany.id,
        principal: 80000,
        base_rate: 0.006,
        risk_premium: 0.003,
        effective_rate: 0.009,
        disbursement_date: '2025-12-31',
        repayment_terms: 'Test escalation-stage loan for Step 8 E2E',
        status: 'active',
        created_by: financeUser?.id,
        approved_by: principalUser?.id,
        approved_at: '2025-12-31T00:00:00Z',
      })

    if (error) console.error('Insert escalation loan:', error.message)
    else console.log(`✓ Created escalation loan for ${targetCompany.name}: RM80,000 disbursed 2025-12-31`)
  }
}

// ───────────── 3. Add subsidiary savings fund source so statements have contra lines
const savingsCompany = companies?.[0]
if (savingsCompany) {
  const { data: existing } = await supabase
    .from('fund_sources')
    .select('id')
    .eq('source_type', 'subsidiary_savings')
    .eq('from_company_id', savingsCompany.id)

  if (existing && existing.length > 0) {
    console.log(`✓ Subsidiary savings already exists for ${savingsCompany.name}`)
  } else {
    const { error } = await supabase.from('fund_sources').insert({
      source_type: 'subsidiary_savings',
      capital_type: 'paid',
      from_company_id: savingsCompany.id,
      amount: 200000,
      cost_rate: 0.005, // 0.5% monthly
      effective_date: '2026-01-01',
      status: 'active',
      created_by: financeUser?.id,
    })
    if (error) console.error('Insert savings:', error.message)
    else console.log(`✓ Added subsidiary savings: ${savingsCompany.name} RM200,000 @ 0.5%/mo`)
  }
}

// ───────────── 4. Summary
const { data: finalLoans } = await supabase
  .from('loans')
  .select('id, principal, disbursement_date, status, companies(name)')
  .eq('status', 'active')

console.log('\n─── Final state ───')
console.log(`Active loans: ${finalLoans?.length ?? 0}`)
finalLoans?.forEach(l => {
  const daysSince = Math.floor((new Date('2026-04-10').getTime() - new Date(l.disbursement_date).getTime()) / 86400000)
  const overdueDays = Math.max(0, daysSince - 30)
  console.log(`  ${l.companies?.name}: RM${l.principal}, ${daysSince}d since disbursement, ${overdueDays}d overdue`)
})
