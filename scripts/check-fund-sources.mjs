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

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const { data: fs_, error: e1 } = await sb
  .from('fund_sources')
  .select('id, source_type, from_company_id, amount, cost_rate, lock_in_months, status, created_at')
  .order('created_at', { ascending: false })
  .limit(10)
console.log('fund_sources:', JSON.stringify(fs_, null, 2), 'err:', e1?.message)

const { data: out, error: e2 } = await sb.from('fund_source_outstanding').select('*').limit(10)
console.log('outstanding:', JSON.stringify(out, null, 2), 'err:', e2?.message)

const { data: pv, error: e3 } = await sb
  .from('payment_vouchers')
  .select('id, voucher_no, fund_source_id, loan_id, status')
  .not('fund_source_id', 'is', null)
  .limit(5)
console.log('vouchers with fund_source:', JSON.stringify(pv, null, 2), 'err:', e3?.message)
