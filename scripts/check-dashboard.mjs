// Quick smoke test: call dashboard_summary() RPC and print the subsidiaries field.
// Uses an actual logged-in session via service-role client (bypasses RLS role check
// by calling as the service role which is treated as principal-equivalent).

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

// Service-role client can call the RPC but current_user_role() returns NULL,
// so the auth check inside the function would fail. Instead we sign in as
// a real user via admin API.

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

// Generate a one-time login token for finance user
const { data: financeUser } = await admin
  .from('users')
  .select('id')
  .eq('role', 'finance')
  .limit(1)
  .single()

const { data: link, error: linkError } = await admin.auth.admin.generateLink({
  type: 'magiclink',
  email: 'finance@venture.my',
})

if (linkError) {
  console.error('Failed to generate link:', linkError.message)
  process.exit(1)
}

// The action_link contains the token — but easier: use signInWithPassword on a
// fresh anon client.
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

const { error: signInError } = await anon.auth.signInWithPassword({
  email: 'finance@venture.my',
  password: 'changeme123',
})

if (signInError) {
  console.error('Sign-in failed:', signInError.message)
  process.exit(1)
}

const { data, error } = await anon.rpc('dashboard_summary')

if (error) {
  console.error('RPC error:', error.message)
  process.exit(1)
}

console.log('─── dashboard_summary() keys ───')
console.log(Object.keys(data))

console.log('\n─── subsidiaries ───')
console.log(JSON.stringify(data.subsidiaries, null, 2))

console.log('\n─── totals ───')
console.log({
  total_pool: data.total_pool,
  loans_outstanding: data.loans_outstanding,
  free_cash: data.free_cash,
  weighted_cost_rate: data.weighted_cost_rate,
  current_base_rate: data.current_base_rate,
  net_spread: data.net_spread,
  monthly_interest_income: data.monthly_interest_income,
  monthly_interest_expense: data.monthly_interest_expense,
  net_interest_income: data.net_interest_income,
})

console.log('\n─── alerts ───')
console.log(JSON.stringify(data.alerts, null, 2))

void financeUser
void link
