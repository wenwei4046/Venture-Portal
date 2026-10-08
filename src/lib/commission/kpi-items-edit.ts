/**
 * Rules › KPI items (2026-10-08): the tab's draft — what was picked, what was
 * retyped, what is coming off the list — and what it becomes when it is
 * saved; and how a SKU is searched for. Pure, so the tab stays a thin caller
 * and this is tested.
 *
 * The items moved here from Product List › Add-on / KPI Items (user
 * 2026-10-08: "rules 这里是用来算薪水的 … product list 是拿来 set costing 的"):
 * Rules says which items count as KPI and what each pays; the Product List
 * only prices things. How a bill is found to carry one is unchanged
 * (`kpi.ts` `orderKpiHits`, its SQL twin `comm_kpi_hits`), and so is the
 * writer, `catalogue_save_kpi_items` — effective-dated, one transaction.
 *
 * Validation is `validateKpiItems` (lib/catalogue/rule-edits.ts); the tab runs
 * it before sending and the Server Action runs it again.
 */

import { valueKey } from '@/lib/catalogue/keys'
import { parseMoney } from '@/lib/catalogue/edits'
import { kpiAddKey, type KpiItemsEdit } from '@/lib/catalogue/rule-edits'
import { kpiCodeKey, type KpiOptionPool } from './kpi'

/** An item on the list — a `comm_kpi_items` row in force today or later. */
export interface KpiListedItem {
  id: string
  source: 'sku' | 'option'
  /** SKU items: the SKU Master row it was picked from, and the code a line carries. */
  erpId: string | null
  code: string | null
  /** SKU items: the SKU's description when it was picked. */
  name: string | null
  /** Option items: the Maintenance pool and the special's own spelling. */
  optionPool: KpiOptionPool | null
  optionValue: string | null
  /** RM per unit. */
  amount: number
}

/** An item picked on the tab and not saved yet. */
export type KpiPickedItem =
  | { key: string; source: 'sku'; erpId: string; code: string; name: string | null }
  | { key: string; source: 'option'; pool: KpiOptionPool; value: string; name: string | null }

export interface KpiItemsDraft {
  /** Newest first, as the table shows them. */
  added: readonly KpiPickedItem[]
  /** What is typed in a row's amount: a listed item by its id, a picked one by its key. */
  amounts: ReadonlyMap<string, string>
  /** Listed items coming off the list (their ids). */
  removing: ReadonlySet<string>
}

export const EMPTY_KPI_DRAFT: KpiItemsDraft = { added: [], amounts: new Map(), removing: new Set() }

/** A listed item's name: the SKU's code, or the special. */
export function listedLabel(item: Pick<KpiListedItem, 'source' | 'code' | 'optionValue'>): string {
  return (item.source === 'sku' ? item.code : item.optionValue) ?? '—'
}

/** Bed frame specials, then sofa specials, then SKUs — the order the tab lists them in. */
export function listedOrder(item: Pick<KpiListedItem, 'source' | 'optionPool'>): number {
  return item.source === 'sku' ? 2 : item.optionPool === 'bedframe_specials' ? 0 : 1
}

export function sortListed<T extends KpiListedItem>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => listedOrder(a) - listedOrder(b) || listedLabel(a).localeCompare(listedLabel(b)))
}

/** True when the text is another amount than the saved one — or no amount at all. */
export function amountDiffers(text: string, saved: number): boolean {
  try {
    return parseMoney(text, 'KPI amount', true) !== saved
  } catch {
    return true
  }
}

/** Listed items, not coming off, whose amount was retyped to another figure. */
export function changedItems<T extends KpiListedItem>(items: readonly T[], draft: KpiItemsDraft): T[] {
  return items.filter(i => {
    if (draft.removing.has(i.id)) return false
    const text = draft.amounts.get(i.id)
    return text !== undefined && amountDiffers(text, i.amount)
  })
}

/** How many changes the draft holds — what Save counts. */
export function draftChanges(items: readonly KpiListedItem[], draft: KpiItemsDraft): number {
  return draft.added.length + draft.removing.size + changedItems(items, draft).length
}

export const skuIdKey = (erpId: string) => `sku:${erpId}`
export const skuCodeKey = (code: string) => `code:${kpiCodeKey(code)}`
export const specialKey = (pool: string | null, value: string | null) => `option:${pool}:${valueKey(value) ?? ''}`

/**
 * Everything already on the list or being added, so the picker never offers
 * it a second time. A SKU by its row AND its code — a renamed SKU keeps its
 * row, and two rows may carry one code. An item coming off may be picked again.
 */
export function listedKeys(items: readonly KpiListedItem[], draft: KpiItemsDraft): Set<string> {
  const keys = new Set<string>()
  for (const i of items) {
    if (draft.removing.has(i.id)) continue
    if (i.source === 'sku') {
      if (i.erpId) keys.add(skuIdKey(i.erpId))
      if (i.code) keys.add(skuCodeKey(i.code))
    } else {
      keys.add(specialKey(i.optionPool, i.optionValue))
    }
  }
  for (const a of draft.added) {
    if (a.source === 'sku') {
      keys.add(skuIdKey(a.erpId))
      keys.add(skuCodeKey(a.code))
    } else {
      keys.add(specialKey(a.pool, a.value))
    }
  }
  return keys
}

/** A picked SKU or special, keyed the way the writer's validation keys it. */
export function pickSku(sku: { erpId: string; code: string; name: string | null }): KpiPickedItem {
  return { key: kpiAddKey({ source: 'sku', erpId: sku.erpId }), source: 'sku', erpId: sku.erpId, code: sku.code, name: sku.name }
}

export function pickSpecial(special: { pool: KpiOptionPool; value: string; label?: string | null }): KpiPickedItem {
  const name = special.label && special.label !== special.value ? special.label : null
  return {
    key: kpiAddKey({ source: 'option', optionPool: special.pool, optionValue: special.value }),
    source: 'option',
    pool: special.pool,
    value: special.value,
    name,
  }
}

/** The draft as `saveKpiItems` takes it. */
export function kpiItemsEditOf(items: readonly KpiListedItem[], draft: KpiItemsDraft): KpiItemsEdit {
  return {
    adds: draft.added.map(a =>
      a.source === 'sku'
        ? { source: 'sku', erpId: a.erpId, amount: draft.amounts.get(a.key) ?? '', label: a.code }
        : { source: 'option', optionPool: a.pool, optionValue: a.value, amount: draft.amounts.get(a.key) ?? '', label: a.value },
    ),
    changes: changedItems(items, draft).map(i => ({ id: i.id, amount: draft.amounts.get(i.id) ?? '', label: listedLabel(i) })),
    removes: [...draft.removing],
  }
}

// ─── Finding a SKU ──────────────────────────────────────────────────────────

/** At most this many SKUs come back for one search. */
export const SKU_SEARCH_LIMIT = 20

/**
 * The PostgREST `or` filter a SKU search sends: its code or its description
 * contains what was typed, any case. Null when nothing was typed.
 *
 * The value is double-quoted, so a comma, a dot or a bracket in it — "PILLOW
 * (K)", "AK-CS 1.5" — stays part of the value instead of breaking the filter;
 * a double quote or a backslash could end the quoting and `*` is PostgREST's
 * wildcard, so those three are taken out.
 */
export function kpiSkuSearchFilter(raw: string): string | null {
  const q = raw.replace(/["\\*]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80).trim()
  if (!q) return null
  const value = `"*${q}*"`
  return `item_code.ilike.${value},description.ilike.${value}`
}
