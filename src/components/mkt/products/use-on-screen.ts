'use client'

import { useLayoutEffect, useState, type RefObject } from 'react'

/**
 * Where a float under a head sits so it never runs off the bottom of the window (the user, 2026-11-13: "不要 overlap"):
 * under its head while it fits; above the head when there is room there; else as low as it fits. Measured again whenever
 * it grows (a Dropdown's options added).
 */
export function useOnScreenTop(box: RefObject<HTMLElement | null>, at: { top: number; above?: number }): number {
  const [top, setTop] = useState(at.top)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const place = () => {
      const h = el.offsetHeight
      const vh = window.innerHeight
      let t = at.top
      if (t + h > vh - 8) t = at.above !== undefined && at.above - h >= 8 ? at.above - h : Math.max(8, vh - h - 8)
      setTop(cur => (cur === t ? cur : t))
    }
    place()
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place)
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [box, at.top, at.above])
  return top
}
