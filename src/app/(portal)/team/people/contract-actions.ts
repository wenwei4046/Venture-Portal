'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requireActionOn } from '@/lib/auth'
import type { AcknowledgeOutcome } from './probation-actions'

/**
 * A contract's reminder acknowledged (2026-10-24 — the user: "need 30 days and 15 days before remind, 2 reminder"):
 * HR view's bell, the person's page or the HR app, for the end it stands at now — the database says who and when
 * (`contract_acknowledge`, mig 20261025046500, which asks the person page's box too). Renewing it is Renew
 * (./renew-actions.ts); making them permanent is the card's own edit; ending their employment is Deactivate. Answers in
 * words: production hands a thrown message to the browser only as a digest.
 */
export async function acknowledgeContract(id: string): Promise<AcknowledgeOutcome> {
  await requireActionOn('/team/people/[id]', 'team', 'edit')
  // The function postdates database.types.ts.
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { data, error } = await supabase.rpc('contract_acknowledge', { p_staff: id })
  if (error) {
    const own = (error.code === '42501' || error.code === '22023') && error.message
    return { ok: false, reason: own ? error.message : 'Could not acknowledge. Please try again.' }
  }
  const answer = (data ?? {}) as { endsOn?: unknown; ackName?: unknown; ackAt?: unknown }
  revalidatePath('/team', 'layout')
  return { ok: true, endsOn: String(answer.endsOn ?? ''), ackName: String(answer.ackName ?? ''), ackAt: String(answer.ackAt ?? '') }
}
