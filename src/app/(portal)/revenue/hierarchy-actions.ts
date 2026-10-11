'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requireActionOn } from '@/lib/auth'
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
 * Two kinds of ROW, one set of actions (user, 2026-09-10; per person since
 * 2026-09-20, so one chart can hold both at once):
 *
 *   based here  the person the company roster describes on this chart. Their
 *               line IS `reports_to`, their title IS the company title, and
 *               the database derives the membership. A move writes
 *               `reports_to`; the title is changed on People; they do not
 *               join or leave by hand.
 *   a member    a world of its own. The chart writes the membership row
 *               directly: who earns under whom here, the title held here.
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

/**
 * Is this the sub-department that person is BASED in (2026-09-20)?
 *
 * The question used to be about the sub-department alone — the department's
 * oldest was everybody's home. It is a person's own fact now, so every branch
 * below asks it per name, and asks the DATABASE: `comm_home_sub_department`
 * is what the trigger derives from, and a second opinion here would let the
 * page write a membership the trigger then overwrites.
 */
async function basedIn(supabase: SupabaseClient, staffId: string, sub: SubDepartment): Promise<boolean> {
  if (!staffId) return false
  const { data, error } = await supabase.rpc('comm_home_sub_department', { p_staff_id: staffId })
  if (error) throw new Error(`Could not read where they are based: ${safeReason(error)}`)
  return typeof data === 'string' && data === sub.id
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
  const user = await requireActionOn('/revenue/[sub]/hierarchy', 'revenue', 'edit')
  const supabase = await client()
  const sub = await subDepartmentOf(schemeId?.trim() ?? '')
  if (!sub) return { ok: false, reason: 'That sub-department has no active scheme.' }

  const mover = staffId?.trim() ?? ''
  const upline = uplineStaffId?.trim() || null

  if (await basedIn(supabase, mover, sub)) {
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
  const user = await requireActionOn('/revenue/[sub]/hierarchy', 'revenue', 'edit')
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

  const home = await basedIn(supabase, staffId, sub)
  const position = (await loadOpenPositions(supabase, schemeId)).get(staffId)
  if (!position) {
    return {
      ok: false,
      note: home
        ? 'They hold no position yet — their title has no rung on this ladder, so there is no rank to set. Give them a ladder title on People first.'
        : 'They are not a member of this sub-department.',
    }
  }

  // The title held here may only change where they are NOT based: the
  // membership the roster describes carries the company title, changed on People.
  const nextTitle = !home && titleId ? titleId : undefined
  const rungs = await loadRungs(supabase, schemeId)
  try {
    await setMembership(supabase, user.id, position, { titleId: nextTitle, rankId, rateMode }, rungs)
  } catch (e) {
    if (isControlFlow(e)) throw e
    return { ok: false, note: e instanceof Error ? e.message : 'Could not set their rank' }
  }

  const after = (await loadOpenPositions(supabase, schemeId)).get(staffId)
  const gap = titleGap(ladder, after?.titleId ?? position.titleId, after?.rankId ?? rankId, home)
  refresh()
  return { ok: true, note: gap }
}

/** A stale chart must not edit somebody who left this payroll department. */
async function memberEligibilityIssue(supabase: SupabaseClient, staffId: string, departmentId: string): Promise<string | null> {
  const { data: staff, error } = await supabase
    .from('hr_staff_costs')
    .select('id, status, department_id, titles (is_department_head)')
    .eq('id', staffId)
    .maybeSingle()
  if (error) return `Could not check this person's roster details: ${safeReason(error)}.`
  if (!staff || staff.status !== 'active') {
    return 'This person is no longer active on the roster. Refresh the chart and try again.'
  }
  if (staff.department_id !== departmentId) {
    return 'Choose a sub-department within this person’s current department.'
  }
  if (one(staff.titles as { is_department_head: boolean } | { is_department_head: boolean }[] | null)?.is_department_head) {
    return 'Department heads are assigned as directors and cannot hold a member position.'
  }
  return null
}

/** Recheck the selected title in case it was retired after the menu opened. */
async function memberTitleIssue(supabase: SupabaseClient, titleId: string): Promise<string | null> {
  const { data: title, error } = await supabase
    .from('titles')
    .select('id, is_active, is_department_head')
    .eq('id', titleId)
    .maybeSingle()
  if (error) return `Could not check the selected title: ${safeReason(error)}.`
  if (!title?.is_active || title.is_department_head) {
    return 'That title is no longer an active member title. Refresh the department choices and choose another title.'
  }
  return null
}

function membershipFields(formData: FormData) {
  const field = (name: string) => {
    const value = formData.get(name)
    return typeof value === 'string' ? value.trim() : ''
  }
  return { staffId: field('staff_id'), schemeId: field('scheme_id'), titleId: field('title_id') }
}

/**
 * Add somebody using the title selected on the chart or Team tab. Only the
 * destination membership is opened; their other positions stay in place.
 * They start a separate tree at the selected title's floor rung, without
 * carrying an upline or rate-mode override over from another sub-department.
 */
export async function addMember(formData: FormData): Promise<RankOutcome> {
  const user = await requireActionOn('/revenue/[sub]/hierarchy', 'revenue', 'edit')
  const { staffId, schemeId, titleId } = membershipFields(formData)
  if (!staffId || !schemeId || !titleId) return { ok: false, note: 'Pick a person and the title they hold here.' }

  try {
    const supabase = await client()
    const sub = await subDepartmentOf(schemeId)
    if (!sub) return { ok: false, note: 'That sub-department has no active scheme.' }
    if (await basedIn(supabase, staffId, sub)) {
      return { ok: false, note: `${sub.name} is where they are based, so the roster already has them there.` }
    }

    const eligibilityIssue = await memberEligibilityIssue(supabase, staffId, sub.departmentId)
    if (eligibilityIssue) return { ok: false, note: eligibilityIssue }
    const titleIssue = await memberTitleIssue(supabase, titleId)
    if (titleIssue) return { ok: false, note: titleIssue }

    const result = await openMembership(supabase, user.id, schemeId, staffId, titleId)
    if (!result.ok) return { ok: false, note: result.reason }
    refresh()
    return { ok: true, note: null }
  } catch (error) {
    if (isControlFlow(error)) throw error
    console.error('[addMember]', error)
    return { ok: false, note: 'Could not add this person. Please try again.' }
  }
}

/** Change only the title held on the selected non-home sub-department card. */
export async function changeMemberTitle(formData: FormData): Promise<RankOutcome> {
  const user = await requireActionOn('/revenue/[sub]/hierarchy', 'revenue', 'edit')
  const { staffId, schemeId, titleId } = membershipFields(formData)
  if (!staffId || !schemeId || !titleId) return { ok: false, note: 'Pick a person and the title they hold here.' }

  try {
    const supabase = await client()
    const sub = await subDepartmentOf(schemeId)
    if (!sub) return { ok: false, note: 'That sub-department has no active scheme.' }
    if (await basedIn(supabase, staffId, sub)) {
      return { ok: false, note: `They are based in ${sub.name}, so this membership carries their company title. Change it under People Management.` }
    }

    const eligibilityIssue = await memberEligibilityIssue(supabase, staffId, sub.departmentId)
    if (eligibilityIssue) return { ok: false, note: eligibilityIssue }
    const titleIssue = await memberTitleIssue(supabase, titleId)
    if (titleIssue) return { ok: false, note: titleIssue }

    const position = (await loadOpenPositions(supabase, schemeId)).get(staffId)
    if (!position) return { ok: false, note: 'They are no longer a member of this sub-department. Refresh the chart and try again.' }
    const rungs = await loadRungs(supabase, schemeId)
    if (!rungs.some(rung => rung.titleId === titleId)) {
      return { ok: false, note: 'That title has no rung on this sub-department’s ladder. Refresh the title choices and try again.' }
    }
    if (!rungs.some(rung => rung.id === position.rankId)) {
      return { ok: false, note: 'Their current rank is not on this sub-department’s ladder. Set a valid rank on the Team tab first.' }
    }
    if (position.titleId === titleId) return { ok: true, note: null }

    // Only the title is a browser input. Keep the authoritative current rank,
    // rate mode and upline; setMembership raises the rank to the title floor
    // when needed and uses the transactional effective-dated writer.
    await setMembership(supabase, user.id, position, {
      titleId, rankId: position.rankId, rateMode: position.rateMode,
    }, rungs)
    refresh()
    return { ok: true, note: null }
  } catch (error) {
    if (isControlFlow(error)) throw error
    return { ok: false, note: error instanceof Error ? error.message : 'Could not change their title. Please try again.' }
  }
}

/** Take somebody out of a non-home sub-department. */
export async function removeMember(formData: FormData): Promise<RankOutcome> {
  await requireActionOn('/revenue', 'revenue', 'edit')
  const supabase = await client()

  const staffId = ((formData.get('staff_id') as string) ?? '').trim()
  const schemeId = ((formData.get('scheme_id') as string) ?? '').trim()
  if (!staffId || !schemeId) return { ok: false, note: 'Which person?' }

  const sub = await subDepartmentOf(schemeId)
  if (!sub) return { ok: false, note: 'That sub-department has no active scheme.' }
  if (await basedIn(supabase, staffId, sub)) {
    return { ok: false, note: `They are based in ${sub.name}. Use Remove employee on the chart to move their base, or People Management to move their department.` }
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
  const user = await requireActionOn('/revenue/[sub]/hierarchy', 'revenue', 'edit')
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
  await requireActionOn('/revenue/[sub]/hierarchy', 'revenue', 'edit')
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
  await requireActionOn('/revenue', 'revenue', 'edit')
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

/**
 * Sales Groups › Members' Withholding cell (2026-10-10, the HR revamp): the
 * same write as `updateStaffTax`, answered — the grid saves many rows in one
 * go and says which one was refused, and production hides a thrown message.
 */
export async function saveStaffTax(formData: FormData): Promise<RankOutcome> {
  try {
    await updateStaffTax(formData)
    return { ok: true, note: null }
  } catch (e) {
    if (isControlFlow(e)) throw e
    return { ok: false, note: e instanceof Error ? e.message : 'Could not save the tax setting' }
  }
}
