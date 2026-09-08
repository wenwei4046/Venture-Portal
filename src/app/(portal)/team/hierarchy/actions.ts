'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { canAccessRevenue } from '@/lib/roles'
import {
  mirrorDecision,
  mirrorFailed,
  MIRRORED_NOTHING,
  type MirrorOutcome,
} from '@/lib/hierarchy-mirror'
import {
  loadAssignableRungs,
  loadOpenPositions,
  movePositionRank,
  movePositionUpline,
  writeReportsTo,
  type OpenPosition,
} from '@/lib/hierarchy-writes'
import { boundaryRefusal } from '@/lib/hierarchy-boundary'
import { undoPlan, type PriorLine } from '@/lib/hierarchy-undo'
import { titleCanRecruit } from '@/lib/commission/titles'
import { setPosition } from '../../revenue/hierarchy-actions'

/**
 * Moving somebody in the company org chart.
 *
 * Writes `hr_staff_costs.reports_to` — and, since 2026-09-07, the commission
 * upline with it.
 *
 * That is a reversal, and it is worth saying why. Until now this action wrote
 * one column and the doc comment here argued for it: `comm_hierarchy` is
 * effective-dated money, the Team canvas drew that line but never edited it,
 * and moving a salesperson here changed who they reported to and not who
 * earned override on their sales. The cost of that split showed up in use —
 * the two lines drift apart silently, and a salesperson moved to a new manager
 * keeps paying override to the old one until somebody remembers to open a
 * different page under a different permission. The user's ruling is that
 * **editing either graph writes both**.
 *
 * What did NOT change is the discipline the old comment was protecting. The
 * mirror does not mutate a closed position: it goes through the same
 * close-the-old-row / open-a-new-one path, so a month already run still keeps
 * the chart it was run against.
 *
 * Three things can happen to the second half of the write, and the caller is
 * told which — see `MirrorOutcome`. A returned `note` is not decoration; it is
 * the only way the person at the screen learns the two lines now disagree.
 *
 * The canvas refuses an illegal move before calling this, and the database
 * trigger refuses it again. This layer's job is the round trip and the message.
 *
 * With ONE exception, added 2026-09-08: the department boundary
 * (`lib/hierarchy-boundary.ts`) has no trigger behind it. The canvas hides the
 * move and this check is the only thing that refuses it, so it runs before the
 * write rather than after — a reporting line that has already crossed cannot be
 * un-crossed without knowing what it used to be.
 */
export async function setReportsTo(
  staffId: string,
  reportsToId: string | null,
): Promise<MirrorOutcome> {
  const user = await requirePermission('team')

  if (!staffId) throw new Error('Which person?')
  if (reportsToId && reportsToId === staffId) {
    throw new Error('Somebody cannot report to themselves')
  }

  const supabase = await createClient()

  // Both people are read from the roster rather than trusted from the client:
  // the department is what the refusal turns on, and a page held open while
  // somebody was moved between departments would otherwise decide on a stale
  // one. The mover is read even for a detach, because a detach still has to
  // prove the mover exists before `writeReportsTo` reports a row it cannot find
  // as "could not move them".
  const roster = await loadStaff(supabase, [staffId, reportsToId])
  const mover = roster.get(staffId)
  if (!mover) throw new Error('That person is no longer on the roster')
  const manager = reportsToId ? (roster.get(reportsToId) ?? null) : null
  if (reportsToId && !manager) throw new Error('That manager is no longer on the roster')

  const refusal = boundaryRefusal(mover, manager)
  if (refusal) throw new Error(refusal)

  await writeReportsTo(supabase, staffId, reportsToId)

  const outcome = await mirrorToCommission(supabase, user.id, staffId, reportsToId, {
    mayWriteRevenue: canAccessRevenue(user),
    // Inside a commission department the two lines are one graph, so a detach
    // here clears the commission upline too rather than being reported as a
    // half-move. The boundary check above is what makes this safe to assume of
    // the target as well: it cannot be outside.
    oneGraph: mover.commissionDept,
  })

  revalidatePath('/team', 'layout')
  // The commission chart draws the same people; a move here changes what it
  // shows whether or not the mirror ran, because the reporting line is drawn
  // on it too.
  revalidatePath('/revenue', 'layout')

  return outcome
}

/**
 * The commission half of the write.
 *
 * Isolated, and deliberately never rethrows past its own catch: the reporting
 * line is already committed by the time this runs. Turning a mirror failure
 * into a thrown error would tell the user their move did not happen, when it
 * did — they would try again, and the second attempt would be a no-op that
 * looks like a second failure.
 */
async function mirrorToCommission(
  supabase: SupabaseClient,
  userId: string,
  staffId: string,
  reportsToId: string | null,
  opts: { mayWriteRevenue: boolean; oneGraph?: boolean },
): Promise<MirrorOutcome> {
  let positions: Map<string, OpenPosition>
  try {
    positions = await loadOpenPositions(supabase)
  } catch (e) {
    // This used to return "nothing to mirror" on the theory that an unreadable
    // commission table is the same answer as an empty one. It is not: `team`
    // and `revenue` both resolve to the `hr` RLS scope, so this account can
    // read `comm_hierarchy` — a failure here is a real failure, and the
    // reporting line is already committed. Swallowing it is how the two lines
    // end up disagreeing with nothing on screen to say so.
    return mirrorFailed(
      'commission upline',
      e instanceof Error ? e.message : 'the commission positions could not be read',
    )
  }

  const position = positions.get(staffId)
  const onCommission = new Set(positions.keys())

  // The name an OFFER would have to say out loud, and nothing more.
  //
  // Only one of the two offer branches can fire for a given move — a move is
  // either onto somebody or off everybody — so at most one person ever needs
  // naming, and the lookup is skipped entirely when the account could not
  // accept the offer anyway. `mirrorDecision` degrades to its unnamed note
  // when the name is absent, which is exactly what a failed read should
  // produce: the refusal still gets said, it just arrives without a button.
  let offerSubject: string | null = null
  if (opts.mayWriteRevenue) {
    offerSubject =
      reportsToId !== null
        ? onCommission.has(reportsToId)
          ? null
          : reportsToId
        : (position?.uplineStaffId ?? null)
  }
  const named = offerSubject ? await nameQuietly(supabase, offerSubject) : null

  const decision = mirrorDecision({
    staffId,
    targetId: reportsToId,
    onCommission,
    mayWriteOther: opts.mayWriteRevenue,
    oneGraph: opts.oneGraph,
    otherName: 'commission upline',
    targetName: reportsToId !== null ? named?.name : null,
    currentOtherUpline: reportsToId === null ? named : null,
  })

  if (decision.kind === 'noop') return MIRRORED_NOTHING
  if (decision.kind === 'skip') {
    return { mirrored: false, note: decision.note, offer: decision.offer }
  }

  if (!position) return MIRRORED_NOTHING

  // A rank belongs to a scheme, and so does an override differential. This page
  // draws the WHOLE company, so it is the only surface from which somebody
  // could be put under an upline holding a position in a different
  // sub-department — the Revenue chart is scheme-scoped and cannot reach it.
  // Latent while Fair is the only scheme; a money bug the day there are two.
  const target = reportsToId ? positions.get(reportsToId) : null
  if (target && target.schemeId !== position.schemeId) {
    return {
      mirrored: false,
      note: 'Their commission upline was left as it was — that manager earns under a different sub-department’s scheme.',
    }
  }

  try {
    await movePositionUpline(supabase, userId, position, reportsToId)
    return { mirrored: true, note: null }
  } catch (e) {
    return mirrorFailed('commission upline', e instanceof Error ? e.message : String(e))
  }
}

/**
 * Set what a month pays somebody from, without moving them.
 *
 * The Hierarchy table's Rank column. Gated on `revenue`, not on this page's
 * own `team`: a rank is a commission fact, and the fact that both permissions
 * happen to resolve to the same `hr` scope in RLS is a coincidence of the
 * current catalogue, not a licence to let a `team`-only account write the
 * money. The table does not render the control without it, so the redirect
 * `requirePermission` performs is a backstop rather than a path anybody walks.
 *
 * The upline is carried through untouched: `comm_hierarchy` rows are whole, so
 * a rank change that forgot to name the current upline would write NULL and
 * tear the person out of their tree.
 */
export async function setStaffRank(staffId: string, rankId: string): Promise<void> {
  const user = await requirePermission('revenue')
  if (!staffId || !rankId) throw new Error('Which person, and to which rank?')

  const supabase = await createClient()
  const positions = await loadOpenPositions(supabase)
  const position = positions.get(staffId)
  if (!position) {
    throw new Error(
      'They hold no commission position yet — place them on the Revenue chart first, where a scheme can be chosen.',
    )
  }

  const { data: rank } = await supabase
    .from('comm_ranks')
    .select('id, scheme_id')
    .eq('id', rankId)
    .maybeSingle()
  const target = rank as { id: string; scheme_id: string } | null
  if (!target) throw new Error('That rank no longer exists')
  // A rank belongs to a scheme and a position points at one. Crossing them
  // would hand the engine a rate it cannot read for that sub-department.
  if (target.scheme_id !== position.schemeId) {
    throw new Error('That rank belongs to another sub-department’s scheme')
  }

  await movePositionRank(supabase, user.id, position, rankId)

  revalidatePath('/team', 'layout')
  revalidatePath('/revenue', 'layout')
}

/* ------------------------------------------------------------------ *
 * Accepting an offer
 *
 * A `MirrorOutcome` may carry a `MirrorOffer` — the refusal plus the named,
 * one-step way to make it possible. The two actions below are the far end of
 * those two offers, and they are ordinary Server Actions rather than anything
 * clever: the moment they are exported they are browser-callable RPCs, so each
 * one re-gates, re-reads and re-validates every id it is handed. The offer that
 * produced the click is a hint about what the user meant, never evidence about
 * what the database contains.
 *
 * Both are gated on `revenue`, not on this page's own `team`. They write
 * `comm_hierarchy`, which is money. RLS will not stop a `team`-only account —
 * both permissions resolve to the same `hr` scope — so this gate is the entire
 * boundary, and it is deliberately stricter than the page it is called from.
 * ------------------------------------------------------------------ */

interface StaffRow {
  id: string
  employee_name: string
  status: string | null
  reports_to: string | null
  title_id: string | null
  /** PostgREST returns an embed as an object or a one-element array. Both. */
  departments:
    | { name: string; payroll_source: string }
    | Array<{ name: string; payroll_source: string }>
    | null
}

/** What the roster knows about somebody these actions have to name or trust. */
interface StaffFacts {
  id: string
  name: string
  active: boolean
  /** Their CURRENT reporting line, read here rather than taken from the client. */
  reportsTo: string | null
  /**
   * The title they hold, because "may this person hold downlines" is a question
   * about the TITLE and not about the rung a form happened to pick — the same
   * rule `setPosition` and `movePositionUpline` both apply.
   */
  titleId: string | null
  /** Where they work, for a sentence. Null is a real state, not a read failure. */
  department: string | null
  /**
   * True in a department the commission engine pays. The one fact
   * `lib/hierarchy-boundary.ts` decides on: inside such a department the
   * reporting line is also the commission upline, so it may not leave.
   */
  commissionDept: boolean
}

async function loadStaff(
  supabase: SupabaseClient,
  ids: Array<string | null>,
): Promise<Map<string, StaffFacts>> {
  const wanted = [...new Set(ids.filter((id): id is string => !!id))]
  if (wanted.length === 0) return new Map()

  const { data, error } = await supabase
    .from('hr_staff_costs')
    .select('id, employee_name, status, reports_to, title_id, departments (name, payroll_source)')
    .in('id', wanted)
  if (error) throw new Error(`Could not read the roster: ${error.message}`)

  return new Map(
    ((data ?? []) as unknown as StaffRow[]).map(r => {
      const dept = Array.isArray(r.departments) ? (r.departments[0] ?? null) : r.departments
      return [
        r.id,
        {
          id: r.id,
          name: r.employee_name,
          active: r.status === 'active',
          reportsTo: r.reports_to,
          titleId: r.title_id,
          department: dept?.name ?? null,
          commissionDept: dept?.payroll_source === 'commission',
        },
      ]
    }),
  )
}

/**
 * One person's name, or nothing — for a sentence, never for a decision.
 *
 * Swallows its failure on purpose, and this is the one place in this file where
 * that is right. It is called from inside the mirror, which may not throw: the
 * reporting line is already committed by then. A name we cannot read costs the
 * reader a button; a throw here would cost them the whole message.
 */
async function nameQuietly(
  supabase: SupabaseClient,
  staffId: string,
): Promise<{ id: string; name: string } | null> {
  try {
    const found = (await loadStaff(supabase, [staffId])).get(staffId)
    return found ? { id: found.id, name: found.name } : null
  } catch (e) {
    console.error('[hierarchy] could not name a person for an offer', staffId, e)
    return null
  }
}

/**
 * `redirect()` and `notFound()` travel as thrown errors carrying a `digest`.
 *
 * Both actions below catch around calls that can reach a `requirePermission`,
 * and a catch that swallowed one of those would turn a redirect into a note
 * saying the write failed — leaving the user on a page they are no longer
 * allowed to be on, reading a sentence about the database. Rethrow control
 * flow; report real failures.
 */
function isControlFlow(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest
  return typeof digest === 'string' && /^NEXT_(REDIRECT|NOT_FOUND)/.test(digest)
}

/**
 * The message a caught write may show the person at the screen.
 *
 * Returned, never rethrown, and that is the point rather than a shortcut. Next
 * redacts the message of an error thrown out of a Server Action in production —
 * the user would get "an error occurred" where the server knew "that rank
 * belongs to another sub-department's scheme". A return value is not redacted.
 * `hierarchy-writes.ts` already writes its refusals for a reader (`safeReason`)
 * precisely so they can travel this way, so nothing leaks here that was not
 * already written to be read.
 */
function reasonOf(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  // These messages are written as clauses, not sentences — `safeReason` returns
  // "the database refused it", `setPosition` returns "That rank belongs to
  // another sub-department's scheme". Both get quoted mid-sentence here and
  // followed by another one, so the full stop has to be added rather than
  // assumed.
  return raw.replace(/[\s.]+$/, '') + '.'
}

/**
 * The same, for a refusal that came back out of `setPosition`.
 *
 * `reasonOf` is right for everything `hierarchy-writes.ts` composes — each one
 * of those went through `safeReason` and was written to be read. It is wrong
 * for `setPosition`, which interpolates the RAW PostgREST message into its
 * "Could not …" wrappers, so `new row violates row-level security policy for
 * table "comm_hierarchy"` would be printed to whoever pressed the button. That
 * is coach-log B9, and it returns the moment raw text is allowed to travel as a
 * return value. The sentences `setPosition` wrote for a reader — "That rank
 * belongs to another sub-department's scheme" — still travel unchanged; only
 * the wrappers are swapped for something a person can act on.
 */
function safeRefusal(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  if (!/^Could not /.test(raw)) return reasonOf(e)
  console.error('[hierarchy] an enrolment write failed', e)
  return 'the database refused the write — the detail is in the server log, and somebody with Revenue access can place them from the Revenue chart instead.'
}

/** What `enrolAndCompleteMove` is asked to do. Every field is re-checked. */
export interface EnrolAndCompleteInput {
  /** The manager to put on the ladder — the `staffId` of an `enrol` offer. */
  managerId: string
  /** Which sub-department's scheme they join. */
  schemeId: string
  /** Which rung of that scheme's ladder. */
  rankId: string
  /** Whose move raised the offer. Their reporting line is already written. */
  moverId: string
}

/**
 * Put the new manager on the commission ladder, then finish the move that was
 * refused because they were not on it.
 *
 * BOTH HALVES, ALWAYS. Enrolling alone is not a smaller version of this
 * feature, it is the bug this feature exists to kill: `setPosition` mirrors the
 * person it is placing, so enrolling Lucas moves LUCAS's reporting line and
 * never touches the salesperson whose move started all of this. Somebody who
 * accepted the offer and stopped there would get a clean confirmation, a
 * manager on the ladder, and a commission line still pointing at the manager
 * they left — the same silent drift, now with a button on it. So the mover's
 * mirror is re-run here, and the sentence that comes back reports what each
 * half did.
 *
 * The enrolment reuses `setPosition` rather than inserting a row. That action is
 * the only path in the app that can create a `comm_hierarchy` row, and it is the
 * only one that asks whether the rank belongs to the scheme's ladder, whether
 * the upline may recruit, whether the placement closes a cycle, and which month
 * the position starts in. A second insert site would be a second place for those
 * four to rot apart.
 *
 * The manager is placed at the TOP of the commission tree — no upline. Deriving
 * one from their own `reports_to` was the tempting alternative and is refused
 * for the reason the detach branch of `mirrorDecision` gives: an edge on the
 * reporting chart is not evidence about the commission chart. The user asked to
 * put this person on the ladder, so they go on it, and who they sit under is a
 * separate decision somebody makes deliberately on the Revenue chart.
 *
 * Failures divide on whether anything has committed. Nothing has yet while the
 * enrolment is being validated, so its refusal comes back as a note the reader
 * can act on. Once the position exists the re-mirror can only be REPORTED — see
 * `mirrorToCommission`.
 */
export async function enrolAndCompleteMove(
  input: EnrolAndCompleteInput,
): Promise<MirrorOutcome> {
  const user = await requirePermission('revenue')

  const managerId = input.managerId?.trim() ?? ''
  const moverId = input.moverId?.trim() ?? ''
  const schemeId = input.schemeId?.trim() ?? ''
  const rankId = input.rankId?.trim() ?? ''

  if (!managerId || !moverId) throw new Error('Which manager, and whose move?')
  if (!schemeId || !rankId) throw new Error('Pick a sub-department and a rank for them')
  if (managerId === moverId) throw new Error('Somebody cannot be their own upline')

  const supabase = await createClient()

  // Who these two ACTUALLY are, and — the load-bearing part — who the mover
  // actually reports to now. The client's copy of that came from a page render
  // that may be minutes old, and a stale one would aim this money write at the
  // wrong manager.
  const staff = await loadStaff(supabase, [managerId, moverId])
  const manager = staff.get(managerId)
  const mover = staff.get(moverId)
  if (!manager?.active) throw new Error('That manager is not on the active roster')
  if (!mover?.active) throw new Error('That person is not on the active roster')

  /* ---------------------------------------------------------------- *
   * Every precondition runs BEFORE anything commits.
   *
   * The order used to be the other way round: enrol, then discover the move
   * could not be completed. A refusal after the write leaves the manager
   * holding a real `comm_hierarchy` row — a position a month is paid from —
   * for a move that never happened, and no gesture on this page takes one
   * back. So each check below returns a note and writes nothing.
   * ---------------------------------------------------------------- */

  // The mover's line moved out from under the offer between the render and the
  // click. This used to be written anyway and reported afterwards, which put a
  // manager on the ladder for a relationship that no longer exists.
  if (mover.reportsTo !== managerId) {
    return {
      mirrored: false,
      note: `${mover.name} no longer reports to ${manager.name} — the reporting line changed since this was offered, so nothing was changed. Move them again if you still meant it.`,
    }
  }

  // The department boundary, checked a second time and not redundantly.
  // `setReportsTo` stops a crossing line from being DRAWN, so no offer to enrol
  // across one can be produced any more — but this action is exported, and a
  // line drawn before the rule existed is still sitting in the roster waiting
  // to be completed. Enrolling on the strength of one is exactly the bug the
  // rule was written for: the manager would earn the override, and the Revenue
  // chart would not show them.
  const refusal = boundaryRefusal(mover, manager)
  if (refusal) return { mirrored: false, note: `${refusal} Nothing was changed.` }

  const before = await loadOpenPositions(supabase)

  const moverPosition = before.get(moverId)
  if (!moverPosition) {
    return {
      mirrored: false,
      note: `${mover.name} holds no commission position of their own, so there is no commission upline to move and putting ${manager.name} on the ladder would complete nothing. Nothing was changed.`,
    }
  }

  // An override differential belongs to ONE scheme, and `mirrorToCommission`
  // refuses a cross-scheme upline unconditionally. Enrolling into a scheme the
  // mover does not earn under is therefore knowably useless before it is
  // written — which makes it a refusal, not a note after the fact.
  if (moverPosition.schemeId !== schemeId) {
    return {
      mirrored: false,
      note: `${manager.name} was not put on that sub-department's ladder — it is not the one ${mover.name} earns under, and an override belongs to a single scheme, so the move could not have followed them across. Nothing was changed.`,
    }
  }

  let ladder: Array<{ id: string; titleId: string; canRecruit: boolean; sortOrder: number }>
  try {
    ladder = await loadAssignableRungs(supabase, schemeId)
  } catch (e) {
    if (isControlFlow(e)) throw e
    return {
      mirrored: false,
      note: `${manager.name} could not be put on the commission ladder: ${safeRefusal(e)} Nothing was changed.`,
    }
  }

  // Who may hold downlines, asked here rather than met on the way out. The rank
  // picker is not filtered by `can_recruit`, so a rung that forbids it is a live
  // choice — and the re-mirror's `movePositionUpline` applies exactly this rule
  // and THROWS, which used to happen after the enrolment had already committed.
  // Same rule and same fallbacks as `setPosition`: the title decides, and only
  // somebody the ladder does not carry is judged by the rung they were put on.
  const chosen = ladder.find(r => r.id === rankId)
  const byTitle = titleCanRecruit(ladder, manager.titleId)
  if ((byTitle ?? chosen?.canRecruit ?? true) === false) {
    const what = byTitle === null ? 'the rank chosen for them is' : 'their title is'
    return {
      mirrored: false,
      note: `${manager.name} was not put on the commission ladder — ${what} not allowed to hold downlines, so ${mover.name}'s override would have nowhere to land. Pick a rung that may recruit, or promote them first. Nothing was changed.`,
    }
  }

  // Already on the ladder — so the offer was stale, and re-running `setPosition`
  // would not be a no-op: it would MOVE them, to whatever rank this call happens
  // to carry and to no upline at all. Accepting an offer is consent to enrol
  // somebody, never consent to rewrite a position they already hold.
  const held = before.get(managerId)

  // …with one exception, and it is the retry this form depends on. When the
  // enrolment lands and the re-mirror does not, the prompt stays on screen so
  // another rung can be chosen; skipping the write as "already enrolled" threw
  // that second choice away in silence, leaving a control that only looked like
  // it worked. A RANK move is not a rewrite of their position —
  // `movePositionRank` keeps the upline they hold and the same close-and-reopen
  // discipline — so it is the one field a repeated accept will move.
  let reranked = false
  if (held) {
    if (held.schemeId !== schemeId) {
      return {
        mirrored: false,
        note: `${manager.name} already earns under a different sub-department's scheme, so ${mover.name}'s override cannot land on them. Move ${manager.name} on the Revenue chart first. Nothing was changed.`,
      }
    }
    reranked = held.rankId !== rankId
    if (reranked) {
      try {
        await movePositionRank(supabase, user.id, held, rankId)
      } catch (e) {
        if (isControlFlow(e)) throw e
        return {
          mirrored: false,
          note: `${manager.name}'s commission rank could not be changed: ${safeRefusal(e)} Nothing else was changed.`,
        }
      }
    }
  } else {
    try {
      await setPosition({
        staffId: managerId,
        schemeId,
        rankId,
        uplineStaffId: null,
        rateMode: null,
      })
    } catch (e) {
      if (isControlFlow(e)) throw e
      return {
        mirrored: false,
        note: `${manager.name} could not be put on the commission ladder: ${safeRefusal(e)} Nothing was changed.`,
      }
    }
  }

  // `setPosition`'s own outcome is deliberately dropped, which is worth the
  // sentence it costs to say why. It reports on the mirror of the placement just
  // made — a first placement with no upline, which its mirror reads as a DETACH
  // and answers "their reporting line was left as it was". True of every
  // enrolment, about the wrong person, and read here it would look like a
  // warning about the move the user is actually making. It would also carry a
  // title-gap nudge when the chosen rank outranks the manager's title; that one
  // is a real loss, and it is the smaller one — the Revenue chart says it again
  // the next time anything touches their position.
  const outcome = await mirrorToCommission(supabase, user.id, moverId, mover.reportsTo, {
    mayWriteRevenue: true,
    oneGraph: mover.commissionDept,
  })

  revalidatePath('/team', 'layout')
  revalidatePath('/revenue', 'layout')

  const enrolled = !held
    ? `${manager.name} is now on the commission ladder`
    : reranked
      ? `${manager.name} is now on the rank you picked`
      : `${manager.name} already holds a commission position`

  if (outcome.mirrored) {
    return {
      mirrored: true,
      note: `${enrolled}, and ${mover.name}'s commission upline moved with them.`,
    }
  }

  // A null note here is the mirror's "nothing to mirror", and the mover's own
  // open position was read a few lines up — so reaching this means it went away
  // between that read and this write. Silence is honest for a mirror and wrong
  // for this action: somebody pressed a button offering to complete a move, and
  // has to learn the move had no commission half left to complete.
  const why =
    outcome.note ??
    `${mover.name} no longer holds a commission position, so there was no commission upline to move.`

  return {
    mirrored: false,
    note: `${enrolled}, but ${mover.name}'s commission upline still did not move. ${why}`,
    offer: outcome.offer,
  }
}

/**
 * Take somebody off the top of the commission tree as well.
 *
 * The far end of the `detach` offer. `mirrorDecision` refuses to copy a detach
 * across on its own and says why: the two trees hold different people, and
 * somebody can top the commission tree while still reporting to a manager who
 * earns no override on them. Copying an absence across would delete a real
 * relationship on the strength of a gap in the other chart — which on this side
 * means quietly changing who gets paid. That is bug B7, and it is not a bug
 * about the write being wrong; it is a bug about nobody having asked for it.
 *
 * So this stays an OFFER, and nothing calls it except a person choosing it. An
 * absence on one chart is not evidence about the other. A click is, and it is
 * the only kind of evidence there is.
 *
 * The clear itself goes through `movePositionUpline`, so it obeys the same
 * effective-dated discipline as every other position write: a position older
 * than this month is closed at the end of last month and reopened without the
 * upline. Nothing about the word "clear" makes it safe to edit history in place.
 */
export async function detachCommissionUpline(staffId: string): Promise<MirrorOutcome> {
  const user = await requirePermission('revenue')

  const id = staffId?.trim() ?? ''
  if (!id) throw new Error('Which person?')

  const supabase = await createClient()

  const positions = await loadOpenPositions(supabase)
  const position = positions.get(id)
  // Both of these are answers, not errors: the offer was rendered against a page
  // that has since moved on. Saying so beats throwing, because there is nothing
  // here for the reader to fix.
  if (!position) {
    return {
      mirrored: false,
      note: 'They hold no commission position, so there is no commission upline to clear.',
    }
  }
  if (position.uplineStaffId === null) {
    return {
      mirrored: false,
      note: 'Their commission upline is already clear — they sit at the top of the commission tree.',
    }
  }

  const staff = await loadStaff(supabase, [id, position.uplineStaffId])
  const person = staff.get(id)?.name ?? 'That person'
  const upline = staff.get(position.uplineStaffId)?.name ?? 'their previous upline'

  try {
    await movePositionUpline(supabase, user.id, position, null)
  } catch (e) {
    if (isControlFlow(e)) throw e
    // Nothing committed — `writeEffectiveDated` reopens the row it closed — so
    // this is a refusal rather than a half-done write, and it is returned for
    // the same reason `reasonOf` exists.
    return {
      mirrored: false,
      note: `Their commission upline could not be cleared: ${reasonOf(e)}`,
    }
  }

  revalidatePath('/team', 'layout')
  revalidatePath('/revenue', 'layout')

  return {
    mirrored: true,
    note: `${person} no longer earns under ${upline} — their commission upline is clear from this month on. Months already run keep the chart they were run against.`,
  }
}

/* ------------------------------------------------------------------ *
 * Putting one move back
 *
 * The user asked for this the moment the chart became draggable
 * (2026-09-07: "i lowkey need an undo button when theres graph ui
 * involved"), and the reason is the gesture rather than the feature: a drop
 * onto the wrong card is one pixel away from a drop onto the right one, and
 * until now the only way back was to remember who the manager used to be.
 *
 * It is deliberately NOT a general undo. The rules it obeys are in
 * `lib/hierarchy-undo.ts`; what matters here is that this action re-reads
 * everything and refuses rather than forces. The values it is handed came
 * from a browser and are a claim about the past, never evidence about the
 * present.
 * ------------------------------------------------------------------ */

/** What the chart remembered before it moved somebody. Every field is re-checked. */
export interface UndoMoveInput {
  staffId: string
  /** The reporting line to put back. Null = they were at the top. */
  reportsTo: string | null
  /** The commission upline to put back. */
  commUplineId: string | null
  /** Did that move's mirror write the commission upline? From its outcome. */
  mirrored: boolean
  /** What the move set the reporting line TO. The staleness check reads this. */
  movedTo: string | null
}

/**
 * What an undo did.
 *
 * Its own type rather than a borrowed `MirrorOutcome`, because the two say
 * different things with the same word. A mirror's `mirrored: false` can mean
 * "there was nothing to mirror", which is a success; an undo has to be able to
 * say "some of that did not go back", which never is. The note is never null —
 * somebody pressed a button and is owed a sentence about what happened.
 */
export interface UndoOutcome {
  /** True only when everything that move changed has been put back. */
  undone: boolean
  note: string
}

export async function undoHierarchyMove(input: UndoMoveInput): Promise<UndoOutcome> {
  // The same gate as the move itself. An undo is not a smaller permission than
  // the thing it reverses — it writes the same column.
  const user = await requirePermission('team')

  const staffId = input.staffId?.trim() ?? ''
  if (!staffId) throw new Error('Which person?')
  if (input.reportsTo === staffId) throw new Error('Somebody cannot report to themselves')

  const supabase = await createClient()

  const roster = await loadStaff(supabase, [staffId, input.reportsTo])
  const mover = roster.get(staffId)
  if (!mover) throw new Error('That person is no longer on the roster')

  // The position is read before the plan, not after: whether they still hold
  // one is one of the facts the plan turns on.
  let positions: Map<string, OpenPosition>
  try {
    positions = await loadOpenPositions(supabase)
  } catch (e) {
    return {
      undone: false,
      note: `The commission positions could not be read, so it is not safe to put that move back — half of it would go and half would not. ${reasonOf(e)}`,
    }
  }
  const position = positions.get(staffId)

  const prior: PriorLine = {
    staffId,
    // Read, not taken from the client. The name goes into a sentence somebody
    // acts on, and this action is an exported RPC like any other.
    staffName: mover.name,
    reportsTo: input.reportsTo,
    commUplineId: input.commUplineId,
    mirrored: input.mirrored,
    movedTo: input.movedTo,
  }

  const plan = undoPlan(prior, {
    reportsTo: mover.reportsTo,
    hasPosition: !!position,
    commUplineId: position?.uplineStaffId ?? null,
  })

  if (plan.kind === 'refuse') return { undone: false, note: plan.note }

  // The manager they are going back to has to still exist, and the line has to
  // still be legal. A department boundary has no trigger behind it, so a
  // manager moved out of the commission department since the original move
  // would let the undo draw exactly the line `boundaryRefusal` exists to stop.
  let manager: StaffFacts | null = null
  if (plan.reportsTo) {
    manager = roster.get(plan.reportsTo) ?? null
    if (!manager) {
      return {
        undone: false,
        note: `${mover.name}'s previous manager is no longer on the roster, so there is nothing to put them back under. Nothing was changed.`,
      }
    }
    const crossing = boundaryRefusal(mover, manager)
    if (crossing) return { undone: false, note: `${crossing} Nothing was changed.` }
  }

  try {
    await writeReportsTo(supabase, staffId, plan.reportsTo)
  } catch (e) {
    if (isControlFlow(e)) throw e
    // Nothing has committed yet, so this is a clean refusal — the ladder
    // trigger, a cycle, or a row that went away. Returned rather than thrown so
    // the reason survives Next's production redaction.
    return {
      undone: false,
      note: `${mover.name} could not be put back: ${reasonOf(e)} Nothing was changed.`,
    }
  }

  const back = plan.reportsTo
    ? `${mover.name} reports to ${manager!.name} again.`
    : `${mover.name} reports to nobody again.`

  if (plan.commission === 'leave') {
    await revalidateHierarchy()
    return { undone: true, note: plan.note ? `${back} ${plan.note}` : back }
  }

  // The commission half. Gated on `revenue` and not on this page's `team` for
  // the reason every other write to `comm_hierarchy` is: it is money, and the
  // two permissions sharing an RLS scope is a coincidence of the catalogue
  // rather than a licence. From here on the reporting line is already
  // committed, so every failure is REPORTED and none is thrown.
  if (!canAccessRevenue(user)) {
    await revalidateHierarchy()
    return {
      undone: false,
      note: `${back} Their commission upline was left where the move put it — that needs Revenue access, so somebody who has it will have to put it back on the Revenue chart.`,
    }
  }

  const target = plan.commUplineId ? positions.get(plan.commUplineId) : null
  if (plan.commUplineId && (!target || target.schemeId !== position!.schemeId)) {
    await revalidateHierarchy()
    return {
      undone: false,
      note: `${back} Their commission upline was left where the move put it — the manager it would go back to ${target ? 'earns under a different sub-department’s scheme' : 'holds no commission position any more'}.`,
    }
  }

  try {
    await movePositionUpline(supabase, user.id, position!, plan.commUplineId)
  } catch (e) {
    if (isControlFlow(e)) throw e
    await revalidateHierarchy()
    return {
      undone: false,
      note: `${back} Their commission upline could not be put back: ${reasonOf(e)} The two lines disagree until somebody fixes it on the Revenue chart.`,
    }
  }

  await revalidateHierarchy()
  return {
    undone: true,
    note: plan.commUplineId
      ? `${back} Their commission upline went back with them.`
      : `${back} Their commission upline is clear again, so nobody earns an override on their sales.`,
  }
}

/** Both charts draw both lines, so both are stale after either half moves. */
async function revalidateHierarchy(): Promise<void> {
  revalidatePath('/team', 'layout')
  revalidatePath('/revenue', 'layout')
}
