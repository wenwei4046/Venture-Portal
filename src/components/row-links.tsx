'use client'

import { useState, type MouseEvent, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import RowMenu, { type RowMenuAnchor, type RowMenuItem } from '@/components/RowMenu'
import { useFinView } from '@/components/layout/fin-view'

// A table whose rows each have a page of their own (2026-10-02).
//
// Every such table ended in a View link, and the user asked for it to go:
// "view … 可以 remove,我希望双击点开". A row now opens on a double-click. A
// right-click offers the same, plus the one thing the link could do that a
// double-click cannot — open in another tab — and whatever else that table's
// rows can do (改金额, on a received loan repayment).
//
//   const links = useRowLinks<LoanRow>({
//     href: (l) => `/fund-out/${l.id}`,
//     title: (l) => l.companyName,
//   })
//   …
//   <SortableTable … onRowOpen={links.onRowOpen} onRowContextMenu={links.onRowContextMenu} />
//   {links.menu}

interface Options<T> {
  /** The row's own page. */
  href: (row: T) => string
  /** What the menu is headed with — the row's number or name. */
  title: (row: T) => string
  /** Anything else this row can do, listed under the two ways of opening it. */
  more?: (row: T) => RowMenuItem[]
}

export function useRowLinks<T>({ href, title, more }: Options<T>): {
  onRowOpen: (row: T) => void
  onRowContextMenu: (row: T, event: MouseEvent<HTMLElement>) => void
  /** The open menu, or null. Rendered once, beside the table. */
  menu: ReactNode
} {
  const router = useRouter()
  // On the Finance view the menu reads in English (2026-10-09).
  const fin = useFinView()
  const [at, setAt] = useState<{ row: T; anchor: RowMenuAnchor } | null>(null)
  const onRowOpen = (row: T) => router.push(href(row))

  let menu: ReactNode = null
  if (at) {
    const extra = more?.(at.row) ?? []
    // Open says nothing of the double-click beside it (2026-10-12: no usage hints).
    const items: RowMenuItem[] = [
      { key: 'open', label: fin ? 'Open' : '打开', onSelect: () => onRowOpen(at.row) },
      {
        key: 'new-tab',
        label: fin ? 'Open in new tab' : '在新分页打开',
        onSelect: () => window.open(href(at.row), '_blank', 'noopener,noreferrer'),
      },
    ]
    if (extra.length > 0) items.push('sep', ...extra)
    menu = <RowMenu title={title(at.row)} anchor={at.anchor} items={items} onClose={() => setAt(null)} />
  }

  return {
    onRowOpen,
    onRowContextMenu: (row, event) => {
      event.preventDefault()
      setAt({ row, anchor: { x: event.clientX, y: event.clientY } })
    },
    menu,
  }
}
