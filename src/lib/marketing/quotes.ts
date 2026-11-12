// Quotations (mig 20261113100000, `Product Builder.dc.html` › 📄 Quotations): built for a subsidiary or an outside client
// from Product List items and packages; their sums (as the database's mkt_quote_subtotal); versions sent and the one
// accepted; the internal pricing sheet's CSV; the tasks an accepted quotation turns into. Pure.

import { catalogItemFromRow, columnFromRow, extraText, norm, type CatalogItem, type ExtraValue, type ItemColumn } from './catalog'
import type { ProductKind } from './products'

// ── Money, days ─────────────────────────────────────────────────────────────
/** The design's money: "RM 4,800", "RM 1,234.5"; "—" for none. */
export const rm = (v: number | null | undefined) =>
  v == null || Number.isNaN(v) ? '—' : `RM ${(Math.round(v * 100) / 100).toLocaleString('en-MY')}`
/** "dd/mm/yyyy" of a day kept as YYYY-MM-DD — never through a Date (a day is a day in every timezone). */
export const dmy = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—')
/** A day plus n days, in local time, as YYYY-MM-DD (never toISOString: it shifts a day in UTC+8). */
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const t = new Date(y, m - 1, d + n)
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}
/** Typed money as the design's inputs read it: digits and a point; empty = none. */
export const numOf = (typed: string): number | null => {
  const t = typed.replace(/[^\d.]/g, '')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

// ── Shapes ──────────────────────────────────────────────────────────────────
/** An item's values of the manager's own columns as a quotation shows them — the Product List's now while it is edited,
 * frozen with each version sent (mkt_quote_with_extras): its name, what it holds, its value, whether the client sees it. */
export interface LineExtra { name: string; kind: string; value: ExtraValue; client: boolean }
export interface PackageItem { name: string; group: string; base: number; qty: number; unit: number; extra?: LineExtra[] }
export interface ItemLine {
  key: string; kind: 'item'; item: string; name: string; cat: string; list: number; cost: number | null; days: number | null
  qty: number; price: number | null; eta: string | null; remark: string; extra?: LineExtra[]
}
export interface PackageLine {
  key: string; kind: 'package'; product: string; name: string; code: string; pkind: ProductKind; version: number; list: number
  cost: number | null; months: number; price: number | null; items: PackageItem[]; eta: string | null; remark: string
}
export type QuoteLine = ItemLine | PackageLine
export type QuoteStatus = 'draft' | 'sent' | 'accepted'

/** What a version keeps and "edited since" compares. */
export interface QuoteCore {
  sub: string | null; other: boolean; client: string; contact: string; date: string; valid: number; discount: number; note: string
  lines: QuoteLine[]
}
export interface QuoteVersion { seq: number; kind: 'sent' | 'accepted'; rev: number; at: string; snap: QuoteCore | null; total: number | null }
export interface QuoteTask {
  key: string; name: string; from: string; cat: string; team: Team; who: string | null; start: string; due: string; days: number | null
  eta: string | null; project?: string; track?: string
}
export interface Quote extends QuoteCore {
  id: string; no: string; status: QuoteStatus; acceptedOn: string | null; tasks: QuoteTask[] | null; assignedOn: string | null; rev: number
  history: QuoteVersion[]
}
export interface QuotePackage { id: string; code: string; name: string; kind: ProductKind; version: number; price: number; cost: number | null; groups: { name: string; items: { name: string; qty: number; price: number | null }[] }[] }
export interface QuoteClient { id: string; code: string; name: string; dot: string; group: boolean; ar: string | null }
export interface QuotePerson { id: string; name: string; full: string; title: string | null }
export interface QuoteBook {
  today: string; items: CatalogItem[]; columns: ItemColumn[]; packages: QuotePackage[]; quotes: Quote[]; clients: QuoteClient[]; arOther: string | null; people: QuotePerson[]
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const strOrNull = (v: unknown) => (typeof v === 'string' && v ? v : null)
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}
const int = (v: unknown, d = 0) => Math.trunc(num(v) ?? d)
const day = (v: unknown) => (typeof v === 'string' && v ? v.slice(0, 10) : null)
/** A version's frozen column values, when it has them. */
function extrasFromRow(v: unknown): { extra?: LineExtra[] } {
  if (!Array.isArray(v)) return {}
  return {
    extra: v.filter(isObj).flatMap(x => {
      const value = x.value
      return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        ? [{ name: str(x.name), kind: str(x.kind) || 'text', value, client: x.client === true }]
        : []
    }),
  }
}

/** An item's column values as a quotation shows them now — the columns that follow quotations, in their order. */
export function lineExtrasOf(item: CatalogItem | null | undefined, columns: readonly ItemColumn[]): LineExtra[] {
  if (!item) return []
  return columns.filter(c => c.inQuotes && item.extra[c.id] !== undefined).map(c => ({ name: c.name, kind: c.kind, value: item.extra[c.id], client: c.client }))
}

/** A quotation's lines with each item's column values as the Product List has them now (an item line by its item, a
 * package's item by its name) — what the page, the PDF and the CSV show of a quotation being edited. A version sent
 * keeps its own (frozen when it was sent). */
export function withExtras<T extends Pick<QuoteCore, 'lines'>>(q: T, items: readonly CatalogItem[], columns: readonly ItemColumn[]): T {
  const named = (n: string) => items.find(x => x.name && norm(x.name) === norm(n)) ?? null
  return {
    ...q,
    lines: q.lines.map(l => (l.kind === 'item'
      ? { ...l, extra: lineExtrasOf(items.find(x => x.id === l.item) ?? null, columns) }
      : { ...l, items: l.items.map(it => ({ ...it, extra: lineExtrasOf(named(it.name), columns) })) })),
  }
}

/** A line's column values on a document: an item's own; a package's per item ("Image post — Platform: Instagram"). */
export function lineExtrasWords(l: QuoteLine, clientOnly = false): string {
  if (l.kind === 'item') return extrasWords(l.extra, clientOnly)
  return l.items.filter(it => it.qty > 0).flatMap(it => {
    const w = extrasWords(it.extra, clientOnly)
    return w ? [`${it.name} — ${w}`] : []
  }).join(' · ')
}

/** "Platform: Instagram · Size: 1080 × 1920" — the values a reader sees (`clientOnly`: the client's PDF). */
export function extrasWords(extra: readonly LineExtra[] | undefined, clientOnly = false): string {
  return (extra ?? []).filter(x => !clientOnly || x.client).flatMap(x => {
    const t = extraText(x.kind, x.value)
    return t ? [`${x.name}: ${t}`] : []
  }).join(' · ')
}

export function lineFromRow(v: unknown): QuoteLine | null {
  if (!isObj(v)) return null
  const base = { key: str(v.key), name: str(v.name), eta: day(v.eta), remark: str(v.remark) }
  if (v.kind === 'item') {
    return { ...base, kind: 'item', item: str(v.item), cat: str(v.cat), list: num(v.list) ?? 0, cost: num(v.cost), days: num(v.days), qty: Math.max(1, int(v.qty, 1)), price: num(v.price), ...extrasFromRow(v.extra) }
  }
  if (v.kind === 'package') {
    return {
      ...base, kind: 'package', product: str(v.product), code: str(v.code), pkind: v.pkind === 'recurring' ? 'recurring' : 'one', version: int(v.version),
      list: num(v.list) ?? 0, cost: num(v.cost), months: Math.max(1, int(v.months, 1)), price: num(v.price),
      items: (Array.isArray(v.items) ? v.items : []).filter(isObj).map(it => ({ name: str(it.name), group: str(it.group), base: int(it.base), qty: int(it.qty), unit: num(it.unit) ?? 0, ...extrasFromRow(it.extra) })),
    }
  }
  return null
}

const coreFromRow = (r: Record<string, unknown>): QuoteCore => ({
  sub: strOrNull(r.sub), other: r.other === true, client: str(r.client), contact: str(r.contact), date: day(r.date) ?? '',
  valid: int(r.valid, 30), discount: num(r.discount) ?? 0, note: str(r.note),
  lines: (Array.isArray(r.lines) ? r.lines : []).map(lineFromRow).filter((l): l is QuoteLine => !!l),
})

const TEAMS: Team[] = ['Content', 'Design', 'Ads', 'Brand', 'Manager']
export function quoteFromRow(v: unknown): Quote {
  const r = isObj(v) ? v : {}
  return {
    ...coreFromRow(r),
    id: str(r.id), no: str(r.no), status: r.status === 'sent' || r.status === 'accepted' ? r.status : 'draft', acceptedOn: day(r.acceptedOn),
    assignedOn: day(r.assignedOn), rev: int(r.rev, 1),
    tasks: Array.isArray(r.tasks)
      ? r.tasks.filter(isObj).map((t, i) => ({
          key: `t${i}`, name: str(t.name), from: str(t.from), cat: '', team: TEAMS.includes(t.team as Team) ? (t.team as Team) : 'Manager',
          who: strOrNull(t.who), start: day(t.start) ?? '', due: day(t.due) ?? '', days: num(t.days), eta: day(t.eta),
          project: strOrNull(t.project) ?? undefined, track: strOrNull(t.track) ?? undefined,
        }))
      : null,
    history: (Array.isArray(r.history) ? r.history : []).filter(isObj).map(h => ({
      seq: int(h.seq), kind: h.kind === 'accepted' ? 'accepted' : 'sent', rev: int(h.rev, 1), at: day(h.at) ?? '',
      snap: isObj(h.snap) ? coreFromRow(h.snap) : null, total: num(h.total),
    })),
  }
}

export function quoteBookFromRow(v: unknown): QuoteBook {
  const r = isObj(v) ? v : {}
  return {
    today: day(r.today) ?? '',
    items: (Array.isArray(r.items) ? r.items : []).map(catalogItemFromRow),
    columns: (Array.isArray(r.columns) ? r.columns : []).map(columnFromRow),
    packages: (Array.isArray(r.packages) ? r.packages : []).filter(isObj).map(p => ({
      id: str(p.id), code: str(p.code), name: str(p.name), kind: p.kind === 'recurring' ? 'recurring' : 'one', version: int(p.version),
      price: num(p.price) ?? 0, cost: num(p.cost),
      groups: (Array.isArray(p.groups) ? p.groups : []).filter(isObj).map(g => ({
        name: str(g.name), items: (Array.isArray(g.items) ? g.items : []).filter(isObj).map(it => ({ name: str(it.name), qty: int(it.qty), price: num(it.price) })),
      })),
    })),
    quotes: (Array.isArray(r.quotes) ? r.quotes : []).map(quoteFromRow),
    clients: (Array.isArray(r.clients) ? r.clients : []).filter(isObj).map(c => ({
      id: str(c.id), code: str(c.code), name: str(c.name), dot: str(c.dot), group: c.group === true, ar: strOrNull(c.ar),
    })),
    arOther: strOrNull(r.arOther),
    people: (Array.isArray(r.people) ? r.people : []).filter(isObj).map(p => ({ id: str(p.id), name: str(p.name), full: str(p.full), title: strOrNull(p.title) })),
  }
}

// ── Lines and sums ──────────────────────────────────────────────────────────
let seq = 0
export const lineKey = () => `l${Date.now().toString(36)}${(seq++).toString(36)}`

/** An item picked from the Product List: one of it at its list price, due its est. days after the quote date, its remarks. */
export function itemLine(it: CatalogItem, date: string): ItemLine {
  return {
    key: lineKey(), kind: 'item', item: it.id, name: it.name, cat: it.cat, list: it.price ?? 0, cost: it.cost, days: it.days, qty: 1, price: null,
    eta: date && it.days ? addDays(date, it.days) : null, remark: it.remarks,
  }
}

/** A package picked: the product as published, 6 months when recurring, its items at their quantities. */
export function packageLine(p: QuotePackage): PackageLine {
  return {
    key: lineKey(), kind: 'package', product: p.id, name: p.name, code: p.code, pkind: p.kind, version: p.version, list: p.price, cost: p.cost,
    months: p.kind === 'recurring' ? 6 : 1, price: null, eta: null, remark: '',
    items: p.groups.flatMap(g => g.items.map(it => ({ name: it.name, group: g.name, base: it.qty, qty: it.qty, unit: it.price ?? 0 }))),
  }
}

export interface LineCalc {
  /** The item's or package's unit price as quoted (an item's each, a package's a month / a project). */
  price: number
  /** A package's price before a hand-set one: its list price with the items' changes. */
  computed: number
  /** A package's items' changes, RM. */
  extras: number
  /** × months when recurring, else 1. */
  mult: number
  amount: number
  listTotal: number
  cost: number | null
  recurring: boolean
}

/** One line's sums, as the database's mkt_quote_subtotal and the design's calcLine. A package's cost moves with its price
 * changes at the package's own cost ratio. */
export function lineCalc(l: QuoteLine): LineCalc {
  if (l.kind === 'item') {
    const unit = l.price ?? l.list
    return { price: unit, computed: l.list, extras: 0, mult: 1, amount: unit * l.qty, listTotal: l.list * l.qty, cost: l.cost == null ? null : l.cost * l.qty, recurring: false }
  }
  const extras = l.items.reduce((n, it) => n + (it.qty - it.base) * it.unit, 0)
  const computed = l.list + extras
  const price = l.price ?? computed
  const ratio = l.cost != null && l.list ? l.cost / l.list : null
  const unitCost = ratio == null ? null : (l.cost as number) + extras * ratio
  const recurring = l.pkind === 'recurring'
  const mult = recurring ? l.months : 1
  return { price, computed, extras, mult, amount: price * mult, listTotal: l.list * mult, cost: unitCost == null ? null : unitCost * mult, recurring }
}

export const clampDiscount = (d: number) => Math.min(100, Math.max(0, Number(d) || 0))
const r2 = (n: number) => Math.round(n * 100) / 100

export interface QuoteTotals {
  calcs: LineCalc[]; sub: number; list: number; disc: number; total: number; hasCost: boolean; cost: number; profit: number
  margin: number | null; monthly: number
}
export function quoteTotals(core: Pick<QuoteCore, 'lines' | 'discount'>): QuoteTotals {
  const calcs = core.lines.map(lineCalc)
  const sub = calcs.reduce((n, c) => n + c.amount, 0)
  const list = calcs.reduce((n, c) => n + c.listTotal, 0)
  const disc = clampDiscount(core.discount)
  const total = r2(sub * (1 - disc / 100))
  const hasCost = calcs.length > 0 && calcs.every(c => c.cost != null)
  const cost = calcs.reduce((n, c) => n + (c.cost ?? 0), 0)
  const profit = total - cost
  const margin = hasCost && total > 0 ? Math.round((profit / total) * 100) : null
  const monthly = calcs.filter(c => c.recurring).reduce((n, c) => n + c.price, 0) * (1 - disc / 100)
  return { calcs, sub, list, disc, total, hasCost, cost, profit, margin, monthly }
}

/** "1 × image post", "4 image post + 2 reels video per month" — what a line includes, as the client PDF says it. */
export function includedOf(l: QuoteLine): string {
  if (l.kind === 'item') return `${l.qty} × ${l.name.toLowerCase()}`
  return l.items.filter(it => it.qty > 0).map(it => `${it.qty} ${it.name.toLowerCase()}`).join(' + ') + (l.pkind === 'recurring' ? ' per month' : '')
}
/** "6 months × RM 4,800", "3 × RM 400", "One-time". */
export function termOf(l: QuoteLine): string {
  const c = lineCalc(l)
  if (l.kind === 'item') return `${l.qty} × ${rm(c.price)}`
  return l.pkind === 'recurring' ? `${l.months} month${l.months === 1 ? '' : 's'} × ${rm(c.price)}` : 'One-time'
}

// ── Versions ────────────────────────────────────────────────────────────────
/** The quotation as it is sent (what its versions keep). */
export function coreOf(q: QuoteCore, clientName: string): QuoteCore {
  return { sub: q.sub, other: q.other, client: clientName, contact: q.contact, date: q.date, valid: q.valid, discount: q.discount, note: q.note, lines: q.lines }
}

/** A comparison that ignores key order and a missing key against a null one (jsonb keeps neither). */
function canon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canon)
  if (isObj(v)) {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(v).sort()) {
      const x = typeof v[k] === 'string' ? (v[k] as string).trim() : v[k]
      if (x === null || x === undefined || x === '' || k === 'extra') continue
      out[k] = canon(x)
    }
    return out
  }
  return typeof v === 'number' ? r2(v) : typeof v === 'string' ? v.trim() : v
}
export const sameCore = (a: QuoteCore, b: QuoteCore) => JSON.stringify(canon(a)) === JSON.stringify(canon(b))

export const lastSent = (q: Pick<Quote, 'history'>) => [...q.history].reverse().find(h => h.kind === 'sent' && h.snap) ?? null

// ── The internal pricing sheet's CSV (the design's `csv`) ───────────────────
export function quoteCsv(q: QuoteCore & { no: string }, clientName: string, account: string): string {
  const t = quoteTotals(q)
  // The manager's own columns that follow quotations: one more column each, after Remarks, in the order they first come.
  const extraNames = [...new Set(q.lines.flatMap(l => [...(l.kind === 'item' ? l.extra ?? [] : []), ...(l.kind === 'package' ? l.items.flatMap(it => it.extra ?? []) : [])].map(x => x.name)))]
  const extraCells = (extra: readonly LineExtra[] | undefined) => extraNames.map(n => {
    const x = (extra ?? []).find(e => e.name === n)
    return x ? extraText(x.kind, x.value) ?? '' : ''
  })
  const rows: (string | number)[][] = [
    ['Quotation', q.no], ['Client', clientName], ['Account', clientName ? account : ''], ['Date', dmy(q.date)], [],
    ['Product / item', 'Code', 'Term', 'Item', 'Qty', 'Unit price', 'List', 'Quoted', 'Cost', 'Profit', 'Margin %', 'Est. delivery', 'Remarks', ...extraNames],
  ]
  q.lines.forEach((l, i) => {
    const c = t.calcs[i]
    rows.push([
      l.name, l.kind === 'item' ? l.cat : l.code, l.kind === 'item' ? `${l.qty} ×` : l.pkind === 'recurring' ? `${l.months} months` : 'One-time', '', '',
      l.kind === 'item' ? c.price : '', r2(c.listTotal), r2(c.amount), c.cost == null ? '' : r2(c.cost), c.cost == null ? '' : r2(c.amount - c.cost),
      c.cost == null || !c.amount ? '' : Math.round(((c.amount - c.cost) / c.amount) * 100), l.eta ? dmy(l.eta) : '', l.remark || '',
      ...(extraNames.length ? extraCells(l.kind === 'item' ? l.extra : undefined) : []),
    ])
    if (l.kind === 'package') {
      l.items.forEach(it => rows.push(extraNames.length ? ['', '', '', it.name, it.qty, it.unit, '', '', '', '', '', '', '', ...extraCells(it.extra)] : ['', '', '', it.name, it.qty, it.unit]))
    }
  })
  rows.push([], ['Subtotal', '', '', '', '', '', r2(t.list), r2(t.sub)], ['Discount %', t.disc],
    ['Total', '', '', '', '', '', '', t.total, t.hasCost ? r2(t.cost) : '', t.hasCost ? r2(t.profit) : '', t.margin ?? ''])
  return rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
}

// ── Tasks from an accepted quotation ────────────────────────────────────────
export type Team = 'Content' | 'Design' | 'Ads' | 'Brand' | 'Manager'
/** The team follows the catalogue (the design's TEAM_OF): Video → Content, Graphic design → Design, Ads management → Ads,
 * Brand book / Brand → Brand, otherwise Manager. */
export function teamOf(cat: string): Team {
  const c = norm(cat)
  if (c === 'video') return 'Content'
  if (c === 'graphic design') return 'Design'
  if (c === 'ads management') return 'Ads'
  if (c === 'brand book' || c === 'brand') return 'Brand'
  return 'Manager'
}
/** The tone of a team's chip (`--mk-team-*`). */
export const teamTone = (t: Team) => (t === 'Content' ? 'content' : t === 'Design' ? 'design' : t === 'Ads' ? 'ads' : t === 'Brand' ? 'brand' : 'manager')

/**
 * The quotation's tasks (the design's buildTasks): an item line is one task; a package one task per item with a quantity
 * (recurring: "month 1"). Due = start + the item's est. days (else the line's est. delivery, else start + 7). Each
 * pre-picked for the first person of its team's tone (`pick`) — or nobody, to be picked.
 */
export function buildTasks(q: Pick<QuoteCore, 'lines'>, items: readonly CatalogItem[], start: string, pick: (t: Team) => string | null): QuoteTask[] {
  const rows: Omit<QuoteTask, 'team' | 'who' | 'start' | 'due'>[] = []
  for (const l of q.lines) {
    if (l.kind === 'item') {
      const it = items.find(x => x.id === l.item)
      rows.push({ key: l.key, name: `${l.name}${l.qty > 1 ? ` × ${l.qty}` : ''}`, from: `One-off item${l.remark ? ` · ${l.remark}` : ''}`, cat: it?.cat ?? l.cat, days: it?.days ?? l.days, eta: l.eta })
    } else {
      l.items.filter(it => it.qty > 0).forEach((it, i) => {
        const hit = items.find(x => norm(x.name) === norm(it.name))
        rows.push({ key: `${l.key}:${i}`, name: `${it.name} × ${it.qty}`, from: `${l.name}${l.pkind === 'recurring' ? ' · month 1' : ''}`, cat: hit?.cat ?? it.group, days: hit?.days ?? null, eta: l.eta })
      })
    }
  }
  return rows.map(r => {
    const team = teamOf(r.cat)
    return { ...r, team, who: pick(team), start, due: r.days ? addDays(start, r.days) : r.eta || addDays(start, 7) }
  })
}

/** The next quotation number the design would show for a new one (the database makes the real one). */
export const quoteStatusLabel = (s: QuoteStatus) => (s === 'draft' ? 'Draft' : s === 'sent' ? 'Sent' : 'Accepted')
export const QUOTE_HINT: Record<QuoteStatus, string> = {
  draft: 'Still being prepared — not sent to the client yet',
  sent: 'Sent to the client — waiting for their answer',
  accepted: 'The client confirmed',
}
