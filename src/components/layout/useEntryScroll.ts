'use client'

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'

/**
 * Remembers how far a view was scrolled in the history entry it was scrolled
 * on, and puts it back when the reader returns to that entry — Back, Forward
 * or a reload (2026-09-27).
 *
 * The browser does this by itself only for a page that scrolls the WINDOW.
 * The portal scrolls `main`, and a ledger's table scrolls inside its own
 * frame, so Back from a bill opened halfway down ANTHONY's ledger showed his
 * ledger from the top. Both are kept: the nearest scrolling ancestor of
 * `root`, and every `panes` element inside it.
 *
 * Written into `history.state` beside Next's own keys (Next keeps them on Back
 * and Forward, and drops them on a refresh), when the scrolling settles and
 * again at any press of the pointer or Enter — the last moment before a link
 * leaves. `view` names what is on screen: a position is only put back onto the
 * view it was taken from, never onto another table that shares the URL.
 */

const KEY = '__vpScroll'

interface Saved {
  view: string
  page: number
  /** [top, left] of each pane, in document order. */
  panes: Array<[number, number]>
}

/** The nearest ancestor that scrolls — `main` in the portal — else the document. */
function scroller(el: HTMLElement): Element | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)) return node
  }
  return document.scrollingElement
}

function savedIn(state: unknown): Saved | null {
  if (!state || typeof state !== 'object') return null
  const saved = (state as Record<string, unknown>)[KEY]
  return saved && typeof saved === 'object' && typeof (saved as Saved).view === 'string' ? (saved as Saved) : null
}

export function useEntryScroll(root: RefObject<HTMLElement | null>, view: string, panes: string) {
  const showing = useRef(view)
  useLayoutEffect(() => { showing.current = view }, [view])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const save = () => {
      clearTimeout(timer)
      timer = undefined
      const el = root.current
      const state: unknown = window.history.state
      // Only an entry Next manages: its keys ride along untouched, and
      // passing them makes Next's patched replaceState step aside.
      if (!el || !state || typeof state !== 'object' || !('__NA' in state)) return
      const saved: Saved = {
        view: showing.current,
        page: scroller(el)?.scrollTop ?? 0,
        panes: [...el.querySelectorAll<HTMLElement>(panes)].map(pane => [pane.scrollTop, pane.scrollLeft]),
      }
      window.history.replaceState({ ...state, [KEY]: saved }, '')
    }
    const settle = () => {
      clearTimeout(timer)
      timer = setTimeout(save, 200)
    }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Enter') save() }
    document.addEventListener('scroll', settle, { capture: true, passive: true })
    document.addEventListener('pointerdown', save, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('scroll', settle, true)
      document.removeEventListener('pointerdown', save, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [root, panes])

  useLayoutEffect(() => {
    const el = root.current
    const saved = savedIn(window.history.state)
    if (!el || !saved || saved.view !== view) return
    const page = scroller(el)
    if (page) page.scrollTop = saved.page
    el.querySelectorAll<HTMLElement>(panes).forEach((pane, i) => {
      const at = saved.panes[i]
      if (!at) return
      pane.scrollTop = at[0]
      pane.scrollLeft = at[1]
    })
  }, [root, panes, view])
}
