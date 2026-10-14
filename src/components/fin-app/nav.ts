'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// How the Finance app moves (2026-10-15, the Finance revamp v2's phone — README
// › Motion and § State): into a list or a record the content enters from the
// right (`push`), back it enters from the left (`pop`) where it was left, a
// tab fades in (`tab`). A move says which it is just before it happens; the
// screen that draws next takes it (`takeIntent`). The browser's own Back — a
// phone's back gesture — is a `pop` too.
//
// Inside one page (a hub, its lists, a record) the screens are steps in the
// browser's history made with `history.pushState` (Next's own state copied
// in, so its router restores the page it has instead of fetching it — the
// Revenue app's way, components/member/app/route.ts); between pages it is
// Next's router. Back from a screen goes back a step while there is one this
// visit made, else up to the screen above it.

export type Intent = 'push' | 'pop' | 'tab'

let intent: Intent | null = null

export function setIntent(next: Intent) {
  intent = next
}

/** The move the next screen plays in with — read once. */
export function takeIntent(): Intent | null {
  const i = intent
  intent = null
  return i
}

/**
 * The move, read without using it up — a screen reads it as it is first drawn
 * (React may draw a component twice before keeping it) and uses it up once it
 * is on screen (`takeIntent`).
 */
export function peekIntent(): Intent | null {
  return intent
}

/** Steps of the browser's history this visit made inside the app: Back may go back that many. */
let depth = 0

export function stepped() {
  depth += 1
}

export function steppedBack() {
  depth = Math.max(0, depth - 1)
}

export function canStepBack(): boolean {
  return depth > 0
}

/** Into another page of the app, over this one (a tile, a row): it plays in from the right, and Back steps back to here. */
export function pushIntent() {
  setIntent('push')
  stepped()
}

let lastPop: Event | null = null

/**
 * The browser went back (or forward) a step: the next screen plays in as a
 * `pop`. Every listener calls it first — once per event, whoever hears it
 * first — so the move is known before React draws anything.
 */
export function notePop(event: Event) {
  if (event === lastPop) return
  lastPop = event
  setIntent('pop')
  steppedBack()
}

/** Where each screen was left (its address), so Back puts it there again — the prototype's saved `y`. */
const scrolls = new Map<string, number>()

export function keepScroll(key: string, top: number) {
  scrolls.set(key, top)
}

export function scrollOf(key: string): number {
  return scrolls.get(key) ?? 0
}

/** Test-only: forget every move. */
export function resetNav() {
  intent = null
  depth = 0
  lastPop = null
  scrolls.clear()
}

/** A screen inside one page, named by its query (`?f=all`, `?id=…`): read off the address, moved with history steps. */
export function useStep<T>(read: (search: URLSearchParams) => T, initialSearch: string): [T, (search: string) => void, (parentSearch: string) => void] {
  const [step, setStep] = useState<T>(() => read(new URLSearchParams(initialSearch)))
  const readRef = useRef(read)
  readRef.current = read

  useEffect(() => {
    // The address the browser shows is the truth (a refresh, a link, Back / Forward).
    setStep(readRef.current(new URLSearchParams(window.location.search)))
    const onPop = (e: PopStateEvent) => {
      notePop(e)
      setStep(readRef.current(new URLSearchParams(window.location.search)))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  /** Into a list or a record of this page. */
  const open = useCallback((search: string) => {
    const href = `${window.location.pathname}${search ? `?${search}` : ''}`
    setIntent('push')
    stepped()
    window.history.pushState(window.history.state, '', href)
    setStep(readRef.current(new URLSearchParams(search)))
  }, [])

  /** Back: a step of this visit's history, else straight to the screen above (a link, a refresh). */
  const back = useCallback((parentSearch: string) => {
    if (canStepBack()) {
      window.history.back()
      return
    }
    const href = `${window.location.pathname}${parentSearch ? `?${parentSearch}` : ''}`
    setIntent('pop')
    window.history.replaceState(window.history.state, '', href)
    setStep(readRef.current(new URLSearchParams(parentSearch)))
  }, [])

  return [step, open, back]
}
