import { valueKey } from '@/lib/catalogue/keys'
import type { KpiItemsEdit, KpiTierInput } from '@/lib/catalogue/rule-edits'
import {
  brandFabricSeriesOf, EMPTY_FABRIC_SERIES, kpiCodeKey, sofaModuleOf, toUnitTiers,
  type FabricSeriesRow, type KpiItemPool, type KpiUnitTier,
} from './kpi'

/**
 * Rules › KPI items — a brand's own items, edited (2026-11-12; a brand on its
 * own commission scheme, 2990s; the user: "KPI item 那边我是可以手动去加的").
 * Since 2026-11-14 picked as the sub-department's own are, from the brand's own
 * ERP company — a SKU, a model, a compartment, a special, a fabric series — and
 * carrying only a bonus and its tiers (the user: "我只需要像 Fair 一样选 KPI 就好，
 * 不需要去选它的 cost"; "HR 那边只需要 set 哪一个 item 是有 KPI，然后它有没有
 * tiering"). The draft of one brand's block: a bonus or tiers retyped, an item
 * coming off, an item picked to add. Pure — the component holds the state and
 * `saveKpiItems` sends what `brandKpiEditOf` makes of it: only what changed.
 */

/** A brand's own KPI item as Rules lists it. */
export interface BrandKpiListed {
  id: string
  source: 'sku' | 'option'
  /** An option item's pool; null for a SKU. */
  pool: KpiItemPool | null
  /** A SKU's code, or the option's own spelling (the special, the series, the model, the compartment). */
  value: string
  /** The SKU Master row a SKU item was picked from. */
  erpId: string | null
  /** The name it is listed under (*Upgrade fabric*, a SKU's description); null = its value. */
  name: string | null
  /** What a unit pays below the first tier. */
  amount: number
  tiers: KpiUnitTier[]
}

/** One tier as typed: from `minQty` units in a month every unit pays `amount`. */
export interface TierDraft {
  minQty: string
  amount: string
}

/** An item picked to add. */
export interface BrandKpiAdded {
  key: string
  source: 'sku' | 'option'
  pool: KpiItemPool | null
  /** A SKU's code, or the option's value. */
  value: string
  erpId: string | null
  /** What the item is called where it comes from (a SKU's description, a model's SKU) — shown, never sent. */
  label: string | null
  /** A name of its own, as typed; blank = its own. */
  name: string
  amount: string
  tiers: TierDraft[]
}

export interface BrandKpiDraft {
  /** Item id → the bonus as typed. */
  amounts: ReadonlyMap<string, string>
  /** Item id → its tiers as typed, once touched. */
  tiers: ReadonlyMap<string, readonly TierDraft[]>
  removing: ReadonlySet<string>
  added: readonly BrandKpiAdded[]
}

export const EMPTY_BRAND_KPI_DRAFT: BrandKpiDraft = { amounts: new Map(), tiers: new Map(), removing: new Set(), added: [] }

/** A stored item (`comm_kpi_items`) as the block lists it. */
export function toBrandKpiListed(row: {
  id: string; source?: string | null; product_code?: string | null; erp_product_id?: string | null
  option_pool?: string | null; option_value: string | null; product_name: string | null; kpi_amount: number | string
  unit_tiers?: unknown
}): BrandKpiListed {
  const sku = (row.source ?? (row.option_pool ? 'option' : 'sku')) === 'sku'
  return {
    id: row.id,
    source: sku ? 'sku' : 'option',
    pool: sku ? null : (row.option_pool as KpiItemPool | null) ?? null,
    value: ((sku ? row.product_code : row.option_value) ?? '').trim(),
    erpId: sku ? row.erp_product_id ?? null : null,
    name: row.product_name?.trim() || null,
    amount: Number(row.kpi_amount),
    tiers: toUnitTiers(row.unit_tiers),
  }
}

/** What an item is called on the page: its own name, else its value. */
export function brandKpiTitle(item: Pick<BrandKpiListed, 'name' | 'value'>): string {
  return item.name || item.value
}

/** The key the picker knows an item by: a SKU by its code, an option by its pool and spelling. */
export function brandKpiKey(item: { source: 'sku' | 'option'; pool: string | null; value: string }): string {
  return item.source === 'sku' ? `sku:${kpiCodeKey(item.value)}` : `option:${item.pool}:${valueKey(item.value) ?? ''}`
}

/** Everything on the list or being added — the picker never offers it again. An item coming off may be picked again. */
export function brandKpiTaken(listed: readonly BrandKpiListed[], draft: BrandKpiDraft): Set<string> {
  return new Set([
    ...listed.filter(item => !draft.removing.has(item.id)).map(brandKpiKey),
    ...draft.added.map(brandKpiKey),
  ])
}

/** An item picked from the brand's catalogue, keyed as the list keys it. */
export function pickBrandItem(
  pick: { source: 'sku'; code: string; erpId: string; label: string | null } | { source: 'option'; pool: KpiItemPool; value: string; label?: string | null },
  amount = '',
): BrandKpiAdded {
  const base = pick.source === 'sku'
    ? { source: 'sku' as const, pool: null, value: pick.code.trim(), erpId: pick.erpId }
    : { source: 'option' as const, pool: pick.pool, value: pick.value.trim(), erpId: null }
  return { ...base, key: `new:${brandKpiKey(base)}`, label: pick.label?.trim() || null, name: '', amount, tiers: [] }
}

/** Stored tiers as the inputs show them. */
export function tierDrafts(tiers: readonly KpiUnitTier[]): TierDraft[] {
  return tiers.map(t => ({ minQty: String(t.minQty), amount: String(t.amount) }))
}

/** The tiers typed that say something: a row left wholly blank is no tier. */
function typedTiers(tiers: readonly TierDraft[]): TierDraft[] {
  return tiers.map(t => ({ minQty: t.minQty.trim(), amount: t.amount.trim() })).filter(t => t.minQty !== '' || t.amount !== '')
}

/** Whether a typed amount is another amount than the stored one. Text that is no number counts as a change. */
export function bonusDiffers(text: string, saved: number): boolean {
  const typed = text.trim()
  if (typed === '') return true
  const n = Number(typed.replace(/,/g, ''))
  return !Number.isFinite(n) || Math.abs(n - saved) > 0.0000001
}

/** Whether the tiers typed are other tiers than the stored ones. */
export function tiersDiffer(typed: readonly TierDraft[], saved: readonly KpiUnitTier[]): boolean {
  const rows = typedTiers(typed)
  if (rows.length !== saved.length) return true
  return rows.some((row, i) => {
    const units = Number(row.minQty)
    const pay = Number(row.amount.replace(/,/g, ''))
    return !Number.isFinite(units) || !Number.isFinite(pay) || units !== saved[i].minQty || Math.abs(pay - saved[i].amount) > 0.0000001
  })
}

/** Whether a listed item is changed in the draft: its bonus or its tiers. */
export function brandItemEdited(item: BrandKpiListed, draft: BrandKpiDraft): boolean {
  const amount = draft.amounts.get(item.id)
  const tiers = draft.tiers.get(item.id)
  return (amount !== undefined && bonusDiffers(amount, item.amount)) || (tiers !== undefined && tiersDiffer(tiers, item.tiers))
}

/** How many changes the draft holds: items coming off, items changed, items added. */
export function brandKpiChanges(listed: readonly BrandKpiListed[], draft: BrandKpiDraft): number {
  const live = listed.filter(item => !draft.removing.has(item.id))
  return draft.removing.size + live.filter(item => brandItemEdited(item, draft)).length + draft.added.length
}

const tierInputs = (tiers: readonly TierDraft[]): KpiTierInput[] => typedTiers(tiers).map(t => ({ minQty: t.minQty, amount: t.amount }))

/**
 * What the Save sends for one brand's block: only what changed. A changed item
 * goes with its bonus when that changed and its tiers, whole, when those did —
 * what it does not name stays as stored, so a bonus somebody else has just
 * retyped on another computer is not written back over by a change of tiers
 * here. An item coming off is never also changed.
 */
export function brandKpiEditOf(brandId: string, listed: readonly BrandKpiListed[], draft: BrandKpiDraft): KpiItemsEdit {
  const live = listed.filter(item => !draft.removing.has(item.id))
  return {
    adds: draft.added.map(a => {
      const name = a.name.trim()
      const common = { amount: a.amount.trim() || null, brandId, name: name || null, tiers: tierInputs(a.tiers), label: name || a.label || a.value }
      return a.source === 'sku'
        ? { source: 'sku' as const, erpId: a.erpId ?? '', ...common }
        : { source: 'option' as const, optionPool: a.pool ?? '', optionValue: a.value, ...common }
    }),
    changes: live.filter(item => brandItemEdited(item, draft)).map(item => {
      const amount = draft.amounts.get(item.id)
      const tiers = draft.tiers.get(item.id)
      return {
        id: item.id,
        ...(amount !== undefined && bonusDiffers(amount, item.amount) ? { amount: amount.trim() || null } : {}),
        label: brandKpiTitle(item),
        ...(tiers !== undefined && tiersDiffer(tiers, item.tiers) ? { tiers: tierInputs(tiers) } : {}),
      }
    }),
    removes: listed.filter(item => draft.removing.has(item.id)).map(item => item.id),
  }
}

// ─── The brand's catalogue (load.ts) ────────────────────────────────────────

/** A SKU of a brand's own SKU master, as far as its models and compartments need it. */
export interface BrandSkuRow {
  item_code: string
  base_model: string | null
  category: string | null
  description: string | null
  removed_at?: string | null
}

/**
 * The fabric series a brand's own item may be (2026-11-14): its company's list,
 * a fabric with no series in its code's family (`brandFabricSeriesOf` — 2990s'
 * EZ-001 … EZ-012 are EZ) — one row a series, with how many fabrics the ERP
 * still lists, one whose every fabric is gone marked so. Sorted by name.
 */
export function brandFabricSeriesList(rows: readonly FabricSeriesRow[]): Array<{ series: string; fabrics: number; removed: boolean }> {
  const bySeries = new Map<string, { series: string; codes: Set<string>; live: boolean }>()
  for (const row of rows) {
    const series = (row.series ?? '').trim() || brandFabricSeriesOf(row.fabric_code, EMPTY_FABRIC_SERIES) || ''
    const key = valueKey(series)
    if (!key) continue
    const live = !row.removed_at
    const held = bySeries.get(key) ?? { series, codes: new Set<string>(), live: false }
    if (live) held.codes.add(kpiCodeKey(row.fabric_code))
    // The writer keeps a live fabric's spelling first (catalogue_save_kpi_items).
    if (live && (!held.live || series < held.series)) held.series = series
    held.live = held.live || live
    bySeries.set(key, held)
  }
  return [...bySeries.values()]
    .map(s => ({ series: s.series, fabrics: s.codes.size, removed: !s.live }))
    .sort((a, b) => a.series.localeCompare(b.series))
}

/** The base models of a brand's own SKU master (2026-11-14): its live SKUs, one row a model, sorted by name. */
export function brandModelList(rows: readonly BrandSkuRow[]): Array<{ model: string; category: string | null; skus: number; sample: string | null }> {
  const byModel = new Map<string, { model: string; category: string | null; skus: number; sample: string | null }>()
  for (const row of rows) {
    if (row.removed_at) continue
    const model = (row.base_model ?? '').trim()
    const key = valueKey(model)
    if (!key) continue
    const held = byModel.get(key) ?? { model, category: row.category?.trim() || null, skus: 0, sample: row.description?.trim() || null }
    held.skus++
    if (model < held.model) held.model = model
    byModel.set(key, held)
  }
  return [...byModel.values()].sort((a, b) => a.model.localeCompare(b.model))
}

/** A brand's sofa compartments (2026-11-14): its live sofas' pieces' modules (`sofaModuleOf`), with how many models have one. */
export function brandCompartmentList(rows: readonly BrandSkuRow[]): Array<{ compartment: string; models: number }> {
  const byCompartment = new Map<string, Set<string>>()
  for (const row of rows) {
    if (row.removed_at || kpiCodeKey(row.category) !== 'SOFA' || !row.item_code.includes('-')) continue
    const compartment = sofaModuleOf(row.item_code)
    if (!compartment) continue
    const models = byCompartment.get(compartment) ?? new Set<string>()
    models.add(valueKey(row.base_model) ?? kpiCodeKey(row.item_code).split('-')[0])
    byCompartment.set(compartment, models)
  }
  return [...byCompartment].map(([compartment, models]) => ({ compartment, models: models.size }))
    .sort((a, b) => b.models - a.models || a.compartment.localeCompare(b.compartment))
}
