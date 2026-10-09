/**
 * The bottom inset a reload loses (2026-10-10).
 *
 * The installed app draws under the phone's own navigation bar
 * (`viewport-fit=cover`, root layout) and stands its bottom bars on
 * `env(safe-area-inset-bottom)` — the Revenue app's Today · Insight · Quote ·
 * Arena · Profile and the portal's tab bar. On an Android phone with
 * three-button navigation, after a reload (Update, a pull that met a new
 * release, Try again) the Revenue app's bar sat under the phone's buttons by
 * their height (user's screenshot, 2026-10-10): the page was still drawn under
 * them, and the inset that lifts the bar had come back as 0. A fresh launch
 * gets it right.
 *
 * So the tab remembers the last inset the browser DID give it, with the window
 * it came with (session storage: kept across a reload, gone with the app), and a
 * page that has heard nothing but 0 in that same window stands on the
 * remembered one: `--safe-bottom` (globals.css) is the larger of the two. The
 * moment the browser gives this page a non-zero inset it is believed from then
 * on, a later 0 included — a keyboard, or a change of navigation mode, is real.
 * A different window (turned sideways, resized, a keyboard that shrinks it) is
 * not the one remembered, and gets the browser's word alone.
 */

/** The tab's memory (session storage). */
export const SAFE_BOTTOM_KEY = 'vp-safe-bottom'
/** The custom property `components/pwa/SafeAreaMemory` sets on `<html>` while the floor holds. */
export const SAFE_BOTTOM_FLOOR_VAR = '--safe-bottom-floor'

export interface SafeBottomMemory {
  /** `innerWidth` / `innerHeight` when the browser gave the inset. */
  width: number
  height: number
  /** The inset, in CSS px. */
  inset: number
}

/** Under half a pixel is the browser saying 0. */
export function isInset(px: number): boolean {
  return Number.isFinite(px) && px >= 0.5
}

/** What the tab remembers — anything unreadable is nothing. */
export function readSafeBottom(raw: string | null): SafeBottomMemory | null {
  if (!raw) return null
  try {
    const m = JSON.parse(raw) as Partial<SafeBottomMemory> | null
    if (!m || typeof m.width !== 'number' || typeof m.height !== 'number' || typeof m.inset !== 'number') return null
    return isInset(m.inset) ? { width: m.width, height: m.height, inset: m.inset } : null
  } catch {
    return null
  }
}

/**
 * The floor under the browser's own inset: the remembered inset, while this
 * page has heard nothing but 0 and its window is exactly the one remembered;
 * otherwise 0 (the browser's word stands alone).
 */
export function safeBottomFloor(input: {
  /** What `env(safe-area-inset-bottom)` says now. */
  inset: number
  /** This page has already been given a non-zero inset. */
  heard: boolean
  width: number
  height: number
  memory: SafeBottomMemory | null
}): number {
  const m = input.memory
  if (input.heard || isInset(input.inset) || !m) return 0
  return m.width === input.width && m.height === input.height ? m.inset : 0
}

/**
 * The root layout's `<head>` script: the same floor before the first paint —
 * the loading frame's bottom bar is drawn long before the app is up, and the
 * browser has said nothing yet. `safeBottomFloor` with an inset of 0, nothing
 * heard; the twin test in `safe-area.test.ts` holds the two together.
 */
export const SAFE_BOTTOM_BOOT = `(function(){try{var m=JSON.parse(sessionStorage.getItem('${SAFE_BOTTOM_KEY}')||'null');if(m&&typeof m.inset==='number'&&m.inset>=0.5&&m.width===innerWidth&&m.height===innerHeight){document.documentElement.style.setProperty('${SAFE_BOTTOM_FLOOR_VAR}',m.inset+'px')}}catch(e){}})()`
