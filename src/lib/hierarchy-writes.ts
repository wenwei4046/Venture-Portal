import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getPeriodMonth } from '@/lib/utils'
import { lineRefusal, type LineManager } from '@/lib/hierarchy-boundary'

/**
 * The hierarchy writes, in one place so that every Server Action moves the
 * same line the same way.
 *
 * ONE LINE (user, 2026-09-10): inside a commission department the reporting
 * line IS the commission upline. `hr_staff_costs.reports_to` is the fact; the
 * position the engine reads (`comm_hierarchy`) is derived from it by the
 * database — trigger `hr_staff_costs_one_line_sync`, migration
 * 20260910120000 — with the rank the title guarantees, ratcheted up and never
 * down. So there are exactly two writes left here:
 *
 *   moveReportingLine   who somebody reports to. The position follows in the
 *                       same transaction; nothing here writes it. Both charts
 *                       call this, each behind its own gate.
 *   movePositionRank    the one fact a human still sets by hand: the rank a
 *                       month pays from. Effective-dated like every position
 *                       write before it.
 *
 * The mirror that used to live here — write one table, then try the other,
 * then say what could not be done — is gone with the reason for it. Two
 * tables that cannot disagree need no note saying they might.
 *
 * NOT a `'use server'` module: nothing here may become a callable endpoint.
 * Every function takes an already-authorised client and trusts the caller to
 * have run its gate — the gates live in the actions, where the redirect
 * semantics of `requirePermission` belong.
 *
 * `comm_*` postdates database.types.ts — untyped-client convention.
 */

/** A person's open commission position, as a rank edit needs to see it. */
export interface OpenPosition {
  id: string
  staffId: string
  schemeId: string
  uplineStaffId: string | null
  rankId: string
  rateMode: 'fixed' | 'variable' | null
  effectiveFrom: string
}

interface OpenRow {
  id: string
  staff_id: string
  scheme_id: string
  upline_staff_id: string | null
  rank_id: string
  rate_mode: 'fixed' | 'variable' | null
  effective_from: string
}

/**
 * Everybody who holds an open commission position, keyed by staff id.
 *
 * Unscoped by scheme on purpose: `one_position_at_a_time` is an EXCLUDE over
 * `staff_id` alone, so a person has at most one of these company-wide.
 */
export async function loadOpenPositions(
  supabase: SupabaseClient,
): Promise<Map<string, OpenPosition>> {
  const { data, error } = await supabase
    .from('comm_hierarchy')
    .select('id, staff_id, scheme_id, upline_staff_id, rank_id, rate_mode, effective_from')
    .is('effective_to', null)

  if (error) throw new Error(`Could not read the commission positions: ${safeReason(error)}`)

  return new Map(
    ((data ?? []) as unknown as OpenRow[]).map(r => [
      r.staff_id,
      {
        id: r.id,
        staffId: r.staff_id,
        schemeId: r.scheme_id,
        uplineStaffId: r.upline_staff_id,
        rankId: r.rank_id,
        rateMode: r.rate_mode,
        effectiveFrom: r.effective_from,
      },
    ]),
  )
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
 * 23REC a title that cannot hold downlines) and those pass through; anything
 * else gets a shrug, and the detail stays in the server log.
 */
export function safeReason(error: { code?: string; message: string }): string {
  switch (error.code) {
    case '23514':
      return 'that would put them under their own report'
    case '23LAD':
    case '23BND':
    case '23REC':
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
 * the way the trigger asks it — does any rung of the title, on the ladders of
 * the person's own department, allow downlines — so the sentence the page
 * shows before the round trip is the sentence the database would have sent.
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

  // Who may recruit, per (department, title). Read only for the departments
  // in play — a handful of rows.
  const deptIds = [...new Set(rows.map(r => r.department_id).filter((d): d is string => !!d))]
  const recruit = new Map<string, boolean>()
  if (deptIds.length > 0) {
    const { data: rungs } = await supabase
      .from('comm_ranks')
      .select('title_id, can_recruit, comm_schemes!inner (comm_sub_departments!inner (department_id))')
      .in('comm_schemes.comm_sub_departments.department_id', deptIds)
    for (const r of (rungs ?? []) as unknown as Array<{
      title_id: string
      can_recruit: boolean
      comm_schemes: { comm_sub_departments: { department_id: string } | { department_id: string }[] } | null
    }>) {
      const sub = one(r.comm_schemes?.comm_sub_departments)
      if (!sub) continue
      const key = `${sub.department_id}:${r.title_id}`
      recruit.set(key, (recruit.get(key) ?? false) || r.can_recruit)
    }
  }

  return new Map(
    rows.map(r => {
      const dept = one(r.departments)
      const key = r.department_id && r.title_id ? `${r.department_id}:${r.title_id}` : null
      return [
        r.id,
        {
          id: r.id,
          name: r.employee_name,
          active: r.status === 'active',
          reportsTo: r.reports_to,
          titleId: r.title_id,
          title: one(r.titles)?.name ?? null,
          department: dept?.name ?? null,
          commissionDept: dept?.payroll_source === 'commission',
          canRecruit: key ? (recruit.get(key) ?? null) : null,
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
 * Move somebody's reporting line — the one line both charts draw.
 *
 * Refused, with the sentence, when the manager is not on the active roster,
 * when the line would cross a commission department's edge, or when the
 * manager's title may not hold downlines (`lib/hierarchy-boundary.ts`). The
 * database refuses the same lines again, plus a loop and a title the ladder
 * ranks below theirs; those come back through `safeReason` in the trigger's
 * own words.
 *
 * The commission position follows inside the same statement — the trigger
 * runs before this returns — so a caller that re-reads the chart afterwards
 * sees both lines already agreeing.
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

/**
 * Close the open position and open its replacement — or edit it in place when
 * no month has closed over it yet.
 *
 *   started this month   edit in place. Nothing has been computed from it, and
 *                        closing a row the day before its own start would
 *                        violate the `effective_window` CHECK.
 *   older                close it at `from - 1 day` and insert a fresh row at
 *                        `from`. The ranges abut without overlapping, which is
 *                        what `one_position_at_a_time` (an EXCLUDE over
 *                        `staff_id` + daterange) demands.
 *
 * Every step is checked, including the roll-back: if the restore itself fails
 * the caller is told exactly that, because the person then holds NO open
 * position and would be paid nothing next month.
 */
async function writeEffectiveDated(
  supabase: SupabaseClient,
  userId: string,
  position: OpenPosition,
  next: { rankId: string; rateMode: 'fixed' | 'variable' | null },
): Promise<void> {
  const from = currentPeriodStart()

  if (position.effectiveFrom >= from) {
    await updateChecked(
      supabase,
      'comm_hierarchy',
      position.id,
      { rank_id: next.rankId, rate_mode: next.rateMode },
      'Could not update their position',
    )
    return
  }

  await updateChecked(
    supabase,
    'comm_hierarchy',
    position.id,
    { effective_to: dayBefore(from) },
    'Could not close their old position',
  )

  const { error } = await supabase.from('comm_hierarchy').insert({
    scheme_id: position.schemeId,
    staff_id: position.staffId,
    upline_staff_id: position.uplineStaffId,
    rank_id: next.rankId,
    rate_mode: next.rateMode,
    effective_from: from,
    created_by: userId,
  })
  if (!error) return

  const reason = safeReason(error)
  try {
    await updateChecked(supabase, 'comm_hierarchy', position.id, { effective_to: null }, 'restore')
  } catch {
    throw new Error(
      `Could not record the new position (${reason}), and their old one could not be reopened — they now hold NO open position and would be paid nothing next month. Set their rank again on the Team tab.`,
    )
  }
  throw new Error(`Could not record the new position: ${reason}`)
}

/**
 * Set somebody's commission RANK (and the rate mode that rides with it),
 * keeping the upline the reporting line gives them. The one hierarchy fact a
 * human still enters by hand.
 */
export async function movePositionRank(
  supabase: SupabaseClient,
  userId: string,
  position: OpenPosition,
  rankId: string,
  rateMode: 'fixed' | 'variable' | null,
): Promise<void> {
  if (position.rankId === rankId && position.rateMode === rateMode) return
  await writeEffectiveDated(supabase, userId, position, { rankId, rateMode })
}
