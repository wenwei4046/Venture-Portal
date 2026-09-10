'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { promotesTo, type LadderRung } from '@/lib/commission/titles'
import {
  closeMembership,
  loadOpenPositions,
  loadRungs,
  moveMembership,
  moveReportingLine,
  openMembership,
  safeReason,
  setMembership,
  type LineResult,
} from '@/lib/hierarchy-writes'
import { listSubDepartments, type SubDepartment } from './_lib/sub-departments'

/**
 * The payroll-purpose org chart: who is under who, at what rank, on which rate
 * mode — per SUB-DEPARTMENT. Shared by Staff Hierarchy's two tabs: the
 * canvas, which moves people between trees, and the Team table, which sets
 * the rank (and, away from home, the title and the membership itself).
 *
 * Two kinds of sub-department, one set of actions (user, 2026-09-10):
 *
 *   home    the department's oldest. Its tree IS the company reporting line,
 *           its titles ARE the company titles, and the database derives the
 *           membership from the roster. A move here writes `reports_to`; the
 *           title is changed on People; nobody joins or leaves by hand.
 *   other   a world of its own. Its chart writes the membership row directly:
 *           who earns under whom here, the title held here, who is in it.
 *
 * The rule that shapes every membership write: **a position is never mutated
 * in place once a month has closed over it.** A change writes a NEW
 * effective-dated `comm_hierarchy` row and closes the old one the day before,
 * so a run already computed keeps the chart it was computed against.
 *
 * comm_* postdates database.types.ts — untyped-client convention.
 */
async function client(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient
}

function refresh() {
  revalidatePath('/revenue', 'layout')
  // The home chart is the company chart.
  revalidatePath('/team', 'layout')
}

/** The sub-department a scheme belongs to, or null when no active one carries it. */
async function subDepartmentOf(schemeId: string): Promise<SubDepartment | null> {
  return (await listSubDepartments()).find(s => s.schemeId === schemeId) ?? null
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
  if (error) throw new Error(`Could not read the ladder: ${safeReason(error)}`)
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
 * `redirect()` and `notFound()` travel as thrown errors carrying a `digest`;
 * a catch that swallowed one would turn a redirect into a sentence about the
 * database. Rethrow control flow; report real failures.
 */
function isControlFlow(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest
  return typeof digest === 'string' && /^NEXT_(REDIRECT|NOT_FOUND)/.test(digest)
}

/**
 * Does the rank they were just set to carry a title above the one they hold
 * here? A rank change reports that a promotion may be owed; on the home
 * sub-department a human records it on People (a title grants permissions),
 * elsewhere the Team tab's own Title column is where it is set.
 */
function titleGap(ladder: LadderRow[], currentTitleId: string | null, rankId: string, isHome: boolean): string | null {
  const rank = ladder.find(r => r.id === rankId)
  if (!rank) return null
  const to = promotesTo(rungs(ladder), currentTitleId, rank.title_id)
  if (!to) return null
  const name = titleName(ladder, to) ?? 'the matching title'
  return isHome
    ? `Their rank now sits above their title. If that is a real promotion, set them to ${name} on People — a rank change does not raise a title on its own.`
    : `Their rank now sits above the title they hold here. If that is a real promotion, set their title here to ${name}.`
}

/**
 * Move somebody on a sub-department's chart: who they earn under there.
 *
 * On the home sub-department that is the company reporting line, written
 * through the same function the People chart uses; elsewhere it is the
 * membership row. Gated on `revenue` either way — the money side of the line.
 */
export async function moveOnChart(
  schemeId: string,
  staffId: string,
  uplineStaffId: string | null,
): Promise<LineResult | { ok: true } | { ok: false; reason: string }> {
  const user = await requirePermission('revenue')
  const supabase = await client()
  const sub = await subDepartmentOf(schemeId?.trim() ?? '')
  if (!sub) return { ok: false, reason: 'That sub-department has no active scheme.' }

  const mover = staffId?.trim() ?? ''
  const upline = uplineStaffId?.trim() || null

  if (sub.isHome) {
    const result = await moveReportingLine(supabase, mover, upline)
    if (result.ok) refresh()
    return result
  }

  const result = await moveMembership(supabase, user.id, sub.schemeId!, mover, upline)
  if (!result.ok) return result
  refresh()
  return { ok: true }
}

/** What a Team-tab save came back with. `note` is rendered either way. */
export interface RankOutcome {
  ok: boolean
  note: string | null
}

/**
 * The Team table's row save: the rank a month pays somebody from here, the
 * rate mode that rides with it, and — away from home — the title held here.
 * The upline is not an input: it is the chart's.
 *
 * Refusals are RETURNED: Next redacts a thrown Server Action message in
 * production, and the reason is the whole point of one.
 */
export async function setStaffRank(formData: FormData): Promise<RankOutcome> {
  const user = await requirePermission('revenue')
  const supabase = await client()

  const staffId = ((formData.get('staff_id') as string) ?? '').trim()
  const schemeId = ((formData.get('scheme_id') as string) ?? '').trim()
  const rankId = ((formData.get('rank_id') as string) ?? '').trim()
  const titleId = ((formData.get('title_id') as string) ?? '').trim() || null
  const rawMode = ((formData.get('rate_mode') as string) ?? '').trim()
  const rateMode = rawMode === 'fixed' || rawMode === 'variable' ? rawMode : null
  if (!staffId || !schemeId || !rankId) throw new Error('Which person, and which rank?')

  const sub = await subDepartmentOf(schemeId)
  if (!sub) return { ok: false, note: 'That sub-department has no active scheme.' }

  // `scheme_id` and `rank_id` both arrive from the browser, and nothing in the
  // schema ties one to the other — `comm_hierarchy.rank_id` is a bare FK to
  // `comm_ranks(id)`. Without this, a form could pair a richer scheme's rank
  // with this sub-department's position and be paid from a rate this ladder
  // never offered.
  const ladder = await loadLadder(supabase, schemeId)
  if (!ladder.some(r => r.id === rankId)) {
    return { ok: false, note: 'That rank belongs to another sub-department’s scheme.' }
  }

  const position = (await loadOpenPositions(supabase, schemeId)).get(staffId)
  if (!position) {
    return {
      ok: false,
      note: sub.isHome
        ? 'They hold no position yet — their title has no rung on this ladder, so there is no rank to set. Give them a ladder title on People first.'
        : 'They are not a member of this sub-department.',
    }
  }

  // The title held here may only change on a non-home chart: the home
  // membership's title is the company title and is changed on People.
  const nextTitle = !sub.isHome && titleId ? titleId : undefined
  const rungs = await loadRungs(supabase, schemeId)
  try {
    await setMembership(supabase, user.id, position, { titleId: nextTitle, rankId, rateMode }, rungs)
  } catch (e) {
    if (isControlFlow(e)) throw e
    return { ok: false, note: e instanceof Error ? e.message : 'Could not set their rank' }
  }

  const after = (await loadOpenPositions(supabase, schemeId)).get(staffId)
  const gap = titleGap(ladder, after?.titleId ?? position.titleId, after?.rankId ?? rankId, sub.isHome)
  refresh()
  return { ok: true, note: gap }
}

/**
 * Add somebody from the department to a non-home sub-department, with the
 * title they hold there. They start at the top of their own tree at that
 * title's floor rung; the chart moves them from there.
 */
export async function addMember(formData: FormData): Promise<RankOutcome> {
  const user = await requirePermission('revenue')
  const supabase = await client()

  const staffId = ((formData.get('staff_id') as string) ?? '').trim()
  const schemeId = ((formData.get('scheme_id') as string) ?? '').trim()
  const titleId = ((formData.get('title_id') as string) ?? '').trim()
  if (!staffId || !schemeId || !titleId) return { ok: false, note: 'Pick a person and the title they hold here.' }

  const sub = await subDepartmentOf(schemeId)
  if (!sub) return { ok: false, note: 'That sub-department has no active scheme.' }
  if (sub.isHome) {
    return { ok: false, note: 'Everybody in the department is on the home sub-department already — add people under People Management.' }
  }

  const result = await openMembership(supabase, user.id, schemeId, staffId, titleId)
  if (!result.ok) return { ok: false, note: result.reason }
  refresh()
  return { ok: true, note: null }
}

/** Take somebody out of a non-home sub-department. */
export async function removeMember(formData: FormData): Promise<RankOutcome> {
  await requirePermission('revenue')
  const supabase = await client()

  const staffId = ((formData.get('staff_id') as string) ?? '').trim()
  const schemeId = ((formData.get('scheme_id') as string) ?? '').trim()
  if (!staffId || !schemeId) return { ok: false, note: 'Which person?' }

  const sub = await subDepartmentOf(schemeId)
  if (!sub) return { ok: false, note: 'That sub-department has no active scheme.' }
  if (sub.isHome) {
    return { ok: false, note: 'The home sub-department is the roster — deactivate or move the person under People Management instead.' }
  }

  const result = await closeMembership(supabase, schemeId, staffId)
  if (!result.ok) return { ok: false, note: result.reason }
  refresh()
  return { ok: true, note: null }
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
