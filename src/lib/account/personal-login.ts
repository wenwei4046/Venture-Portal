import 'server-only'
import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { viewingAsSomebody } from '@/lib/view-as-person'

/**
 * Is the signed-in login a person's own (2026-10-12, the user: Change password "just for that personal
 * acc")? One a People record names — every login People › Invite user makes — and not a shared
 * account (principal@, finance@, hr@, marketing@), whose password several people sign in with.
 * The database answers for the caller only (`my_login_is_personal()`, mig 20261012000000): the
 * roster itself is closed to most logins.
 *
 * No while the portal is viewing as somebody — the session is somebody else's view and reads only.
 * `null` when the database could not be asked: an error is not a "no" (the change says so in its own
 * words, never "this is a shared login").
 */
export async function askPersonalLogin(): Promise<boolean | null> {
  if (await viewingAsSomebody()) return false
  // The function postdates database.types.ts.
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { data, error } = await supabase.rpc('my_login_is_personal')
  if (error) return null
  return data === true
}

/** For the menus: shown only on a yes — a failed read hides the link, the safe side. Once per request. */
export const loginIsPersonal = cache(async (): Promise<boolean> => (await askPersonalLogin()) === true)
