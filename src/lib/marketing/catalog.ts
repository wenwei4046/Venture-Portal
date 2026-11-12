// The Product List (mig 20261113100000, `Product Builder.dc.html` › 📋 Product List): Marketing's one menu of sellable
// items — each a catalogue, a name, a description, a price, an internal cost, its est. days, a default workflow and
// remarks. Products and quotations pick their items from it and are linked to it by name (case-insensitive); renaming an
// item here renames it everywhere (the database does it). Pure.

import type { ProductGroup } from './products'

/** A value of one of the manager's own columns: text, a number, an amount, one of its options, a tick. */
export type ExtraValue = string | number | boolean
export type ColumnKind = 'text' | 'number' | 'money' | 'choice' | 'check'

/** One of the manager's own columns of the Product List (the user, 2026-11-12: "管理者可自行增加 column 去填需要的东西"):
 * what it holds, and where its values follow the item — the products' Items, the quotations' lines, the client's PDF. */
export interface ItemColumn {
  id: string
  name: string
  kind: ColumnKind
  options: string[]
  inProducts: boolean
  inQuotes: boolean
  client: boolean
}

export interface CatalogItem {
  id: string
  cat: string
  name: string
  desc: string
  price: number | null
  cost: number | null
  days: number | null
  remarks: string
  wf: string | null
  /** The manager's own columns' values, by the column's id. */
  extra: Record<string, ExtraValue>
}

export const COLUMN_KINDS: [ColumnKind, string][] = [['text', 'Text'], ['number', 'Number'], ['money', 'Price (RM)'], ['choice', 'Dropdown'], ['check', 'Tick box']]

/** What + offers first (the user, 2026-11-13: "点选之后可以选择勾选，价格，下拉式，文字"): each kind, its mark, a line of what it is for. */
export const COLUMN_KIND_MENU: { kind: ColumnKind; mark: string; label: string; hint: string }[] = [
  { kind: 'text', mark: 'Aa', label: 'Text', hint: 'Words — a size, a note' },
  { kind: 'money', mark: 'RM', label: 'Price (RM)', hint: 'An amount in ringgit' },
  { kind: 'number', mark: '#', label: 'Number', hint: 'A count — slides, minutes' },
  { kind: 'choice', mark: '≡', label: 'Dropdown', hint: 'Pick one of your options' },
  { kind: 'check', mark: '✓', label: 'Tick box', hint: 'Yes or no' },
]

export function columnFromRow(v: unknown): ItemColumn {
  const r = isObj(v) ? v : {}
  const kind = COLUMN_KINDS.some(([k]) => k === r.kind) ? (r.kind as ColumnKind) : 'text'
  return {
    id: str(r.id), name: str(r.name), kind, options: Array.isArray(r.options) ? r.options.filter((o): o is string => typeof o === 'string') : [],
    inProducts: r.inProducts !== false, inQuotes: r.inQuotes !== false, client: r.client === true,
  }
}

/** A value in words: "RM 120", "Yes"; null for none. */
export function extraText(kind: ColumnKind | string, v: ExtraValue | null | undefined): string | null {
  if (v === null || v === undefined || v === '' || v === false) return null
  if (kind === 'check') return v === true ? 'Yes' : null
  if (kind === 'money' && typeof v === 'number') return `RM ${(Math.round(v * 100) / 100).toLocaleString('en-MY')}`
  if (typeof v === 'number') return v.toLocaleString('en-MY')
  return String(v)
}

/** An item's values of the columns that pass `keep`, in the columns' order: "Platform: Instagram". */
export function extrasOf(item: Pick<CatalogItem, 'extra'> | null | undefined, columns: readonly ItemColumn[], keep: (c: ItemColumn) => boolean) {
  if (!item) return []
  return columns.filter(keep).flatMap(c => {
    const text = extraText(c.kind, item.extra[c.id])
    return text ? [{ name: c.name, text, client: c.client }] : []
  })
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}

export function catalogItemFromRow(v: unknown): CatalogItem {
  const r = isObj(v) ? v : {}
  const days = num(r.days)
  const extra: Record<string, ExtraValue> = {}
  if (isObj(r.extra)) for (const [k, x] of Object.entries(r.extra)) if (typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean') extra[k] = x
  return {
    id: str(r.id), cat: str(r.cat), name: str(r.name), desc: str(r.desc), price: num(r.price), cost: num(r.cost),
    days: days === null ? null : Math.trunc(days), remarks: str(r.remarks), wf: str(r.wf) || null, extra,
  }
}

/** The design's `norm`: names match whatever their case and spaces at the ends. */
export const norm = (t: string | null | undefined) => (t ?? '').trim().toLowerCase()

/** The item a name stands for on the Product List, if any. */
export const itemNamed = (items: readonly CatalogItem[], name: string) => {
  const n = norm(name)
  return n ? items.find(x => norm(x.name) === n) ?? null : null
}

/** The catalogues in the order their first item was added. */
export const catalogues = (items: readonly CatalogItem[]) => [...new Set(items.map(x => x.cat))]

/** Where an item is used, as the delete's tooltip and toast say it: "2 products · 1 quote" — or "Not used yet". */
export function usedText(pc: number, qc: number): string {
  return [pc ? `${pc} product${pc === 1 ? '' : 's'}` : '', qc ? `${qc} quote${qc === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ') || 'Not used yet'
}

/** How many products' drafts name it, and how many quotations hold it (an item line, or a package's item by name). */
export function usedIn(
  item: CatalogItem,
  products: readonly { groups: readonly ProductGroup[] }[],
  quotes: readonly { lines: readonly { kind: string; item?: string; items?: readonly { name: string }[] }[] }[],
): { pc: number; qc: number; text: string } {
  const n = norm(item.name)
  const pc = n ? products.filter(p => p.groups.some(g => g.items.some(it => norm(it.name) === n))).length : 0
  const qc = quotes.filter(q => q.lines.some(l => (l.kind === 'item' && l.item === item.id) || (!!n && (l.items ?? []).some(it => norm(it.name) === n)))).length
  return { pc, qc, text: usedText(pc, qc) }
}

/**
 * The item picker's groups under a product's category (the design's floating menu): the Product List by catalogue, the
 * catalogue matching the category first and tagged "this category"; what is typed narrows it unless it names an item
 * exactly (then every item shows, to switch).
 */
export function pickerGroups(items: readonly CatalogItem[], category: string, typed: string): {
  groups: { cat: string; here: boolean; items: CatalogItem[] }[]
  exact: boolean
} {
  const q = norm(typed)
  const exact = items.some(x => norm(x.name) === q)
  const pool = items.filter(x => x.name && (!q || exact || norm(`${x.name} ${x.desc} ${x.cat}`).includes(q)))
  const cats = catalogues(items)
  const order = [...new Set([...cats.filter(c => norm(c) === norm(category)), ...cats])]
  return {
    exact,
    groups: order.map(cat => ({ cat, here: norm(cat) === norm(category), items: pool.filter(x => x.cat === cat) })).filter(g => g.items.length),
  }
}

/** Only what changed of an item, for the save. */
export function itemPatch(before: CatalogItem, after: CatalogItem): Record<string, unknown> | null {
  const p: Record<string, unknown> = {}
  for (const k of ['cat', 'name', 'desc', 'price', 'cost', 'days', 'remarks', 'wf'] as const) if (before[k] !== after[k]) p[k] = after[k]
  // The manager's columns: only the values that changed; one emptied is sent as null (cleared).
  const extra: Record<string, ExtraValue | null> = {}
  for (const k of new Set([...Object.keys(before.extra), ...Object.keys(after.extra)])) {
    if (before.extra[k] !== after.extra[k]) extra[k] = after.extra[k] ?? null
  }
  if (Object.keys(extra).length) p.extra = extra
  return Object.keys(p).length ? p : null
}

/** What a product's Items may set of a Product List item (the user, 2026-11-12: days and the manager's columns, "两者联动"):
 * its est. days, and its columns' values — null clears one. */
export interface ItemFacts {
  days?: number | null
  extra?: Record<string, ExtraValue | null>
}

/** Two changes as one: the later wins, a column's value by column. */
export function mergeFacts(a: ItemFacts, b: ItemFacts): ItemFacts {
  const out: ItemFacts = { ...a }
  if ('days' in b) out.days = b.days ?? null
  if (b.extra) out.extra = { ...(a.extra ?? {}), ...b.extra }
  return out
}

/** The item with the change made. */
export function withFacts(item: CatalogItem, f: ItemFacts): CatalogItem {
  const extra = { ...item.extra }
  for (const [k, v] of Object.entries(f.extra ?? {})) {
    if (v === null || v === '' || v === false) delete extra[k]
    else extra[k] = v
  }
  return { ...item, days: 'days' in f ? f.days ?? null : item.days, extra }
}

/** The change as the save takes it (`mkt_item_save`'s keys). */
export function factsPayload(f: ItemFacts): Record<string, unknown> {
  const p: Record<string, unknown> = {}
  if ('days' in f) p.days = f.days ?? null
  if (f.extra && Object.keys(f.extra).length) p.extra = Object.fromEntries(Object.entries(f.extra).map(([k, v]) => [k, v === '' || v === false ? null : v]))
  return p
}
