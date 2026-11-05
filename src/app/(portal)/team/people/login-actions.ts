'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requireAnyActionOn } from '@/lib/auth'

// Disable / enable a login (2026-11-05 — the user: People › Deactivate left the person able to sign in, "这个需要"; HR
// may too, a full-access login only whoever manages permissions; mig 20261105010000). One database step,
// account_set_login, asks every rule; the answer is in words — production hides a thrown message behind a digest.

/** Turns a login off or on from the person's page. */
export async function setLoginEnabled(userId: string, enabled: boolean): Promise<{ ok: true } | { ok: false; reason: string }> {
  await requireAnyActionOn('/team/people/[id]', ['team', 'edit'], ['accounts', 'manage'])
  if (!userId) return { ok: false, reason: 'Which login? Open the person again.' }
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { error } = await supabase.rpc('account_set_login', { p_user: userId, p_enabled: enabled })
  if (error) return { ok: false, reason: error.message }
  revalidatePath('/team', 'layout')
  return { ok: true }
}
