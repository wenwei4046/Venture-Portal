/**
 * The Product List's tables, laid out by the person reading them (user
 * 2026-09-27, pointing at the ERP's SKU Master): drag a column's right edge
 * to make it wider or narrower, drag a header onto another to swap their
 * places. The layout is one viewer's convenience, kept in this browser, one per
 * table — never a fact anybody else sees.
 *
 * It lives in a cookie scoped to the Product List rather than localStorage so
 * the server can render the table in the reader's order; from localStorage the
 * first paint would be the table's own order and the columns would jump when
 * the page woke up.
 *
 * Everything here is pure. The hook is `useColumnLayout`, the table
 * `ColumnTable`.
 */

export const LAYOUT_COOKIE_PREFIX = 'vp-cols.'
export const LAYOUT_COOKIE_PATH = '/revenue/products'

export const MIN_COLUMN_WIDTH = 64
export const MAX_COLUMN_WIDTH = 1200
export const DEFAULT_COLUMN_WIDTH = 160
/** Double-click on an edge fits the column to its widest cell, up to this. */
export const MAX_FIT_WIDTH = 800
const MAX_STORED_KEYS = 100

export type ColumnLayout = {
  /** The movable columns, left to right. Empty = the table's own order. */
  order: string[]
  /** Widths the reader set, px. A column absent here keeps its natural width. */
  widths: Record<string, number>
}

export const EMPTY_LAYOUT: ColumnLayout = { order: [], widths: {} }

/** What a column needs for the layout; a table's own column type extends it. */
export type LayoutColumn = {
  key: string
  /** False pins the column after the movable ones (a sofa sheet's seat sizes). */
  movable?: boolean
  /** The width before anything could be measured. */
  defaultWidth?: number
}

export function clampWidth(px: number): number {
  return Math.round(Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, px)))
}

export function isEmptyLayout(layout: ColumnLayout): boolean {
  return layout.order.length === 0 && Object.keys(layout.widths).length === 0
}

/**
 * The layouts carried by the request's cookies, table id → the stored JSON —
 * handed to the tables so the server renders what the browser will. A value
 * arrives either as written (URI-encoded) or already decoded; anything that is
 * not a layout is left out.
 */
export function layoutsFromCookies(cookies: readonly { name: string; value: string }[]): Record<string, string> {
  const layouts: Record<string, string> = {}
  for (const { name, value } of cookies) {
    if (!name.startsWith(LAYOUT_COOKIE_PREFIX)) continue
    const id = name.slice(LAYOUT_COOKIE_PREFIX.length)
    for (const candidate of [value, safeDecode(value)]) {
      if (candidate === null) continue
      try {
        JSON.parse(candidate)
        layouts[id] = candidate
        break
      } catch {
        // try the next reading
      }
    }
  }
  return layouts
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

/** Whatever was stored, read as a layout; anything unreadable is dropped. */
export function sanitizeLayout(raw: unknown): ColumnLayout {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return EMPTY_LAYOUT
  const { order, widths } = raw as { order?: unknown; widths?: unknown }
  const keys = Array.isArray(order)
    ? [...new Set(order.filter((k): k is string => typeof k === 'string' && k.length > 0 && k.length <= 64))].slice(0, MAX_STORED_KEYS)
    : []
  const sized: Record<string, number> = {}
  if (widths && typeof widths === 'object' && !Array.isArray(widths)) {
    for (const [key, width] of Object.entries(widths as Record<string, unknown>)) {
      if (Object.keys(sized).length >= MAX_STORED_KEYS) break
      if (key.length > 0 && key.length <= 64 && typeof width === 'number' && Number.isFinite(width)) sized[key] = clampWidth(width)
    }
  }
  const layout = { order: keys, widths: sized }
  return isEmptyLayout(layout) ? EMPTY_LAYOUT : layout
}

/**
 * The columns in the reader's order: the movable ones as they were left, any
 * the stored order does not know after them in the table's own order, then the
 * fixed ones.
 */
export function orderColumns<C extends LayoutColumn>(columns: readonly C[], order: readonly string[]): C[] {
  const movable = columns.filter(c => c.movable !== false)
  const byKey = new Map(movable.map(c => [c.key, c]))
  const known = order.filter((key, i) => byKey.has(key) && order.indexOf(key) === i)
  const placed = new Set(known)
  return [
    ...known.map(key => byKey.get(key)!),
    ...movable.filter(c => !placed.has(c.key)),
    ...columns.filter(c => c.movable === false),
  ]
}

/**
 * `key` taken out and put where `target` stood: dragged rightwards it lands
 * after the column it was dropped on, leftwards before it — which is also the
 * side the insertion bar is drawn on (`dropSide`).
 */
export function moveColumn(order: readonly string[], key: string, target: string): string[] {
  const from = order.indexOf(key)
  const to = order.indexOf(target)
  if (from < 0 || to < 0 || from === to) return [...order]
  const next = [...order]
  next.splice(from, 1)
  next.splice(to, 0, key)
  return next
}

/** One place left or right — the keyboard's Alt+← / Alt+→. */
export function stepColumn(order: readonly string[], key: string, step: -1 | 1): string[] {
  const from = order.indexOf(key)
  const to = from + step
  if (from < 0 || to < 0 || to >= order.length) return [...order]
  return moveColumn(order, key, order[to])
}

export function dropSide(order: readonly string[], dragged: string, target: string): 'before' | 'after' {
  return order.indexOf(dragged) < order.indexOf(target) ? 'after' : 'before'
}
