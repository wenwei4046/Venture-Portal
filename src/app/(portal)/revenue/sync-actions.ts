'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'

/**
 * The human side of the ERP live feed.
 *
 * The feed itself needs nobody (app/api/erp/v1/sales-orders). Two things do:
 * a salesperson the ERP names whom the portal cannot place, and a delivery the
 * feed HELD because the month's run was already applied. Both are answered
 * from the Comm Cal page, by someone with the revenue permission, through the
 * same RPCs the receiver uses — so a replay and a live delivery cannot behave
 * differently.
 *
 * erp_sync_events / the RPCs postdate database.types.ts — untyped-client
 * convention.
 */
async function client(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient
}

export interface MatchOutcome {
  /** Orders that now pay this person. */
  matched: number
  /**
   * Orders left unplaced because their month's run is applied. They keep the
   * name on the list, which otherwise reads like the match never happened.
   */
  locked: number
}

/** Row form on the Comm Cal page: agent_key + erp_salesperson_id → staff_id. */
export async function matchErpSalesperson(fd: FormData): Promise<MatchOutcome> {
  await requirePermission('revenue')
  const subDepartmentId = String(fd.get('sub_department_id') ?? '').trim()
  const agentKey = String(fd.get('agent_key') ?? '').trim()
  const erpSalespersonId = String(fd.get('erp_salesperson_id') ?? '').trim()
  const staffId = String(fd.get('staff_id') ?? '').trim()
  if (!staffId) throw new Error('Pick who this salesperson is')
  if (!agentKey && !erpSalespersonId) throw new Error('Nothing to match on')

  const supabase = await client()
  await assertErpSubDepartment(supabase, subDepartmentId)
  const { data, error } = await supabase.rpc('match_erp_salesperson', {
    p_agent_key: agentKey,
    p_erp_salesperson_id: erpSalespersonId || null,
    p_staff_id: staffId,
  })
  if (error) throw new Error(`Could not save the match: ${error.message}`)

  revalidatePath('/revenue', 'layout')
  const r = (data ?? {}) as { ordersMatched?: number; ordersLocked?: number }
  return { matched: Number(r.ordersMatched ?? 0), locked: Number(r.ordersLocked ?? 0) }
}

export interface ReplayResult {
  replayed: number
  applied: number
  stillHeld: number
}

interface HeldEventRow {
  id: string
  doc_no: string | null
  payload: Record<string, unknown> | null
  received_at: string
}

/**
 * Re-deliver every held event of a month, latest per document. Meant for the
 * moment after `reopen_commission_run`: the events that arrived while the run
 * was applied go through exactly as if the ERP had just sent them. Anything
 * the month still refuses stays held, and says so.
 */
export async function replayHeldErpEvents(period: string, subDepartmentId: string): Promise<ReplayResult> {
  await requirePermission('revenue')
  if (!/^\d{4}-\d{2}-01$/.test(period)) throw new Error('Period must be the first of a month')

  const supabase = await client()
  await assertErpSubDepartment(supabase, subDepartmentId)
  const { data, error } = await supabase
    .from('erp_sync_events')
    .select('id, doc_no, payload, received_at')
    .eq('status', 'held')
    .eq('period_month', period)
    .eq('sub_department_id', subDepartmentId)
    .is('replayed_at', null)
    .order('received_at', { ascending: true })
  if (error) throw new Error(`Could not read the held events: ${error.message}`)

  // The last delivery of a document is the one that matters; the ones before
  // it were already overtaken in the ERP.
  const latest = new Map<string, HeldEventRow>()
  const superseded: string[] = []
  for (const row of (data ?? []) as HeldEventRow[]) {
    const key = row.doc_no ?? row.id
    const prev = latest.get(key)
    if (prev) superseded.push(prev.id)
    latest.set(key, row)
  }
  if (superseded.length > 0) {
    await supabase
      .from('erp_sync_events')
      .update({ replayed_at: new Date().toISOString(), replay_result: 'superseded' })
      .in('id', superseded)
  }

  let applied = 0
  let stillHeld = 0
  for (const row of latest.values()) {
    if (!row.payload) continue
    const { data: result, error: rpcError } = await supabase.rpc('ingest_erp_sales_order', {
      p_order: row.payload,
      p_replay_of: row.id,
    })
    if (rpcError) throw new Error(`Replay of ${row.doc_no ?? row.id} failed: ${rpcError.message}`)
    const status = (result as { status?: string } | null)?.status
    if (status === 'applied') applied++
    if (status === 'held') stillHeld++
  }

  revalidatePath('/revenue', 'layout')
  return { replayed: latest.size, applied, stillHeld }
}

async function assertErpSubDepartment(supabase: SupabaseClient, subDepartmentId: string): Promise<void> {
  const { data, error } = await supabase.rpc('erp_sync_sub_department')
  if (error) throw new Error(`Could not identify the ERP programme: ${error.message}`)
  if (data !== subDepartmentId) throw new Error('The Houzs ERP feed belongs to Fair.')
}
