import { useLayoutEffect, useRef } from 'react'

/**
 * A menu that hangs under its button opens UPWARD when the page shows no room
 * for it below (2026-10-12, the user: a request's Candidates card sits at the
 * foot of the sheet, its "+" — New candidate · Pick from Talent Bank — ran off
 * the bottom, and the page would not scroll to it: while a menu is open its
 * catcher covers the sheet, so the wheel never reaches the sheet's scroller).
 * Measured as it opens, and again when it grows (a candidate's Change status ▸).
 */
export function useMenuPlace<T extends HTMLElement>(open: boolean, grown?: unknown) {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    if (open && ref.current) placeMenu(ref.current)
  }, [open, grown])
  return ref
}

const CUTS = new Set(['auto', 'scroll', 'hidden', 'clip'])

/** The part of the window that shows `el`: cut by every box around it that scrolls or clips. */
export function shownEdges(el: HTMLElement): { top: number; bottom: number } {
  let top = 0
  let bottom = window.innerHeight
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    if (!CUTS.has(getComputedStyle(p).overflowY)) continue
    const r = p.getBoundingClientRect()
    top = Math.max(top, r.top + p.clientTop)
    bottom = Math.min(bottom, r.top + p.clientTop + p.clientHeight)
  }
  return { top, bottom }
}

const GAP = 6
const MARGIN = 8

/**
 * Below its button while it fits; above when it fits there, or there is more
 * room above than below (`data-up`, which the menu's CSS turns over); and when
 * neither side holds all of it, the sheet is scrolled to show it.
 */
export function placeMenu(el: HTMLElement): void {
  el.removeAttribute('data-up')
  const menu = el.getBoundingClientRect()
  // The box the menu is placed from: `top` / `bottom: calc(100% + 6px)` are its.
  const anchor = (el.offsetParent instanceof HTMLElement ? el.offsetParent : el.parentElement) ?? el
  const button = anchor.getBoundingClientRect()
  const edge = shownEdges(el)
  const below = edge.bottom - menu.bottom
  if (below >= MARGIN) return
  const above = button.top - GAP - menu.height - edge.top
  if (above >= MARGIN || above > below) el.setAttribute('data-up', 'true')
  const placed = el.getBoundingClientRect()
  if (placed.top < edge.top || placed.bottom > edge.bottom) el.scrollIntoView?.({ block: 'nearest' })
}
