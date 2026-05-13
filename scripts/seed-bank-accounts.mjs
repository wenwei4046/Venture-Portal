// scripts/seed-bank-accounts.mjs
//
// Seeds two bank accounts for HV:
//   1. Hong Leong Bank (Main Account) — primary
//   2. Alliance Bank (HR Account)
//
// Usage:
//   node --env-file=.env.local scripts/seed-bank-accounts.mjs

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('✗ Missing env vars.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const accounts = [
  {
    bank_name: 'Hong Leong Bank',
    account_number: '123-456-7890',
    account_holder: 'HOUZS Venture Sdn Bhd',
    account_type: 'current',
    currency: 'MYR',
    is_primary: true,
    gl_account_code: '3000',
    opening_balance: 0,
    current_balance: 0,
    status: 'active',
    notes: 'Main operating account',
  },
  {
    bank_name: 'Alliance Bank',
    account_number: '987-654-3210',
    account_holder: 'HOUZS Venture Sdn Bhd',
    account_type: 'current',
    currency: 'MYR',
    is_primary: false,
    gl_account_code: '3010',
    opening_balance: 0,
    current_balance: 0,
    status: 'active',
    notes: 'HR payroll account',
  },
]

async function main() {
  // Get principal user for created_by
  const { data: principalUser } = await supabase
    .from('users')
    .select('id')
    .eq('role', 'principal')
    .single()

  if (!principalUser) {
    console.error('✗ No principal user found. Run seed:users first.')
    process.exit(1)
  }

  for (const acc of accounts) {
    const { data: existing } = await supabase
      .from('bank_accounts')
      .select('id')
      .eq('bank_name', acc.bank_name)
      .eq('account_number', acc.account_number)
      .single()

    if (existing) {
      console.log(`• ${acc.bank_name} (${acc.account_number}) already exists`)
      continue
    }

    const { error } = await supabase
      .from('bank_accounts')
      .insert({ ...acc, created_by: principalUser.id })

    if (error) {
      console.error(`✗ Failed to create ${acc.bank_name}: ${error.message}`)
    } else {
      console.log(`✓ Created ${acc.bank_name} (${acc.account_number})${acc.is_primary ? ' [PRIMARY]' : ''}`)
    }
  }

  console.log('\nBank accounts seeded.')
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
