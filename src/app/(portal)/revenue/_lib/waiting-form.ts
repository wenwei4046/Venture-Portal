import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { formFromRow, type MemberFormKind, type WaitingForm } from '@/lib/commission/waiting-form'

/**
 * The waiting-list form as it stands (2026-10-10, the HR revamp): its newest
 * version, read under the viewer's own session — `member_waiting_form()` lets
 * in whoever manages member requests or may send them (mig 20261010140000).
 * The replacement list's form (2026-10-11, round 2's README 18.5) is read the
 * same way, through `member_replacement_form()` (mig 20261011130000).
 * A refusal comes back as words, never a throw: the list still draws.
 */
export type WaitingFormRead = { ok: true; form: WaitingForm } | { ok: false; reason: string }

const NAMES: Readonly<Record<MemberFormKind, string>> = { waiting: 'waiting-list form', replacement: 'replacement form' }

export async function loadMemberForm(kind: MemberFormKind): Promise<WaitingFormRead> {
  const name = NAMES[kind]
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { data, error } = kind === 'replacement' ? await supabase.rpc('member_replacement_form') : await supabase.rpc('member_waiting_form')
  if (error) {
    return {
      ok: false,
      reason: error.code === '42501' ? `The ${name} needs member request access.` : `The ${name} could not be read. Please try again.`,
    }
  }
  const form = formFromRow(data, kind)
  return form ? { ok: true, form } : { ok: false, reason: `The ${name} has not been set up.` }
}

export function loadWaitingForm(): Promise<WaitingFormRead> {
  return loadMemberForm('waiting')
}

export function loadReplacementForm(): Promise<WaitingFormRead> {
  return loadMemberForm('replacement')
}
