'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { promotesTo, type LadderRung } from '@/lib/commission/titles'
import {
  assignDirector,
  closeMembership,
  loadOpenPositions,
  loadRungs,
  moveMembership,
  moveReportingLine,
  openMembership,
  safeReason,
  setMembership,
  unassignDirector,
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
 * Add somebody from the department to a non-home sub-department using the
 * Team tab's explicit title selection. This only opens the destination membership: their
 * existing memberships, company title and reporting line stay in place.
 * They start at the top of their own tree at the selected title's floor rung.
 */
export async function addMember(formData: FormData): Promise<RankOutcome> {
  const user = await requirePermission('revenue')
  const field = (name: string) => {
    const value = formData.get(name)
    return typeof value === 'string' ? value.trim() : ''
  }
  const staffId = field('staff_id')
  const schemeId = field('scheme_id')
  const titleId = field('title_id')
  if (!staffId || !schemeId || !titleId) return { ok: false, note: 'Pick a person and the title they hold here.' }

  return addMemberToScheme(user.id, staffId, schemeId, { titleId })
}

/** Quick-add copies the source card's current title; it never chooses a new one. */
export async function addMemberWithCurrentTitle(formData: FormData): Promise<RankOutcome> {
  const user = await requirePermission('revenue')
  const field = (name: string) => {
    const value = formData.get(name)
    return typeof value === 'string' ? value.trim() : ''
  }
  const staffId = field('staff_id')
  const schemeId = field('scheme_id')
  const sourceSchemeId = field('source_scheme_id')
  if (!staffId || !schemeId || !sourceSchemeId) {
    return { ok: false, note: 'Choose a person and a destination from their current sub-department.' }
  }

  // title_id from the browser is deliberately not accepted. The source may
  // have changed since the card was rendered, so read its title again below.
  return addMemberToScheme(user.id, staffId, schemeId, { sourceSchemeId })
}

async function addMemberToScheme(
  userId: string,
  staffId: string,
  schemeId: string,
  titleSource: { titleId: string } | { sourceSchemeId: string },
): Promise<RankOutcome> {
  try {
    const supabase = await client()
    const subDepartments = await listSubDepartments()
    const sub = subDepartments.find(candidate => candidate.schemeId === schemeId)
    if (!sub) return { ok: false, note: 'That sub-department has no active scheme.' }
    if (sub.isHome) {
      return { ok: false, note: 'Home sub-department membership follows the roster. Manage it under People Management.' }
    }

    // Recheck roster eligibility on the server: the chart or Team picker may
    // have been open while somebody was deactivated or moved department.
    // Cross-department memberships cannot be paid by the payroll sync, which
    // requires the roster and destination to share their payroll department.
    const { data: staff, error } = await supabase
      .from('hr_staff_costs')
      .select('id, status, department_id, title_id, titles (is_department_head)')
      .eq('id', staffId)
      .maybeSingle()
    if (error) return { ok: false, note: `Could not check this person's roster details: ${safeReason(error)}.` }
    if (!staff || staff.status !== 'active') {
      return { ok: false, note: 'This person is no longer active on the roster. Refresh the chart and try again.' }
    }
    if (staff.department_id !== sub.departmentId) {
      return { ok: false, note: 'Choose a sub-department within this person’s current department.' }
    }
    if (one(staff.titles as { is_department_head: boolean } | { is_department_head: boolean }[] | null)?.is_department_head) {
      return { ok: false, note: 'Department heads are assigned as directors and cannot hold a member position.' }
    }

    let titleId: string
    if ('sourceSchemeId' in titleSource) {
      const source = subDepartments.find(candidate => candidate.schemeId === titleSource.sourceSchemeId)
      if (!source) return { ok: false, note: 'The source sub-department has no active scheme. Refresh the chart and try again.' }
      if (source.departmentId !== sub.departmentId) {
        return { ok: false, note: 'Choose a source and destination within this person’s current department.' }
      }

      const { data: position, error: positionError } = await supabase
        .from('comm_hierarchy')
        .select('title_id')
        .eq('scheme_id', source.schemeId!)
        .eq('staff_id', staffId)
        .is('effective_to', null)
        .maybeSingle()
      if (positionError) return { ok: false, note: `Could not check their current membership: ${safeReason(positionError)}.` }
      if (!position && !source.isHome) {
        return { ok: false, note: 'They are no longer a member of the source sub-department. Refresh the chart and try again.' }
      }

      // Match loadTeam: an open membership supplies the displayed title. The
      // home chart also draws roster members without a ladder position yet.
      const currentTitleId = position ? position.title_id : staff.title_id
      if (!currentTitleId) {
        return { ok: false, note: 'They have no current title to carry over. Set their title separately before adding them.' }
      }
      titleId = currentTitleId

      // The destination menu only offers active member titles. Recheck here
      // so a retired title or a newly designated director cannot be copied
      // from a stale card. openMembership checks this title's destination rung.
      const { data: title, error: titleError } = await supabase
        .from('titles')
        .select('id, is_active, is_department_head')
        .eq('id', titleId)
        .maybeSingle()
      if (titleError) return { ok: false, note: `Could not check their current title: ${safeReason(titleError)}.` }
      if (!title?.is_active || title.is_department_head) {
        return { ok: false, note: 'Their current title is not an active member title. Set their title separately before adding them.' }
      }
    } else {
      titleId = titleSource.titleId
    }

    const result = await openMembership(supabase, userId, schemeId, staffId, titleId)
    if (!result.ok) return { ok: false, note: result.reason }
    refresh()
    return { ok: true, note: null }
  } catch (error) {
    if (isControlFlow(error)) throw error
    console.error('[addMember]', error)
    return { ok: false, note: 'Could not add this person. Please try again.' }
  }
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
 * Who a sub-department REPORTS TO (user, 2026-09-11): a department head —
 * the Revenue Director — added on the Team tab. From then on every team
 * leader and standalone member of the sub-department reports to them, drawn
 * above every tree on the chart. A reporting line only: the director holds
 * no rank and no override reaches them, so nothing in `comm_hierarchy` moves.
 * The database refuses anybody who does not hold a title that heads the
 * department (23DIR); the reason comes back as the note.
 */
export async function addDirector(formData: FormData): Promise<RankOutcome> {
  const user = await requirePermission('revenue')
  const supabase = await client()

  const subDepartmentId = ((formData.get('sub_department_id') as string) ?? '').trim()
  const staffId = ((formData.get('staff_id') as string) ?? '').trim()
  if (!subDepartmentId || !staffId) return { ok: false, note: 'Pick a director.' }

  const sub = (await listSubDepartments()).find(s => s.id === subDepartmentId)
  if (!sub) return { ok: false, note: 'That sub-department does not exist.' }

  const result = await assignDirector(supabase, user.id, subDepartmentId, staffId)
  if (!result.ok) return { ok: false, note: result.reason }
  refresh()
  return { ok: true, note: null }
}

/** A sub-department stops reporting to one of its directors. Nobody else moves. */
export async function removeDirector(formData: FormData): Promise<RankOutcome> {
  await requirePermission('revenue')
  const supabase = await client()

  const subDepartmentId = ((formData.get('sub_department_id') as string) ?? '').trim()
  const staffId = ((formData.get('staff_id') as string) ?? '').trim()
  if (!subDepartmentId || !staffId) return { ok: false, note: 'Which director?' }

  const result = await unassignDirector(supabase, subDepartmentId, staffId)
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
