// scripts/migrate-emails.mjs
//
// One-off migration: rename test user emails from @houzs.my to @venture.my
// Preserves UUIDs (important because fund_sources.created_by references them).
//
// Usage: node --env-file=.env.local scripts/migrate-emails.mjs

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('✗ Missing env vars')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  console.log('Migrating test user emails @houzs.my → @venture.my\n')

  const { data: listData, error: listError } = await supabase.auth.admin.listUsers()
  if (listError) {
    console.error('✗ Failed to list users:', listError.message)
    process.exit(1)
  }

  const toMigrate = listData.users.filter((u) => u.email?.endsWith('@houzs.my'))

  if (toMigrate.length === 0) {
    console.log('• No @houzs.my users found — nothing to migrate.')
    return
  }

  for (const u of toMigrate) {
    const newEmail = u.email.replace('@houzs.my', '@venture.my')

    // Update auth.users
    const { error: authError } = await supabase.auth.admin.updateUserById(u.id, {
      email: newEmail,
      email_confirm: true,
    })
    if (authError) {
      console.error(`✗ Failed to update auth for ${u.email}:`, authError.message)
      continue
    }

    // Update public.users
    const { error: publicError } = await supabase
      .from('users')
      .update({ email: newEmail, updated_at: new Date().toISOString() })
      .eq('id', u.id)
    if (publicError) {
      console.error(`✗ Failed to update public.users for ${u.email}:`, publicError.message)
      continue
    }

    console.log(`✓ ${u.email} → ${newEmail}`)
  }

  console.log('\nDone. All users can now login with @venture.my domain.')
  console.log('Password unchanged: changeme123')
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
