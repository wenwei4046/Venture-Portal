import { useEffect, type RefObject } from 'react'

/**
 * The page moves before the table does (user 2026-09-27: "这个框架本身太小了").
 *
 * SKU Master and Costing gaps sit in a stage one screen tall below their
 * filters, so the table fills the screen once the page has scrolled the
 * filters away. A wheel over the table would otherwise scroll its rows inside
 * a frame whose bottom — and its "Show more" — is still below the screen, and
 * the page would only follow once the last row had gone past. So a DOWNWARD
 * wheel goes to the page until the stage fills the screen, and only then to
 * the rows. Upward is the browser's own: the rows first, then the page, which
 * brings the filters back.
 */

/** Pixels a wheel event asks for, whatever unit it came in. */
export function wheelPixels(event: { deltaY: number; deltaMode: number }, pageHeight: number): number {
  if (event.deltaMode === 1) return event.deltaY * 20
  if (event.deltaMode === 2) return event.deltaY * pageHeight
  return event.deltaY
}

/** Where the page should go for this wheel, or null to leave it to the table. */
export function pageFirstTarget(scrollTop: number, maxScrollTop: number, delta: number): number | null {
  if (!(delta > 0)) return null
  if (scrollTop >= maxScrollTop - 1) return null
  return Math.min(maxScrollTop, scrollTop + delta)
}

/**
 * Wires `pageFirstTarget` to a table window inside the page that scrolls it:
 * the Product List's own frame (`[data-page-scroll]`, inside the Revenue app
 * since 2026-10-08), else the portal's <main>.
 */
export function usePageFirstWheel(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const table = ref.current
    const page = table?.closest<HTMLElement>('[data-page-scroll]') ?? table?.closest('main')
    if (!table || !page) return
    // Successive notches of one gesture add up from where the page is GOING,
    // not from where a smooth scroll has got to so far.
    let target: number | null = null
    let settle: ReturnType<typeof setTimeout> | undefined
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const onWheel = (event: WheelEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey) return
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return
      const delta = wheelPixels(event, page.clientHeight)
      const next = pageFirstTarget(target ?? page.scrollTop, page.scrollHeight - page.clientHeight, delta)
      if (next === null) {
        target = null
        return
      }
      event.preventDefault()
      target = next
      // A mouse notch glides like the browser's own; a touchpad's stream of
      // small steps follows the fingers.
      page.scrollTo({ top: next, behavior: !reduced && Math.abs(delta) >= 40 ? 'smooth' : 'auto' })
      clearTimeout(settle)
      settle = setTimeout(() => { target = null }, 300)
    }

    table.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      table.removeEventListener('wheel', onWheel)
      clearTimeout(settle)
    }
  }, [ref])
}
