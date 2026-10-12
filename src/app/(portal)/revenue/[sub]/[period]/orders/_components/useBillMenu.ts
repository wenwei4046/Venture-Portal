'use client'

import { useCallback, useState, type MouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { MenuAnchor } from '../../../hierarchy/_components/ContextMenuPanel'

/** What in a row keeps its own press: a double-click there is not the row's. */
const ROW_CONTROLS = 'a, button, input, select, textarea, label, summary, [role="menuitem"], [role="dialog"]'

/** Whether a press landed on the row itself — not a control in it, not something it portalled. */
export function onTheRow(event: MouseEvent<HTMLElement>): boolean {
  const row = event.currentTarget
  const target = event.target as HTMLElement | null
  if (!target || !row.contains(target)) return false
  for (let el: HTMLElement | null = target; el && el !== row; el = el.parentElement) {
    if (el.matches(ROW_CONTROLS)) return false
  }
  return true
}

/** The bill a menu is open on, and where it hangs. */
export interface OpenBillMenu<Row> {
  row: Row
  anchor: MenuAnchor
  /** Another link the right-click landed on — the salesperson's bills, the venue. */
  link: { href: string; label: string } | null
  byRightClick: boolean
}

/**
 * How a table of bills opens `BillContextMenu` — by a right-click anywhere on
 * the row, or by the ⋯ beside the order number for whoever cannot right-click
 * (a phone, a keyboard). One hook, so All bills and a salesperson's ledger on
 * the month (2026-09-27) open the same menu the same way.
 *
 * `keyOf` names a ROW, not a bill: one bill can sit on two rows of a table
 * (two holders' parts under one upline), and the ⋯ of each toggles its own.
 * `hrefOf` is the row's own link, so a right-click on it is not offered back
 * as "another link".
 *
 * A DOUBLE-CLICK on a row opens its bill (2026-10-12, the user: "for all sales
 * order list on the table, need to able press in to show order detail") — the
 * portal's way of opening a row (`SortableTable`, user 2026-10-02: 双击点开),
 * with Ctrl / ⌘ for a new tab. A press on a control in the row stays the
 * control's. `onRowDoubleClick` takes the href, so a row that is no bill of
 * its own (an upsell) can open the bill it changed, or nothing.
 */
export function useBillMenu<Row>(keyOf: (row: Row) => string, hrefOf: (row: Row) => string) {
  const router = useRouter()
  const [menu, setMenu] = useState<OpenBillMenu<Row> | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])

  function onRowDoubleClick(event: MouseEvent<HTMLElement>, href: string | null) {
    if (!href || !onTheRow(event)) return
    // The double-click picked the word under it; the bill is what was meant.
    window.getSelection()?.removeAllRanges()
    if (event.ctrlKey || event.metaKey) window.open(href, '_blank', 'noopener')
    else router.push(href)
  }

  /** The second press of a double-click would otherwise select the word under it. */
  function onRowMouseDown(event: MouseEvent<HTMLElement>) {
    if (event.detail > 1 && onTheRow(event)) event.preventDefault()
  }

  function onRowContextMenu(event: MouseEvent<HTMLElement>, row: Row) {
    // A control with a right-click of its own (Share…), or the browser's menu on purpose.
    if (event.isDefaultPrevented() || event.shiftKey) return
    const target = event.target as HTMLElement
    if (target.closest('input, select, textarea')) return
    // Selected text: Copy is what the right-click is for.
    if (window.getSelection()?.toString().trim()) return
    event.preventDefault()
    // Right-clicking a link keeps the browser's one useful answer for it.
    const linkEl = target.closest('a')
    const href = linkEl?.getAttribute('href')
    const link = linkEl && href && href !== hrefOf(row) ? { href, label: linkEl.textContent?.trim() || href } : null
    // The keyboard's menu key fires at 0, 0: hang the menu from the row instead.
    const rect = event.currentTarget.getBoundingClientRect()
    const anchor = event.clientX === 0 && event.clientY === 0
      ? { left: rect.left + 16, top: rect.top, bottom: rect.bottom }
      : { left: event.clientX, top: event.clientY, bottom: event.clientY }
    setMenu({ row, anchor, link, byRightClick: true })
  }

  function onMenuButton(button: HTMLButtonElement, row: Row) {
    if (menu && keyOf(menu.row) === keyOf(row)) return setMenu(null)
    const rect = button.getBoundingClientRect()
    setMenu({ row, anchor: { left: rect.left, top: rect.top, bottom: rect.bottom }, link: null, byRightClick: false })
  }

  const isOpenOn = (row: Row) => menu !== null && keyOf(menu.row) === keyOf(row)

  return { menu, closeMenu, onRowContextMenu, onMenuButton, isOpenOn, onRowDoubleClick, onRowMouseDown }
}
