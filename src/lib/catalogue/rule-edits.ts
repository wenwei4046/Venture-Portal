/**
 * Validating what is typed on Product List › Costing Setting (the Principal)
 * and Rules › KPI items (Principal and HR — the Product List's Add-on / KPI
 * Items until 2026-10-08) before `catalogue_save_cost_setting` and
 * `catalogue_save_kpi_items` write it. Pure: the tabs check a draft with the
 * same rules the Server Actions enforce (`app/(member)/member/(app)/products/
 * actions.ts`, `app/(portal)/revenue/kpi-actions.ts`).
 *
 * A RATIO divides a cost — Revenue Team cost = cost ÷ ratio (Fair 0.7). Above
 * 0 and at most 10, the range `revenue_cost_divisor` has always had, to four
 * decimals (what `numeric(6,4)` keeps). A SKU's blank ratio means it has none
 * of its own and takes its sub-department's.
 *
 * A KPI AMOUNT is money: up to two decimals, zero or more — a zero item still
 * counts toward the monthly quantity bonus — and never blank.
 *
 * What names a SKU, a special or a fabric series is NOT taken from here: the
 * database reads a SKU's code and name from the SKU Master, a special's
 * spelling from its Maintenance pool and a series' from the ERP's fabric list.
 * These carry ids and the special or series as picked.
 */

import { EditError, parseMoney } from './edits'
import { valueKey } from './keys'
import { isFabricSeriesPool, isKpiItemPool, isKpiOptionPool, type KpiItemPool } from '@/lib/commission/kpi'

export { EditError }

const ERP_ID = /^[A-Za-z0-9_.:-]{1,80}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_ROWS = 2000

// ─── Costing Setting ────────────────────────────────────────────────────────

/** `0.6` → 0.6, `.65` → 0.65; blank → null. */
export function parseRatio(raw: string | number | null | undefined, what: string): number | null {
  if (raw === null || raw === undefined) return null
  const s = String(raw).trim()
  if (s === '') return null
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(s)) throw new EditError(`${what}: "${raw}" is not a ratio — type it as 0.7`)
  if (/\.\d{5,}$/.test(s)) throw new EditError(`${what}: "${raw}" — a ratio keeps four decimals at most`)
  const n = Number(s)
  if (!(n > 0) || n > 10) throw new EditError(`${what}: a ratio must be above 0 and at most 10`)
  return n
}

export interface CostSettingEdit {
  /** The sub-department's ratio. Undefined leaves it as it is. */
  divisor?: string | null
  /** SKUs' own ratios; blank sends a SKU back to its sub-department's. */
  ratios: ReadonlyArray<{ erpId: string; ratio: string | null; label?: string }>
  /**
   * A rider SKU's ratio for a brand (2026-11-07) — only the ones changed. Blank
   * takes it off: that brand follows the SKU's own ratio, else the default.
   */
  brands?: ReadonlyArray<{ erpId: string; brand: string; ratio: string | null; label?: string }>
}

export interface CostSettingPlan {
  /** Null = unchanged. */
  divisor: number | null
  ratios: Array<{ erp_product_id: string; ratio: number }>
  removes: string[]
  /** Null ratio = taken off. */
  brands: Array<{ erp_product_id: string; brand_code: string; ratio: number | null }>
}

const BRAND_CODE = /^[A-Za-z0-9 _&.'-]{1,40}$/

export function validateCostSetting(edit: CostSettingEdit): CostSettingPlan {
  let divisor: number | null = null
  if (edit.divisor !== undefined) {
    divisor = parseRatio(edit.divisor, 'The sub-department ratio')
    if (divisor === null) throw new EditError('The sub-department ratio cannot be blank — 1 keeps a cost as it was keyed')
  }
  const rows = edit.ratios ?? []
  if (rows.length > MAX_ROWS) throw new EditError(`Save at most ${MAX_ROWS.toLocaleString()} SKUs at a time`)
  const seen = new Set<string>()
  const ratios: CostSettingPlan['ratios'] = []
  const removes: string[] = []
  for (const row of rows) {
    if (!row || typeof row.erpId !== 'string' || !ERP_ID.test(row.erpId)) throw new EditError('A row names no SKU')
    const name = row.label?.trim() || row.erpId
    if (seen.has(row.erpId)) throw new EditError(`${name} appears twice`)
    seen.add(row.erpId)
    const ratio = parseRatio(row.ratio, name)
    if (ratio === null) removes.push(row.erpId)
    else ratios.push({ erp_product_id: row.erpId, ratio })
  }
  const brandRows = edit.brands ?? []
  if (rows.length + brandRows.length > MAX_ROWS) throw new EditError(`Save at most ${MAX_ROWS.toLocaleString()} ratios at a time`)
  const seenBrand = new Set<string>()
  const brands: CostSettingPlan['brands'] = []
  for (const row of brandRows) {
    if (!row || typeof row.erpId !== 'string' || !ERP_ID.test(row.erpId)) throw new EditError('A row names no SKU')
    if (typeof row.brand !== 'string' || !BRAND_CODE.test(row.brand)) throw new EditError('A row names no brand')
    const name = `${row.label?.trim() || row.erpId} · ${row.brand}`
    const key = `${row.erpId}\u0000${row.brand}`
    if (seenBrand.has(key)) throw new EditError(`${name} appears twice`)
    seenBrand.add(key)
    brands.push({ erp_product_id: row.erpId, brand_code: row.brand, ratio: parseRatio(row.ratio, name) })
  }
  if (divisor === null && ratios.length === 0 && removes.length === 0 && brands.length === 0) throw new EditError('Nothing to save')
  return { divisor, ratios, removes, brands }
}

/** Revenue Team cost: what a margin is judged against. Never rounded here. */
export function teamCost(cost: number, ratio: number): number {
  return cost / ratio
}

// ─── KPI items (Rules › KPI items since 2026-10-08) ─────────────────────────

/**
 * A step of a brand's own KPI item, as typed (2026-11-12 — a brand on its own commission scheme, 2990s): from
 * `minQty` units in a month EVERY unit pays `amount`.
 */
export interface KpiTierInput {
  minQty: string | null
  amount: string | null
}

/** A brand's own item (2026-11-12): the brand (`comm_brands.id`), the name it is listed under, and its tiers. */
interface BrandKpiAddFields {
  brandId?: string
  name?: string | null
  tiers?: ReadonlyArray<KpiTierInput>
}

export type KpiItemAdd =
  | ({ source: 'sku'; erpId: string; amount: string | null; label?: string } & BrandKpiAddFields)
  | ({ source: 'option'; optionPool: string; optionValue: string; amount: string | null; label?: string } & BrandKpiAddFields)

export interface KpiItemsEdit {
  adds: ReadonlyArray<KpiItemAdd>
  /**
   * `amount` absent = the amount stays as stored (a brand's item whose tiers alone changed — only what changed is
   * sent); null = the box was emptied, which is refused. `tiers`: a brand's own item's, sent whole when they
   * changed — absent, they stay as stored.
   */
  changes: ReadonlyArray<{ id: string; amount?: string | null; label?: string; tiers?: ReadonlyArray<KpiTierInput> }>
  removes: ReadonlyArray<string>
}

/** `comm_kpi_items.unit_tiers`: what the database's CHECK (`comm_kpi_unit_tiers_valid`) takes. */
export interface KpiTierRow {
  min_qty: number
  amount: number
}

/** A brand's own item's add (2026-11-12): its brand, the name it is listed under, its tiers. */
interface BrandKpiAddRow {
  brand_id?: string
  label?: string
  unit_tiers?: KpiTierRow[]
}

export type KpiAddRow =
  | ({ source: 'sku'; erp_product_id: string; kpi_amount: number } & BrandKpiAddRow)
  | ({ source: 'option'; option_pool: KpiItemPool; option_value: string; kpi_amount: number } & BrandKpiAddRow)

export interface KpiItemsPlan {
  adds: KpiAddRow[]
  changes: Array<{ id: string; kpi_amount?: number; unit_tiers?: KpiTierRow[] }>
  removes: string[]
}

/** One key per item, whichever row names it: a SKU by its id, a special by pool and spelling — a brand's own, by its brand too. */
export function kpiAddKey(
  add: { source: 'sku'; erpId: string; brandId?: string } | { source: 'option'; optionPool: string; optionValue: string; brandId?: string },
): string {
  const key = add.source === 'sku' ? `sku:${add.erpId}` : `option:${add.optionPool}:${valueKey(add.optionValue) ?? ''}`
  return add.brandId ? `brand:${add.brandId.toLowerCase()}:${key}` : key
}

/** The most tiers one item takes: more than anybody types, far fewer than would crowd its row. */
export const MAX_KPI_TIERS = 6

/**
 * A brand's item's tiers as the database stores them — the twin of its CHECK: whole numbers of units from 2 up,
 * each above the one before, each with what a unit then pays (RM 0 – 1,000,000). A row left wholly blank is no tier.
 */
export function kpiTiers(raw: ReadonlyArray<KpiTierInput> | undefined, name: string): KpiTierRow[] {
  const rows: KpiTierRow[] = []
  let last = 1
  for (const tier of raw ?? []) {
    const units = (tier?.minQty ?? '').toString().trim()
    const pay = (tier?.amount ?? '').toString().trim()
    if (!units && !pay) continue
    if (!/^\d{1,6}$/.test(units)) throw new EditError(`${name}: a tier starts at a whole number of units`)
    const minQty = Number(units)
    if (minQty < 2) throw new EditError(`${name}: a tier starts from 2 units — below that every unit pays the bonus`)
    if (minQty <= last) throw new EditError(`${name}: each tier starts above the one before`)
    const amount = parseMoney(pay, `${name}: what a unit pays from ${minQty}`, true)
    if (amount === null) throw new EditError(`${name}: say what a unit pays from ${minQty} units`)
    if (amount < 0) throw new EditError(`${name}: a tier cannot pay less than nothing`)
    if (amount > 1_000_000) throw new EditError(`${name}: a tier pays at most RM 1,000,000 a unit`)
    rows.push({ min_qty: minQty, amount })
    last = minQty
  }
  if (rows.length > MAX_KPI_TIERS) throw new EditError(`${name}: at most ${MAX_KPI_TIERS} tiers`)
  return rows
}

function kpiAmount(raw: string | null | undefined, name: string): number {
  const amount = parseMoney(raw, `${name}: KPI amount`, true)
  if (amount === null) throw new EditError(`${name}: give it a KPI amount`)
  if (amount < 0) throw new EditError(`${name}: a KPI amount cannot be negative`)
  return amount
}

/** A brand's own item's brand, its own name, its tiers (2026-11-12) — what only such an item has. */
function brandFields(a: BrandKpiAddFields, value: string): { brandId: string; own: string; name: string; tiers: KpiTierRow[] } {
  if (typeof a.brandId !== 'string' || !UUID.test(a.brandId)) throw new EditError('An added row names no brand')
  const own = typeof a.name === 'string' ? a.name.trim().replace(/\s+/g, ' ') : ''
  if (own.length > 120) throw new EditError(`${own.slice(0, 40)}…: a name is at most 120 characters`)
  const name = own || value
  return { brandId: a.brandId, own, name, tiers: kpiTiers(a.tiers, name) }
}

export function validateKpiItems(edit: KpiItemsEdit): KpiItemsPlan {
  const addsIn = edit.adds ?? []
  const changesIn = edit.changes ?? []
  const removesIn = edit.removes ?? []
  if (addsIn.length + changesIn.length + removesIn.length > MAX_ROWS) {
    throw new EditError(`Save at most ${MAX_ROWS.toLocaleString()} changes at a time`)
  }

  const removes = [...new Set(removesIn.map(String))]
  for (const id of removes) if (!UUID.test(id)) throw new EditError('A removed row names no KPI item')
  const removing = new Set(removes)

  const changed = new Set<string>()
  const changes = changesIn.map(c => {
    if (!c || typeof c.id !== 'string' || !UUID.test(c.id)) throw new EditError('A changed row names no KPI item')
    const name = c.label?.trim() || 'A KPI item'
    if (changed.has(c.id)) throw new EditError(`${name} is changed twice`)
    if (removing.has(c.id)) throw new EditError(`${name} is both changed and removed`)
    changed.add(c.id)
    if (c.amount === undefined && c.tiers === undefined) throw new EditError(`${name}: nothing changed`)
    // What the row does not name stays as stored (the database reads it so): the amount when the tiers alone
    // changed. A brand's own item's tiers go whole when they changed; whose item it is, the database knows (it
    // refuses tiers on the sub-department's own).
    return {
      id: c.id,
      ...(c.amount === undefined ? {} : { kpi_amount: kpiAmount(c.amount, name) }),
      ...(c.tiers === undefined ? {} : { unit_tiers: kpiTiers(c.tiers, name) }),
    }
  })

  const added = new Set<string>()
  const adds = addsIn.map((a): KpiAddRow => {
    if (!a || (a.source !== 'sku' && a.source !== 'option')) throw new EditError('A KPI item is a SKU, a special or a fabric series')
    const ownFieldsSent = a.tiers !== undefined || a.name !== undefined
    if (a.source === 'sku') {
      if (typeof a.erpId !== 'string' || !ERP_ID.test(a.erpId)) throw new EditError('An added row names no SKU')
      // A brand's own SKU (2026-11-14): of the brand's own SKU master (the database checks), its name and its tiers.
      if (a.brandId !== undefined) {
        const brand = brandFields(a, a.label?.trim() || a.erpId)
        const key = kpiAddKey({ source: 'sku', erpId: a.erpId, brandId: brand.brandId })
        if (added.has(key)) throw new EditError(`${brand.name} is added twice`)
        added.add(key)
        return {
          source: 'sku', erp_product_id: a.erpId, kpi_amount: kpiAmount(a.amount, brand.name), brand_id: brand.brandId,
          ...(brand.own ? { label: brand.own } : {}), ...(brand.tiers.length > 0 ? { unit_tiers: brand.tiers } : {}),
        }
      }
      if (ownFieldsSent) throw new EditError("Only a brand's own KPI item has a name and tiers of its own")
      const name = a.label?.trim() || a.erpId
      const key = kpiAddKey(a)
      if (added.has(key)) throw new EditError(`${name} is added twice`)
      added.add(key)
      return { source: 'sku', erp_product_id: a.erpId, kpi_amount: kpiAmount(a.amount, name) }
    }
    // A model or a compartment (2026-11-14) is a brand's own alone.
    const brandItem = a.brandId !== undefined
    const pool: KpiItemPool | null = typeof a.optionPool === 'string'
      && (brandItem ? isKpiItemPool(a.optionPool) : isKpiOptionPool(a.optionPool)) ? a.optionPool as KpiItemPool : null
    if (!pool) {
      throw new EditError(brandItem
        ? "A brand's own KPI item is a SKU, a model, a compartment, a special or a fabric series"
        : "Only a bed frame's or a sofa's special or fabric series can be a KPI item")
    }
    const value = typeof a.optionValue === 'string' ? a.optionValue.trim() : ''
    if (!value || value.length > 200) {
      throw new EditError(isFabricSeriesPool(pool) ? 'An added fabric series has no name' : 'An added special has no name')
    }
    // A brand's own item (2026-11-12): of the brand's own ERP company, with a name of its own and, maybe, tiers.
    if (brandItem) {
      const brand = brandFields(a, value)
      const key = kpiAddKey({ source: 'option', optionPool: pool, optionValue: value, brandId: brand.brandId })
      if (added.has(key)) throw new EditError(`${brand.name} is added twice`)
      added.add(key)
      return {
        source: 'option', option_pool: pool, option_value: value, kpi_amount: kpiAmount(a.amount, brand.name),
        brand_id: brand.brandId, ...(brand.own ? { label: brand.own } : {}),
        ...(brand.tiers.length > 0 ? { unit_tiers: brand.tiers } : {}),
      }
    }
    if (ownFieldsSent) throw new EditError("Only a brand's own KPI item has a name and tiers of its own")
    const name = a.label?.trim() || value
    const key = kpiAddKey({ source: 'option', optionPool: pool, optionValue: value })
    if (added.has(key)) throw new EditError(`${name} is added twice`)
    added.add(key)
    return { source: 'option', option_pool: pool, option_value: value, kpi_amount: kpiAmount(a.amount, name) }
  })

  if (adds.length === 0 && changes.length === 0 && removes.length === 0) throw new EditError('Nothing to save')
  return { adds, changes, removes }
}
