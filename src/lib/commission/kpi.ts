/**
 * KPI items — what the Product List's *Add-on / KPI Items* tab sets, and how a
 * bill is found to carry one (2026-09-27).
 *
 * A KPI item is a SKU from the SKU Master (a pillow, a protector) or a special
 * from Maintenance (a bed frame's *HB Straight*, a sofa's *Wooden Arm*), each
 * with ONE amount. When a bill carries it, that amount comes off the bill's
 * commissionable sales and is paid to the salesperson as a flat KPI allowance
 * instead (user 2026-09-27, "Flat KPI allowance"):
 *
 *   RM 10,000 bill with HB Straight at RM 200, rate 7%
 *     main   9,800 × 7% = 686.00   its margin judged on 9,800
 *     KPI    RM 200 flat            no margin applied, + the monthly
 *                                   quantity bonus (comm_kpi_thresholds)
 *
 * The ERP cannot say how much of a bill an add-on is — a bed frame line is
 * RM 0.00 on 96% of bills, its value folded into the mattress — so the amount
 * is the Principal's figure, not the line's. A bill pays its KPI items only
 * when its sales cover them (`coverKpi`).
 *
 * FOUND, not typed: a SKU by its product code; a special by the options the
 * line carries (`raw.variants`, else the ERP's own `description2` grammar —
 * `parseLineFacts`), in the pool's own category. A sofa prints its specials
 * on every module line, so a sofa special counts ONCE per bill; a bed frame
 * special counts per bed frame (line quantity) — two bed frames with HB
 * Straight are two add-ons. Hand-typed AutoCount-era text ("HEADBOARD DO
 * STRAIGHT") parses to nothing and is not found.
 *
 * The twin of the SQL in migration 20260927050000 (`comm_kpi_hits`); the run,
 * the month page, the member app and the calculator must find the same items.
 */

import { valueKey } from '@/lib/catalogue/keys'
import { parseLineFacts } from '@/lib/catalogue/facts'

export const KPI_OPTION_POOLS = ['bedframe_specials', 'sofa_specials'] as const
export type KpiOptionPool = (typeof KPI_OPTION_POOLS)[number]

export function isKpiOptionPool(pool: string): pool is KpiOptionPool {
  return (KPI_OPTION_POOLS as readonly string[]).includes(pool)
}

/** The ERP item group a special's pool belongs to. */
const POOL_GROUP: Record<KpiOptionPool, string> = {
  bedframe_specials: 'BEDFRAME',
  sofa_specials: 'SOFA',
}

export interface KpiItem {
  /** Absent = a SKU when it names a code (every row before 2026-09-27 was). */
  source?: 'sku' | 'option'
  /** SKU items: the ERP Item Code a line carries. */
  productCode?: string | null
  /** Option items: which Maintenance pool, and the option's own spelling. */
  optionPool?: KpiOptionPool | null
  optionValue?: string | null
  /** What a person reads: the SKU's name, or the special. */
  label?: string | null
  /** RM per unit — taken off the bill and paid as the KPI allowance. */
  kpiAmount: number
}

/**
 * The specials a sales line carries, read the way `catalogue_line_facts` reads
 * them: the ERP's `raw.variants` when it sent them, else its `description2`
 * grammar. Only a bed frame's or a sofa's can be a KPI item, so nothing else
 * is read; undefined = none.
 */
export function lineSpecialsOf(
  itemGroup: string | null | undefined,
  description2: string | null | undefined,
  variants: unknown,
): string[] | undefined {
  const group = kpiCodeKey(itemGroup)
  if (group !== 'BEDFRAME' && group !== 'SOFA') return undefined
  const raw = variants === undefined || variants === null ? undefined : { variants }
  const { specials } = parseLineFacts(description2 ?? null, raw)
  return specials.length > 0 ? specials : undefined
}

/** A line as far as finding KPI items needs it. */
export interface KpiLine {
  id: string
  itemGroup: string
  productCode: string
  productName?: string
  qty: number
  /** The specials the line carries, as printed (`LineFacts.specials`). */
  specials?: readonly string[]
  upsale?: boolean
}

export interface KpiIndex {
  byCode: ReadonlyMap<string, KpiItem>
  /** Pool → option value key → item. */
  byOption: ReadonlyMap<KpiOptionPool, ReadonlyMap<string, KpiItem>>
  size: number
}

export const EMPTY_KPI_INDEX: KpiIndex = { byCode: new Map(), byOption: new Map(), size: 0 }

/** Codes are compared the way the engine compares them: trimmed, upper case. */
export function kpiCodeKey(code: string | null | undefined): string {
  return (code ?? '').trim().toUpperCase()
}

export function kpiSourceOf(item: Pick<KpiItem, 'source' | 'optionPool'>): 'sku' | 'option' {
  return item.source ?? (item.optionPool ? 'option' : 'sku')
}

/** A stable key for one item, for summaries and React keys. */
export function kpiItemKey(item: Pick<KpiItem, 'source' | 'productCode' | 'optionPool' | 'optionValue'>): string {
  return kpiSourceOf(item) === 'sku'
    ? `sku:${kpiCodeKey(item.productCode)}`
    : `option:${item.optionPool}:${valueKey(item.optionValue) ?? ''}`
}

export function kpiItemLabel(item: KpiItem): string {
  const own = (item.label ?? '').trim()
  if (own) return own
  return kpiSourceOf(item) === 'sku' ? kpiCodeKey(item.productCode) : (item.optionValue ?? '').trim()
}

/** What an item is, and how a bill counts it — the words the tabs print. */
export function kpiItemKind(item: Pick<KpiItem, 'source' | 'optionPool'>): { kind: string; counted: string } {
  if (kpiSourceOf(item) === 'sku') return { kind: 'SKU', counted: 'Per unit' }
  return item.optionPool === 'sofa_specials'
    ? { kind: 'Sofa special', counted: 'Once per sofa bill' }
    : { kind: 'Bed frame special', counted: 'Per bed frame' }
}

export function indexKpiItems(items: readonly KpiItem[]): KpiIndex {
  const byCode = new Map<string, KpiItem>()
  const byOption = new Map<KpiOptionPool, Map<string, KpiItem>>()
  let size = 0
  for (const item of items) {
    if (kpiSourceOf(item) === 'sku') {
      const code = kpiCodeKey(item.productCode)
      if (!code || byCode.has(code)) continue
      byCode.set(code, item)
      size++
    } else if (item.optionPool && isKpiOptionPool(item.optionPool)) {
      const key = valueKey(item.optionValue)
      if (!key) continue
      const pool = byOption.get(item.optionPool) ?? new Map<string, KpiItem>()
      if (pool.has(key)) continue
      pool.set(key, item)
      byOption.set(item.optionPool, pool)
      size++
    }
  }
  return { byCode, byOption, size }
}

/**
 * The item a printed special is, in one pool. Exact first, then without a
 * trailing "(…)" — `Right Drawer (10")` is the pool's `Right Drawer` — the
 * rule the surcharge lookup uses (`OptionPrices.get`, `catalogue_option_price`).
 */
function optionFor(special: string, pool: ReadonlyMap<string, KpiItem>): KpiItem | undefined {
  const exact = valueKey(special)
  if (exact && pool.has(exact)) return pool.get(exact)
  const stripped = valueKey(special.replace(/\s*\(.*\)\s*$/, ''))
  return stripped ? pool.get(stripped) : undefined
}

export interface KpiHit {
  item: KpiItem
  itemKey: string
  /** The line that carries it — the first such line for a once-a-bill special. */
  lineId: string
  qty: number
  /** qty × the item's amount: off the bill, and the allowance paid. */
  amount: number
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Every KPI item a bill carries. An upsale HR recorded is never one. */
export function orderKpiHits(order: { lines: readonly KpiLine[]; upsale?: boolean }, index: KpiIndex): KpiHit[] {
  if (index.size === 0 || order.upsale) return []
  const hits: KpiHit[] = []
  // Once-a-bill specials (a sofa's): item key → the hit being built.
  const perBill = new Map<string, KpiHit>()

  for (const line of order.lines) {
    if (line.upsale) continue
    const sku = index.byCode.get(kpiCodeKey(line.productCode))
    if (sku) {
      hits.push({ item: sku, itemKey: kpiItemKey(sku), lineId: line.id, qty: line.qty, amount: round2(line.qty * sku.kpiAmount) })
    }
    if (!line.specials?.length) continue
    const group = kpiCodeKey(line.itemGroup)
    for (const [poolName, pool] of index.byOption) {
      if (POOL_GROUP[poolName] !== group) continue
      // One line may print a special twice; it is still one add-on.
      const seen = new Set<KpiItem>()
      for (const special of line.specials) {
        const item = optionFor(special, pool)
        if (!item || seen.has(item)) continue
        seen.add(item)
        const key = kpiItemKey(item)
        if (poolName === 'sofa_specials') {
          if (!perBill.has(key)) {
            perBill.set(key, { item, itemKey: key, lineId: line.id, qty: 0, amount: 0 })
          }
          // The sign of the sofa's quantity decides: a return takes it back.
          const hit = perBill.get(key)!
          hit.qty += line.qty
        } else {
          hits.push({ item, itemKey: key, lineId: line.id, qty: line.qty, amount: round2(line.qty * item.kpiAmount) })
        }
      }
    }
  }

  for (const hit of perBill.values()) {
    const qty = Math.sign(hit.qty)
    if (qty === 0) continue
    hits.push({ ...hit, qty, amount: round2(qty * hit.item.kpiAmount) })
  }
  return hits
}

/** What the bill's KPI items take off its commissionable sales. */
export function kpiAmountOf(hits: readonly KpiHit[]): number {
  return round2(hits.reduce((sum, hit) => sum + hit.amount, 0))
}

/**
 * Whether a bill's sales COVER its KPI items, and its main sales.
 *
 * The KPI part is part of the bill: its amount comes out of the bill's
 * commissionable sales. A bill whose sales do not cover it — a RM 0.00
 * exchange that still prints the sofa's specials (two in September 2026) —
 * sold no add-on: none of its KPI items is paid, and it is paid as the sales
 * it has. Not a run warning: every warning blocks Apply, and an exchange is
 * not an error to be fixed before payroll.
 */
export function coverKpi(commissionable: number, kpiAmount: number): { main: number; covered: boolean } {
  const main = round2(commissionable - kpiAmount)
  const covered = commissionable >= 0 ? main >= 0 : main <= 0
  return covered ? { main, covered } : { main: round2(commissionable), covered }
}
