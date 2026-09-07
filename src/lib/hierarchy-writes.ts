import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { rankAfterTitleChange, titleCanRecruit, type LadderRung } from '@/lib/commission/titles'
import { getPeriodMonth } from '@/lib/utils'

/**
 * The two low-level hierarchy writes, in one place so that both Server Actions
 * can perform each other's half without calling each other.
 *
 * That last clause is the whole point. The user's "double write" ruling means
 * moving somebody on the org chart must also move their commission upline, and
 * vice versa. The obvious implementation — `setReportsTo` calls `setPosition`,
 * `setPosition` calls `setReportsTo` — is a mutual recursion waiting for the
 * day somebody removes a guard clause. Instead both actions call the plain
 * functions below, which know nothing about mirroring and cannot trigger one.
 * The recursion is impossible structurally rather than prevented by a flag.
 *
 * NOT a `'use server'` module: nothing here may become a callable endpoint.
 * Every function takes an already-authorised client and trusts the caller to
 * have run its gate — the gates live in the actions, where the redirect
 * semantics of `requirePermission` belong.
 *
 * `comm_*` postdates database.types.ts — untyped-client convention.
 */

/** A person's open commission position, as the mirror needs to see it. */
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
 * `staff_id` alone, so a person has at most one of these company-wide, and the
 * question the mirror asks — "is this person on commission at all" — is a
 * company-wide question.
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
 * calendar month, and the business's calendar is UTC+8.
 *
 * Delegates to `getPeriodMonth` rather than deriving the month from raw UTC.
 * The difference is not cosmetic: the server runs in UTC, so for the first
 * eight hours of the 1st it is still the previous month there. A move made at
 * 07:00 on 1 October would compute `from = '2026-09-01'`, decide September's
 * position "started this month", and EDIT SEPTEMBER IN PLACE — overwriting the
 * chart a September run was computed against, which is the one invariant every
 * comment in this file swears to.
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
 * success. Everything this module writes is one half of a pair, and a half that
 * reports a success it did not achieve is the precise failure the double write
 * exists to prevent — so no bare `.update()` survives in this file.
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
 * These messages travel further than a thrown error does: the mirror turns them
 * into a `MirrorOutcome.note`, which is a RETURN VALUE, so Next's production
 * redaction of Server Action errors never sees it. Constraint names, column
 * names and RLS-shaped text would be rendered verbatim to whoever made the
 * move. Known codes get a sentence written here; anything else gets a shrug,
 * and the detail stays in the server log where it belongs.
 */
function safeReason(error: { code?: string; message: string }): string {
  switch (error.code) {
    case '23514':
      return 'that would put them under their own report'
    case '23LAD':
      // The ladder trigger's own message is written for a reader — it names
      // both people and both titles and nothing else.
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

/**
 * `hr_staff_costs.reports_to`, written and CHECKED.
 *
 * The check is not defensive noise. PostgREST answers an UPDATE that matched
 * no rows exactly as it answers one that matched — `{ error: null }` — so an
 * RLS policy quietly filtering the row away is indistinguishable from a
 * successful write unless the returned rows are counted. A mirror that reports
 * success it did not achieve is worse than one that refuses.
 */
export async function writeReportsTo(
  supabase: SupabaseClient,
  staffId: string,
  reportsToId: string | null,
): Promise<void> {
  await updateChecked(
    supabase,
    'hr_staff_costs',
    staffId,
    { reports_to: reportsToId },
    'Could not move them',
  )
}

interface RecruitRow {
  title_id: string
  can_recruit: boolean
  sort_order: number
}

/**
 * Close the open position and open its replacement — or edit it in place when
 * no month has closed over it yet.
 *
 * Written once and called by both movers. The two gestures that reach it (a
 * chart drag moves an upline, a title change raises a rank) differ only in
 * which field they carry; the discipline below is identical, and it is the part
 * that must not drift:
 *
 *   started this month   edit in place. Nothing has been computed from it, and
 *                        closing a row the day before its own start would
 *                        violate the `effective_window` CHECK.
 *   older                close it at `from - 1 day` and insert a fresh row at
 *                        `from`. The ranges abut without overlapping, which is
 *                        what `one_position_at_a_time` (an EXCLUDE over
 *                        `staff_id` + daterange) demands.
 *
 * Every step is checked, including the roll-back. The comment that used to sit
 * on the roll-back said a person with no open position is paid nothing next
 * month — and then discarded the result that would have told us whether the
 * roll-back worked. If the restore itself fails the caller is told exactly
 * that, because the person is now in the state the comment was afraid of.
 */
async function writeEffectiveDated(
  supabase: SupabaseClient,
  userId: string,
  position: OpenPosition,
  next: { uplineStaffId: string | null; rankId: string },
): Promise<void> {
  const from = currentPeriodStart()

  if (position.effectiveFrom >= from) {
    await updateChecked(
      supabase,
      'comm_hierarchy',
      position.id,
      { upline_staff_id: next.uplineStaffId, rank_id: next.rankId },
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
    upline_staff_id: next.uplineStaffId,
    rank_id: next.rankId,
    rate_mode: position.rateMode,
    effective_from: from,
    created_by: userId,
  })
  if (!error) return

  const reason = safeReason(error)
  try {
    await updateChecked(
      supabase,
      'comm_hierarchy',
      position.id,
      { effective_to: null },
      'restore',
    )
  } catch {
    throw new Error(
      `Could not record the new position (${reason}), and their old one could not be reopened — they now hold NO open position and would be paid nothing next month. Place them on the Revenue chart.`,
    )
  }
  throw new Error(`Could not record the new position: ${reason}`)
}

/**
 * Move somebody's commission upline, keeping the rank and rate mode they hold.
 *
 * Throws rather than returning a flag. The caller has already committed the
 * other half of the write and turns this into a note the user reads; see
 * `mirrorFailed`.
 */
export async function movePositionUpline(
  supabase: SupabaseClient,
  userId: string,
  position: OpenPosition,
  uplineStaffId: string | null,
): Promise<void> {
  if (uplineStaffId === position.staffId) {
    throw new Error('somebody cannot be their own upline')
  }
  if (position.uplineStaffId === uplineStaffId) return

  if (uplineStaffId) {
    // Who may hold downlines follows the TITLE, not the month's rank (user
    // 2026-09-03) — the same rule `setPosition` applies, asked the same way,
    // so a move refused there is refused here for the same stated reason.
    const [{ data: ladder }, { data: uplineStaff }] = await Promise.all([
      supabase.from('comm_ranks').select('title_id, can_recruit, sort_order').eq('scheme_id', position.schemeId),
      supabase.from('hr_staff_costs').select('title_id, employee_name').eq('id', uplineStaffId).maybeSingle(),
    ])

    const rungs: LadderRung[] = ((ladder ?? []) as unknown as RecruitRow[]).map(r => ({
      titleId: r.title_id,
      canRecruit: r.can_recruit,
      sortOrder: r.sort_order,
    }))
    const upline = uplineStaff as { title_id: string | null; employee_name: string } | null
    // `null` means the ladder does not carry their title — outside the rule,
    // not refused by it, exactly as `setPosition` treats somebody untitled.
    if (titleCanRecruit(rungs, upline?.title_id ?? null) === false) {
      throw new Error(
        `${upline?.employee_name ?? 'that manager'}'s title is not allowed to hold downlines`,
      )
    }
  }

  await writeEffectiveDated(supabase, userId, position, {
    uplineStaffId,
    rankId: position.rankId,
  })
}

/**
 * Move somebody's commission RANK, keeping the upline they already have.
 *
 * Split from `movePositionUpline` because the two are asked for by different
 * gestures and neither should carry the other's argument along as a null that
 * means "leave it alone". The write itself is shared.
 */
export async function movePositionRank(
  supabase: SupabaseClient,
  userId: string,
  position: OpenPosition,
  rankId: string,
): Promise<void> {
  if (position.rankId === rankId) return

  await writeEffectiveDated(supabase, userId, position, {
    uplineStaffId: position.uplineStaffId,
    rankId,
  })
}

interface AssignableRow {
  id: string
  title_id: string
  can_recruit: boolean
  sort_order: number
}

/** The scheme's rungs in the shape `rankAfterTitleChange` reasons about. */
export async function loadAssignableRungs(
  supabase: SupabaseClient,
  schemeId: string,
): Promise<Array<{ id: string; titleId: string; canRecruit: boolean; sortOrder: number }>> {
  const { data, error } = await supabase
    .from('comm_ranks')
    .select('id, title_id, can_recruit, sort_order')
    .eq('scheme_id', schemeId)
  if (error) throw new Error(`Could not read the ladder: ${safeReason(error)}`)
  return ((data ?? []) as unknown as AssignableRow[]).map(r => ({
    id: r.id,
    titleId: r.title_id,
    canRecruit: r.can_recruit,
    sortOrder: r.sort_order,
  }))
}

/**
 * The rank a TITLE assigns, written.
 *
 * "A title assigns the rank automatically" (user). The mapping is
 * `rankAfterTitleChange` — a ratchet, so this only ever raises somebody, never
 * claws back a rank they were deliberately placed above.
 *
 * Silent no-ops, all of them legitimate and none worth a message:
 *   - the person holds no open commission position (they are not on commission);
 *   - the scheme's ladder does not carry their new title (a Finance title never
 *     will);
 *   - their rank already sits at or above the title's floor.
 *
 * Returns the rank it moved them to, or null when it moved nothing, so the
 * caller can say "…and their rank moved up with it" only when it did.
 */
export async function syncRankToTitle(
  supabase: SupabaseClient,
  userId: string,
  staffId: string,
  titleId: string | null,
): Promise<string | null> {
  const positions = await loadOpenPositions(supabase)
  const position = positions.get(staffId)
  if (!position) return null

  const rungs = await loadAssignableRungs(supabase, position.schemeId)
  const target = rankAfterTitleChange(rungs, titleId, position.rankId)
  if (!target) return null

  await movePositionRank(supabase, userId, position, target.id)
  return target.id
}
