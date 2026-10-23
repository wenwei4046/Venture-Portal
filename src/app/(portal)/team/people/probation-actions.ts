'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requireActionOn } from '@/lib/auth'
import { EXTEND_MONTH_CHOICES, MAX_PROBATION_MONTHS } from '@/lib/employment-status'

/**
 * A probation's three steps (2026-10-23 — the user: "if the probation is almost end, then it will notification hr
 * acknowledge for further action"): Acknowledge the reminder (HR view's bell, or the person's page), then Confirm as
 * permanent or Extend it — or end their employment, which Deactivate already does. People · Edit on the person's page,
 * the box Acknowledge asks in the database too (`probation_acknowledge`, mig 20261024031500). Each answers in words:
 * production hands a thrown message to the browser only as a digest.
 */
export type ProbationOutcome = { ok: true } | { ok: false; reason: string }
export type AcknowledgeOutcome = { ok: true; endsOn: string; ackName: string; ackAt: string } | { ok: false; reason: string }

const GONE = 'They are not on probation any more — reload the page.'

function refreshPeople() {
  revalidatePath('/team', 'layout')
}

/** The reminder acknowledged, for the end it stands at now — the database says who and when. */
export async function acknowledgeProbation(id: string): Promise<AcknowledgeOutcome> {
  await requireActionOn('/team/people/[id]', 'team', 'edit')
  // The function postdates database.types.ts.
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { data, error } = await supabase.rpc('probation_acknowledge', { p_staff: id })
  if (error) {
    const own = (error.code === '42501' || error.code === '22023') && error.message
    return { ok: false, reason: own ? error.message : 'Could not acknowledge. Please try again.' }
  }
  const answer = (data ?? {}) as { endsOn?: unknown; ackName?: unknown; ackAt?: unknown }
  refreshPeople()
  return { ok: true, endsOn: String(answer.endsOn ?? ''), ackName: String(answer.ackName ?? ''), ackAt: String(answer.ackAt ?? '') }
}

/** Confirmed as permanent: the probation, its period and its reminder end together (the reminder by trigger). */
export async function confirmProbation(id: string): Promise<ProbationOutcome> {
  await requireActionOn('/team/people/[id]', 'team', 'edit')
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('hr_staff_costs')
    .update({ employment_status: 'permanent', probation_months: null })
    .eq('id', id)
    .eq('employment_status', 'probation')
    .select('id')
  if (error) return { ok: false, reason: `Could not confirm them: ${error.message}` }
  if (!data?.length) return { ok: false, reason: GONE }
  refreshPeople()
  return { ok: true }
}

/**
 * Extended by 1–3 months: the period grows, so its last day moves — and a reminder acknowledged for the old end is
 * given again before the new one. Written only over the period this page read, so two extensions never stack unseen.
 */
export async function extendProbation(id: string, months: number): Promise<ProbationOutcome> {
  await requireActionOn('/team/people/[id]', 'team', 'edit')
  if (!(EXTEND_MONTH_CHOICES as readonly number[]).includes(months)) return { ok: false, reason: 'Pick how many months to extend it by.' }
  const supabase = await createClient()
  const { data: row } = await supabase.from('hr_staff_costs').select('employment_status, probation_months').eq('id', id).maybeSingle()
  if (!row || row.employment_status !== 'probation' || !row.probation_months) return { ok: false, reason: GONE }
  const next = row.probation_months + months
  if (next > MAX_PROBATION_MONTHS) return { ok: false, reason: `A probation runs ${MAX_PROBATION_MONTHS} months at most.` }
  const { data, error } = await supabase
    .from('hr_staff_costs')
    .update({ probation_months: next })
    .eq('id', id)
    .eq('employment_status', 'probation')
    .eq('probation_months', row.probation_months)
    .select('id')
  if (error) return { ok: false, reason: `Could not extend it: ${error.message}` }
  if (!data?.length) return { ok: false, reason: 'Their probation changed since this page was opened — reload it.' }
  refreshPeople()
  return { ok: true }
}
