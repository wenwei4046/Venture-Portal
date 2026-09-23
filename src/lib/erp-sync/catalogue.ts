/**
 * A catalogue delivery from the Houzs ERP — `POST /api/erp/v1/products`,
 * contract §9 (version 2, 2026-09-24).
 *
 * ITEMS ONLY. The user's rule: 所有镜像功能只同步 item，不同步价钱与 costing —
 * the mirror carries what EXISTS (SKUs, models and their allowed options,
 * the Maintenance pools, specials, fabrics, combos) and never a price or a
 * cost. The portal's prices are typed on the Product List. The ERP strips
 * money in its own SQL before anything leaves; `ingest_erp_catalogue` strips
 * it again on the way in, and so does this, so a money field can survive
 * neither end.
 *
 * The rows are the ERP's own, verbatim — its snake_case column names — so the
 * sender is a plain SELECT and the mapping lives in ONE place, the ingest RPC.
 * This module only checks the envelope, drops what cannot be a row, and counts,
 * so a delivery the portal could not read answers 422 with a reason instead of
 * vanishing into a 200.
 */

import { isRow, type Row } from './contract'

/** Sections a delivery may carry. Each is optional; an absent one is untouched. */
export const CATALOGUE_SECTIONS = ['products', 'models', 'specials', 'fabrics', 'combos'] as const
export type CatalogueSection = (typeof CATALOGUE_SECTIONS)[number]

/**
 * One delivery may not carry more than this many rows. A whole catalogue is
 * ~2,350 SKUs + ~700 models + ~950 fabrics + ~100 combos + ~35 specials; the cap
 * leaves room for growth while keeping one bad batch from becoming one
 * enormous transaction.
 */
export const CATALOGUE_MAX_ROWS = 20_000

/** Keys that are money on the ERP side. Never forwarded, whatever the sender did. */
export const MONEY_KEYS = [
  'cost_price_sen', 'base_price_sen', 'price1_sen', 'sell_price_sen', 'pwp_price_sen',
  'seat_height_prices', 'prices_by_height', 'selling_prices_by_height', 'pwp_prices_by_height',
  'priceSen', 'costSen', 'sellingPriceSen', 'price', 'price_sen', 'selling_price_sen',
  'cost_price', 'costPrice', 'basePrice', 'price1', 'sellPrice', 'default_surcharge',
] as const

const MONEY = new Set<string>(MONEY_KEYS)

export function stripMoney(row: Row): Row {
  const out: Row = {}
  for (const [k, v] of Object.entries(row)) {
    if (!MONEY.has(k)) out[k] = v
  }
  return out
}

/** A Maintenance pool entry keeps its value and its active flag, nothing else. */
function poolEntry(entry: unknown): { value: string; active: boolean } | null {
  if (typeof entry === 'string') {
    const v = entry.trim()
    return v ? { value: v, active: true } : null
  }
  if (isRow(entry) && typeof entry.value === 'string' && entry.value.trim()) {
    return { value: entry.value.trim(), active: entry.active !== false }
  }
  return null
}

/** The ERP's config keys the portal mirrors — Bedframe and Sofa, not "Products Maintenance". */
export const MAINTENANCE_POOL_KEYS = [
  'divanHeights', 'totalHeights', 'gaps', 'legHeights', 'sofaSizes', 'sofaLegHeights',
] as const

export interface CatalogueDelivery {
  companyId: number
  full: boolean
  snapshotAt: string | null
  products?: Row[]
  models?: Row[]
  specials?: Row[]
  fabrics?: Row[]
  combos?: Row[]
  maintenance?: {
    effective_from: string | null
    pools: Partial<Record<(typeof MAINTENANCE_POOL_KEYS)[number], Array<{ value: string; active: boolean }>>>
  }
}

export interface CatalogueCounts {
  /** Rows sent per section. */
  sent: Partial<Record<CatalogueSection | 'maintenance', number>>
  /** Rows dropped because they were not objects. */
  unreadable: number
}

export type CatalogueParseResult =
  | { ok: true; delivery: CatalogueDelivery; counts: CatalogueCounts }
  | { ok: false; error: string }

export function parseCatalogueDelivery(body: unknown): CatalogueParseResult {
  if (!isRow(body)) return { ok: false, error: 'delivery must be an object' }

  const companyRaw = body.companyId ?? body.company_id ?? 1
  const companyId = Number(companyRaw)
  if (!Number.isInteger(companyId) || companyId < 1) {
    return { ok: false, error: 'companyId must be a positive integer' }
  }

  const delivery: CatalogueDelivery = {
    companyId,
    full: body.full === true,
    snapshotAt: typeof body.snapshotAt === 'string' ? body.snapshotAt : null,
  }
  const counts: CatalogueCounts = { sent: {}, unreadable: 0 }
  let total = 0
  let carried = 0

  for (const section of CATALOGUE_SECTIONS) {
    const raw = body[section]
    if (raw === undefined || raw === null) continue
    if (!Array.isArray(raw)) return { ok: false, error: `${section} must be an array` }
    const rows = raw.filter(isRow).map(stripMoney)
    counts.sent[section] = raw.length
    counts.unreadable += raw.length - rows.length
    total += raw.length
    carried += 1
    delivery[section] = rows
  }

  const m = body.maintenance
  if (m !== undefined && m !== null) {
    if (!isRow(m) || (m.pools !== undefined && !isRow(m.pools))) {
      return { ok: false, error: 'maintenance must be {effective_from, pools: {…}}' }
    }
    const pools: NonNullable<CatalogueDelivery['maintenance']>['pools'] = {}
    let entries = 0
    for (const key of MAINTENANCE_POOL_KEYS) {
      const list = isRow(m.pools) ? m.pools[key] : undefined
      if (!Array.isArray(list)) continue
      pools[key] = list.map(poolEntry).filter((e): e is { value: string; active: boolean } => e !== null)
      entries += list.length
    }
    delivery.maintenance = {
      effective_from: typeof m.effective_from === 'string' ? m.effective_from : null,
      pools,
    }
    counts.sent.maintenance = entries
    total += entries
    carried += 1
  }

  if (carried === 0) {
    return { ok: false, error: 'delivery carried no catalogue section (products, models, maintenance, specials, fabrics, combos)' }
  }
  if (total > CATALOGUE_MAX_ROWS) {
    return { ok: false, error: `delivery carries ${total} rows; the cap is ${CATALOGUE_MAX_ROWS}` }
  }

  return { ok: true, delivery, counts }
}
