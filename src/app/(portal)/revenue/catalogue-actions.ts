'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import {
  EditError,
  validateComboPrices,
  validateModelEdit,
  validateOptionPrices,
  validateSkuPrices,
  type ComboPriceEdit,
  type ModelEdit,
  type OptionPriceEdit,
  type SkuPriceEdit,
} from '@/lib/catalogue/edits'

/**
 * Revenue → Product List: the portal's OWN decisions about the ERP's catalogue
 * (user 2026-09-24) — the price every margin is measured against, and what the
 * Revenue calculator may offer. **Principal only** (`product_list`): HR sets
 * the commission rules, not what a product costs.
 *
 * Nothing here writes the mirror (`erp_*`); a delivery from the ERP writes
 * that, and never touches what is saved here.
 *
 * A PRICE MOVES MARGINS. New and re-pushed sales lines are costed at the new
 * price from the moment it is saved; a month already landed moves only when
 * somebody presses Recost on it, and a paid month refuses (23RUN).
 *
 * The catalogue tables postdate database.types.ts — untyped-client convention.
 */
async function client(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient
}

function refresh() {
  revalidatePath('/revenue', 'layout')
}

/** Validation failures read as themselves; database failures say what was being saved. */
function fail(what: string, err: { message: string } | null): never {
  throw new Error(`Could not save ${what}: ${err?.message ?? 'unknown error'}`)
}

function guard<T>(fn: () => T): T {
  try {
    return fn()
  } catch (e) {
    if (e instanceof EditError) throw new Error(e.message)
    throw e
  }
}

export interface SaveSummary {
  saved: number
}

/** Prices for many SKUs at once — the SKU Master's Edit prices. */
export async function saveSkuPrices(edits: SkuPriceEdit[]): Promise<SaveSummary> {
  const user = await requirePermission('product_list')
  const rows = guard(() => validateSkuPrices(edits))
  const sb = await client()
  const now = new Date().toISOString()
  // Upsert touches only the columns it names: a SKU's calculator tick is left
  // exactly as it was, and a SKU with no row yet starts unticked.
  const { error } = await sb.from('catalogue_skus').upsert(
    rows.map(r => ({ ...r, updated_by: user.id, updated_at: now })),
    { onConflict: 'erp_product_id' },
  )
  if (error) fail('the prices', error)
  refresh()
  return { saved: rows.length }
}

/** Tick or untick SKUs for the Revenue calculator. */
export async function setSkusOffered(erpIds: string[], offered: boolean): Promise<SaveSummary> {
  const user = await requirePermission('product_list')
  const ids = [...new Set((erpIds ?? []).map(String).filter(id => /^[A-Za-z0-9_.:-]{1,80}$/.test(id)))]
  if (ids.length === 0) throw new Error('No SKU chosen')
  const sb = await client()
  const now = new Date().toISOString()
  const { error } = await sb.from('catalogue_skus').upsert(
    ids.map(id => ({ erp_product_id: id, offered: offered === true, updated_by: user.id, updated_at: now })),
    { onConflict: 'erp_product_id' },
  )
  if (error) fail('the calculator ticks', error)
  refresh()
  return { saved: ids.length }
}

/** One model's Modular ticks: offered, its option pools, its SKUs, and its overrides. */
export async function saveModelSettings(edit: ModelEdit): Promise<SaveSummary> {
  const user = await requirePermission('product_list')
  const { model, skus } = guard(() => validateModelEdit(edit))
  const sb = await client()
  const now = new Date().toISOString()

  if (skus.length > 0) {
    // Only SKUs that really belong to this model: a tick sent for another
    // model's SKU is refused before ANY settings are written.
    const { data: owned, error: ownError } = await sb
      .from('erp_products')
      .select('erp_id')
      .eq('model_erp_id', model.erp_model_id)
      .in('erp_id', skus.map(s => s.erp_product_id))
    if (ownError) fail('the SKU ticks', ownError)
    const mine = new Set(((owned ?? []) as Array<{ erp_id: string }>).map(o => o.erp_id))
    const foreign = skus.filter(s => !mine.has(s.erp_product_id))
    if (foreign.length > 0) throw new Error(`${foreign.length} SKU(s) do not belong to this model`)
  }

  const { error: modelError } = await sb
    .from('catalogue_models')
    .upsert({ ...model, updated_by: user.id, updated_at: now }, { onConflict: 'erp_model_id' })
  if (modelError) fail('the model', modelError)

  if (skus.length > 0) {
    const { error } = await sb.from('catalogue_skus').upsert(
      skus.map(s => ({ ...s, updated_by: user.id, updated_at: now })),
      { onConflict: 'erp_product_id' },
    )
    if (error) fail('the SKU ticks', error)
  }
  refresh()
  return { saved: 1 + skus.length }
}

/** A Maintenance pool's surcharges. Blank clears an option's price. */
export async function saveOptionPrices(pool: string, edits: OptionPriceEdit[]): Promise<SaveSummary> {
  const user = await requirePermission('product_list')
  const { upserts, clears } = guard(() => validateOptionPrices(pool, edits))
  const sb = await client()
  const now = new Date().toISOString()
  if (upserts.length > 0) {
    const { error } = await sb.from('catalogue_option_prices').upsert(
      upserts.map(u => ({ erp_company_id: 1, ...u, updated_by: user.id, updated_at: now })),
      { onConflict: 'erp_company_id,pool,value' },
    )
    if (error) fail('the surcharges', error)
  }
  if (clears.length > 0) {
    const { error } = await sb
      .from('catalogue_option_prices')
      .delete()
      .eq('erp_company_id', 1)
      .eq('pool', pool)
      .in('value', clears)
    if (error) fail('the surcharges', error)
  }
  refresh()
  return { saved: upserts.length + clears.length }
}

/** Combo prices per seat height. A combo whose every height is blank loses its price row. */
export async function saveComboPrices(edits: ComboPriceEdit[]): Promise<SaveSummary> {
  const user = await requirePermission('product_list')
  const rows = guard(() => validateComboPrices(edits))
  const sb = await client()
  const now = new Date().toISOString()
  const keep = rows.filter(r => Object.keys(r.price_by_height).length > 0)
  const drop = rows.filter(r => Object.keys(r.price_by_height).length === 0)
  if (keep.length > 0) {
    const { error } = await sb.from('catalogue_combo_prices').upsert(
      keep.map(r => ({ erp_company_id: 1, ...r, updated_by: user.id, updated_at: now })),
      { onConflict: 'erp_company_id,base_model,slots_key,tier' },
    )
    if (error) fail('the combo prices', error)
  }
  for (const r of drop) {
    const { error } = await sb
      .from('catalogue_combo_prices')
      .delete()
      .eq('erp_company_id', 1)
      .eq('base_model', r.base_model)
      .eq('slots_key', r.slots_key)
      .eq('tier', r.tier)
    if (error) fail('the combo prices', error)
  }
  refresh()
  return { saved: rows.length }
}
