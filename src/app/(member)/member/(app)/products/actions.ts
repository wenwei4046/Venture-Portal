'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requireProductListEdit } from '@/lib/member/product-access'
import {
  EditError,
  validateComboPrices,
  validateComboRemovals,
  validateFabricUpgrades,
  validateModelEdit,
  validateNewCombo,
  validateOptionPrices,
  validateSkuPrices,
  type ComboPriceEdit,
  type ComboSetRef,
  type FabricUpgradesEdit,
  type ModelEdit,
  type NewComboEdit,
  type OptionPriceEdit,
  type SkuPriceEdit,
} from '@/lib/catalogue/edits'
import { validateCostSetting, type CostSettingEdit } from '@/lib/catalogue/rule-edits'

/**
 * Revenue → Product List: the portal's OWN decisions about the ERP's catalogue
 * (user 2026-09-24) — the price every margin is measured against, and what the
 * Revenue calculator may offer. **Only for `product_list`** (the Principal by
 * default; the account's own, whatever view the portal was left in —
 * `requireProductList`): HR sets the commission rules, not what a product costs. A page of
 * the Revenue app since 2026-10-08 (`/member/products`).
 *
 * Nothing here writes the mirror (`erp_*`); a delivery from the ERP writes
 * that, and never touches what is saved here.
 *
 * A PRICE MOVES MARGINS. New and re-pushed sales lines are costed at the new
 * price from the moment it is saved; a month already landed moves only when
 * somebody presses Recost on it, and a paid month refuses (23RUN).
 *
 * One tab sets a commission rule rather than a price (2026-09-27): Costing
 * Setting — the ratio a cost is divided by for the Revenue Team, per
 * sub-department and per SKU. It is read by the run when it is computed, never
 * stored on a bill, so a month moves when its run is computed again. Its
 * neighbour, Add-on / KPI Items, moved to Rules › KPI items on 2026-10-08
 * (`app/(portal)/revenue/kpi-actions.ts`): which items count as KPI is the
 * pay's rule, set by whoever sets the rules.
 *
 * The catalogue tables postdate database.types.ts — untyped-client convention.
 */
async function client(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient
}

function refresh() {
  // The page itself, and every Comm Cal page a price moves.
  revalidatePath('/member/products')
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
  const user = await requireProductListEdit()
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
  const user = await requireProductListEdit()
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
  const user = await requireProductListEdit()
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
  const user = await requireProductListEdit()
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

export type SaveFabricUpgradesResult = { ok: true; saved: number } | { ok: false; reason: string }

/**
 * Maintenance › Fabrics › Sofa / Bedframe upgrades (2026-10-29): one
 * category's upgrades — the ones made, only what changed on the others, the
 * ones taken off — in one transaction (`catalogue_save_fabric_upgrades`, under
 * the caller's own session). A charge, as every Maintenance price: what the
 * customer pays on top, out of the margin; new and re-pushed bills are charged
 * at once, a landed month when it is Recosted. A refusal the Principal can act
 * on — a name twice, a series already under another upgrade — comes back as
 * `reason`; production hides a thrown message.
 */
export async function saveFabricUpgrades(category: string, edit: FabricUpgradesEdit): Promise<SaveFabricUpgradesResult> {
  await requireProductListEdit()
  let plan
  try {
    plan = validateFabricUpgrades(category, edit)
  } catch (e) {
    if (e instanceof EditError) return { ok: false, reason: e.message }
    throw e
  }
  const sb = await client()
  const { data, error } = await sb.rpc('catalogue_save_fabric_upgrades', {
    p_category: plan.category,
    p_adds: plan.adds,
    p_changes: plan.changes,
    p_removes: plan.removes,
  })
  if (error) {
    if (error.code === '22023') return { ok: false, reason: error.message }
    if (error.code === '23505') return { ok: false, reason: 'Somebody saved these upgrades at the same time — reload the page' }
    fail('the fabric upgrades', error)
  }
  refresh()
  return { ok: true, saved: Number(data ?? 0) }
}

/** Combo prices per seat height. A combo whose every height is blank loses its price row. */
export async function saveComboPrices(edits: ComboPriceEdit[]): Promise<SaveSummary> {
  const user = await requireProductListEdit()
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

// ─── Costing Setting ────────────────────────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The writer's own refusals already read as sentences; the database's
 * constraint gets one here.
 */
function ruleFail(what: string, err: { message: string; code?: string } | null): never {
  const code = err?.code
  if (code === '23505') throw new Error('Two SKUs share that code — only one of them can carry its own ratio')
  if (code === 'P0002' || code === '22023' || code === '23503' || code === '40001') throw new Error(err!.message)
  throw new Error(`Could not save ${what}: ${err?.message ?? 'unknown error'}`)
}

function schemeOf(schemeId: string): string {
  if (typeof schemeId !== 'string' || !UUID.test(schemeId)) throw new Error('No sub-department chosen')
  return schemeId
}

/** One sub-department's cost ratio and its SKUs' own, in one transaction. */
export async function saveCostSetting(schemeId: string, edit: CostSettingEdit): Promise<SaveSummary> {
  await requireProductListEdit()
  const scheme = schemeOf(schemeId)
  const plan = guard(() => validateCostSetting(edit))
  const sb = await client()
  const { data, error } = await sb.rpc('catalogue_save_cost_setting', {
    p_scheme: scheme,
    p_divisor: plan.divisor,
    p_ratios: plan.ratios,
    p_removes: plan.removes,
  })
  if (error) ruleFail('the costing setting', error)
  refresh()
  return { saved: Number(data ?? 0) }
}

// ─── Combo Pricing › Add combo (2026-10-08) ─────────────────────────────────

export type AddComboResult = { ok: true; prices: number } | { ok: false; reason: string }

/**
 * A sofa set made here: one row per fabric tier that has a price, each with its
 * own price row — costed from then on like every combo (all of them the
 * portal's own since the same day). A refusal the Principal can act on (the set
 * or its name is already the model's, a module not the model's) comes back as
 * `reason`; production hides a thrown message.
 */
export async function addCombo(edit: NewComboEdit): Promise<AddComboResult> {
  await requireProductListEdit()
  let plan
  try {
    plan = validateNewCombo(edit)
  } catch (e) {
    if (e instanceof EditError) return { ok: false, reason: e.message }
    throw e
  }
  const sb = await client()
  const { data, error } = await sb.rpc('catalogue_add_combo', {
    p_base_model: plan.base_model,
    p_modules: plan.modules,
    p_label: plan.label,
    p_prices: plan.prices,
  })
  if (error) {
    // 22023: a check only the database can make, in its own words.
    if (error.code === '22023') return { ok: false, reason: error.message }
    fail('the combo', error)
  }
  refresh()
  return { ok: true, prices: Number(data ?? plan.filled) }
}

// ─── Combo Pricing › Remove (2026-10-08) ────────────────────────────────────

export type RemoveCombosResult = { ok: true; removed: number } | { ok: false; reason: string }

/**
 * Takes sets away — every fabric tier of each, and their prices (user
 * 2026-10-08: combos are our own costing, not the ERP's). All or nothing; a set
 * already gone comes back as `reason`. A bill already costed at one keeps that
 * cost until its month is Recosted.
 */
export async function removeCombos(sets: ComboSetRef[]): Promise<RemoveCombosResult> {
  await requireProductListEdit()
  let rows
  try {
    rows = validateComboRemovals(sets)
  } catch (e) {
    if (e instanceof EditError) return { ok: false, reason: e.message }
    throw e
  }
  const sb = await client()
  const { data, error } = await sb.rpc('catalogue_remove_combos', { p_sets: rows })
  if (error) {
    if (error.code === '22023' || error.code === '42501') return { ok: false, reason: error.message }
    fail('the combos', error)
  }
  refresh()
  return { ok: true, removed: Number(data ?? rows.length) }
}
