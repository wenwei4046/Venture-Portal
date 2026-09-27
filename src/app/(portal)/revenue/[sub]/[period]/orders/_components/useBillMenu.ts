'use client'

import { useCallback, useState, type MouseEvent } from 'react'
import type { MenuAnchor } from '../../../hierarchy/_components/ContextMenuPanel'

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
 */
export function useBillMenu<Row>(keyOf: (row: Row) => string, hrefOf: (row: Row) => string) {
  const [menu, setMenu] = useState<OpenBillMenu<Row> | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])

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

  return { menu, closeMenu, onRowContextMenu, onMenuButton, isOpenOn }
}
