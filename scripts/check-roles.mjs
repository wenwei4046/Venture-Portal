import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  'https://gixpptmfuryskbwkmiwz.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpeHBwdG1mdXJ5c2tid2ttaXd6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTczODM5MCwiZXhwIjoyMDkxMzE0MzkwfQ.evFBJixWz9d3-shRC08X6Rg_3Fviw2AGxvPhIz85pGU',
)

const { data, error } = await sb
  .from('users')
  .select('id, email, role, name')
  .in('email', ['hr@venture.my', 'finance@venture.my', 'principal@venture.my'])
  .order('email')

console.log('error:', error)
console.log(JSON.stringify(data, null, 2))
