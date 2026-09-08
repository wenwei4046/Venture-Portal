'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { promotesTo, titleCanRecruit, type LadderRung } from '@/lib/commission/titles'
import { canAccessTeam } from '@/lib/roles'
import { boundaryRefusal, type BoundaryPerson } from '@/lib/hierarchy-boundary'
import type { PermissionHolder } from '@/lib/permissions'
import {
  mirrorDecision,
  mirrorFailed,
  MIRRORED_NOTHING,
  type MirrorOutcome,
} from '@/lib/hierarchy-mirror'
import {
  currentPeriodStart,
  dayBefore,
  loadOpenPositions,
  writeReportsTo,
} from '@/lib/hierarchy-writes'

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
 * A position carries the RANK (the floor a month pays from). It does NOT carry
 * the TITLE. A title rises the month a run is APPLIED whose paid rank outranks
 * it (user 2026-09-02, migration 20260903030000), and a human records one on
 * People. Placing somebody here only SAYS their rank has outgrown their title
 * — see `titleGap`.
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

/** A `departments` embed, in either shape PostgREST returns it in. */
type DeptEmbed =
  | { name: string; payroll_source: string }
  | Array<{ name: string; payroll_source: string }>
  | null

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
 * Does the rank they were just placed at carry a title above the one they hold?
 *
 * This used to RAISE the title here — writing `hr_staff_costs.title_id` and the
 * same `comm_title_promotions` audit line an applied run writes, with no run
 * behind it. Two things were wrong with that, and the second is why it is gone
 * (user 2026-09-07):
 *
 *  1. It was the only title write in the app not behind `team`, and a title
 *     GRANTS PERMISSIONS — `current_permissions()` resolves them from
 *     `hr_staff_costs.title_id` through `title_permissions`. `upsertRank` is
 *     `revenue`-gated too, so a single account holding `revenue` and not `team`
 *     could bind a powerful title to a rung, place itself on that rung, and be
 *     promoted by its own placement.
 *  2. It is not the rule. The rule (migration 20260903030000, quoting the user
 *     on 2026-09-02) is that a title rises the month a run is APPLIED whose
 *     paid rank belongs to a higher title — a tier that was HIT. Dragging
 *     somebody onto a rung is an assignment, not a month of performance.
 *
 * So a placement no longer decides a promotion. It reports that one may be
 * owed, and a human with `team` records it on People, where every other title
 * write in this app already lives. The monthly `apply_commission_run` still
 * ratchets exactly as it did — that path is earned, and it is untouched.
 */
async function titleGap(
  supabase: SupabaseClient,
  ladder: LadderRow[],
  staffId: string,
  rankId: string,
): Promise<string | null> {
  const rank = ladder.find(r => r.id === rankId)
  if (!rank) return null

  const { data: staff, error } = await supabase
    .from('hr_staff_costs')
    .select('title_id')
    .eq('id', staffId)
    .maybeSingle()
  // A title we cannot read is a prompt we cannot write. The position is already
  // committed and correct, so this loses a nudge, not a fact.
  if (error) {
    console.error('[titleGap] could not read their title', staffId, error.message)
    return null
  }

  const current = (staff as { title_id: string | null } | null)?.title_id ?? null
  const to = promotesTo(rungs(ladder), current, rank.title_id)
  if (!to) return null

  return `Their rank now sits above their title. If that is a real promotion, set them to ${titleName(ladder, to) ?? 'the matching title'} on People — a placement no longer raises a title on its own.`
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
 * Every successful write ends with `finish()` — the reporting-line mirror,
 * plus a note if the placed rank has outgrown their title.
 */
export async function setPosition(input: PositionInput): Promise<MirrorOutcome> {
  const user = await requirePermission('revenue')
  const supabase = await client()

  if (input.uplineStaffId === input.staffId) {
    throw new Error('Somebody cannot be their own upline')
  }

  const from = currentPeriodStart()
  const ladder = await loadLadder(supabase, input.schemeId)

  // `scheme_id` and `rank_id` both arrive from the browser, and nothing in the
  // schema ties one to the other — `comm_hierarchy.rank_id` is a bare FK to
  // `comm_ranks(id)`. Without this, a form could pair a richer scheme's rank
  // with this sub-department's position and be paid from a rate this ladder
  // never offered. `setStaffRank` has always asked; this had not.
  if (!ladder.some(r => r.id === input.rankId)) {
    throw new Error('That rank belongs to another sub-department’s scheme')
  }

  if (input.uplineStaffId) {
    const [{ data: uplineRow }, { data: uplineStaff }] = await Promise.all([
      supabase
        .from('comm_hierarchy')
        .select('id, upline_staff_id, comm_ranks (label, can_recruit)')
        .eq('staff_id', input.uplineStaffId)
        .is('effective_to', null)
        .maybeSingle(),
      // BOTH people, where this used to read only the upline's title. The
      // department boundary (2026-09-08) is a question about the pair, and this
      // canvas is not the place it can be answered from the client: it loads
      // one commission department and cannot even OFFER an outsider, so
      // anything that reaches here across the edge arrived by another route.
      supabase
        .from('hr_staff_costs')
        .select('id, employee_name, title_id, departments (name, payroll_source)')
        .in('id', [input.staffId, input.uplineStaffId]),
    ])

    if (!uplineRow) {
      throw new Error('That upline has no active position — place them first')
    }

    const staffRows = (uplineStaff ?? []) as unknown as Array<{
      id: string
      employee_name: string
      title_id: string | null
      departments: DeptEmbed
    }>
    const asBoundary = (id: string): BoundaryPerson | null => {
      const row = staffRows.find(s => s.id === id)
      if (!row) return null
      const dept = one(row.departments)
      return {
        name: row.employee_name,
        department: dept?.name ?? null,
        commissionDept: dept?.payroll_source === 'commission',
      }
    }
    const mover = asBoundary(input.staffId)
    const upline = asBoundary(input.uplineStaffId)
    // Refused before the position is written, not after: this action mirrors
    // into `reports_to`, so a crossing placement would draw the crossing line
    // as well — and the override would be paid to somebody the Revenue chart
    // does not draw at all.
    if (mover && upline) {
      const crossing = boundaryRefusal(mover, upline)
      if (crossing) throw new Error(crossing)
    }

    const rank = one((uplineRow as unknown as { comm_ranks: { label: string; can_recruit: boolean } | { label: string; can_recruit: boolean }[] | null }).comm_ranks)
    const uplineTitle = staffRows.find(s => s.id === input.uplineStaffId)?.title_id ?? null
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
    // A first placement IS a statement about their upline, so it mirrors.
    return finish(supabase, user, ladder, input, true)
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
  if (unchanged) return MIRRORED_NOTHING
  // Did this gesture say anything about who they sit under? The Team table
  // submits the person's CURRENT upline as a hidden field because it edits the
  // rank and nothing else — mirroring that would rewrite `reports_to` from a
  // control documented as rank-only, silently replacing a line manager who may
  // not be on commission at all.
  const uplineChanged = cur.upline_staff_id !== input.uplineStaffId

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
    return finish(supabase, user, ladder, input, uplineChanged)
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

  return finish(supabase, user, ladder, input, uplineChanged)
}


/**
 * Everything that follows a committed position.
 *
 * The mirror runs first and never throws: the position is already committed by
 * the time we are here, so a failure has to be REPORTED, not raised — raising
 * would tell the user their move did not happen when it did.
 *
 * The title check runs second and only READS. It used to be a write, and it
 * used to run first, which meant its anticipated `23LAD` throw left
 * `comm_hierarchy` written and `reports_to` untouched — the exact drift this
 * change exists to prevent. Now there is no write left to order wrongly.
 *
 * `refresh()` runs either way: the pages must be re-read whatever happens next.
 */
async function finish(
  supabase: SupabaseClient,
  user: PermissionHolder & { id: string },
  ladder: LadderRow[],
  input: PositionInput,
  uplineChanged: boolean,
): Promise<MirrorOutcome> {
  try {
    const outcome = await mirrorToReportsTo(supabase, user, input, uplineChanged)
    const gap = await titleGap(supabase, ladder, input.staffId, input.rankId)
    if (!gap) return outcome
    return { ...outcome, note: outcome.note ? `${outcome.note} ${gap}` : gap }
  } finally {
    refresh()
  }
}

/**
 * The reporting-line half of the write.
 *
 * The mirror image of `mirrorToCommission` in the Team page's actions, and it
 * exists for the same reason: the user's ruling that **editing either graph
 * writes both**, so a salesperson moved under a new upline here does not keep
 * reporting to the manager they left on the org chart.
 *
 * Gated on `team`, not on this action's own `revenue`, because it writes the
 * People side's column. RLS will not stop a `revenue` holder — both permissions
 * resolve to the same `hr` scope — so this gate is the whole policy, and it
 * fails to a spoken skip rather than to a silent write.
 *
 * Never rethrows: the position is already committed. A thrown error here would
 * tell the user their placement did not happen, when it did.
 */
async function mirrorToReportsTo(
  supabase: SupabaseClient,
  user: PermissionHolder,
  input: PositionInput,
  uplineChanged: boolean,
): Promise<MirrorOutcome> {
  if (!uplineChanged) return MIRRORED_NOTHING

  let positions
  try {
    positions = await loadOpenPositions(supabase)
  } catch (e) {
    // `team` and `revenue` both resolve to the `hr` scope, so this cannot be
    // RLS hiding the table — it is a real read failure, and the position is
    // already committed. Saying nothing would leave the two lines disagreeing
    // with nothing on screen to show for it.
    return mirrorFailed(
      'reporting line',
      e instanceof Error ? e.message : 'the commission positions could not be read',
    )
  }

  const decision = mirrorDecision({
    staffId: input.staffId,
    targetId: input.uplineStaffId,
    // The person being placed may not have had an open position a moment ago —
    // this is the write that gave them one — so they count as on commission
    // either way. Everybody else is judged by what the table says.
    onCommission: new Set([...positions.keys(), input.staffId]),
    mayWriteOther: canAccessTeam(user),
    otherName: 'reporting line',
  })

  if (decision.kind === 'noop') return MIRRORED_NOTHING
  if (decision.kind === 'skip') return { mirrored: false, note: decision.note }

  try {
    await writeReportsTo(supabase, input.staffId, input.uplineStaffId)
    return { mirrored: true, note: null }
  } catch (e) {
    return mirrorFailed('reporting line', e instanceof Error ? e.message : String(e))
  }
}

/**
 * Form wrapper for the Team table. The table carries the person's current
 * upline as a hidden value (2026-09-05: the table changes the rank and nothing
 * else — trees are rearranged on the chart), so `upline_staff_id` here is
 * what the chart last drew, not a choice.
 */
export async function setPositionFromForm(formData: FormData): Promise<MirrorOutcome> {
  const rateMode = ((formData.get('rate_mode') as string) ?? '').trim()
  return setPosition({
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
