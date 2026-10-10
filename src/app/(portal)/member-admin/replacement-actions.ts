'use server'

import { revalidatePath } from 'next/cache'
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { replacementRefusal } from '@/lib/member/member-services'

/**
 * Member services › Request reviews › a replacement (2026-10-10, HR revamp
 * 4b): HR approves it with who takes the seat — or nobody, the seat released
 * — and the date. On that date the database makes the change itself (mig
 * 20261010170000): `member_schedule_replacement` runs it at once when the
 * date has come, and the hourly `/api/member-queue` sweep runs the rest. Take
 * off the schedule puts it back to Pending review. Both RPCs ask
 * `member_is_manager` again — the gate here is the one the rest of Request
 * reviews asks.
 *
 * Refusals come back as `{ ok: false, reason }`: a thrown message never
 * reaches the browser in production.
 */

export type ScheduleOutcome = { ok: true; ran: boolean } | { ok: false; reason: string }
export type UnscheduleOutcome = { ok: true } | { ok: false; reason: string }

const NO_ACCESS = 'Replacements need HR request management access.'

/** The database's own sentence when it is one HR can act on: its refusals and the chart's rules. */
const SAYS_WHY = new Set(['22023', 'P0001', '23CAP', '23LAD', '23REC', '23BND', '23HOM', '23EMP'])

async function manages(): Promise<boolean> {
  const user = await requireAuth()
  return user.permissions.includes('member_requests_manage')
}

function refusal(error: PostgrestError, fallback: string): string {
  if (error.code === '42501') return NO_ACCESS
  return SAYS_WHY.has(error.code) && error.message ? error.message : fallback
}

function revalidate() {
  revalidatePath('/member-admin')
  revalidatePath('/revenue', 'layout')
  revalidatePath('/team', 'layout')
  revalidatePath('/member')
}

export async function scheduleReplacement(input: {
  requestId: string
  successorId: string | null
  effective: string
  note: string
}): Promise<ScheduleOutcome> {
  const refused = replacementRefusal(input)
  if (refused) return { ok: false, reason: refused }
  if (!(await manages())) return { ok: false, reason: NO_ACCESS }
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { data, error } = await supabase.rpc('member_schedule_replacement', {
    p_request: input.requestId,
    p_successor: input.successorId,
    p_effective: input.effective,
    p_note: input.note.trim() || null,
  })
  if (error) return { ok: false, reason: refusal(error, 'The replacement could not be approved. Please try again.') }
  revalidate()
  return { ok: true, ran: (data as { status?: unknown } | null)?.status === 'executed' }
}

export async function unscheduleReplacement(requestId: string): Promise<UnscheduleOutcome> {
  const refused = replacementRefusal({ requestId, successorId: null, effective: '2000-01-01' })
  if (refused) return { ok: false, reason: refused }
  if (!(await manages())) return { ok: false, reason: NO_ACCESS }
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { error } = await supabase.rpc('member_unschedule_replacement', { p_request: requestId, p_note: null })
  if (error) return { ok: false, reason: refusal(error, 'The replacement could not be taken off the schedule. Please try again.') }
  revalidate()
  return { ok: true }
}
