'use client'

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

// 2026-10-10 — the handoff's Total row under a list: "Total" in the first
// column, each figure under its own column. SortableTable hands its footer the
// rows on show but not the columns, and a reader may drag a column elsewhere
// or hide it (the Columns panel) — so this row reads the header it sits under
// and lays one cell under each heading, folded on a phone the way the header
// is (`m-hide`, the chevron cell). Until the header can be read (the server's
// render) it lays out the columns as the code declares them.

interface Slot {
  key: string
  /** Leaves the grid on a phone (`m-hide`). */
  hide: boolean
  /** The phone's chevron cell (`lt-toggle`). */
  toggle: boolean
}

const signature = (slots: Slot[]) => slots.map((s) => (s.toggle ? '|' : `${s.key}${s.hide ? '-' : '+'}`)).join(',')

export default function TotalFoot({
  label,
  values,
  columns,
}: {
  label: ReactNode
  /** Column key → the figure under it. */
  values: Record<string, ReactNode>
  /** The table's columns in the code's order; `phone` on those a phone keeps. */
  columns: Array<{ key: string; phone?: boolean }>
}) {
  const ref = useRef<HTMLTableRowElement>(null)
  const [read, setRead] = useState<Slot[] | null>(null)

  // After every render: the header may have been rearranged since the last
  // one. State is set only when the header differs from what was read, so
  // this settles after one pass.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const head = ref.current?.closest('table')?.querySelector(':scope > thead > tr')
    if (!head) return
    const next = Array.from(head.children).map((th) => ({
      key: th.getAttribute('data-col') ?? '',
      hide: th.classList.contains('m-hide'),
      toggle: th.classList.contains('lt-toggle'),
    }))
    if (read === null || signature(read) !== signature(next)) setRead(next)
  })

  const slots: Slot[] =
    read ??
    [
      ...columns.map((c) => ({ key: c.key, hide: !c.phone, toggle: false })),
      ...(columns.some((c) => !c.phone) ? [{ key: '', hide: false, toggle: true }] : []),
    ]
  const labelAt = slots.findIndex((s) => !s.toggle && !(s.key in values))

  return (
    <tr ref={ref} className="pay-foot">
      {slots.map((s, i) =>
        s.toggle ? (
          <td key={`toggle-${i}`} className="lt-toggle" />
        ) : (
          <td
            key={s.key || i}
            className={`${s.key in values ? 'num text-right font-bold' : ''}${s.hide ? ' m-hide' : ''}`.trim() || undefined}
          >
            {s.key in values ? values[s.key] : i === labelAt ? label : null}
          </td>
        ),
      )}
    </tr>
  )
}
