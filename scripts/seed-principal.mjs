// scripts/seed-principal.mjs
//
// Bootstrap script: creates the first Principal user in both auth.users
// and public.users. Idempotent — safe to re-run.
//
// Usage:
//   node --env-file=.env.local scripts/seed-principal.mjs
//
// Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    '✗ Missing env vars. Expected NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local'
  )
  process.exit(1)
}

// Principal account details — change these as needed
const PRINCIPAL_EMAIL = 'principal@houzs.my'
const PRINCIPAL_PASSWORD = 'changeme123'
const PRINCIPAL_NAME = 'Principal'

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  console.log('Seeding Principal user...\n')

  // 1. Check if auth user already exists
  const { data: listData, error: listError } = await supabase.auth.admin.listUsers()
  if (listError) {
    console.error('✗ Failed to list auth users:', listError.message)
    process.exit(1)
  }

  const existing = listData.users.find((u) => u.email === PRINCIPAL_EMAIL)

  let authUserId
  if (existing) {
    console.log(`• Auth user ${PRINCIPAL_EMAIL} already exists (id ${existing.id})`)
    authUserId = existing.id
  } else {
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email: PRINCIPAL_EMAIL,
      password: PRINCIPAL_PASSWORD,
      email_confirm: true,
    })
    if (createError) {
      console.error('✗ Failed to create auth user:', createError.message)
      process.exit(1)
    }
    authUserId = created.user.id
    console.log(`✓ Created auth user ${PRINCIPAL_EMAIL} (id ${authUserId})`)
  }

  // 2. Upsert public.users row (service role bypasses RLS)
  const { error: upsertError } = await supabase.from('users').upsert(
    {
      id: authUserId,
      email: PRINCIPAL_EMAIL,
      name: PRINCIPAL_NAME,
      role: 'principal',
      is_active: true,
    },
    { onConflict: 'id' }
  )

  if (upsertError) {
    console.error('✗ Failed to upsert public.users row:', upsertError.message)
    process.exit(1)
  }

  console.log(`✓ public.users row upserted with role=principal`)

  console.log('\n' + '═'.repeat(50))
  console.log('Principal user seeded successfully')
  console.log('═'.repeat(50))
  console.log(`  Email:    ${PRINCIPAL_EMAIL}`)
  console.log(`  Password: ${PRINCIPAL_PASSWORD}`)
  console.log(`  Role:     principal`)
  console.log('')
  console.log('⚠️  Change the password after first login via Supabase dashboard:')
  console.log('    → Authentication → Users → principal@houzs.my → Reset password')
  console.log('')
  console.log('Next: npm run dev → http://localhost:3000/login')
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
