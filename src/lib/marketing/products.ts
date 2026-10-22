// Marketing's Product Builder (mig 20261023235900, `Product Builder.dc.html`): the products and packages Marketing sells
// to the subsidiaries — what each includes (actions in categories, a quantity and a unit price each, a workflow each),
// its intake minutes template, its list price and internal cost, the day a version takes effect, its versions. What the
// list and the editor show, the five sections' ticks, the margin, what publishing refuses (as mkt_product_publish
// does), and only what changed, for the save. Prices and costs are the manager's alone. Pure.

export type ProductKind = 'one' | 'recurring'
export type ProductStatus = 'draft' | 'active' | 'retired'

export interface ProductItem {
  /** The item's key on the page (not kept). */
  key: string
  name: string
  qty: number
  /** The unit price, RM; null when not set. */
  price: number | null
  /** A workflow template's id. */
  workflow: string | null
}

export interface ProductGroup {
  key: string
  name: string
  items: ProductItem[]
}

export interface ProductVersionLine {
  version: number
  at: string | null
  note: string
  by: string | null
}

export interface Product {
  id: string
  code: string
  name: string
  description: string
  kind: ProductKind
  groups: ProductGroup[]
  intake: string | null
  price: number | null
  cost: number | null
  effectiveFrom: string | null
  status: ProductStatus
  retiredOn: string | null
  rev: number
  version: number
  changed: boolean
  /** Projects running on it, whatever their version. */
  live: number
  history: ProductVersionLine[]
}

/** A workflow template the action picker offers. */
export interface ProductWorkflowOption {
  id: string
  action: string
  tname: string
  version: number
  stages: number
  days: number
  pic: number
}

/** A minutes template the intake picker offers. */
export interface ProductMinutesOption {
  id: string
  name: string
  version: number
  fields: number
}

export interface ProductBook {
  products: Product[]
  workflows: ProductWorkflowOption[]
  minutes: ProductMinutesOption[]
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const strOrNull = (v: unknown) => (typeof v === 'string' && v ? v : null)
const int = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null)
const money = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

let seq = 0
export const productKey = () => `p${Date.now().toString(36)}${(seq++).toString(36)}`

function groupsFromRow(v: unknown): ProductGroup[] {
  if (!Array.isArray(v)) return []
  return v.filter(isObj).map(g => ({
    key: productKey(),
    name: str(g.name),
    items: Array.isArray(g.items)
      ? g.items.filter(isObj).map(it => ({ key: productKey(), name: str(it.name), qty: Math.max(0, int(it.qty) ?? 0), price: money(it.price), workflow: strOrNull(it.workflow) }))
      : [],
  }))
}

/** mkt_products(): the products on sale first, then drafts, then those retired; the pickers' templates. */
export function productBookFromRow(v: unknown): ProductBook {
  const r = isObj(v) ? v : {}
  const products = (Array.isArray(r.products) ? r.products : []).filter(isObj).map((p): Product => ({
    id: str(p.id),
    code: str(p.code),
    name: str(p.name),
    description: str(p.description),
    kind: p.kind === 'recurring' ? 'recurring' : 'one',
    groups: groupsFromRow(p.groups),
    intake: strOrNull(p.intake),
    price: money(p.price),
    cost: money(p.cost),
    effectiveFrom: strOrNull(p.effectiveFrom),
    status: p.status === 'active' || p.status === 'retired' ? p.status : 'draft',
    retiredOn: strOrNull(p.retiredOn),
    rev: int(p.rev) ?? 1,
    version: int(p.version) ?? 0,
    changed: p.changed !== false,
    live: int(p.live) ?? 0,
    history: (Array.isArray(p.history) ? p.history : []).filter(isObj).map(h => ({ version: int(h.version) ?? 0, at: strOrNull(h.at), note: str(h.note), by: strOrNull(h.by) })),
  }))
  const workflows = (Array.isArray(r.workflows) ? r.workflows : []).filter(isObj).map(w => ({
    id: str(w.id), action: str(w.action), tname: str(w.tname), version: int(w.version) ?? 0, stages: int(w.stages) ?? 0, days: int(w.days) ?? 0, pic: int(w.pic) ?? 0,
  }))
  const minutes = (Array.isArray(r.minutes) ? r.minutes : []).filter(isObj).map(t => ({
    id: str(t.id), name: str(t.name), version: int(t.version) ?? 0, fields: int(t.fields) ?? 0,
  }))
  return { products, workflows, minutes }
}

/** "4 image posts + 2 videos" — what a product includes, as the database writes it in a version's note. */
export function includedText(groups: readonly ProductGroup[]): string {
  const parts = groups.flatMap(g => g.items).filter(it => it.qty > 0 && it.name.trim()).map(it => `${it.qty} ${it.name.trim().toLowerCase()}`)
  return parts.join(' + ') || 'Nothing added yet'
}

/** The sum of every action's quantity × unit price. */
export const itemsSum = (groups: readonly ProductGroup[]) =>
  Math.round(groups.flatMap(g => g.items).reduce((n, it) => n + (it.price ?? 0) * it.qty, 0) * 100) / 100
export const groupSum = (g: ProductGroup) => itemsSum([g])

/** The margin on the list price — (price − cost) ÷ price, whole per cent — or null without both. */
export function margin(price: number | null, cost: number | null): number | null {
  if (price == null || price <= 0 || cost == null || cost < 0) return null
  return Math.round(((price - cost) / price) * 100)
}

/** The editor's five sections, each ticked once it is complete (the handoff's `filled`). */
export function productSections(p: Pick<Product, 'name' | 'code' | 'groups' | 'intake' | 'price' | 'effectiveFrom'>): { label: string; done: boolean }[] {
  const items = p.groups.flatMap(g => g.items)
  return [
    { label: 'Basics', done: !!p.name.trim() && !!p.code },
    { label: "What's included", done: items.some(it => it.qty > 0 && !!it.name.trim()) },
    { label: 'Linked templates', done: !!p.intake && items.length > 0 && items.every(it => !!it.workflow) },
    { label: 'Pricing', done: (p.price ?? 0) > 0 },
    { label: 'Publish', done: !!p.effectiveFrom },
  ]
}

/** What publishing refuses, as the database does (`book`: whether each linked template is published). */
export function productProblems(p: Product, book: Pick<ProductBook, 'workflows' | 'minutes'>): string[] {
  const out: string[] = []
  if (p.status === 'retired') return ['A retired product is read-only — reactivate it first']
  if (!p.name.trim()) out.push('Name the product')
  const items = p.groups.flatMap(g => g.items)
  if (p.groups.some(g => !g.name.trim()) || items.some(it => !it.name.trim())) out.push('Name each category and action')
  if (!items.some(it => it.qty > 0 && it.name.trim())) out.push('Add what the product includes')
  if (items.some(it => !it.workflow)) out.push('Link a workflow to each action')
  else if (items.some(it => (book.workflows.find(w => w.id === it.workflow)?.version ?? 0) === 0)) out.push('A linked workflow is not published yet')
  if (!p.intake) out.push('Pick its intake minutes template')
  else if ((book.minutes.find(t => t.id === p.intake)?.version ?? 0) === 0) out.push('Its intake minutes template is not published yet')
  if ((p.price ?? 0) <= 0) out.push('Set its list price')
  if (!p.effectiveFrom) out.push('Pick the day it takes effect')
  return out
}

/** An empty action and an empty category, as the editor adds them. */
export const newItem = (): ProductItem => ({ key: productKey(), name: '', qty: 1, price: null, workflow: null })
export const newGroup = (name: string): ProductGroup => ({ key: productKey(), name: name.trim(), items: [newItem()] })

/** The groups as mkt_product_save takes them. */
export function groupsPayload(groups: readonly ProductGroup[]): Record<string, unknown>[] {
  return groups.map(g => ({ name: g.name, items: g.items.map(it => ({ name: it.name, qty: it.qty, price: it.price, workflow: it.workflow })) }))
}

export interface ProductEdit {
  name: string
  description: string
  kind: ProductKind
  groups: ProductGroup[]
  intake: string | null
  price: number | null
  cost: number | null
  effectiveFrom: string | null
}

export const editOfProduct = (p: Product): ProductEdit => ({
  name: p.name, description: p.description, kind: p.kind, groups: p.groups, intake: p.intake, price: p.price, cost: p.cost, effectiveFrom: p.effectiveFrom,
})

/** The parts of `now` not as `saved` had them; null when nothing changed. */
export function productPatch(saved: ProductEdit, now: ProductEdit): Record<string, unknown> | null {
  const patch: Record<string, unknown> = {}
  if (now.name !== saved.name) patch.name = now.name
  if (now.description !== saved.description) patch.description = now.description
  if (now.kind !== saved.kind) patch.kind = now.kind
  if (JSON.stringify(groupsPayload(now.groups)) !== JSON.stringify(groupsPayload(saved.groups))) patch.groups = groupsPayload(now.groups)
  if (now.intake !== saved.intake) patch.intake = now.intake
  if (now.price !== saved.price) patch.price = now.price
  if (now.cost !== saved.cost) patch.cost = now.cost
  if (now.effectiveFrom !== saved.effectiveFrom) patch.effectiveFrom = now.effectiveFrom
  return Object.keys(patch).length ? patch : null
}

/** Typed ringgit, as the inputs take it: digits and one point, two decimals at most; empty = not set. */
export function ringgitOf(typed: string): number | null | undefined {
  const t = typed.replace(/[^\d.]/g, '')
  if (t === '') return null
  if (!/^\d{0,13}(\.\d{0,2})?$/.test(t)) return undefined
  const n = Number(t)
  return Number.isFinite(n) ? n : undefined
}
