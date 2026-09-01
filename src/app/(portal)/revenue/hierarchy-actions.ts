'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'

/**
 * The payroll-purpose org chart: who is under who, at what rank, on which rate
 * mode. Shared by the Staff Hierarchy canvas and the Rules salespeople table.
 *
 * The rule that shapes all of this: **a position is never mutated in place once
 * a month has closed over it.** Moving somebody writes a NEW effective-dated
 * `comm_hierarchy` row and closes the old one the day before, so a run that has
 * already been computed keeps the chart it was computed against.
 *
 * comm_* postdates database.types.ts — untyped-client convention.
 */
async function client(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient
}

function refresh() {
  revalidatePath('/revenue', 'layout')
}

/** YYYY-MM-01 of today — commission settles per calendar month. */
function currentPeriodStart(): string {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`
}

function dayBefore(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export interface PositionInput {
  staffId: string
  schemeId: string
  rankId: string
  uplineStaffId: string | null
  rateMode: 'fixed' | 'variable' | null
}

/**
 * Place or move a salesperson.
 *
 * Guards, in order of how expensive the mistake would be:
 *  1. the upline's rank must be allowed to recruit (a 5% Revenue Specialist
 *     may not hold downlines);
 *  2. the upline must not already sit below this person — the DB trigger also
 *     rejects a cycle, but a readable message beats a raised exception;
 *  3. nobody may be their own upline.
 *
 * If the current position already starts inside this month, it is edited in
 * place: there is no closed history to protect yet, and closing a row on the
 * day before its own start would violate the effective-window CHECK.
 */
export async function setPosition(input: PositionInput): Promise<void> {
  const user = await requireRole(['principal', 'hr'])
  const supabase = await client()

  if (input.uplineStaffId === input.staffId) {
    throw new Error('Somebody cannot be their own upline')
  }

  const from = currentPeriodStart()

  if (input.uplineStaffId) {
    const { data: uplineRow } = await supabase
      .from('comm_hierarchy')
      .select('id, upline_staff_id, comm_ranks (label, can_recruit)')
      .eq('staff_id', input.uplineStaffId)
      .is('effective_to', null)
      .maybeSingle()

    if (!uplineRow) {
      throw new Error('That upline has no active position — place them first')
    }
    const rank = (uplineRow as unknown as { comm_ranks: { label: string; can_recruit: boolean } | null }).comm_ranks
    if (rank && !rank.can_recruit) {
      throw new Error(`${rank.label} is not allowed to hold downlines — promote them first`)
    }

    // Walk up from the proposed upline: if we meet this person, it is a loop.
    const { data: allOpen } = await supabase
      .from('comm_hierarchy')
      .select('staff_id, upline_staff_id')
      .is('effective_to', null)
    const parent = new Map(
      ((allOpen ?? []) as Array<{ staff_id: string; upline_staff_id: string | null }>).map(r => [
        r.staff_id,
        r.upline_staff_id,
      ]),
    )
    let cursor: string | null | undefined = input.uplineStaffId
    for (let depth = 0; cursor && depth < 20; depth++) {
      if (cursor === input.staffId) {
        throw new Error('That would put somebody under their own downline')
      }
      cursor = parent.get(cursor) ?? null
    }
  }

  const { data: current } = await supabase
    .from('comm_hierarchy')
    .select('id, effective_from, rank_id, upline_staff_id, rate_mode, scheme_id')
    .eq('staff_id', input.staffId)
    .is('effective_to', null)
    .maybeSingle()

  const row = {
    scheme_id: input.schemeId,
    staff_id: input.staffId,
    upline_staff_id: input.uplineStaffId,
    rank_id: input.rankId,
    rate_mode: input.rateMode,
    effective_from: from,
    created_by: user.id,
  }

  if (!current) {
    const { error } = await supabase.from('comm_hierarchy').insert(row)
    if (error) throw new Error(`Could not place them: ${error.message}`)
    refresh()
    return
  }

  const cur = current as unknown as {
    id: string
    effective_from: string
    rank_id: string
    upline_staff_id: string | null
    rate_mode: string | null
    scheme_id: string
  }

  const unchanged =
    cur.rank_id === input.rankId &&
    cur.upline_staff_id === input.uplineStaffId &&
    cur.rate_mode === input.rateMode &&
    cur.scheme_id === input.schemeId
  if (unchanged) return

  if (cur.effective_from >= from) {
    // Still inside the month it started in — no closed history to protect.
    const { error } = await supabase
      .from('comm_hierarchy')
      .update({
        scheme_id: input.schemeId,
        upline_staff_id: input.uplineStaffId,
        rank_id: input.rankId,
        rate_mode: input.rateMode,
      })
      .eq('id', cur.id)
    if (error) throw new Error(`Could not update the position: ${error.message}`)
    refresh()
    return
  }

  const { error: closeError } = await supabase
    .from('comm_hierarchy')
    .update({ effective_to: dayBefore(from) })
    .eq('id', cur.id)
  if (closeError) throw new Error(`Could not close the old position: ${closeError.message}`)

  const { error } = await supabase.from('comm_hierarchy').insert(row)
  if (error) {
    // Put the old row back rather than leaving them with no position at all.
    await supabase.from('comm_hierarchy').update({ effective_to: null }).eq('id', cur.id)
    throw new Error(`Could not record the new position: ${error.message}`)
  }

  refresh()
}

/** Form wrapper for the Rules page's people table. */
export async function setPositionFromForm(formData: FormData): Promise<void> {
  const rateMode = ((formData.get('rate_mode') as string) ?? '').trim()
  await setPosition({
    staffId: ((formData.get('staff_id') as string) ?? '').trim(),
    schemeId: ((formData.get('scheme_id') as string) ?? '').trim(),
    rankId: ((formData.get('rank_id') as string) ?? '').trim(),
    uplineStaffId: ((formData.get('upline_staff_id') as string) ?? '').trim() || null,
    rateMode: rateMode === 'fixed' || rateMode === 'variable' ? rateMode : null,
  })
}

/**
 * Withholding Tax is a per-person tick (user 2026-08-31): 2% of gross instead
 * of PCB. Lives on hr_staff_costs because it is a payroll fact, not a
 * commission rule — a person could move sub-department and keep it.
 */
export async function updateStaffTax(formData: FormData): Promise<void> {
  await requireRole(['principal', 'hr'])
  const supabase = await client()

  const staffId = ((formData.get('staff_id') as string) ?? '').trim()
  if (!staffId) throw new Error('Staff is required')

  const withhold = formData.get('withholding') === 'on'
  const rawRate = ((formData.get('withholding_rate') as string) ?? '').trim()
  let rate = 0.02
  if (withhold && rawRate !== '') {
    const n = Number(rawRate)
    if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error('Withholding rate must be 0–100%')
    rate = n / 100
  }

  const { error } = await supabase
    .from('hr_staff_costs')
    .update({ tax_mode: withhold ? 'withholding' : 'pcb', withholding_rate: rate })
    .eq('id', staffId)

  if (error) throw new Error(`Could not save the tax setting: ${error.message}`)
  refresh()
}
