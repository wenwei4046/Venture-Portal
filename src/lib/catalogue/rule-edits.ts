/**
 * Validating what the Principal types on Product List › Costing Setting and
 * › Add-on / KPI Items (2026-09-27) before `catalogue_save_cost_setting` and
 * `catalogue_save_kpi_items` write it. Pure: the tabs check a draft with the
 * same rules the Server Actions enforce (`app/(portal)/revenue/catalogue-actions.ts`).
 *
 * A RATIO divides a cost — Revenue Team cost = cost ÷ ratio (Fair 0.7). Above
 * 0 and at most 10, the range `revenue_cost_divisor` has always had, to four
 * decimals (what `numeric(6,4)` keeps). A SKU's blank ratio means it has none
 * of its own and takes its sub-department's.
 *
 * A KPI AMOUNT is money: up to two decimals, zero or more — a zero item still
 * counts toward the monthly quantity bonus — and never blank.
 *
 * What names a SKU or a special is NOT taken from here: the database reads a
 * SKU's code and name from the SKU Master and a special's spelling from its
 * Maintenance pool. These carry ids and the special as picked.
 */

import { EditError, parseMoney } from './edits'
import { valueKey } from './keys'
import { isKpiOptionPool, type KpiOptionPool } from '@/lib/commission/kpi'

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
}

export interface CostSettingPlan {
  /** Null = unchanged. */
  divisor: number | null
  ratios: Array<{ erp_product_id: string; ratio: number }>
  removes: string[]
}

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
  if (divisor === null && ratios.length === 0 && removes.length === 0) throw new EditError('Nothing to save')
  return { divisor, ratios, removes }
}

/** Revenue Team cost: what a margin is judged against. Never rounded here. */
export function teamCost(cost: number, ratio: number): number {
  return cost / ratio
}

// ─── Add-on / KPI Items ─────────────────────────────────────────────────────

export type KpiItemAdd =
  | { source: 'sku'; erpId: string; amount: string | null; label?: string }
  | { source: 'option'; optionPool: string; optionValue: string; amount: string | null; label?: string }

export interface KpiItemsEdit {
  adds: ReadonlyArray<KpiItemAdd>
  changes: ReadonlyArray<{ id: string; amount: string | null; label?: string }>
  removes: ReadonlyArray<string>
}

export type KpiAddRow =
  | { source: 'sku'; erp_product_id: string; kpi_amount: number }
  | { source: 'option'; option_pool: KpiOptionPool; option_value: string; kpi_amount: number }

export interface KpiItemsPlan {
  adds: KpiAddRow[]
  changes: Array<{ id: string; kpi_amount: number }>
  removes: string[]
}

/** One key per item, whichever row names it: a SKU by its id, a special by pool and spelling. */
export function kpiAddKey(add: { source: 'sku'; erpId: string } | { source: 'option'; optionPool: string; optionValue: string }): string {
  return add.source === 'sku' ? `sku:${add.erpId}` : `option:${add.optionPool}:${valueKey(add.optionValue) ?? ''}`
}

function kpiAmount(raw: string | null | undefined, name: string): number {
  const amount = parseMoney(raw, `${name}: KPI amount`, true)
  if (amount === null) throw new EditError(`${name}: give it a KPI amount`)
  if (amount < 0) throw new EditError(`${name}: a KPI amount cannot be negative`)
  return amount
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
    return { id: c.id, kpi_amount: kpiAmount(c.amount, name) }
  })

  const added = new Set<string>()
  const adds = addsIn.map((a): KpiAddRow => {
    if (!a || (a.source !== 'sku' && a.source !== 'option')) throw new EditError('A KPI item is a SKU or a special')
    if (a.source === 'sku') {
      if (typeof a.erpId !== 'string' || !ERP_ID.test(a.erpId)) throw new EditError('An added row names no SKU')
      const name = a.label?.trim() || a.erpId
      const key = kpiAddKey(a)
      if (added.has(key)) throw new EditError(`${name} is added twice`)
      added.add(key)
      return { source: 'sku', erp_product_id: a.erpId, kpi_amount: kpiAmount(a.amount, name) }
    }
    if (typeof a.optionPool !== 'string' || !isKpiOptionPool(a.optionPool)) {
      throw new EditError('Only a bed frame or a sofa special can be a KPI item')
    }
    const value = typeof a.optionValue === 'string' ? a.optionValue.trim() : ''
    if (!value || value.length > 200) throw new EditError('An added special has no name')
    const name = a.label?.trim() || value
    const key = kpiAddKey({ source: 'option', optionPool: a.optionPool, optionValue: value })
    if (added.has(key)) throw new EditError(`${name} is added twice`)
    added.add(key)
    return { source: 'option', option_pool: a.optionPool, option_value: value, kpi_amount: kpiAmount(a.amount, name) }
  })

  if (adds.length === 0 && changes.length === 0 && removes.length === 0) throw new EditError('Nothing to save')
  return { adds, changes, removes }
}
