import type { TouchEvent } from 'react'

// A long press (~500 ms) on touch opens what a right-click opens (the user's decision 2, 2026-11-13). One finger at a
// time, so one timer serves every row and card; moving the finger more than 10 px, lifting it early or a second
// touch cancels it, and the tap that ends a long press does not also click.

export const LONG_PRESS_MS = 500
let timer: ReturnType<typeof setTimeout> | null = null
let from: { x: number; y: number } | null = null
let fired = false

const clear = () => {
  if (timer) clearTimeout(timer)
  timer = null
}

export interface LongPressHandlers {
  onTouchStart: (e: TouchEvent) => void
  onTouchMove: (e: TouchEvent) => void
  onTouchEnd: (e: TouchEvent) => void
  onTouchCancel: () => void
}

/** The touch handlers that call `open(x, y)` (the finger's place on the screen) after a long press. */
export function longPress(open: (x: number, y: number) => void): LongPressHandlers {
  return {
    onTouchStart: e => {
      clear()
      fired = false
      const t = e.touches[0]
      if (!t || e.touches.length > 1) return
      from = { x: t.clientX, y: t.clientY }
      const { clientX, clientY } = t
      timer = setTimeout(() => {
        timer = null
        fired = true
        open(clientX, clientY)
      }, LONG_PRESS_MS)
    },
    onTouchMove: e => {
      const t = e.touches[0]
      if (from && t && Math.hypot(t.clientX - from.x, t.clientY - from.y) > 10) clear()
    },
    onTouchEnd: e => {
      clear()
      if (fired) {
        e.preventDefault()
        fired = false
      }
    },
    onTouchCancel: clear,
  }
}
