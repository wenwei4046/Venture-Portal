// A person's arrangement of a table: which order the columns run in, and how
// wide each one is (2026-10-02 — user: "我希望可以左右拉 … 甚至我希望我可以自己
// 排顺序", and it should follow the account rather than the browser).
//
// The pure half is here so it can be tested without a table: reconciling a
// saved arrangement with the columns the code has TODAY (a column added since
// takes its natural place, one removed since is dropped), moving a column, and
// refusing anything in a saved row that is not a plausible width.

import { createClient } from '@/lib/supabase/client'
import type { Json } from '@/lib/supabase/database.types'

export interface TableLayout {
  /** Movable column keys, in the order the person left them. */
  order: string[]
  /** Column key → width in px. A key with no entry is as wide as the browser makes it. */
  widths: Record<string, number>
  /** Columns the person has unticked in the Columns panel (2026-10-02, user:
   *  "有些我不用显示"). Absent on rows saved before the panel existed. */
  hidden: string[]
}

export const EMPTY_LAYOUT: TableLayout = { order: [], widths: {}, hidden: [] }

export const MIN_COLUMN_WIDTH = 60
export const MAX_COLUMN_WIDTH = 900

export interface LayoutColumn {
  key: string
  /** Kept at its edge and never moved: a tick-box column, a row menu. */
  pinned?: 'start' | 'end'
}

export function isCustomised(layout: TableLayout): boolean {
  return layout.order.length > 0 || Object.keys(layout.widths).length > 0 || layout.hidden.length > 0
}

/**
 * The columns in the person's order. Pinned ones stay at their edge. A column
 * the saved order has never heard of goes back where the code puts it — right
 * after the column that precedes it by default — so adding a column to a table
 * never throws it to the far end of everybody's saved layout.
 */
export function applyOrder<C extends LayoutColumn>(columns: C[], order: string[]): C[] {
  const start = columns.filter((c) => c.pinned === 'start')
  const end = columns.filter((c) => c.pinned === 'end')
  const movable = columns.filter((c) => !c.pinned)
  const byKey = new Map(movable.map((c) => [c.key, c]))

  const result: C[] = []
  const placed = new Set<string>()
  for (const key of order) {
    const col = byKey.get(key)
    if (col && !placed.has(key)) {
      result.push(col)
      placed.add(key)
    }
  }
  movable.forEach((col, i) => {
    if (placed.has(col.key)) return
    // After its nearest default predecessor that IS placed; else at the front.
    let at = 0
    for (let j = i - 1; j >= 0; j--) {
      const idx = result.findIndex((r) => r.key === movable[j].key)
      if (idx >= 0) {
        at = idx + 1
        break
      }
    }
    result.splice(at, 0, col)
    placed.add(col.key)
  })
  return [...start, ...result, ...end]
}

/** `moving` dropped onto `target`, on its near or far side. */
export function moveColumn(order: string[], moving: string, target: string, side: 'before' | 'after'): string[] {
  if (moving === target) return order
  const without = order.filter((k) => k !== moving)
  const at = without.indexOf(target)
  if (at < 0) return order
  without.splice(side === 'before' ? at : at + 1, 0, moving)
  return without
}

/** A width somebody DRAGGED: never narrower than a column can be read at. */
export function clampWidth(px: number): number {
  return Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, Math.round(px)))
}

/** A width that was MEASURED off the screen, or read back from storage. The
 *  first drag freezes every column where it stands, and some stand narrower
 *  than the dragging minimum — a tick-box column is about 40px. Clamping those
 *  up to 60 made the whole table jump sideways on the first drag (seen in a
 *  real browser, 2026-10-02), so they are kept as they are. */
export const MIN_STORED_WIDTH = 24
export function storedWidth(px: number): number {
  return Math.max(MIN_STORED_WIDTH, Math.min(MAX_COLUMN_WIDTH, Math.round(px)))
}

/** Whatever was stored, reduced to what is safe to apply. */
export function sanitizeLayout(raw: unknown): TableLayout {
  if (!raw || typeof raw !== 'object') return EMPTY_LAYOUT
  const r = raw as { order?: unknown; widths?: unknown }
  const order = Array.isArray(r.order) ? [...new Set(r.order.filter((k): k is string => typeof k === 'string' && k.length > 0))] : []
  const widths: Record<string, number> = {}
  if (r.widths && typeof r.widths === 'object') {
    for (const [key, value] of Object.entries(r.widths as Record<string, unknown>)) {
      const n = Number(value)
      if (key && Number.isFinite(n) && n > 0) widths[key] = storedWidth(n)
    }
  }
  const hidden = Array.isArray((r as { hidden?: unknown }).hidden)
    ? [...new Set(((r as { hidden: unknown[] }).hidden).filter((k): k is string => typeof k === 'string' && k.length > 0))]
    : []
  return { order, widths, hidden }
}

/** The columns still on show. A pinned column, or one that opts out, cannot be
 *  hidden whatever the saved row says — and the table is never left with
 *  nothing but its tick box and its menu. */
export function visibleColumns<C extends LayoutColumn & { hideable?: boolean }>(columns: C[], hidden: string[]): C[] {
  const off = new Set(hidden)
  const canHide = (c: C) => !c.pinned && c.hideable !== false
  const kept = columns.filter((c) => !canHide(c) || !off.has(c.key))
  return kept.some(canHide) ? kept : columns
}

/** Tick or untick one column. Unticking the last one on show is refused. */
export function toggleHidden(hidden: string[], key: string, show: boolean, hideableKeys: string[]): string[] {
  if (show) return hidden.filter((k) => k !== key)
  if (hidden.includes(key)) return hidden
  const stillShown = hideableKeys.filter((k) => k !== key && !hidden.includes(k))
  return stillShown.length === 0 ? hidden : [...hidden, key]
}

/** The headings of the Columns panel, in the order every table lists them. */
export const COLUMN_GROUPS: readonly string[] = ['基本', '金额', '日期', '入账']

/** Columns under their headings. Within a heading they keep the order the
 *  table declares them in; a heading that is not one of the four follows
 *  them, and columns with no heading at all come last. */
export function groupColumns<C extends { group?: string }>(columns: C[]): Array<{ name: string; columns: C[] }> {
  const groups: Array<{ name: string; columns: C[] }> = []
  for (const c of columns) {
    const name = c.group ?? ''
    const g = groups.find((x) => x.name === name)
    if (g) g.columns.push(c)
    else groups.push({ name, columns: [c] })
  }
  const rank = (name: string) => {
    if (name === '') return COLUMN_GROUPS.length + 1
    const at = COLUMN_GROUPS.indexOf(name)
    return at >= 0 ? at : COLUMN_GROUPS.length
  }
  // sort() is stable: headings of the same rank stay in declaration order.
  return groups.sort((a, b) => rank(a.name) - rank(b.name))
}

// More than one table on a page can share an id — Payments draws each payroll
// batch as a table of its own — and they must not disagree about which
// columns are on show. The table that changes a layout says so; the others
// take it.
const LAYOUT_EVENT = 'table-layout'

export function announceLayout(tableId: string, layout: TableLayout): void {
  try {
    window.dispatchEvent(new CustomEvent(LAYOUT_EVENT, { detail: { tableId, layout } }))
  } catch {
    // No window, no CustomEvent: then nothing is listening either.
  }
}

/** Returns the function that stops listening. */
export function onLayoutAnnounced(tableId: string, take: (layout: TableLayout) => void): () => void {
  const listener = (e: Event) => {
    const detail = (e as CustomEvent<{ tableId?: string; layout?: unknown } | null>).detail
    if (detail && detail.tableId === tableId) take(sanitizeLayout(detail.layout))
  }
  window.addEventListener(LAYOUT_EVENT, listener)
  return () => window.removeEventListener(LAYOUT_EVENT, listener)
}

export function sameLayout(a: TableLayout, b: TableLayout): boolean {
  if (a.order.length !== b.order.length || a.order.some((k, i) => k !== b.order[i])) return false
  const ka = Object.keys(a.widths)
  const kb = Object.keys(b.widths)
  if (ka.length !== kb.length || !ka.every((k) => a.widths[k] === b.widths[k])) return false
  return a.hidden.length === b.hidden.length && a.hidden.every((k) => b.hidden.includes(k))
}

// ─── Where it is kept ───────────────────────────────────────────────────────
// The account's copy lives in user_table_layouts (own rows only, RLS). The
// browser keeps a copy too, so a table opens already arranged instead of
// re-flowing once the network answers; the account's copy wins when they differ.
// Straight from the browser, not a Server Action — see lib/page-view.ts for why
// a background write must not sit on the router's action queue.

const cacheKey = (tableId: string) => `table-layout:${tableId}`

export function readCachedLayout(tableId: string): TableLayout {
  try {
    const raw = window.localStorage.getItem(cacheKey(tableId))
    return raw ? sanitizeLayout(JSON.parse(raw)) : EMPTY_LAYOUT
  } catch {
    return EMPTY_LAYOUT
  }
}

export function writeCachedLayout(tableId: string, layout: TableLayout): void {
  try {
    if (isCustomised(layout)) window.localStorage.setItem(cacheKey(tableId), JSON.stringify(layout))
    else window.localStorage.removeItem(cacheKey(tableId))
  } catch {
    // Private mode, quota — the account's copy still holds it.
  }
}

/** The account's copy. No row means the default arrangement — which is an
 *  answer (somebody reset it on another computer), so it comes back as the
 *  empty layout; null is only for "could not be read just now", and then the
 *  browser's copy is left alone. */
export async function fetchSavedLayout(tableId: string): Promise<TableLayout | null> {
  try {
    const { data, error } = await createClient()
      .from('user_table_layouts')
      .select('layout')
      .eq('table_id', tableId)
      .maybeSingle()
    if (error) return null
    return data ? sanitizeLayout(data.layout) : EMPTY_LAYOUT
  } catch {
    return null
  }
}

/** Save (or, for the default arrangement, forget) the account's copy. Silent on
 *  failure: a layout that did not save must never get in the way of the table. */
export function saveLayout(tableId: string, layout: TableLayout): void {
  try {
    const supabase = createClient()
    const done = isCustomised(layout)
      ? supabase
          .from('user_table_layouts')
          .upsert(
            { table_id: tableId, layout: layout as unknown as Json, updated_at: new Date().toISOString() },
            { onConflict: 'user_id,table_id' },
          )
      : supabase.from('user_table_layouts').delete().eq('table_id', tableId)
    done.then(
      () => undefined,
      () => undefined,
    )
  } catch {
    // Swallowed on purpose.
  }
}
