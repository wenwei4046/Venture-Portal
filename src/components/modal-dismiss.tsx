'use client'

import type { MouseEvent } from 'react'

/**
 * How a modal is allowed to close.
 *
 * Clicking the backdrop should close it. A text selection that merely ENDS on
 * the backdrop should not — but that is what used to happen: a `click` fires on
 * the nearest common ancestor of mousedown and mouseup, so dragging a selection
 * out of an input and releasing over the scrim counted as a backdrop click and
 * threw away everything typed. (User, 2026-09-29: "当我 highlight 超过这个 pop
 * out 出来的格子就好自动关" — 18 of the portal's 24 modals behaved this way, and
 * only 5 answered Esc.)
 *
 * So the press has to START on the backdrop as well as end there. One
 * module-level flag is enough: only one pointer is down at a time, and the flag
 * is cleared on every click it takes part in.
 *
 * Spread onto the backdrop element, in place of its old onClick:
 *
 *   <div className="fixed inset-0 …" {...backdropDismiss(() => setOpen(false))}>
 *
 * The returned ref is where Esc lives: it binds while the backdrop is mounted
 * and unbinds with it (React 19 runs the cleanup a ref callback returns), so an
 * open modal answers Esc and a closed one never listens.
 */

let pressedOnBackdrop = false

export function backdropDismiss(close: () => void) {
  return {
    ref: (el: HTMLElement | null) => {
      if (!el) return
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') close()
      }
      document.addEventListener('keydown', onKey)
      return () => document.removeEventListener('keydown', onKey)
    },
    onMouseDown: (e: MouseEvent) => {
      pressedOnBackdrop = e.target === e.currentTarget
    },
    onClick: (e: MouseEvent) => {
      // detail > 1 is the second click of the double-click that OPENED the
      // modal: the backdrop appeared under the pointer between the two, and a
      // number or a row that was double-clicked used to flash open and shut
      // (2026-10-02, when rows began to open on a double-click). A click that
      // means "close" always starts a count of its own.
      const outside = pressedOnBackdrop && e.target === e.currentTarget && e.detail <= 1
      pressedOnBackdrop = false
      if (outside) close()
    },
  }
}
