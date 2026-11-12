// Lead View v3 › Outlets (2026-11-10, docs/design_handoff_lead_view_v3 § 3; mig 20261110200000). A brand's showrooms;
// an ad belongs to one; a customer's follows the ad they came in on unless CS set it. Pure parts, tested in outlets.test.ts.

import type { LeadBrand } from './types'

export interface LeadOutlet {
  id: string
  brandId: string
  name: string
}

/** The Outlet filter's value: every outlet, the customers with none, or one outlet's id. */
export type OutletFilter = 'all' | 'none' | string

/** A brand's own outlets; a brand with none (2990s mini) is offered every outlet (README § 3). */
export function outletsFor(outlets: LeadOutlet[], brandId: string | null | undefined): LeadOutlet[] {
  const own = outlets.filter(o => o.brandId === brandId)
  return own.length ? own : outlets
}

export function outletName(outlets: LeadOutlet[], id: string | null | undefined): string {
  return (id && outlets.find(o => o.id === id)?.name) || ''
}

/** Does something with this outlet (null = none) pass the filter? */
export function passesOutlet(filter: OutletFilter, outletId: string | null | undefined): boolean {
  if (filter === 'all') return true
  if (filter === 'none') return !outletId
  return outletId === filter
}

export type OutletMenuRow =
  | { kind: 'item'; value: OutletFilter; label: string; count: number | null }
  | { kind: 'head'; label: string }

/**
 * The All outlets menu (the prototype's `outFilter`): All outlets, then each brand's outlets under the brand's name in
 * capitals (brands in their order, only those with outlets), then No outlet last. `counts` (outlet id | 'none' → n)
 * draws a number beside each; without it none is drawn.
 */
export function outletMenu(outlets: LeadOutlet[], brands: Pick<LeadBrand, 'id' | 'name'>[], counts?: Map<string, number>): OutletMenuRow[] {
  const n = (k: string) => (counts ? counts.get(k) ?? 0 : null)
  const rows: OutletMenuRow[] = [{ kind: 'item', value: 'all', label: 'All outlets', count: counts ? [...counts.values()].reduce((a, b) => a + b, 0) : null }]
  for (const b of brands) {
    const own = outlets.filter(o => o.brandId === b.id)
    if (!own.length) continue
    rows.push({ kind: 'head', label: b.name.toUpperCase() })
    for (const o of own) rows.push({ kind: 'item', value: o.id, label: o.name, count: n(o.id) })
  }
  rows.push({ kind: 'item', value: 'none', label: 'No outlet', count: n('none') })
  return rows
}

/**
 * The Inbox's Filters › OUTLET (2026-11-11 — the user: "筛选brand, outlet 的方式再容易看懂"): each brand's outlets under its
 * name, brands in their order, then No outlet; with one brand picked in All brands, only that brand's.
 */
export function inboxOutletRows(outlets: LeadOutlet[], brands: Pick<LeadBrand, 'id' | 'name'>[], brand: string): OutletMenuRow[] {
  return outletMenu(outlets, brand === 'all' ? brands : brands.filter(b => b.id === brand)).filter(r => !(r.kind === 'item' && r.value === 'all'))
}

/** How many of `items` sit at each outlet ('none' for those with none). */
export function outletCounts<T>(items: T[], outletOf: (t: T) => string | null | undefined): Map<string, number> {
  const m = new Map<string, number>()
  for (const t of items) {
    const k = outletOf(t) || 'none'
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return m
}

/** The filter button's words. */
export function outletFilterLabel(outlets: LeadOutlet[], filter: OutletFilter): string {
  if (filter === 'all') return 'All outlets'
  if (filter === 'none') return 'No outlet'
  return outletName(outlets, filter) || 'All outlets'
}
