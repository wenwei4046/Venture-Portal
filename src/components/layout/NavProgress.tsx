'use client'

import {
  startTransition,
  useEffect,
  useLayoutEffect,
  useOptimistic,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { onNavigationStart, subscribeSkeletons, visibleSkeletons } from '@/lib/nav-progress'

// The ink line across the top of the app while a page is on its way
// (2026-09-26), mounted once in app/layout.tsx so the portal, the member app
// and the sign-in hand-off all share it. It answers "did my click do anything?"
// for the navigations a skeleton cannot: a search-param tab that keeps its
// page, a link nothing had prefetched, a router.push after a Server Action. See
// lib/nav-progress.ts for what feeds it, and docs/DESIGN.md › "Navigation
// feedback" for the motion.
//
// The line leaps to ~20 % in the first 200 ms, is past half by 0.7 s, then
// crawls toward 92 % and never gets there; the moment the page lands it runs
// out to the end and fades. A wait feels shorter when progress comes early and
// the finish is quick. It stays hidden for SHOW_DELAY_MS, so a navigation that
// lands at once never flashes it.

const SHOW_DELAY_MS = 120
// The router commits a skeleton a frame before the skeleton counts itself in.
// Waiting this long before calling a navigation over keeps the line from
// finishing and restarting in that gap.
const SETTLE_MS = 80
// Run-out (220 ms) plus the fade that starts under it (180 ms in, 280 ms long).
const FINISH_MS = 480
// A navigation Next abandons for a newer one should hand its pending state on,
// and does; this is the floor under that. A line still "waiting" on a commit
// after this long is not reporting anything true, so it stands down.
const STALL_MS = 15_000

const RUN: Keyframe[] = [{ transform: 'translateX(-100%)' }, { transform: 'translateX(-8%)' }]
const RUN_TIMING: KeyframeAnimationOptions = {
  duration: 8000,
  easing: 'cubic-bezier(0.08, 0.82, 0.17, 1)',
  fill: 'forwards',
}

type Phase = 'idle' | 'loading' | 'done'

export default function NavProgress() {
  // True from the moment a navigation starts until Next commits it. Set in a
  // transition started inside the router's own (the instrumentation hook runs
  // synchronously in Next's navigate call), so React keeps it until that
  // transition lands — the same mechanism Next's useLinkStatus uses per link.
  const [navPending, setNavPending] = useOptimistic(false)
  const [stalled, setStalled] = useState(false)
  const skeletons = useSyncExternalStore(subscribeSkeletons, visibleSkeletons, () => 0)
  const committing = navPending && !stalled
  const waiting = committing || skeletons > 0
  const [phase, setPhase] = useState<Phase>('idle')

  useEffect(() => {
    if (!navPending) {
      setStalled(false)
      return
    }
    const timer = setTimeout(() => setStalled(true), STALL_MS)
    return () => clearTimeout(timer)
  }, [navPending])
  const lineRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(
    () =>
      onNavigationStart(() => {
        startTransition(() => setNavPending(true))
      }),
    [setNavPending],
  )

  // While a navigation has not committed, the page being left dims a little
  // (CSS, after a delay), so it reads as "being replaced" rather than as a
  // click that did nothing. A skeleton navigation commits within a frame and
  // never gets there.
  useLayoutEffect(() => {
    if (!committing) return
    const root = document.documentElement
    root.setAttribute('data-nav-pending', '')
    return () => root.removeAttribute('data-nav-pending')
  }, [committing])

  useEffect(() => {
    if (waiting) {
      if (phase === 'loading') return
      const timer = setTimeout(() => setPhase('loading'), phase === 'done' ? 0 : SHOW_DELAY_MS)
      return () => clearTimeout(timer)
    }
    if (phase === 'loading') {
      const timer = setTimeout(() => setPhase('done'), SETTLE_MS)
      return () => clearTimeout(timer)
    }
    if (phase === 'done') {
      const timer = setTimeout(() => setPhase('idle'), FINISH_MS)
      return () => clearTimeout(timer)
    }
  }, [waiting, phase])

  // Driven with the Web Animations API rather than CSS classes because the
  // finish has to START from wherever the run had got to, and only script can
  // read that.
  useLayoutEffect(() => {
    const line = lineRef.current
    const bar = barRef.current
    if (!line || !bar || typeof bar.animate !== 'function') return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const cancelAll = () => {
      for (const animation of [...bar.getAnimations(), ...line.getAnimations()]) animation.cancel()
    }

    if (phase === 'loading') {
      cancelAll()
      line.style.opacity = '1'
      if (reduced) bar.style.transform = 'translateX(-35%)'
      else bar.animate(RUN, RUN_TIMING)
      return
    }
    if (phase === 'done') {
      const reached = getComputedStyle(bar).transform
      for (const animation of bar.getAnimations()) animation.cancel()
      bar.style.transform = 'translateX(0)'
      if (!reduced && reached && reached !== 'none') {
        bar.animate([{ transform: reached }, { transform: 'translateX(0)' }], {
          duration: 220,
          easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
        })
      }
      line.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: reduced ? 150 : 280,
        delay: reduced ? 0 : 180,
        easing: 'ease-out',
        fill: 'forwards',
      })
      return
    }
    cancelAll()
    line.style.opacity = '0'
    bar.style.transform = 'translateX(-100%)'
  }, [phase])

  return (
    <div ref={lineRef} className="nav-progress print:hidden" data-state={phase} aria-hidden>
      <div ref={barRef} className="nav-progress-bar" />
    </div>
  )
}
