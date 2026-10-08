'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requireAction, requirePermission } from '@/lib/auth'
import { EditError } from '@/lib/catalogue/edits'
import { validateKpiItems, type KpiItemsEdit } from '@/lib/catalogue/rule-edits'
import { kpiSkuSearchFilter, SKU_SEARCH_LIMIT } from '@/lib/commission/kpi-items-edit'

/**
 * Revenue → Rules › KPI items (2026-10-08). Which items count as KPI and what
 * each pays is a rule of the pay, so it is set where every other rule is —
 * behind `revenue`, Principal and HR — and no longer on the Product List,
 * which prices things (user: "rules 这里是用来算薪水的 … product list 是拿来
 * set costing 的"). The table's RLS was always Principal + HR.
 *
 * The writer is unchanged: `catalogue_save_kpi_items`, one transaction —
 * added items start today; a new amount, or a removal, of an item begun before
 * today closes it yesterday and opens today's, so every earlier month keeps
 * the amount it was worked out at. SECURITY INVOKER, so RLS decides who
 * writes; what names a SKU or a special is read by the function itself.
 *
 * A refusal the reader can act on comes back as `reason` rather than a throw:
 * production replaces a thrown message with a digest.
 *
 * comm_* / erp_* postdate the generated database.types.ts — untyped-client
 * convention.
 */
async function client(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type SaveKpiItemsResult = { ok: true; saved: number } | { ok: false; reason: string }

/** The database's refusals, in words; anything else is a fault and throws. */
function refusal(err: { message: string; code?: string }): string | null {
  if (err.code === '23P01') return 'That item is already a KPI item of this sub-department.'
  // The writer's own sentences: an unknown scheme, a SKU or special gone
  // from the ERP, a row changed since the page was opened.
  if (err.code === 'P0002' || err.code === '22023' || err.code === '23503' || err.code === '40001') return err.message
  if (err.code === '42501') return 'Your account cannot change the KPI items.'
  return null
}

/** One sub-department's KPI items: added, re-priced, taken off — all or nothing. */
export async function saveKpiItems(schemeId: string, edit: KpiItemsEdit): Promise<SaveKpiItemsResult> {
  await requireAction('revenue', 'manage')
  if (typeof schemeId !== 'string' || !UUID.test(schemeId)) return { ok: false, reason: 'No sub-department chosen.' }
  let plan
  try {
    plan = validateKpiItems(edit)
  } catch (e) {
    if (e instanceof EditError) return { ok: false, reason: e.message }
    throw e
  }
  const sb = await client()
  const { data, error } = await sb.rpc('catalogue_save_kpi_items', {
    p_scheme: schemeId,
    p_adds: plan.adds,
    p_changes: plan.changes,
    p_removes: plan.removes,
  })
  if (error) {
    const reason = refusal(error)
    if (reason) return { ok: false, reason }
    throw new Error(`Could not save the KPI items: ${error.message}`)
  }
  // Rules itself, and every Comm Cal month, which reads the list when it is worked out.
  revalidatePath('/revenue', 'layout')
  return { ok: true, saved: Number(data ?? 0) }
}

/** A SKU as the picker lists it — no price: Rules never shows what a product costs. */
export interface KpiSkuHit {
  erpId: string
  code: string
  description: string | null
  category: string | null
  /** False while the ERP has it switched off — still a SKU, still pickable. */
  active: boolean
}

export type SearchKpiSkusResult = { ok: true; hits: KpiSkuHit[]; total: number } | { ok: false; reason: string }

/**
 * SKUs of the SKU Master whose code or description contains the text, for the
 * picker — at most twenty, and how many matched in all. A SKU the ERP removed
 * is left out: no new bill can carry it.
 */
export async function searchKpiSkus(query: string): Promise<SearchKpiSkusResult> {
  await requirePermission('revenue')
  const filter = kpiSkuSearchFilter(typeof query === 'string' ? query : '')
  if (!filter) return { ok: true, hits: [], total: 0 }
  const sb = await client()
  const { data, error, count } = await sb
    .from('erp_products')
    .select('erp_id, item_code, description, category, active', { count: 'exact' })
    .is('removed_at', null)
    .or(filter)
    .order('item_code')
    .order('erp_id')
    .limit(SKU_SEARCH_LIMIT)
  if (error) return { ok: false, reason: 'The SKU Master could not be searched just now. Try again.' }
  const rows = (data ?? []) as Array<{ erp_id: string; item_code: string; description: string | null; category: string | null; active: boolean | null }>
  return {
    ok: true,
    hits: rows.map(r => ({
      erpId: String(r.erp_id),
      code: String(r.item_code),
      description: r.description ?? null,
      category: r.category ?? null,
      active: r.active !== false,
    })),
    total: count ?? rows.length,
  }
}
