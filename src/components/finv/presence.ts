'use client'

import { useEffect, useState } from 'react'

/**
 * The prototype's two-phase mount (2026-10-14, the Finance revamp v2 — README
 * › Motion: "sheets animate out as well as in"): a panel is mounted first and
 * shown a frame later, so its transition plays in; closed, it is hidden first
 * and unmounted once the exit has played (`exitMs`, the transition's length).
 * The prototype's `raf()`: two animation frames, or 80ms, whichever is first.
 */
export function usePresence(open: boolean, exitMs: number): { mounted: boolean; shown: boolean } {
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (open) {
      setMounted(true)
      let done = false
      const show = () => {
        if (done) return
        done = true
        setShown(true)
      }
      let inner = 0
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(show)
      })
      const fallback = setTimeout(show, 80)
      return () => {
        done = true
        cancelAnimationFrame(outer)
        cancelAnimationFrame(inner)
        clearTimeout(fallback)
      }
    }
    setShown(false)
    const t = setTimeout(() => setMounted(false), exitMs)
    return () => clearTimeout(t)
  }, [open, exitMs])

  return { mounted, shown }
}
