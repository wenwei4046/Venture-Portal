'use client'

import { useEffect, type RefObject } from 'react'
import { useRouter } from 'next/navigation'

// An edge swipe back on a phone (2026-10-09, the user's Claude Design
// handoff): on a Finance detail page, a touch that starts within 28px of the
// left edge and travels more than 80px to the right goes back, the sheet
// following the finger on the way. A touch that starts further in, a short
// drag or a vertical scroll is left alone. Mounted by PortalFrame on the
// Finance view's detail routes only.

const EDGE = 28
const LOCK = 8
const COMMIT = 80
const SLIDE_MS = 180

export default function FinSwipeBack({ main, sheet }: { main: RefObject<HTMLElement | null>; sheet: RefObject<HTMLElement | null> }) {
  const router = useRouter()
  useEffect(() => {
    const el = main.current
    if (!el) return
    let startX = 0
    let startY = 0
    let armed = false
    let axis: 'x' | 'y' | null = null
    let dx = 0
    const follow = (x: number, animate: boolean) => {
      const s = sheet.current
      if (!s) return
      s.style.transition = animate ? `transform ${SLIDE_MS}ms ease-out` : 'none'
      s.style.transform = x ? `translateX(${x}px)` : ''
    }
    const start = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!t) return
      const left = el.getBoundingClientRect().left
      armed = t.clientX - left < EDGE
      axis = null
      dx = 0
      startX = t.clientX
      startY = t.clientY
    }
    const move = (e: TouchEvent) => {
      if (!armed) return
      const t = e.touches[0]
      if (!t) return
      const mx = t.clientX - startX
      const my = t.clientY - startY
      if (!axis) {
        if (Math.abs(mx) < LOCK && Math.abs(my) < LOCK) return
        axis = Math.abs(mx) >= Math.abs(my) ? 'x' : 'y'
        if (axis === 'y') {
          armed = false
          return
        }
      }
      dx = Math.max(0, mx)
      follow(dx * 0.9, false)
    }
    const end = () => {
      if (!armed) return
      armed = false
      if (axis === 'x' && dx > COMMIT) {
        follow(window.innerWidth, true)
        window.setTimeout(() => {
          follow(0, false)
          router.back()
        }, SLIDE_MS - 10)
      } else {
        follow(0, true)
      }
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: true })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', end)
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', end)
      follow(0, false)
    }
  }, [main, sheet, router])
  return null
}
