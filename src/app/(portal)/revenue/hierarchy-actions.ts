'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { promotesTo, type LadderRung } from '@/lib/commission/titles'
import {
  loadOpenPositions,
  moveReportingLine,
  movePositionRank,
  safeReason,
  type LineResult,
} from '@/lib/hierarchy-writes'

/**
 * The payroll-purpose org chart: who is under who, at what rank, on which rate
 * mode. Shared by Staff Hierarchy's two tabs — the canvas, which moves people
 * between trees, and the Team table, which sets nothing but the rank.
 *
 * ONE LINE (user, 2026-09-10). The chart moves `hr_staff_costs.reports_to` —
 * the same line People draws — and the commission position follows it in the
 * database (trigger `hr_staff_costs_one_line_sync`). So `moveOnChart` writes
 * one column and returns; the position's upline, its rank when first opened
 * (the title's floor), and the effective dating are the trigger's. The one
 * hierarchy fact still entered by hand is the RANK, and `setStaffRank` is the
 * only writer of it left.
 *
 * The rule that shapes the rank write: **a position is never mutated in place
 * once a month has closed over it.** Changing the rank writes a NEW
 * effective-dated `comm_hierarchy` row and closes the old one the day before,
 * so a run already computed keeps the chart it was computed against.
 *
 * A position carries the RANK (the floor a month pays from). It does NOT carry
 * the TITLE. A title rises the month a run is APPLIED whose paid rank outranks
 * it (user 2026-09-02, migration 20260903030000), and a human records one on
 * People. Setting a rank here only SAYS it has outgrown the title — `titleGap`.
 *
 * comm_* postdates database.types.ts — untyped-client convention.
 */
async function client(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient
}

function refresh() {
  revalidatePath('/revenue', 'layout')
  // Both charts draw the same line.
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
 * Does the rank they were just set to carry a title above the one they hold?
 *
 * This used to RAISE the title here, and does not any more (user 2026-09-07):
 * a title GRANTS PERMISSIONS, and the rule is that a title rises the month a
 * run is APPLIED whose paid rank belongs to a higher title. So a rank change
 * reports that a promotion may be owed, and a human with `team` records it on
 * People, where every other title write in this app already lives.
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
  if (error) {
    console.error('[titleGap] could not read their title', staffId, error.message)
    return null
  }

  const current = (staff as { title_id: string | null } | null)?.title_id ?? null
  const to = promotesTo(rungs(ladder), current, rank.title_id)
  if (!to) return null

  return `Their rank now sits above their title. If that is a real promotion, set them to ${titleName(ladder, to) ?? 'the matching title'} on People — a rank change does not raise a title on its own.`
}

/**
 * Move somebody on the chart: who they report to, which is who earns the
 * override on their sales. Gated on `revenue` — the money side of the one
 * line — and written through the same function the People chart uses, so
 * the two surfaces can never disagree about who may sit under whom.
 */
export async function moveOnChart(staffId: string, reportsToId: string | null): Promise<LineResult> {
  await requirePermission('revenue')
  const supabase = await client()
  const result = await moveReportingLine(supabase, staffId?.trim() ?? '', reportsToId?.trim() || null)
  if (result.ok) refresh()
  return result
}

/** What a rank edit came back with. `note` is rendered either way. */
export interface RankOutcome {
  ok: boolean
  note: string | null
}

/**
 * The Team table's one write: the rank a month pays somebody from, and the
 * rate mode that rides with it. The upline is not an input any more — it is
 * their reporting line, and the position already carries it.
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
  const rawMode = ((formData.get('rate_mode') as string) ?? '').trim()
  const rateMode = rawMode === 'fixed' || rawMode === 'variable' ? rawMode : null
  if (!staffId || !schemeId || !rankId) throw new Error('Which person, and which rank?')

  // `scheme_id` and `rank_id` both arrive from the browser, and nothing in the
  // schema ties one to the other — `comm_hierarchy.rank_id` is a bare FK to
  // `comm_ranks(id)`. Without this, a form could pair a richer scheme's rank
  // with this sub-department's position and be paid from a rate this ladder
  // never offered.
  const ladder = await loadLadder(supabase, schemeId)
  if (!ladder.some(r => r.id === rankId)) {
    return { ok: false, note: 'That rank belongs to another sub-department’s scheme.' }
  }

  const position = (await loadOpenPositions(supabase)).get(staffId)
  if (!position) {
    return {
      ok: false,
      note: 'They hold no position yet — their title has no rung on this ladder, so there is no rank to set. Give them a ladder title on People first.',
    }
  }
  if (position.schemeId !== schemeId) {
    return { ok: false, note: 'They earn under another sub-department’s scheme.' }
  }

  try {
    await movePositionRank(supabase, user.id, position, rankId, rateMode)
  } catch (e) {
    if (isControlFlow(e)) throw e
    return { ok: false, note: e instanceof Error ? e.message : 'Could not set their rank' }
  }

  const gap = await titleGap(supabase, ladder, staffId, rankId)
  refresh()
  return { ok: true, note: gap }
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
