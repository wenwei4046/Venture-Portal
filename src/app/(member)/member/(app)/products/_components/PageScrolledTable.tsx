'use client'

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import c from './products.module.css'

/**
 * The box around a table on a tab the PAGE scrolls (`productTabScroll`). It is
 * deliberately not a scroll box, so the table's sticky header holds to the top
 * of the page while the rows scroll under it. Only while the table is wider
 * than its card (a narrow window) does the box scroll sideways — and then,
 * being a scroll box, it keeps the header with it: the price of reaching the
 * last column.
 */
export default function PageScrolledTable({ label, children }: { label: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const [sideways, setSideways] = useState(false)

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    // scrollWidth counts the overflow whether or not the box scrolls; the 1px
    // of slack absorbs two fractional widths rounding apart.
    const measure = () => setSideways(el.scrollWidth > el.clientWidth + 1)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    for (const child of Array.from(el.children)) observer.observe(child)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={box} className={c.tableScroll} data-page="" role="region" aria-label={label}
      data-sideways={sideways || undefined} tabIndex={sideways ? 0 : undefined}>
      {children}
    </div>
  )
}
