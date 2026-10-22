// scripts/seed-users.mjs
//
// Idempotent seed of test users for Phase 1 testing.
// Creates 4 users, one per role. Safe to re-run.
//
// Usage:
//   npm run seed:users
//
// Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('✗ Missing env vars. Expected NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const TEST_PASSWORD = '123456'

const users = [
  {
    email: 'principal@venture.my',
    name: 'Principal',
    role: 'principal',
    department_id: null,
  },
  {
    email: 'finance@venture.my',
    name: 'Finance Manager',
    role: 'finance',
    department_id: null,
  },
  {
    email: 'hr@venture.my',
    name: 'HR Manager',
    role: 'hr',
    department_id: null,
  },
]

async function main() {
  console.log('Seeding test users...\n')

  // (marketing@, the Dept Manager, went with the kind on 2026-10-17.)

  // List existing auth users once
  const { data: listData, error: listError } = await supabase.auth.admin.listUsers()
  if (listError) {
    console.error('✗ Failed to list auth users:', listError.message)
    process.exit(1)
  }

  for (const spec of users) {
    const existing = listData.users.find((u) => u.email === spec.email)

    let authUserId
    if (existing) {
      console.log(`• ${spec.email} already exists`)
      authUserId = existing.id
    } else {
      const { data: created, error: createError } = await supabase.auth.admin.createUser({
        email: spec.email,
        password: TEST_PASSWORD,
        email_confirm: true,
      })
      if (createError) {
        console.error(`✗ Failed to create ${spec.email}:`, createError.message)
        continue
      }
      authUserId = created.user.id
      console.log(`✓ Created ${spec.email}`)
    }

    const { error: upsertError } = await supabase.from('users').upsert(
      {
        id: authUserId,
        email: spec.email,
        name: spec.name,
        role: spec.role,
        department_id: spec.department_id,
        is_active: true,
      },
      { onConflict: 'id' }
    )

    if (upsertError) {
      console.error(`✗ Failed to upsert public.users for ${spec.email}:`, upsertError.message)
    } else {
      console.log(`  → public.users row set, role=${spec.role}`)
    }
  }

  console.log('\n' + '═'.repeat(60))
  console.log('Test users seeded')
  console.log('═'.repeat(60))
  console.log(`Password for all: ${TEST_PASSWORD}`)
  console.log('')
  for (const spec of users) {
    console.log(`  ${spec.role.padEnd(13)} ${spec.email}`)
  }
  console.log('')
  console.log('⚠️  Test accounts only. Change passwords before production.')
  console.log('Next: npm run dev → http://localhost:3000/login')
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
