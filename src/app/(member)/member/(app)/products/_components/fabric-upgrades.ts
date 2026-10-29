/**
 * Maintenance › Fabrics › Sofa / Bedframe upgrades (2026-10-29): the tab's
 * draft — upgrades made, names and charges retyped, series ticked and
 * unticked, upgrades taken off — and the Save it becomes, which sends only
 * what changed (a shared account has the same upgrade open on two computers:
 * a charge retyped on one must not put back the series the other ticked).
 * Pure, so the table stays a thin caller and this is tested.
 *
 * Validation is `validateFabricUpgrades` (lib/catalogue/edits.ts); the tab
 * runs it before sending and the Server Action runs it again.
 */

import { valueKey } from '@/lib/catalogue/keys'
import { tidyUpgradeName, type FabricUpgradeCategory, type FabricUpgradesEdit } from '@/lib/catalogue/edits'
import type { FabricRow, FabricUpgradeRow } from '../load'

/** What the draft holds for a saved upgrade: only what was touched. */
export interface UpgradeDraftRow {
  name?: string
  price?: string
  /** The series ticked under it after the edit, whole. */
  series?: string[]
  removing?: boolean
}

/** An upgrade made on the tab and not saved yet. */
export interface NewUpgrade {
  key: string
  name: string
  price: string
  series: string[]
}

export interface UpgradesDraft {
  rows: ReadonlyMap<string, UpgradeDraftRow>
  /** In the order they were added. */
  added: readonly NewUpgrade[]
}

export const EMPTY_UPGRADES_DRAFT: UpgradesDraft = { rows: new Map(), added: [] }

/** One category's saved upgrades, by name. */
export function upgradesOf(upgrades: readonly FabricUpgradeRow[], category: FabricUpgradeCategory): FabricUpgradeRow[] {
  return upgrades.filter(u => u.category === category).sort((a, b) => a.name.localeCompare(b.name))
}

/** A saved upgrade as the draft shows it. */
export function shownUpgrade(u: FabricUpgradeRow, draft: UpgradesDraft) {
  const d = draft.rows.get(u.id)
  return {
    name: d?.name ?? u.name,
    price: d?.price ?? String(u.price),
    series: d?.series ?? u.series,
    removing: d?.removing === true,
  }
}

/** A saved upgrade's draft row, changed. */
export function touchUpgrade(draft: UpgradesDraft, id: string, change: UpgradeDraftRow): UpgradesDraft {
  const rows = new Map(draft.rows)
  rows.set(id, { ...rows.get(id), ...change })
  return { ...draft, rows }
}

/** A new upgrade's row, changed. */
export function touchNew(draft: UpgradesDraft, key: string, change: Partial<Omit<NewUpgrade, 'key'>>): UpgradesDraft {
  return { ...draft, added: draft.added.map(a => (a.key === key ? { ...a, ...change } : a)) }
}

export function addUpgrade(draft: UpgradesDraft, key: string): UpgradesDraft {
  return { ...draft, added: [...draft.added, { key, name: '', price: '', series: [] }] }
}

export function dropNew(draft: UpgradesDraft, key: string): UpgradesDraft {
  return { ...draft, added: draft.added.filter(a => a.key !== key) }
}

/**
 * The fabric series the list can tick: each series of a fabric the ERP still
 * lists, once whatever its case, spelled as its live fabrics spell it, with how
 * many fabrics it holds — each code once (the ERP lists AVANI's 18 colours as
 * 36 rows). By name.
 */
export function seriesOptions(fabrics: readonly FabricRow[]): Array<{ series: string; fabrics: number }> {
  const bySeries = new Map<string, { series: string; codes: Set<string> }>()
  for (const f of fabrics) {
    if (f.removed) continue
    const series = (f.series ?? '').trim()
    const key = valueKey(series)
    if (!key) continue
    const held = bySeries.get(key) ?? { series, codes: new Set<string>() }
    held.codes.add(f.code.trim().toUpperCase())
    if (series < held.series) held.series = series
    bySeries.set(key, held)
  }
  return [...bySeries.values()].map(s => ({ series: s.series, fabrics: s.codes.size })).sort((a, b) => a.series.localeCompare(b.series))
}

/**
 * The series ticked under the draft's upgrades — saved ones not coming off,
 * and new ones — except the one named (a saved id or a new key): a series is
 * in one upgrade of a category at most, so the others are not offered it.
 */
export function takenSeries(upgrades: readonly FabricUpgradeRow[], draft: UpgradesDraft, except?: string): Set<string> {
  const taken = new Set<string>()
  for (const u of upgrades) {
    if (u.id === except) continue
    const shown = shownUpgrade(u, draft)
    if (shown.removing) continue
    for (const s of shown.series) taken.add(valueKey(s)!)
  }
  for (const a of draft.added) {
    if (a.key === except) continue
    for (const s of a.series) taken.add(valueKey(s)!)
  }
  return taken
}

const keysOf = (series: readonly string[]) => new Set(series.map(s => valueKey(s)))

function priceDiffers(text: string, saved: number): boolean {
  const s = text.replace(/,/g, '').trim()
  const n = Number(s)
  return s === '' || !Number.isFinite(n) || Math.round(n * 100) !== Math.round(saved * 100)
}

/** What changed on a saved upgrade: its name, its charge, the series ticked and unticked. */
function changeOf(u: FabricUpgradeRow, d: UpgradeDraftRow) {
  const name = d.name !== undefined && tidyUpgradeName(d.name) !== u.name ? d.name : undefined
  const price = d.price !== undefined && priceDiffers(d.price, u.price) ? d.price : undefined
  const saved = keysOf(u.series)
  const now = d.series ?? u.series
  const shown = keysOf(now)
  const addSeries = now.filter(s => !saved.has(valueKey(s)))
  const dropSeries = u.series.filter(s => !shown.has(valueKey(s)))
  return { name, price, addSeries, dropSeries }
}

/** How many changes the draft holds — what Save counts: an upgrade made, taken off, or changed, one each. */
export function upgradesChanges(upgrades: readonly FabricUpgradeRow[], draft: UpgradesDraft): number {
  let n = draft.added.length
  for (const u of upgrades) {
    const d = draft.rows.get(u.id)
    if (!d) continue
    if (d.removing) {
      n++
      continue
    }
    const c = changeOf(u, d)
    if (c.name !== undefined || c.price !== undefined || c.addSeries.length || c.dropSeries.length) n++
  }
  return n
}

/** The draft as `saveFabricUpgrades` takes it: only what changed. */
export function upgradesEditOf(upgrades: readonly FabricUpgradeRow[], draft: UpgradesDraft): FabricUpgradesEdit {
  const changes: FabricUpgradesEdit['changes'] = []
  const removes: string[] = []
  for (const u of upgrades) {
    const d = draft.rows.get(u.id)
    if (!d) continue
    if (d.removing) {
      removes.push(u.id)
      continue
    }
    const c = changeOf(u, d)
    if (c.name === undefined && c.price === undefined && !c.addSeries.length && !c.dropSeries.length) continue
    changes.push({
      id: u.id,
      label: u.name,
      ...(c.name !== undefined ? { name: c.name } : {}),
      ...(c.price !== undefined ? { price: c.price } : {}),
      ...(c.addSeries.length ? { addSeries: c.addSeries } : {}),
      ...(c.dropSeries.length ? { dropSeries: c.dropSeries } : {}),
    })
  }
  return { adds: draft.added.map(a => ({ name: a.name, price: a.price, series: [...a.series] })), changes, removes }
}
