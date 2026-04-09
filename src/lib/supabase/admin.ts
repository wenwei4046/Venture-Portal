import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

// Service role client — bypasses RLS. Use only in server-side admin operations.
// The 'server-only' import above causes Next.js to error at build time if any
// client component accidentally imports from this file.
export const adminClient = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)
