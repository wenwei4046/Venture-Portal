import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getPeriodMonth } from '@/lib/utils'
import { lineRefusal, type LineManager } from '@/lib/hierarchy-boundary'
import { rankAfterTitleChange, rankForTitle, titleCanRecruit, type AssignableRung } from '@/lib/commission/titles'

/**
 * The hierarchy writes, in one place so that every Server Action moves the
 * same line the same way.
 *
 * ONE LINE (user, 2026-09-10): inside a commission department the reporting
 * line IS the commission upline. `hr_staff_costs.reports_to` is the fact for
 * the HOME sub-department — the department's oldest — and the membership the
 * engine reads (`comm_hierarchy`) is derived from it by the database
 * (trigger `hr_staff_costs_one_line_sync`, migrations 20260910120000 and
 * 20260910160000) with the company title and the rank it guarantees.
 *
 * MEMBERSHIPS (the same day, an hour later): every OTHER sub-department is a
 * world of its own — its own tree, its own title per person, its own rank —
 * and its chart writes its memberships directly. So the writes here are:
 *
 *   moveReportingLine   the home line. Both charts call this for the home
 *                       sub-department, each behind its own gate.
 *   moveMembership      a non-home sub-department's upline, written to the
 *                       membership row with the same effective dating.
 *   openMembership /    joining or leaving a non-home sub-department, with
 *   closeMembership     the title held there.
 *   setMembership       the rank a month pays from (and the rate mode) — the
 *                       one hierarchy fact a human sets by hand on the home
 *                       chart; on other charts the title held there too, the
 *                       rank ratcheting up with it in the same write.
 *
 * NOT a `'use server'` module: nothing here may become a callable endpoint.
 * Every function takes an already-authorised client and trusts the caller to
 * have run its gate — the gates live in the actions, where the redirect
 * semantics of `requirePermission` belong.
 *
 * `comm_*` postdates database.types.ts — untyped-client convention.
 */

/** A person's open membership of one sub-department, as a write needs to see it. */
export interface OpenPosition {
  id: string
  staffId: string
  schemeId: string
  uplineStaffId: string | null
  rankId: string
  /** The title held in this sub-department. */
  titleId: string | null
  rateMode: 'fixed' | 'variable' | null
  effectiveFrom: string
}

interface OpenRow {
  id: string
  staff_id: string
  scheme_id: string
  upline_staff_id: string | null
  rank_id: string
  title_id: string | null
  rate_mode: 'fixed' | 'variable' | null
  effective_from: string
}

function toPosition(r: OpenRow): OpenPosition {
  return {
    id: r.id,
    staffId: r.staff_id,
    schemeId: r.scheme_id,
    uplineStaffId: r.upline_staff_id,
    rankId: r.rank_id,
    titleId: r.title_id,
    rateMode: r.rate_mode,
    effectiveFrom: r.effective_from,
  }
}

/**
 * Everybody who holds an open membership of ONE scheme, keyed by staff id.
 * Scoped by scheme since 2026-09-10: a person may hold one per sub-department,
 * so an unscoped map would keep whichever row came last.
 */
export async function loadOpenPositions(
  supabase: SupabaseClient,
  schemeId: string,
): Promise<Map<string, OpenPosition>> {
  const { data, error } = await supabase
    .from('comm_hierarchy')
    .select('id, staff_id, scheme_id, upline_staff_id, rank_id, title_id, rate_mode, effective_from')
    .eq('scheme_id', schemeId)
    .is('effective_to', null)

  if (error) throw new Error(`Could not read the commission positions: ${safeReason(error)}`)

  return new Map(((data ?? []) as unknown as OpenRow[]).map(r => [r.staff_id, toPosition(r)]))
}

/**
 * YYYY-MM-01 of today in MALAYSIAN wall-clock time — commission settles per
 * calendar month, and the business's calendar is UTC+8. The database twin is
 * `comm_period_start()`; the two must agree, or a rank set at 07:00 on the
 * 1st would open a row for one month while the trigger edits the other.
 */
export function currentPeriodStart(): string {
  return getPeriodMonth()
}

/** The day before an ISO date, for closing a position the day a new one opens. */
export function dayBefore(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/**
 * An UPDATE whose effect is verified, because PostgREST will not tell you.
 *
 * A statement that matched no rows answers exactly as one that matched:
 * `{ error: null }`. So an RLS policy filtering the row away, a row deleted
 * between the read and the write, or a stale id are all indistinguishable from
 * success unless the returned rows are counted.
 */
async function updateChecked(
  supabase: SupabaseClient,
  table: string,
  id: string,
  patch: Record<string, unknown>,
  what: string,
): Promise<void> {
  const { data, error } = await supabase.from(table).update(patch).eq('id', id).select('id')
  if (error) throw new Error(`${what}: ${safeReason(error)}`)
  if (!data || data.length === 0) {
    throw new Error(`${what}: the row is gone, or is not visible to this account`)
  }
}

/**
 * What a database error may be told to the person at the screen.
 *
 * These messages travel as RETURN VALUES, which Next's production redaction
 * of Server Action errors never sees, so raw constraint names, column names
 * and RLS-shaped text would be rendered verbatim to whoever made the move.
 * Known codes get a sentence written here; the triggers that refuse a line
 * write theirs for a reader (23LAD the ladder, 23BND the department edge,
 * 23REC a title that cannot hold downlines, 23RNK a title with no rung) and
 * those pass through; anything else gets a shrug, and the detail stays in the
 * server log.
 */
export function safeReason(error: { code?: string; message: string }): string {
  switch (error.code) {
    case '23514':
      return 'that would put them under their own report'
    case '23LAD':
    case '23BND':
    case '23REC':
    case '23RNK':
    case '23CAP':
    case '23MEM':
      return error.message
    case '23P01':
      return 'they already hold a position covering that period'
    case '23503':
      return 'somebody in that move is no longer on the roster'
    case '42501':
      return 'this account is not allowed to write that'
    default:
      console.error('[hierarchy-writes]', error.code, error.message)
      return 'the database refused it'
  }
}

/** Somebody on the roster, as the two ends of a line need them. */
export interface LineFacts extends LineManager {
  id: string
  active: boolean
  /** Their CURRENT reporting line, read here rather than taken from the client. */
  reportsTo: string | null
  titleId: string | null
  departmentId: string | null
}

interface StaffRow {
  id: string
  employee_name: string
  status: string | null
  reports_to: string | null
  title_id: string | null
  department_id: string | null
  titles: { name: string } | { name: string }[] | null
  departments:
    | { name: string; payroll_source: string }
    | Array<{ name: string; payroll_source: string }>
    | null
}

function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

/**
 * The roster facts a line's two ends need, read fresh. `canRecruit` is asked
 * the way the trigger asks it — does any rung of the title, on the HOME
 * ladder of the person's own department, allow downlines — so the sentence
 * the page shows before the round trip is the sentence the database would
 * have sent.
 */
export async function loadLineFacts(
  supabase: SupabaseClient,
  ids: Array<string | null>,
): Promise<Map<string, LineFacts>> {
  const wanted = [...new Set(ids.filter((id): id is string => !!id))]
  if (wanted.length === 0) return new Map()

  const { data, error } = await supabase
    .from('hr_staff_costs')
    .select(
      'id, employee_name, status, reports_to, title_id, department_id, titles (name), departments (name, payroll_source)',
    )
    .in('id', wanted)
  if (error) throw new Error(`Could not read the roster: ${safeReason(error)}`)
  const rows = (data ?? []) as unknown as StaffRow[]

  // Who may recruit on the home ladder, per (department, title) — the same
  // answer `comm_title_can_recruit` gives the trigger.
  const recruit = new Map<string, boolean | null>()
  await Promise.all(
    rows
      .filter(r => r.department_id && r.title_id && one(r.departments)?.payroll_source === 'commission')
      .map(async r => {
        const { data: can } = await supabase.rpc('comm_title_can_recruit', {
          p_department_id: r.department_id,
          p_title_id: r.title_id,
        })
        recruit.set(r.id, typeof can === 'boolean' ? can : null)
      }),
  )

  return new Map(
    rows.map(r => {
      const dept = one(r.departments)
      return [
        r.id,
        {
          id: r.id,
          name: r.employee_name,
          active: r.status === 'active',
          reportsTo: r.reports_to,
          titleId: r.title_id,
          departmentId: r.department_id,
          title: one(r.titles)?.name ?? null,
          department: dept?.name ?? null,
          commissionDept: dept?.payroll_source === 'commission',
          canRecruit: recruit.get(r.id) ?? null,
        },
      ]
    }),
  )
}

/**
 * What a move came back with. Returned, never thrown, because Next redacts
 * the message of an error thrown out of a Server Action in production and
 * the reason is the whole point of a refusal.
 */
export type LineResult =
  | { ok: true; mover: LineFacts; manager: LineFacts | null }
  | { ok: false; reason: string }

/**
 * Move somebody's reporting line — the home sub-department's line, the one
 * both charts draw.
 *
 * Refused, with the sentence, when the manager is not on the active roster,
 * when the line would cross a commission department's edge, or when the
 * manager's title may not hold downlines (`lib/hierarchy-boundary.ts`). The
 * database refuses the same lines again, plus a loop and a title the ladder
 * ranks below theirs; those come back through `safeReason` in the trigger's
 * own words.
 *
 * The home membership follows inside the same statement — the trigger runs
 * before this returns — so a caller that re-reads the chart afterwards sees
 * both already agreeing.
 */
export async function moveReportingLine(
  supabase: SupabaseClient,
  staffId: string,
  reportsToId: string | null,
): Promise<LineResult> {
  if (!staffId) return { ok: false, reason: 'Which person?' }
  if (reportsToId === staffId) return { ok: false, reason: 'Somebody cannot report to themselves.' }

  const facts = await loadLineFacts(supabase, [staffId, reportsToId])
  const mover = facts.get(staffId)
  if (!mover?.active) return { ok: false, reason: 'That person is not on the active roster.' }
  const manager = reportsToId ? (facts.get(reportsToId) ?? null) : null
  if (reportsToId && !manager?.active) {
    return { ok: false, reason: 'That manager is not on the active roster.' }
  }

  const refusal = lineRefusal(mover, manager)
  if (refusal) return { ok: false, reason: refusal }

  if (mover.reportsTo === reportsToId) return { ok: true, mover, manager }

  const { data, error } = await supabase
    .from('hr_staff_costs')
    .update({ reports_to: reportsToId })
    .eq('id', staffId)
    .select('id')
  if (error) return { ok: false, reason: safeReason(error) }
  if (!data || data.length === 0) {
    return { ok: false, reason: 'the row is gone, or is not visible to this account' }
  }

  return { ok: true, mover: { ...mover, reportsTo: reportsToId }, manager }
}

/** What a membership write is asked to change. Anything absent is kept. */
interface PositionPatch {
  uplineStaffId?: string | null
  rankId?: string
  titleId?: string | null
  rateMode?: 'fixed' | 'variable' | null
}

/**
 * Close the open position and open its replacement — or edit it in place when
 * no month has closed over it yet.
 *
 *   started this month   edit in place. Nothing has been computed from it, and
 *                        closing a row the day before its own start would
 *                        violate the `effective_window` CHECK.
 *   older                close it at `from - 1 day` and insert a fresh row at
 *                        `from`. The ranges abut without overlapping, which is
 *                        what `one_position_per_scheme` (an EXCLUDE over
 *                        `scheme_id` + `staff_id` + daterange) demands.
 *
 * The replacement is one database transaction. A capacity refusal must roll
 * back the close too, even if another move is competing for the same slot.
 */
async function writeEffectiveDated(
  supabase: SupabaseClient,
  userId: string,
  position: OpenPosition,
  patch: PositionPatch,
): Promise<void> {
  const next = {
    upline_staff_id: 'uplineStaffId' in patch ? (patch.uplineStaffId ?? null) : position.uplineStaffId,
    rank_id: patch.rankId ?? position.rankId,
    title_id: 'titleId' in patch ? (patch.titleId ?? null) : position.titleId,
    rate_mode: 'rateMode' in patch ? (patch.rateMode ?? null) : position.rateMode,
  }

  const { error } = await supabase.rpc('comm_replace_membership_position', {
    p_position_id: position.id,
    p_upline_staff_id: next.upline_staff_id,
    p_rank_id: next.rank_id,
    p_title_id: next.title_id,
    p_rate_mode: next.rate_mode,
    p_actor: userId,
  })
  if (error) throw new Error(`Could not record the position: ${safeReason(error)}`)
}

/** The scheme's rungs in the shape titles.ts reasons about. */
export async function loadRungs(supabase: SupabaseClient, schemeId: string): Promise<AssignableRung[]> {
  const { data, error } = await supabase
    .from('comm_ranks')
    .select('id, title_id, can_recruit, sort_order')
    .eq('scheme_id', schemeId)
  if (error) throw new Error(`Could not read the ladder: ${safeReason(error)}`)
  return ((data ?? []) as unknown as Array<{ id: string; title_id: string; can_recruit: boolean; sort_order: number }>).map(
    r => ({ id: r.id, titleId: r.title_id, canRecruit: r.can_recruit, sortOrder: r.sort_order }),
  )
}

/** What the Team tab may change on one membership. */
export interface MembershipFacts {
  /** The title held HERE. Only a non-home chart may pass it; home titles come from People. */
  titleId?: string
  rankId: string
  rateMode: 'fixed' | 'variable' | null
}

/**
 * Set the rank a month pays somebody from in one sub-department, the rate
 * mode that rides with it, and — away from home — the title held there.
 *
 * ONE write, because the two ratchet against each other: a row's form
 * carries the rank select as it stood when the page rendered, and a title
 * raised in the same save would otherwise be followed by that stale rank
 * lowering what the title just raised. So the rank written is the higher of
 * the one asked for and the new title's floor (`rankAfterTitleChange`), and
 * nothing here lowers a rank the title guarantees.
 */
export async function setMembership(
  supabase: SupabaseClient,
  userId: string,
  position: OpenPosition,
  facts: MembershipFacts,
  rungs: readonly AssignableRung[],
): Promise<void> {
  const titleId = facts.titleId ?? position.titleId
  let rankId = facts.rankId
  if (titleId && titleId !== position.titleId) {
    const raised = rankAfterTitleChange(rungs, titleId, rankId)
    if (raised) rankId = raised.id
  }
  if (position.titleId === titleId && position.rankId === rankId && position.rateMode === facts.rateMode) return
  await writeEffectiveDated(supabase, userId, position, { titleId, rankId, rateMode: facts.rateMode })
}

/** Somebody in a sub-department, as its tree's rules need them. */
export interface MemberFacts {
  staffId: string
  name: string
  position: OpenPosition
  /** May the title they hold HERE lead? Null when this ladder does not carry it. */
  canRecruit: boolean | null
}

export type MembershipResult =
  | { ok: true; mover: MemberFacts; upline: MemberFacts | null }
  | { ok: false; reason: string }

/**
 * Move somebody within a NON-home sub-department's tree: who they earn under
 * there. Both must be members; the upline's title here must be able to hold
 * downlines; the line must not loop. The company ladder has no say — a Team
 * Leader may lead a Senior Team Leader in IR if that is how IR is run.
 */
export async function moveMembership(
  supabase: SupabaseClient,
  userId: string,
  schemeId: string,
  staffId: string,
  uplineStaffId: string | null,
): Promise<MembershipResult> {
  if (!staffId) return { ok: false, reason: 'Which person?' }
  if (uplineStaffId === staffId) return { ok: false, reason: 'Somebody cannot be their own upline.' }

  const [positions, rungs, names] = await Promise.all([
    loadOpenPositions(supabase, schemeId),
    loadRungs(supabase, schemeId),
    loadNames(supabase, [staffId, uplineStaffId]),
  ])
  const facts = (id: string): MemberFacts | null => {
    const position = positions.get(id)
    if (!position) return null
    return {
      staffId: id,
      name: names.get(id) ?? 'somebody',
      position,
      canRecruit: titleCanRecruit(rungs, position.titleId),
    }
  }
  const mover = facts(staffId)
  if (!mover) return { ok: false, reason: 'They are not a member of this sub-department.' }
  const upline = uplineStaffId ? facts(uplineStaffId) : null
  if (uplineStaffId && !upline) {
    return { ok: false, reason: 'That person is not a member of this sub-department — add them first.' }
  }
  if (upline && upline.canRecruit !== true) {
    return {
      ok: false,
      reason: `${upline.name} cannot hold downlines here — the title they hold in this sub-department may not lead.`,
    }
  }
  // Walk up from the proposed upline: meeting the mover means a loop. The
  // database trigger refuses it again; this is the readable version.
  let cursor: string | null = uplineStaffId
  for (let depth = 0; cursor && depth < 50; depth++) {
    if (cursor === staffId) return { ok: false, reason: `That would put ${mover.name} under their own downline.` }
    cursor = positions.get(cursor)?.uplineStaffId ?? null
  }

  if (mover.position.uplineStaffId === uplineStaffId) return { ok: true, mover, upline }

  try {
    await writeEffectiveDated(supabase, userId, mover.position, { uplineStaffId })
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'Could not move them' }
  }
  return { ok: true, mover, upline }
}

/**
 * Add somebody from the department to a NON-home sub-department, with the
 * title they hold there. They start at the top of their own tree, at that
 * title's floor rung on this ladder; the chart moves them from there.
 */
export async function openMembership(
  supabase: SupabaseClient,
  userId: string,
  schemeId: string,
  staffId: string,
  titleId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const [positions, rungs] = await Promise.all([loadOpenPositions(supabase, schemeId), loadRungs(supabase, schemeId)])
  if (positions.has(staffId)) return { ok: false, reason: 'They are already a member of this sub-department.' }
  const floor = rankForTitle(rungs, titleId)
  if (!floor) {
    return {
      ok: false,
      reason: 'That title has no rung on this sub-department’s ladder — give it a rank under Rules › Title ladder first.',
    }
  }
  const { error } = await supabase.from('comm_hierarchy').insert({
    scheme_id: schemeId,
    staff_id: staffId,
    title_id: titleId,
    upline_staff_id: null,
    rank_id: floor.id,
    rate_mode: null,
    effective_from: currentPeriodStart(),
    created_by: userId,
  })
  if (error) return { ok: false, reason: safeReason(error) }
  return { ok: true }
}

/**
 * Take somebody out of a NON-home sub-department. Refused while anybody there
 * still earns under them — their downlines would be left pointing at a
 * membership that no longer exists. A membership that started this month
 * is removed outright; an older one is closed at the end of last month, so a
 * month already computed keeps the chart it was computed against.
 */
export async function closeMembership(
  supabase: SupabaseClient,
  schemeId: string,
  staffId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const positions = await loadOpenPositions(supabase, schemeId)
  const position = positions.get(staffId)
  if (!position) return { ok: false, reason: 'They are not a member of this sub-department.' }
  const downlines = [...positions.values()].filter(p => p.uplineStaffId === staffId)
  if (downlines.length > 0) {
    return {
      ok: false,
      reason: `${downlines.length} member${downlines.length === 1 ? '' : 's'} still earn${downlines.length === 1 ? 's' : ''} under them here — move those first.`,
    }
  }
  const from = currentPeriodStart()
  try {
    if (position.effectiveFrom >= from) {
      const { data, error } = await supabase.from('comm_hierarchy').delete().eq('id', position.id).select('id')
      if (error) throw new Error(safeReason(error))
      if (!data || data.length === 0) throw new Error('the row is gone, or is not visible to this account')
    } else {
      await updateChecked(supabase, 'comm_hierarchy', position.id, { effective_to: dayBefore(from) }, 'Could not close their membership')
    }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'Could not remove them' }
  }
  return { ok: true }
}

/** Names for a sentence, never for a decision. */
async function loadNames(supabase: SupabaseClient, ids: Array<string | null>): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => !!id))]
  if (wanted.length === 0) return new Map()
  const { data } = await supabase.from('hr_staff_costs').select('id, employee_name').in('id', wanted)
  return new Map(((data ?? []) as Array<{ id: string; employee_name: string }>).map(r => [r.id, r.employee_name]))
}
