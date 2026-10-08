'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import {
  DEFAULT_COLUMN_WIDTH,
  EMPTY_LAYOUT,
  LAYOUT_COOKIE_PATH,
  LAYOUT_COOKIE_PREFIX,
  MAX_FIT_WIDTH,
  clampWidth,
  dropSide,
  isEmptyLayout,
  moveColumn,
  orderColumns,
  sanitizeLayout,
  stepColumn,
  type ColumnLayout,
  type LayoutColumn,
} from './column-layout'

/**
 * One table's columns as its reader left them (see `column-layout.ts`).
 *
 * The table opens at its natural widths: the first paint is the browser's own
 * auto layout, the header widths read off it become the baseline, and from
 * then on the layout is fixed — so widening one column never squeezes its
 * neighbours; a blank last column takes up the slack, and a table grown wider
 * than its frame scrolls sideways. Only what the reader changed is stored.
 */

const CHANGED = 'vp:product-list-columns'
const KEEP_FOR = 60 * 60 * 24 * 365
const KEY_STEP = 16
const KEY_STEP_LARGE = 64

// A browser refusing cookies: the layout then lasts as long as the tab does.
const memory = new Map<string, string>()

function readCookie(id: string): string | null {
  const name = `${LAYOUT_COOKIE_PREFIX}${id}=`
  const found = document.cookie.split(/;\s*/).find(part => part.startsWith(name))
  if (found === undefined) return null
  try {
    return decodeURIComponent(found.slice(name.length)) || null
  } catch {
    return null
  }
}

function readRaw(id: string): string | null {
  if (memory.has(id)) return memory.get(id) || null
  return readCookie(id)
}

function parse(raw: string | null): ColumnLayout {
  if (!raw) return EMPTY_LAYOUT
  try {
    return sanitizeLayout(JSON.parse(raw))
  } catch {
    return EMPTY_LAYOUT
  }
}

function writeLayout(id: string, layout: ColumnLayout) {
  const raw = isEmptyLayout(layout) ? null : JSON.stringify(layout)
  const cookie = `${LAYOUT_COOKIE_PREFIX}${id}=${raw === null ? '' : encodeURIComponent(raw)}`
  document.cookie = `${cookie}; Path=${LAYOUT_COOKIE_PATH}; Max-Age=${raw === null ? 0 : KEEP_FOR}; SameSite=Lax`
  if (readCookie(id) === raw) memory.delete(id)
  else memory.set(id, raw ?? '')
  window.dispatchEvent(new Event(CHANGED))
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange)
  return () => window.removeEventListener(CHANGED, onChange)
}

/** Every header's width as painted, or null while the table is not laid out. */
function headerWidths(table: HTMLTableElement | null): Record<string, number> | null {
  const heads = table?.querySelectorAll<HTMLElement>('thead th[data-col-key]')
  if (!heads || heads.length === 0) return null
  const widths: Record<string, number> = {}
  for (const th of Array.from(heads)) {
    const width = th.getBoundingClientRect().width
    if (!(width > 0)) return null
    // Exactly as painted, fraction and all. Rounded down, the widest cell of a
    // column that just fitted clips by a pixel; rounded up, the columns outgrow
    // the table and a sideways scrollbar appears. Layout works in 1/64 px, which
    // survives the round trip through a CSS width unchanged.
    widths[th.dataset.colKey!] = width
  }
  return widths
}

/** The widest line a cell holds, on one line, padding included. */
function contentWidth(cell: HTMLElement, range: Range): number {
  let widest = 0
  const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.trim()) continue
    range.selectNodeContents(node)
    widest = Math.max(widest, range.getBoundingClientRect().width)
  }
  for (const control of Array.from(cell.querySelectorAll<HTMLElement>('input, select, button'))) {
    widest = Math.max(widest, control.getBoundingClientRect().width)
  }
  const style = getComputedStyle(cell)
  return widest + (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0)
}

type Gesture = { key: string; pointerId: number; startX: number; start: number; width: number; total: number }

/**
 * `initial` is the layout the request's cookie carried (`layoutsFromCookies`),
 * so the server renders the reader's order and hydration finds nothing to move.
 */
export function useColumnLayout<C extends LayoutColumn>(id: string, columns: readonly C[], initial: string | null = null) {
  const raw = useSyncExternalStore(subscribe, () => readRaw(id), () => initial)
  const stored = useMemo(() => parse(raw), [raw])
  const ordered = useMemo(() => orderColumns(columns, stored.order), [columns, stored.order])
  const movableKeys = ordered.filter(c => c.movable !== false).map(c => c.key)
  const defaultKeys = columns.filter(c => c.movable !== false).map(c => c.key)

  const tableRef = useRef<HTMLTableElement>(null)
  const cols = useRef(new Map<string, HTMLTableColElement>())
  const handles = useRef(new Map<string, HTMLElement>())
  const [natural, setNatural] = useState<{ id: string; widths: Record<string, number> } | null>(null)
  const measured = natural?.id === id ? natural.widths : null

  const gesture = useRef<Gesture | null>(null)
  const dragKey = useRef<string | null>(null)
  const dragTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [dragging, setDragging] = useState<string | null>(null)
  const [drop, setDrop] = useState<{ key: string; side: 'before' | 'after' } | null>(null)
  const refocus = useRef<string | null>(null)

  const widthOf = useCallback(
    (column: C, base: Record<string, number> | null = measured) =>
      stored.widths[column.key] ?? base?.[column.key] ?? column.defaultWidth ?? DEFAULT_COLUMN_WIDTH,
    [stored.widths, measured],
  )

  // The natural widths: read once the auto layout has painted.
  useLayoutEffect(() => {
    if (measured) return
    const widths = headerWidths(tableRef.current)
    if (widths) setNatural({ id, widths })
  }, [measured, id, ordered])

  // A column moved by keyboard keeps its handle focused.
  useLayoutEffect(() => {
    const key = refocus.current
    if (key === null) return
    refocus.current = null
    handles.current.get(key)?.focus()
  })

  // While the reader has set no width, a wider or narrower frame (a window
  // resized, the sidebar pinned) is measured afresh rather than padded.
  useEffect(() => {
    const frame = tableRef.current?.parentElement
    if (!frame || typeof ResizeObserver === 'undefined') return
    let last = frame.clientWidth
    const observer = new ResizeObserver(() => {
      const width = frame.clientWidth
      if (Math.abs(width - last) < 2) return
      last = width
      if (gesture.current || Object.keys(parse(readRaw(id)).widths).length > 0) return
      setNatural(null)
    })
    observer.observe(frame)
    return () => observer.disconnect()
  }, [id])

  // A web font that lands after the first reading widens its text a little —
  // enough to clip the one cell that just fitted — so read again once it is in.
  useEffect(() => {
    const fonts = typeof document === 'undefined' ? undefined : document.fonts
    if (!fonts || fonts.status === 'loaded') return
    let live = true
    fonts.ready.then(() => {
      if (live && !gesture.current) setNatural(null)
    })
    return () => {
      live = false
    }
  }, [])

  useEffect(() => () => clearTimeout(dragTimer.current), [])

  const save = useCallback(
    (next: Partial<ColumnLayout>) => {
      const now = parse(readRaw(id))
      writeLayout(id, { order: next.order ?? now.order, widths: next.widths ?? now.widths })
    },
    [id],
  )

  const setWidth = (key: string, width: number) => {
    save({ widths: { ...parse(readRaw(id)).widths, [key]: clampWidth(width) } })
  }

  /** Pins every column where it stands before one of them moves. */
  const freeze = (): Record<string, number> => {
    const base =
      measured ??
      headerWidths(tableRef.current) ??
      Object.fromEntries(ordered.map(c => [c.key, c.defaultWidth ?? DEFAULT_COLUMN_WIDTH]))
    if (!measured) setNatural({ id, widths: base })
    return Object.fromEntries(ordered.map(c => [c.key, widthOf(c, base)]))
  }

  // During a drag the <col> is sized directly — a React render of every row
  // per pointer move would stutter — and the width is stored once, on release.
  const paint = (key: string, width: number, total: number) => {
    const col = cols.current.get(key)
    if (col) col.style.width = `${width}px`
    if (tableRef.current) tableRef.current.style.minWidth = `${total}px`
  }

  const endResize = (event: PointerEvent<HTMLElement>, keep: boolean) => {
    const g = gesture.current
    if (!g || event.pointerId !== g.pointerId) return
    gesture.current = null
    event.currentTarget.removeAttribute('data-active')
    if (keep && g.width !== g.start) setWidth(g.key, g.width)
    else paint(g.key, g.start, g.total)
  }

  const fit = (key: string) => {
    const table = tableRef.current
    const heads = Array.from(table?.tHead?.rows[0]?.cells ?? [])
    const at = heads.findIndex(cell => cell.dataset.colKey === key)
    if (!table || at < 0) return
    freeze()
    // Every cell on one line for the reading, then back as it was.
    table.setAttribute('data-fitting', '')
    let widest = 0
    try {
      const range = document.createRange()
      widest = contentWidth(heads[at], range)
      for (const body of Array.from(table.tBodies)) {
        for (const row of Array.from(body.rows)) {
          if (row.cells.length === heads.length) widest = Math.max(widest, contentWidth(row.cells[at], range))
        }
      }
    } finally {
      table.removeAttribute('data-fitting')
    }
    if (widest > 0) setWidth(key, Math.min(MAX_FIT_WIDTH, Math.ceil(widest) + 4))
  }

  const endDrag = () => {
    dragKey.current = null
    clearTimeout(dragTimer.current)
    setDragging(null)
    setDrop(null)
  }

  const total = ordered.reduce((sum, c) => sum + widthOf(c), 0)
  const fixed = measured !== null

  return {
    /** The columns, left to right, as the reader arranged them. */
    columns: ordered,
    tableRef,
    fixed,
    tableStyle: fixed ? { minWidth: total } : undefined,
    width: (column: C) => widthOf(column),
    colRef: (key: string) => (el: HTMLTableColElement | null) => {
      if (el) cols.current.set(key, el)
      else cols.current.delete(key)
    },
    colStyle: (column: C) => {
      if (fixed) return { width: widthOf(column) }
      const set = stored.widths[column.key]
      return set === undefined ? undefined : { width: set }
    },
    dragging,
    drop,
    customised: Object.keys(stored.widths).length > 0 || movableKeys.join('\n') !== defaultKeys.join('\n'),
    reset: () => {
      writeLayout(id, EMPTY_LAYOUT)
      setNatural(null)
    },

    /** Drag a header onto another to swap their places. */
    headerProps: (column: C) => {
      const movable = column.movable !== false
      return {
        draggable: movable,
        onDragStart: (event: DragEvent<HTMLElement>) => {
          if (!movable || gesture.current) {
            event.preventDefault()
            return
          }
          // The dragged key lives in a ref: the first dragover can arrive before
          // React has rendered any state set here.
          dragKey.current = column.key
          if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move'
            try {
              event.dataTransfer.setData('text/plain', column.key)
            } catch {
              // A locked-down dataTransfer: the ref carries the drag.
            }
          }
          // Dimmed only after the browser has taken its picture of the header.
          dragTimer.current = setTimeout(() => setDragging(column.key), 0)
        },
        onDragOver: (event: DragEvent<HTMLElement>) => {
          const from = dragKey.current
          if (!from || !movable || from === column.key) return
          event.preventDefault()
          if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
          const side = dropSide(movableKeys, from, column.key)
          setDrop(now => (now?.key === column.key && now.side === side ? now : { key: column.key, side }))
        },
        onDragLeave: (event: DragEvent<HTMLElement>) => {
          if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return
          setDrop(now => (now?.key === column.key ? null : now))
        },
        onDrop: (event: DragEvent<HTMLElement>) => {
          const from = dragKey.current
          if (!from || !movable || from === column.key) return
          event.preventDefault()
          save({ order: moveColumn(movableKeys, from, column.key) })
          endDrag()
        },
        onDragEnd: endDrag,
      }
    },

    /** The edge: drag to resize, double-click to fit, ←/→ from the keyboard. */
    resizeProps: (column: C) => ({
      ref: (el: HTMLElement | null) => {
        if (el) handles.current.set(column.key, el)
        else handles.current.delete(column.key)
      },
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (event.button !== 0) return
        // Also what keeps the header from starting a column drag from here.
        event.preventDefault()
        event.stopPropagation()
        const widths = freeze()
        const start = widths[column.key]
        gesture.current = {
          key: column.key,
          pointerId: event.pointerId,
          startX: event.clientX,
          start,
          width: start,
          total: Object.values(widths).reduce((sum, w) => sum + w, 0),
        }
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          // No capture (an old browser): the moves still arrive while over the edge.
        }
        event.currentTarget.setAttribute('data-active', '')
      },
      onPointerMove: (event: PointerEvent<HTMLElement>) => {
        const g = gesture.current
        if (!g || event.pointerId !== g.pointerId) return
        const width = clampWidth(g.start + event.clientX - g.startX)
        if (width === g.width) return
        g.width = width
        paint(g.key, width, g.total - g.start + width)
      },
      onPointerUp: (event: PointerEvent<HTMLElement>) => endResize(event, true),
      onPointerCancel: (event: PointerEvent<HTMLElement>) => endResize(event, false),
      onLostPointerCapture: (event: PointerEvent<HTMLElement>) => endResize(event, true),
      onClick: (event: { stopPropagation: () => void }) => event.stopPropagation(),
      onDoubleClick: (event: { stopPropagation: () => void }) => {
        event.stopPropagation()
        fit(column.key)
      },
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
        event.preventDefault()
        const step = event.key === 'ArrowLeft' ? -1 : 1
        if (event.altKey) {
          const next = stepColumn(movableKeys, column.key, step)
          if (column.movable === false || next.join('\n') === movableKeys.join('\n')) return
          refocus.current = column.key
          save({ order: next })
          return
        }
        const widths = freeze()
        setWidth(column.key, widths[column.key] + step * (event.shiftKey ? KEY_STEP_LARGE : KEY_STEP))
      },
    }),
  }
}
