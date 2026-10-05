'use client'

import { useEffect, useRef, useState } from 'react'
import { CHECK_EVERY_MS, CHECK_GAP_MS, readLiveVersion, updateStep, wasBusy } from '@/lib/app-update'

// Module-level, so the defaults below are the same function on every render
// and the effect keeps its listeners and its timer.
function reloadPage() {
  window.location.reload()
}

/**
 * "A new version is ready" (2026-10-06), mounted once in the root layout so the
 * portal, the member app and the installed app on a phone all hear about a
 * release. It asks the server which build is live (lib/app-update.ts) when the
 * page loads, every time the app comes back to the screen, when the network
 * returns, and every five minutes while it is in view.
 *
 * A newer build is OFFERED — the bar at the top, Update reloads — except after
 * thirty minutes or more away with nothing half-typed, when the app simply
 * loads it on return, so somebody reopening it in the morning never meets
 * yesterday's build. While it is on screen it never reloads by itself. A page
 * with unsaved changes that guards them (`beforeunload`) still asks first.
 */
export default function UpdatePrompt({
  built = process.env.NEXT_PUBLIC_APP_VERSION ?? '',
  readLive = readLiveVersion,
  reload = reloadPage,
  now = Date.now,
}: {
  built?: string
  readLive?: () => Promise<string | null>
  reload?: () => void
  now?: () => number
}) {
  const [ready, setReady] = useState(false)
  const [later, setLater] = useState(false)
  const hiddenAt = useRef<number | null>(null)
  const lastInputAt = useRef<number | null>(null)
  const askedAt = useRef<number | null>(null)

  useEffect(() => {
    if (!built) return
    let alive = true

    const ask = async (awayMs: number, busy: boolean) => {
      const t = now()
      if (askedAt.current !== null && t - askedAt.current < CHECK_GAP_MS && awayMs === 0) return
      askedAt.current = t
      const live = await readLive()
      if (!alive) return
      const step = updateStep({ built, live, awayMs, busy })
      if (step === 'none') return
      // Shown under a reload too: a page guarding unsaved changes may keep it.
      setReady(true)
      if (step === 'reload') reload()
    }

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = now()
        return
      }
      const left = hiddenAt.current
      hiddenAt.current = null
      if (left === null) return
      setLater(false)
      void ask(now() - left, wasBusy({ focused: document.activeElement, lastInputAt: lastInputAt.current, hiddenAt: left }))
    }
    // A page restored whole from the back-forward cache (an installed app on
    // iOS often is) may come back without a visibility change of its own.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) onVisibility()
    }
    const onInput = () => {
      lastInputAt.current = now()
    }
    const onOnline = () => void ask(0, true)
    const tick = window.setInterval(() => {
      if (document.visibilityState === 'visible') void ask(0, true)
    }, CHECK_EVERY_MS)

    void ask(0, true)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pageshow', onPageShow)
    document.addEventListener('input', onInput, true)
    document.addEventListener('change', onInput, true)
    window.addEventListener('online', onOnline)
    return () => {
      alive = false
      window.clearInterval(tick)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pageshow', onPageShow)
      document.removeEventListener('input', onInput, true)
      document.removeEventListener('change', onInput, true)
      window.removeEventListener('online', onOnline)
    }
  }, [built, readLive, reload, now])

  if (!ready || later) return null
  return (
    <div className="update-prompt print:hidden" role="status" aria-live="polite">
      <span className="update-prompt-text">A new version is ready.</span>
      <button type="button" className="update-prompt-go" onClick={() => reload()}>
        Update
      </button>
      <button type="button" className="update-prompt-later" onClick={() => setLater(true)} aria-label="Not now">
        ×
      </button>
    </div>
  )
}
