'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { fetchByKeys } from '@/lib/paginate'
import { formatMoney } from '@/lib/utils'
import { closeSnapshots, totalsThatMoved } from '@/lib/commission/closes'
import { buildCommissionWorkbench } from '@/lib/commission/workbench'
import { loadCommissionInput } from './_lib/commission-input'

/**
 * Closing salespeople's month on Comm Cal (2026-09-27) — one person from
 * their ledger, or several ticked on the list, or everybody still open.
 *
 * The figure is worked out HERE, from the month as saved — the same input the
 * page replays — never taken from the browser, which may be holding a draft.
 * The browser sends what it showed instead, and a close whose figure has moved
 * since is refused: a close locks what somebody looked at, nothing else.
 *
 * comm_* postdates database.types.ts — untyped-client convention.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_PEOPLE = 500

async function client(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient
}

function assertMonth(subDepartmentId: unknown, period: unknown): asserts period is string {
  if (typeof subDepartmentId !== 'string' || !UUID.test(subDepartmentId)) throw new Error('Which sub-department?')
  if (typeof period !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])-01$/.test(period)) {
    throw new Error('A month is its first day, e.g. 2026-09-01')
  }
}

function monthName(period: string): string {
  return new Date(`${period}T00:00:00Z`).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export interface CloseRequest {
  subDepartmentId: string
  /** YYYY-MM-01. */
  period: string
  /** Who, and the total the page showed for each. */
  people: Array<{ staffId: string; expectedTotal: number }>
}

export interface CloseResult {
  closed: number
  /** Their names, for the page to say who. */
  names: string[]
}

export async function closeSalespeople(request: CloseRequest): Promise<CloseResult> {
  await requirePermission('revenue')
  const { subDepartmentId, period, people } = request ?? ({} as CloseRequest)
  assertMonth(subDepartmentId, period)
  if (!Array.isArray(people) || people.length === 0) throw new Error('Tick somebody to close.')
  if (people.length > MAX_PEOPLE) throw new Error('That is more people than one month holds.')
  const seen = new Set<string>()
  for (const p of people) {
    if (!p || typeof p.staffId !== 'string' || !UUID.test(p.staffId) || seen.has(p.staffId)) {
      throw new Error('Every close must name a different salesperson.')
    }
    if (typeof p.expectedTotal !== 'number' || !Number.isFinite(p.expectedTotal)) {
      throw new Error('Refresh the page and try again — a figure was missing.')
    }
    seen.add(p.staffId)
  }

  const supabase = await client()
  // The page replays the month's run when there is one (its paid bills stay
  // visible); the figure must be the one the page showed.
  const { data: run, error: runError } = await supabase.from('comm_runs').select('id')
    .eq('sub_department_id', subDepartmentId).eq('period_month', period).maybeSingle()
  if (runError) throw new Error(`Could not read the month's run: ${runError.message}`)
  const runId = (run as { id: string } | null)?.id

  const { input } = await loadCommissionInput(period, subDepartmentId, supabase, { replayRunId: runId })
  const staffIds = [...new Set([...input.hierarchy.map(n => n.staffId), ...input.orders.map(o => o.staffId), ...seen])]
  const names = await fetchByKeys<{ id: string; employee_name: string }, string>(staffIds, keys =>
    supabase.from('hr_staff_costs').select('id, employee_name').in('id', keys))
  const board = buildCommissionWorkbench(input, {
    people: names.map(n => ({ staffId: n.id, name: n.employee_name })),
  })

  const movedSince = totalsThatMoved(people, board)
  if (movedSince.length > 0) {
    const detail = movedSince.map(m => m.now === null
      ? `${m.name} is no longer on ${monthName(period)}`
      : `${m.name} is ${formatMoney(m.now)} now, not the ${formatMoney(m.expected)} on your screen`)
    throw new Error(`Nobody was closed — ${detail.join('; ')}. Refresh the page and check again.`)
  }

  const snapshots = closeSnapshots(input, board, people.map(p => p.staffId))
  const { data: closed, error } = await supabase.rpc('comm_close_salespeople', {
    p_sub_department_id: subDepartmentId,
    p_period: period,
    p_closes: snapshots,
    p_run_id: runId ?? null,
  })
  if (error) throw new Error(error.message)

  revalidatePath('/revenue', 'layout')
  return { closed: Number(closed ?? 0), names: snapshots.map(s => s.summary.name) }
}

export interface ReopenRequest {
  subDepartmentId: string
  period: string
  staffIds: string[]
}

export async function reopenSalespeople(request: ReopenRequest): Promise<{ reopened: number }> {
  await requirePermission('revenue')
  const { subDepartmentId, period, staffIds } = request ?? ({} as ReopenRequest)
  assertMonth(subDepartmentId, period)
  if (!Array.isArray(staffIds) || staffIds.length === 0) throw new Error('Tick somebody to reopen.')
  if (staffIds.length > MAX_PEOPLE || staffIds.some(id => typeof id !== 'string' || !UUID.test(id))) {
    throw new Error('Refresh the page and try again — somebody on the list is not a salesperson.')
  }

  const supabase = await client()
  const { data, error } = await supabase.rpc('comm_reopen_salespeople', {
    p_sub_department_id: subDepartmentId,
    p_period: period,
    p_staff_ids: [...new Set(staffIds)],
  })
  if (error) throw new Error(error.message)

  revalidatePath('/revenue', 'layout')
  return { reopened: Number(data ?? 0) }
}
