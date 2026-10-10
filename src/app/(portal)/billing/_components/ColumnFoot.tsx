'use client'

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

// The handoff's foot row (2026-10-10 — "Total" under an invoice list,
// "All companies" under a month's statements): a label in the first column
// and each figure under the column it sums. A SortableTable's columns can be
// dragged into another order or hidden, and its `footer` is not told which
// are on show — so the row reads the header it sits under and lays its cells
// out the same way: a figure follows its column, a column hidden on a phone
// (`m-hide`) stays hidden, and the phone's chevron column gets its empty cell.
// Before the header has been read (the server's render) it is one cell.

interface Props {
  /** "Total", "All companies" — in the first column that is not skipped and has no figure of its own. */
  label?: ReactNode
  /** Column keys the label must not land in — a tick-box column. */
  labelSkip?: string[]
  /** Column key → what the foot shows under it. */
  cells: Record<string, ReactNode>
}

interface Slot {
  key: string | null
  cls: string
}

function readHead(row: HTMLTableRowElement): Slot[] {
  const head = row.closest('table')?.querySelector('thead tr')
  if (!head) return []
  return Array.from(head.children).map((th) => {
    const el = th as HTMLElement
    const cls = [
      el.classList.contains('m-hide') ? 'm-hide' : '',
      el.classList.contains('lt-toggle') ? 'lt-toggle' : '',
      el.classList.contains('right') || el.classList.contains('text-right') ? 'text-right num whitespace-nowrap' : '',
    ]
      .filter(Boolean)
      .join(' ')
    return { key: el.dataset.col ?? null, cls }
  })
}

const sameSlots = (a: Slot[] | null, b: Slot[]) =>
  !!a && a.length === b.length && a.every((s, i) => s.key === b[i].key && s.cls === b[i].cls)

export default function ColumnFoot({ label, labelSkip = [], cells }: Props) {
  const ref = useRef<HTMLTableRowElement>(null)
  const [slots, setSlots] = useState<Slot[] | null>(null)

  // After every render: the table re-renders this row whenever its header
  // changes (an order, a width, a hidden column), so the row is read again.
  // No dependency list on purpose; the state only moves when the header did.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (!ref.current) return
    const next = readHead(ref.current)
    setSlots((prev) => (sameSlots(prev, next) ? prev : next))
  })

  if (!slots || slots.length === 0) {
    return (
      <tr ref={ref}>
        <td colSpan={1000}>{label}</td>
      </tr>
    )
  }

  const free = (s: Slot) => !!s.key && !labelSkip.includes(s.key) && !(s.key in cells)
  const phoneHidden = (s: Slot) => s.cls.split(' ').includes('m-hide')
  const labelAt = slots.findIndex(free)
  // A phone drops that column: the label shows again, on a phone only, in the
  // first column the phone keeps.
  const phoneAt = labelAt >= 0 && phoneHidden(slots[labelAt]) ? slots.findIndex((s) => free(s) && !phoneHidden(s)) : -1
  return (
    <tr ref={ref}>
      {slots.map((s, i) => (
        <td key={s.key ?? `slot-${i}`} className={s.cls || undefined}>
          {s.key && s.key in cells ? cells[s.key] : i === labelAt ? label : i === phoneAt ? <span className="md:hidden">{label}</span> : null}
        </td>
      ))}
    </tr>
  )
}
