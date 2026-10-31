import { brandCodeFor } from '@/lib/brand-code'
import type { BrandRef, CatalogueModel } from '../load'

/**
 * Modular's board in the order it is drawn: category (the ERP's order), then
 * branding inside the category (user 2026-09-27: "有 branding 的就放 branding，
 * 没有 branding 的就放在一起"), then the ERP's own model order.
 *
 * A model's branding is the ERP's — its own, else its SKUs', the fallback
 * `derivedBrand` reads — named by the brand register's code when the register
 * knows it, so DUNLOPILLO sits under DUNLOP, the word on its cards, and a
 * sub-brand under its brand (HAPPI SLEEP under AKEMI, 2026-10-31); a branding
 * the register does not know (MYLATEX) keeps the ERP's word. Choosing a margin
 * ladder in the model's window never moves its card: the ladder is the
 * portal's decision, the branding the ERP's fact. Brandings run A→Z and the
 * unbranded close the category, together. A category where nothing is
 * branded has no branding headings at all.
 */

export interface Branding {
  key: string
  label: string
}

export interface BoardBranding {
  /** null = the unbranded, together. */
  branding: Branding | null
  models: CatalogueModel[]
}

export interface BoardCategory {
  /** Upper-cased; '' for a model the ERP gave no category. */
  category: string
  count: number
  /** Draw branding headings only when something in the category is branded. */
  branded: boolean
  groups: BoardBranding[]
}

export function brandingOf(model: Pick<CatalogueModel, 'branding' | 'skus'>, brands: readonly BrandRef[]): Branding | null {
  const raw = model.branding?.trim() || model.skus.map(s => s.branding?.trim()).find(Boolean)
  if (!raw) return null
  const known = brandCodeFor(raw, brands)
  const label = known ? known.toUpperCase() : raw.toUpperCase()
  return { key: label, label }
}

/** `models` already filtered; `categories` in the ERP's order (`orderedCategories`). */
export function modularBoard(
  models: readonly CatalogueModel[],
  categories: readonly string[],
  brands: readonly BrandRef[],
): BoardCategory[] {
  const byCategory = new Map<string, Map<string, BoardBranding>>()
  for (const m of models) {
    const category = (m.category ?? '').toUpperCase()
    const branding = brandingOf(m, brands)
    let groups = byCategory.get(category)
    if (!groups) byCategory.set(category, (groups = new Map()))
    // A branding's key is never blank, so '' is free for the unbranded.
    const key = branding?.key ?? ''
    let group = groups.get(key)
    if (!group) groups.set(key, (group = { branding, models: [] }))
    group.models.push(m)
  }
  const rank = (c: string) => {
    const i = categories.indexOf(c)
    return i === -1 ? categories.length : i
  }
  return [...byCategory]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([category, map]) => {
      const groups = [...map.values()].sort((a, b) =>
        a.branding === null ? 1 : b.branding === null ? -1 : a.branding.label.localeCompare(b.branding.label, 'en', { numeric: true }),
      )
      return {
        category,
        count: groups.reduce((n, g) => n + g.models.length, 0),
        branded: groups.some(g => g.branding !== null),
        groups,
      }
    })
}

/** Every model of the board, in the order it is drawn — what ‹ › steps through. */
export function boardOrder(board: readonly BoardCategory[]): CatalogueModel[] {
  return board.flatMap(c => c.groups.flatMap(g => g.models))
}

export interface PageBranding extends BoardBranding {
  /** The cards drawn now; `models` stays the whole group. */
  cards: CatalogueModel[]
}

export interface PageCategory extends Omit<BoardCategory, 'groups'> {
  groups: PageBranding[]
}

/**
 * The first `limit` cards of the board, cut where they run out. Headings keep
 * the whole group's count: a heading names its group, and "Show more" adds
 * cards under it, never a different number.
 */
export function boardPage(board: readonly BoardCategory[], limit: number): PageCategory[] {
  let left = limit
  const page: PageCategory[] = []
  for (const c of board) {
    if (left <= 0) break
    const groups: PageBranding[] = []
    for (const g of c.groups) {
      if (left <= 0) break
      const cards = g.models.slice(0, left)
      left -= cards.length
      groups.push({ ...g, cards })
    }
    page.push({ ...c, groups })
  }
  return page
}
