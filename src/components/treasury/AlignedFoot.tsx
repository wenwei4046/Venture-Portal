'use client'

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

// A list's Total row with each figure under its own column (2026-10-10, the
// user's Claude Design handoff — the peach foot of Fund IN, Fund OUT). A
// SortableTable footer is handed only the rows, not the columns as arranged —
// a person may have dragged them into another order or hidden some — so the
// row reads the header it sits under and lays one cell under each heading:
// the figure for a column it totals, the label in the first free cell, blank
// elsewhere. It follows the header when the arrangement changes.

interface Head {
  key: string | null
  right: boolean
  mHide: boolean
  toggle: boolean
}

const readHead = (row: Element): Head[] =>
  Array.from(row.children).map((th) => ({
    key: th.getAttribute('data-col'),
    right: th.classList.contains('right'),
    mHide: th.classList.contains('m-hide'),
    toggle: th.classList.contains('lt-toggle'),
  }))

const sameHead = (a: Head[], b: Head[]) =>
  a.length === b.length &&
  a.every((h, i) => h.key === b[i].key && h.right === b[i].right && h.mHide === b[i].mHide && h.toggle === b[i].toggle)

export default function AlignedFoot({
  columns,
  values,
  label = 'Total',
}: {
  /** The columns as declared: what the row lays out until it has read the header. */
  columns: Array<{ key: string; right?: boolean }>
  /** The figure under each column it totals, by column key. */
  values: Record<string, ReactNode>
  label?: ReactNode
}) {
  const ref = useRef<HTMLTableRowElement>(null)
  const [heads, setHeads] = useState<Head[]>(() =>
    columns.map((c) => ({ key: c.key, right: !!c.right, mHide: false, toggle: false })),
  )

  useLayoutEffect(() => {
    const headRow = ref.current?.closest('table')?.querySelector('thead > tr')
    if (!headRow) return
    const sync = () => {
      const next = readHead(headRow)
      setHeads((cur) => (sameHead(cur, next) ? cur : next))
    }
    sync()
    const watch = new MutationObserver(sync)
    watch.observe(headRow, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-col'] })
    return () => watch.disconnect()
  }, [])

  const labelAt = heads.findIndex((h) => h.key != null && !h.toggle && !(h.key in values))
  return (
    <tr ref={ref} className="fund-foot">
      {heads.map((h, i) => {
        const cls = [h.right ? 'num text-right' : '', h.mHide ? 'm-hide' : '', h.toggle ? 'lt-toggle' : ''].filter(Boolean).join(' ')
        const content = h.key != null && h.key in values ? values[h.key] : i === labelAt ? label : null
        return (
          <td key={h.key ?? `cell-${i}`} className={cls || undefined} data-col={h.key ?? undefined}>
            {content}
          </td>
        )
      })}
    </tr>
  )
}
