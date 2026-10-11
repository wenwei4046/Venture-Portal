'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireActionOn } from '@/lib/auth'
import { loadLineFacts, moveReportingLine, type LineResult } from '@/lib/hierarchy-writes'
import { undoPlan } from '@/lib/hierarchy-undo'

/**
 * Moving somebody in the company org chart.
 *
 * Writes `hr_staff_costs.reports_to`. That is the whole write, and it is worth
 * saying why after two reversals.
 *
 * Until 2026-09-07 this action wrote one column and the commission upline was
 * edited elsewhere; the two drifted apart in silence. From 2026-09-07 it wrote
 * both — a mirror, with notes and offers for every way the second half could
 * decline. On 2026-09-10 the user ruled that inside a commission department
 * the two lines are ONE LINE: who somebody reports to is who earns the
 * override on their sales, always. So the commission position is now derived
 * from `reports_to` by the database (trigger `hr_staff_costs_one_line_sync`),
 * and a move here is one column again — with nothing left to mirror, skip,
 * or say.
 *
 * The rules of the line are refused before the round trip, in sentences
 * (`lib/hierarchy-boundary.ts`), and again by the database: a loop, a title
 * the ladder ranks below theirs, a line across a commission department's
 * edge, a manager whose title cannot hold downlines.
 */
export async function setReportsTo(
  staffId: string,
  reportsToId: string | null,
): Promise<LineResult> {
  await requireActionOn('/team/hierarchy', 'team', 'edit')
  const supabase = await createClient()
  const result = await moveReportingLine(supabase, staffId?.trim() ?? '', reportsToId?.trim() || null)
  if (result.ok) await revalidateHierarchy()
  return result
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
 * It is deliberately NOT a general undo. The rule it obeys is in
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
  /** What the move set the reporting line TO. The staleness check reads this. */
  movedTo: string | null
}

/**
 * What an undo did. The note is never null — somebody pressed a button and
 * is owed a sentence about what happened.
 */
export interface UndoOutcome {
  /** True only when the line went back. */
  undone: boolean
  note: string
}

export async function undoHierarchyMove(input: UndoMoveInput): Promise<UndoOutcome> {
  // The same gate as the move itself. An undo is not a smaller permission than
  // the thing it reverses — it writes the same column.
  await requireActionOn('/team/hierarchy', 'team', 'edit')

  const staffId = input.staffId?.trim() ?? ''
  if (!staffId) throw new Error('Which person?')

  const supabase = await createClient()
  const mover = (await loadLineFacts(supabase, [staffId])).get(staffId)
  if (!mover) return { undone: false, note: 'That person is no longer on the roster. Nothing was changed.' }

  const plan = undoPlan(
    { staffId, staffName: mover.name, reportsTo: input.reportsTo, movedTo: input.movedTo },
    { reportsTo: mover.reportsTo },
  )
  if (plan.kind === 'refuse') return { undone: false, note: plan.note }

  // The same writer, the same rules: a manager gone from the roster or a line
  // the rules now refuse comes back as the reason, and nothing is changed.
  const result = await moveReportingLine(supabase, staffId, plan.reportsTo)
  if (!result.ok) {
    return { undone: false, note: `${mover.name} could not be put back: ${result.reason} Nothing was changed.` }
  }

  await revalidateHierarchy()
  return {
    undone: true,
    note: result.manager
      ? `${mover.name} reports to ${result.manager.name} again.`
      : `${mover.name} reports to nobody again.`,
  }
}

/** Both charts draw the one line, so both are stale after it moves. */
async function revalidateHierarchy(): Promise<void> {
  revalidatePath('/team', 'layout')
  revalidatePath('/revenue', 'layout')
}
