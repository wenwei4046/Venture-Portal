'use client'

import { useEffect, useRef } from 'react'
import { SAFE_BOTTOM_FLOOR_VAR, SAFE_BOTTOM_KEY, isInset, readSafeBottom, safeBottomFloor, type SafeBottomMemory } from '@/lib/safe-area'

/** Session storage, or nothing where the browser refuses it (a private window, blocked site data). */
const sessionStore = {
  read(): string | null {
    try {
      return window.sessionStorage.getItem(SAFE_BOTTOM_KEY)
    } catch {
      return null
    }
  },
  write(memory: SafeBottomMemory) {
    try {
      window.sessionStorage.setItem(SAFE_BOTTOM_KEY, JSON.stringify(memory))
    } catch {
      // Not remembered: a reload then gets the browser's word alone, as before.
    }
  },
}

/** `env(safe-area-inset-bottom)`, as the probe stands. */
function probeInset(probe: HTMLElement): number {
  return probe.getBoundingClientRect().height
}

/**
 * Mounted once in the root layout (2026-10-10): keeps the bottom bars clear of
 * the phone's own navigation bar when a reload loses its inset —
 * lib/safe-area.ts. A zero-width probe stands `env(safe-area-inset-bottom)`
 * tall, so what the browser says is read off it and every change it makes
 * re-measures. A non-zero inset is remembered for the tab; a page that has
 * heard only 0 in the very window remembered gets the floor
 * (`--safe-bottom-floor` on `<html>`, which the root layout's head script set
 * from the same memory before the first paint); anything else lifts it.
 */
export default function SafeAreaMemory({
  store = sessionStore,
  measure = probeInset,
}: {
  store?: { read(): string | null; write(memory: SafeBottomMemory): void }
  measure?: (probe: HTMLElement) => number
}) {
  const probe = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = probe.current
    if (!el) return
    const root = document.documentElement
    let heard = false

    const check = () => {
      const inset = measure(el)
      const width = window.innerWidth
      const height = window.innerHeight
      let memory = readSafeBottom(store.read())
      if (isInset(inset)) {
        heard = true
        if (!memory || memory.inset !== inset || memory.width !== width || memory.height !== height) {
          memory = { width, height, inset }
          store.write(memory)
        }
      }
      const floor = safeBottomFloor({ inset, heard, width, height, memory })
      if (floor > 0) root.style.setProperty(SAFE_BOTTOM_FLOOR_VAR, `${floor}px`)
      else root.style.removeProperty(SAFE_BOTTOM_FLOOR_VAR)
    }

    check()
    const resized = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(check)
    resized?.observe(el)
    window.addEventListener('resize', check)
    window.addEventListener('pageshow', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      resized?.disconnect()
      window.removeEventListener('resize', check)
      window.removeEventListener('pageshow', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [store, measure])

  return <div ref={probe} className="safe-bottom-probe" aria-hidden="true" />
}
