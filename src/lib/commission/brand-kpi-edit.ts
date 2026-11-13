import { valueKey } from '@/lib/catalogue/keys'
import type { KpiItemsEdit, KpiTierInput } from '@/lib/catalogue/rule-edits'
import { toUnitTiers, type KpiUnitTier } from './kpi'

/**
 * Rules › KPI items — a brand's own items, edited (2026-11-12; a brand on its
 * own commission scheme, 2990s; the user: "KPI item 那边我是可以手动去加的").
 * The draft of one brand's block: a cost, a corner cost or a bonus retyped, tiers retyped, an
 * item coming off, an item picked to add. Pure — the component holds the state
 * and `saveKpiItems` sends what `brandKpiEditOf` makes of it: only what changed.
 */

/** A brand's own KPI item as Rules lists it. */
export interface BrandKpiListed {
  id: string
  /** The ERP's sofa special the item is found by. */
  special: string
  /** The name it is listed under (*Upgrade fabric*); null = the special's own. */
  name: string | null
  /**
   * What a unit takes off the bill's commissionable sales (2026-11-13); null = none set — what the bill's special
   * order charges for it comes off instead.
   */
  cost: number | null
  /** What a unit takes off the bill of a sofa with a corner (2026-11-14); null = none set — its cost. */
  cornerCost: number | null
  /** What a unit pays below the first tier. */
  amount: number
  tiers: KpiUnitTier[]
}

/** One tier as typed: from `minQty` units in a month every unit pays `amount`. */
export interface TierDraft {
  minQty: string
  amount: string
}

/** An item picked to add, as typed. */
export interface BrandKpiAdded {
  key: string
  special: string
  name: string
  /** Blank = no cost. */
  cost: string
  /** Blank = no corner cost — its cost. */
  cornerCost: string
  amount: string
  tiers: TierDraft[]
}

export interface BrandKpiDraft {
  /** Item id → the cost as typed (blank = none). */
  costs: ReadonlyMap<string, string>
  /** Item id → the corner cost as typed (blank = none). */
  cornerCosts: ReadonlyMap<string, string>
  /** Item id → the bonus as typed. */
  amounts: ReadonlyMap<string, string>
  /** Item id → its tiers as typed, once touched. */
  tiers: ReadonlyMap<string, readonly TierDraft[]>
  removing: ReadonlySet<string>
  added: readonly BrandKpiAdded[]
}

export const EMPTY_BRAND_KPI_DRAFT: BrandKpiDraft = {
  costs: new Map(), cornerCosts: new Map(), amounts: new Map(), tiers: new Map(), removing: new Set(), added: [],
}

/** A stored amount above 0, else none. */
function storedCost(value: number | string | null | undefined): number | null {
  const n = value === null || value === undefined ? NaN : Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** A stored item (`comm_kpi_items`) as the block lists it. */
export function toBrandKpiListed(row: {
  id: string; option_value: string | null; product_name: string | null; kpi_amount: number | string; unit_tiers?: unknown
  cost_amount?: number | string | null
  corner_cost_amount?: number | string | null
}): BrandKpiListed {
  return {
    id: row.id,
    special: (row.option_value ?? '').trim(),
    name: row.product_name?.trim() || null,
    cost: storedCost(row.cost_amount),
    cornerCost: storedCost(row.corner_cost_amount),
    amount: Number(row.kpi_amount),
    tiers: toUnitTiers(row.unit_tiers),
  }
}

/** What an item is called on the page: its own name, else the special. */
export function brandKpiTitle(item: Pick<BrandKpiListed, 'name' | 'special'>): string {
  return item.name || item.special
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

/**
 * Whether a typed cost is another cost than the stored one. A box left blank — or 0 — is no cost; text that is no
 * number counts as a change (the Save says what is wrong with it).
 */
export function costDiffers(text: string, saved: number | null): boolean {
  const typed = text.trim()
  if (typed === '') return saved !== null
  const n = Number(typed.replace(/,/g, ''))
  if (!Number.isFinite(n)) return true
  if (n === 0) return saved !== null
  return saved === null || Math.abs(n - saved) > 0.0000001
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

/** Whether a listed item is changed in the draft: its cost, its corner cost, its bonus or its tiers. */
export function brandItemEdited(item: BrandKpiListed, draft: BrandKpiDraft): boolean {
  const cost = draft.costs.get(item.id)
  const cornerCost = draft.cornerCosts.get(item.id)
  const amount = draft.amounts.get(item.id)
  const tiers = draft.tiers.get(item.id)
  return (cost !== undefined && costDiffers(cost, item.cost))
    || (cornerCost !== undefined && costDiffers(cornerCost, item.cornerCost))
    || (amount !== undefined && bonusDiffers(amount, item.amount))
    || (tiers !== undefined && tiersDiffer(tiers, item.tiers))
}

/** How many changes the draft holds: items coming off, items changed, items added. */
export function brandKpiChanges(listed: readonly BrandKpiListed[], draft: BrandKpiDraft): number {
  const live = listed.filter(item => !draft.removing.has(item.id))
  return draft.removing.size + live.filter(item => brandItemEdited(item, draft)).length + draft.added.length
}

/** The specials of the brand's pool that are no item of the brand yet, and not picked. */
export function specialsLeft(
  pool: readonly { value: string; removed: boolean }[],
  listed: readonly BrandKpiListed[],
  draft: BrandKpiDraft,
): string[] {
  const taken = new Set([
    ...listed.filter(item => !draft.removing.has(item.id)).map(item => valueKey(item.special)),
    ...draft.added.map(a => valueKey(a.special)),
  ])
  const seen = new Set<string | null>()
  return pool.filter(o => !o.removed).map(o => o.value.trim()).filter(value => {
    const key = valueKey(value)
    if (!key || taken.has(key) || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const tierInputs = (tiers: readonly TierDraft[]): KpiTierInput[] => typedTiers(tiers).map(t => ({ minQty: t.minQty, amount: t.amount }))

/**
 * What the Save sends for one brand's block: only what changed. A changed item
 * goes with its cost when that changed (blank = none any more), its corner cost
 * when that did, its bonus when that did and its tiers, whole, when those did —
 * what it does not name stays as stored, so a bonus somebody else has just
 * retyped on another computer is not written back over by a change of tiers
 * here. An item coming off is never also changed.
 */
export function brandKpiEditOf(brandId: string, listed: readonly BrandKpiListed[], draft: BrandKpiDraft): KpiItemsEdit {
  const live = listed.filter(item => !draft.removing.has(item.id))
  return {
    adds: draft.added.map(a => ({
      source: 'option' as const, optionPool: 'sofa_specials', optionValue: a.special, amount: a.amount.trim() || null,
      brandId, name: a.name.trim() || null, tiers: tierInputs(a.tiers), label: a.name.trim() || a.special,
      ...(a.cost.trim() ? { cost: a.cost.trim() } : {}),
      ...(a.cornerCost.trim() ? { cornerCost: a.cornerCost.trim() } : {}),
    })),
    changes: live.filter(item => brandItemEdited(item, draft)).map(item => {
      const cost = draft.costs.get(item.id)
      const cornerCost = draft.cornerCosts.get(item.id)
      const amount = draft.amounts.get(item.id)
      const tiers = draft.tiers.get(item.id)
      return {
        id: item.id,
        ...(cost !== undefined && costDiffers(cost, item.cost) ? { cost: cost.trim() || null } : {}),
        ...(cornerCost !== undefined && costDiffers(cornerCost, item.cornerCost) ? { cornerCost: cornerCost.trim() || null } : {}),
        ...(amount !== undefined && bonusDiffers(amount, item.amount) ? { amount: amount.trim() || null } : {}),
        label: brandKpiTitle(item),
        ...(tiers !== undefined && tiersDiffer(tiers, item.tiers) ? { tiers: tierInputs(tiers) } : {}),
      }
    }),
    removes: listed.filter(item => draft.removing.has(item.id)).map(item => item.id),
  }
}
