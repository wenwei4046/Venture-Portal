'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { promotesTo, titleCanRecruit, type LadderRung } from '@/lib/commission/titles'

/**
 * The payroll-purpose org chart: who is under who, at what rank, on which rate
 * mode. Shared by Staff Hierarchy's two tabs — the canvas, which moves people
 * between trees, and the Team table, which sets nothing but the rank.
 *
 * The rule that shapes all of this: **a position is never mutated in place once
 * a month has closed over it.** Moving somebody writes a NEW effective-dated
 * `comm_hierarchy` row and closes the old one the day before, so a run that has
 * already been computed keeps the chart it was computed against.
 *
 * A position carries the RANK (the floor a month pays from). The TITLE a
 * person holds is the ratchet on `hr_staff_costs` (user 2026-09-02): placing
 * somebody at a rank above their title raises the title here, exactly as an
 * applied run does — and nothing here ever lowers one.
 *
 * comm_* postdates database.types.ts — untyped-client convention.
 */
async function client(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient
}

function refresh() {
  revalidatePath('/revenue', 'layout')
  // A raised title shows on the People roster too.
  revalidatePath('/team', 'layout')
}

interface LadderRow {
  id: string
  title_id: string
  can_recruit: boolean
  sort_order: number
  titles: { name: string } | { name: string }[] | null
}

function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

/** The scheme's rungs, in the shape titles.ts reasons about. */
async function loadLadder(supabase: SupabaseClient, schemeId: string): Promise<LadderRow[]> {
  const { data, error } = await supabase
    .from('comm_ranks')
    .select('id, title_id, can_recruit, sort_order, titles (name)')
    .eq('scheme_id', schemeId)
  if (error) throw new Error(`Could not read the ladder: ${error.message}`)
  return (data ?? []) as unknown as LadderRow[]
}

function rungs(ladder: LadderRow[]): LadderRung[] {
  return ladder.map(r => ({ titleId: r.title_id, canRecruit: r.can_recruit, sortOrder: r.sort_order }))
}

function titleName(ladder: LadderRow[], titleId: string | null): string | null {
  if (!titleId) return null
  return one(ladder.find(r => r.title_id === titleId)?.titles)?.name ?? null
}

/**
 * The ratchet, on a manual placement: putting somebody at a rank whose title
 * sits above the one they hold raises the title (and `designation`, which the
 * payroll export reads), and writes the same audit line an applied run would —
 * with no run behind it. Placing them lower changes nothing.
 */
async function ratchetTitle(
  supabase: SupabaseClient,
  ladder: LadderRow[],
  staffId: string,
  rankId: string,
  actorId: string,
): Promise<void> {
  const rank = ladder.find(r => r.id === rankId)
  if (!rank) return

  const { data: staff } = await supabase
    .from('hr_staff_costs')
    .select('title_id')
    .eq('id', staffId)
    .maybeSingle()
  const current = ((staff as { title_id: string | null } | null)?.title_id ?? null)

  const to = promotesTo(rungs(ladder), current, rank.title_id)
  if (!to) return

  const { error } = await supabase
    .from('hr_staff_costs')
    .update({ title_id: to, designation: titleName(ladder, to) })
    .eq('id', staffId)
  if (error) {
    // 23LAD is the People org chart's ladder rule (hr_staff_respects_ladder):
    // the raised title would stand above their reports_to line. The position
    // is saved; the title is not, and the line is theirs to fix on People.
    throw new Error(
      error.code === '23LAD'
        ? `Placed, but their title could not be raised to ${titleName(ladder, to) ?? 'that title'} — ${error.message}. Fix their reporting line on People first.`
        : `Placed, but could not raise their title: ${error.message}`,
    )
  }

  await supabase.from('comm_title_promotions').insert({
    run_id: null,
    staff_id: staffId,
    period_month: currentPeriodStart(),
    from_title_id: current,
    to_title_id: to,
    promoted_by: actorId,
  })
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
 *  1. the upline's TITLE must be allowed to recruit (a 5% Revenue Specialist
 *     may not hold downlines) — the title, not the month's rank, so a Team
 *     Assistant back on 5% for a month keeps their team (user 2026-09-03);
 *     only somebody with no title yet is judged by the rank they were placed at;
 *  2. the upline must not already sit below this person — the DB trigger also
 *     rejects a cycle, but a readable message beats a raised exception;
 *  3. nobody may be their own upline.
 *
 * If the current position already starts inside this month, it is edited in
 * place: there is no closed history to protect yet, and closing a row on the
 * day before its own start would violate the effective-window CHECK.
 *
 * Every successful write ends with the ratchet (`ratchetTitle`).
 */
export async function setPosition(input: PositionInput): Promise<void> {
  const user = await requirePermission('revenue')
  const supabase = await client()

  if (input.uplineStaffId === input.staffId) {
    throw new Error('Somebody cannot be their own upline')
  }

  const from = currentPeriodStart()
  const ladder = await loadLadder(supabase, input.schemeId)

  if (input.uplineStaffId) {
    const [{ data: uplineRow }, { data: uplineStaff }] = await Promise.all([
      supabase
        .from('comm_hierarchy')
        .select('id, upline_staff_id, comm_ranks (label, can_recruit)')
        .eq('staff_id', input.uplineStaffId)
        .is('effective_to', null)
        .maybeSingle(),
      supabase.from('hr_staff_costs').select('title_id').eq('id', input.uplineStaffId).maybeSingle(),
    ])

    if (!uplineRow) {
      throw new Error('That upline has no active position — place them first')
    }
    const rank = one((uplineRow as unknown as { comm_ranks: { label: string; can_recruit: boolean } | { label: string; can_recruit: boolean }[] | null }).comm_ranks)
    const uplineTitle = ((uplineStaff as { title_id: string | null } | null)?.title_id ?? null)
    const byTitle = titleCanRecruit(rungs(ladder), uplineTitle)
    const allowed = byTitle ?? rank?.can_recruit ?? true
    if (!allowed) {
      const held = byTitle === null ? rank?.label : titleName(ladder, uplineTitle)
      throw new Error(`${held ?? 'That title'} is not allowed to hold downlines — promote them first`)
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
    await ratchetTitle(supabase, ladder, input.staffId, input.rankId, user.id)
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
    await ratchetTitle(supabase, ladder, input.staffId, input.rankId, user.id)
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

  await ratchetTitle(supabase, ladder, input.staffId, input.rankId, user.id)
  refresh()
}

/**
 * Form wrapper for the Team table. The table carries the person's current
 * upline as a hidden value (2026-09-05: the table changes the rank and nothing
 * else — trees are rearranged on the chart), so `upline_staff_id` here is
 * what the chart last drew, not a choice.
 */
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
  await requirePermission('revenue')
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
