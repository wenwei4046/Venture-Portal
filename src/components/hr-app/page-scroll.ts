'use client'

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'

/**
 * Every page the HR app opens starts at its top, and Back returns to where its
 * page was left (2026-10-11 — the user: "点进另一个界面的时候，应该要 start from
 * top … 每次点进去都从最上面开始"). The app's pages share one scroller, so a page
 * opened from the middle of a long list opened in the middle too.
 *
 * A page is named by its tab, then each page pushed on it: `hiring/hire:HR-205`.
 * Going back is the page before it on the same tab (`hiring/hire:HR-205` →
 * `hiring`); a tab pressed, a notice opened or a page pushed is a page entered.
 */
export function pageKeyOf(tab: string, stack: ReadonlyArray<{ k: string; id?: string }>): string {
  return [tab, ...stack.map(p => (p.id === undefined ? p.k : `${p.k}:${encodeURIComponent(p.id)}`))].join('/')
}

export function usePageScroll(scroller: RefObject<HTMLElement | null>, page: string): void {
  const left = useRef(new Map<string, number>())
  const shown = useRef(page)

  // Where each page was left, as it is scrolled.
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const keep = () => {
      left.current.set(shown.current, el.scrollTop)
    }
    el.addEventListener('scroll', keep, { passive: true })
    return () => el.removeEventListener('scroll', keep)
  }, [scroller])

  // Before the new page is painted: its top — or, going back, where it was left.
  useLayoutEffect(() => {
    const before = shown.current
    if (before === page) return
    shown.current = page
    const el = scroller.current
    if (!el) return
    if (before.startsWith(`${page}/`)) {
      el.scrollTop = left.current.get(page) ?? 0
    } else {
      left.current.delete(page)
      el.scrollTop = 0
    }
  }, [scroller, page])
}
