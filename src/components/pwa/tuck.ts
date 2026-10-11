'use client'

import { useEffect, useState, type RefObject } from 'react'

/**
 * The phone's bottom bar steps out of the way while you read on (2026-10-11 —
 * the user: "滑上去的时候，它是会收下来的 … 等这个爬升来的时候，它才可以又再跑
 * 起来"): scrolling down (the finger moving up) tucks it away, scrolling back
 * up brings it back, and near the top of a page it always shows. A new page
 * shows it again (`resetKey`).
 *
 * - Any vertical scroller counts — the app's own frame, a page's list, the
 *   window — read in the capture phase, since a scroll event does not bubble.
 *   One inside a dialog (a sheet, a drawer, a page sliding over) does not: the
 *   bar is under it. A sideways scroller (a chip row, a wide table) moves
 *   nothing, and neither does a jitter under 24px one way.
 * - A bar in its frame's flow (the HR app's tabs, the Revenue app's nav) gives
 *   its height back when tucked, so the page grows into the space. A page
 *   standing at its foot is then pulled back by the browser — that is not
 *   someone scrolling up, and is not read as one; neither is iOS's bounce past
 *   either end. And a page too short to keep its reader off the top once the
 *   bar's height is given back never tucks it: there would be no scrolling up
 *   to bring it back.
 */
export const TUCK_AFTER = 24
export const ALWAYS_NEAR_TOP = 48

type Box = { key: object; top: number; max: number }

/** Where a scroller stands and how far it can go — or null for one in a dialog. */
function scrollBox(target: EventTarget | null): Box | null {
  if (!target || target === document || target === window || target === document.documentElement || target === document.body) {
    const root = document.scrollingElement ?? document.documentElement
    return { key: document, top: window.scrollY, max: root.scrollHeight - root.clientHeight }
  }
  if (!(target instanceof Element) || target.closest('[role="dialog"]')) return null
  return { key: target, top: target.scrollTop, max: target.scrollHeight - target.clientHeight }
}

export function useTuckOnScroll(bar: RefObject<HTMLElement | null>, enabled = true, resetKey?: unknown): boolean {
  const [tucked, setTucked] = useState(false)

  useEffect(() => {
    setTucked(false)
  }, [resetKey])

  // The bar's own height, kept current (a safe-area inset, a font size): what
  // the stylesheet pulls it down by (`--bar-h`, tuck.module.css).
  useEffect(() => {
    const el = bar.current
    if (!el) return
    const measure = () => el.style.setProperty('--bar-h', `${el.offsetHeight}px`)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [bar])

  useEffect(() => {
    if (!enabled) {
      setTucked(false)
      return
    }
    const last = new WeakMap<object, number>()
    let run = 0
    let way = 0
    const onScroll = (e: Event) => {
      const box = scrollBox(e.target)
      if (!box) return
      const top = Math.min(Math.max(box.top, 0), Math.max(box.max, 0))
      const before = last.get(box.key)
      last.set(box.key, top)
      if (before === undefined) return
      const dy = top - before
      if (dy === 0) return
      if (top < ALWAYS_NEAR_TOP) {
        run = 0
        way = 0
        setTucked(false)
        return
      }
      // Pulled back from its foot: the frame grew (the bar's height given back) or the page got shorter.
      if (dy < 0 && top >= box.max - 1) return
      const now = Math.sign(dy)
      if (now !== way) {
        way = now
        run = 0
      }
      run += dy
      if (run > TUCK_AFTER) {
        if (box.max - (bar.current?.offsetHeight ?? 0) >= ALWAYS_NEAR_TOP) setTucked(true)
      } else if (run < -TUCK_AFTER) {
        setTucked(false)
      }
    }
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => document.removeEventListener('scroll', onScroll, { capture: true })
  }, [enabled, bar])

  return enabled && tucked
}
