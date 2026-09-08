import { createClient } from '@supabase/supabase-js'

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    '✗ Missing env vars. Expected NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local'
  )
  process.exit(1)
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

const { data, error } = await sb
  .from('users')
  .select('id, email, role, name')
  .in('email', ['hr@venture.my', 'finance@venture.my', 'principal@venture.my'])
  .order('email')

console.log('error:', error)
console.log(JSON.stringify(data, null, 2))
