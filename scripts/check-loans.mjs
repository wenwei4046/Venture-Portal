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

const { data: loans } = await supabase
  .from('loans')
  .select('id, company_id, principal, disbursement_date, status, companies(name, short_code)')

console.log('All loans:', loans?.length ?? 0)
loans?.forEach(l =>
  console.log(
    `  [${l.status}] ${l.companies?.name ?? '?'}: RM${l.principal} disbursed ${l.disbursement_date}`
  )
)

const { data: overdueConfig } = await supabase
  .from('overdue_config')
  .select('*')
  .order('days_from')
console.log('\nOverdue stages:')
overdueConfig?.forEach(c =>
  console.log(`  ${c.stage}: ${c.days_from}-${c.days_to ?? '∞'} days, penalty ${c.penalty_rate}`)
)

const { data: fundSources } = await supabase
  .from('fund_sources')
  .select('id, source_type, principal, interest_rate, status, companies(name)')
console.log('\nFund sources:', fundSources?.length ?? 0)
fundSources?.forEach(f =>
  console.log(`  [${f.status}] ${f.source_type} ${f.companies?.name ?? 'Director'}: RM${f.principal} @ ${f.interest_rate}`)
)
