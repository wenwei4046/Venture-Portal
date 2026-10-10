import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { formFromRow, type WaitingForm } from '@/lib/commission/waiting-form'

/**
 * The waiting-list form as it stands (2026-10-10, the HR revamp): its newest
 * version, read under the viewer's own session — `member_waiting_form()` lets
 * in whoever manages member requests or may send them (mig 20261010140000).
 * A refusal comes back as words, never a throw: the list still draws.
 */
export type WaitingFormRead = { ok: true; form: WaitingForm } | { ok: false; reason: string }

export async function loadWaitingForm(): Promise<WaitingFormRead> {
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { data, error } = await supabase.rpc('member_waiting_form')
  if (error) {
    return {
      ok: false,
      reason: error.code === '42501' ? 'The waiting-list form needs member request access.' : 'The waiting-list form could not be read. Please try again.',
    }
  }
  const form = formFromRow(data)
  return form ? { ok: true, form } : { ok: false, reason: 'The waiting-list form has not been set up.' }
}
