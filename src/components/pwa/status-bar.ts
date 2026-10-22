'use client'

import { useEffect, useLayoutEffect } from 'react'

/**
 * The phone's status bar in the colour of the page under it (2026-10-17 — the owner, circling the strip above the CRM's
 * Profile on an iPhone: "for the top bar, should be same colour with the apps. with all tab as well").
 *
 * An installed app draws its status bar itself (the root layout's `statusBarStyle: 'default'`) and colours it from the
 * page's `<meta name="theme-color">`, which every route sets once for all its screens: the Revenue app white, the
 * Finance app #f8f5f0 — and the CRM's Team pages cream and both Profiles peach drew under it. Each screen now writes its
 * own top colour there while it is on, and on `html` / `body` too (an iPhone on iOS 26 takes the bar's colour from the
 * page's background rather than the meta). Android follows at once. An iPhone was seen keeping the colour of the page
 * the app was opened on (the Finance app's #f8f5f0 all through the CRM, 2026-10-17, though the page's meta said #ffffff)
 * — what each screen asks is written all the same.
 *
 * A screen opened OVER another — a photo, a video, the camera, the editor, all black to the edges — holds the bar in its
 * own colour until it closes (2026-10-18 — the owner, a photo opened on an iPhone under a white bar, WhatsApp's black one
 * beside it: "when open pic and video, top bar didnt same colour or full screen"); whatever the screen under it paints
 * meanwhile is kept for when it lets go.
 */
type Mark = { was: string; now: string }
const ours = new WeakMap<HTMLMetaElement, Mark>()
let painted = false
/** What the screen asked last (`null`: the page's own), and the colours held over it, the newest on top. */
let screen: string | null = null
const holds: { color: string }[] = []

/** A `var(--name)` read off the Revenue app's root, where its colours are defined; any other colour as it is. */
export function resolveColor(color: string): string {
  const v = /^var\((--[\w-]+)\)$/.exec(color.trim())
  if (!v || typeof document === 'undefined') return color
  const host = document.querySelector('[data-revenue-app]') ?? document.documentElement
  return getComputedStyle(host).getPropertyValue(v[1]).trim()
}

/** The colour a screen shows at its very top: its background's first colour (a strip drawn as a gradient), else its colour. */
export function topColorOf(el: Element): string {
  const cs = getComputedStyle(el)
  return /rgba?\([^)]*\)|#[0-9a-f]{3,8}\b/i.exec(cs.backgroundImage || '')?.[0] ?? cs.backgroundColor ?? ''
}

/**
 * The screen's own colour for the status bar; `null` gives back what the page had (a meta someone changed since is left
 * as it is). Under a held colour it waits for the hold to go.
 */
export function paintStatusBar(color: string | null) {
  screen = color
  if (!holds.length) write(color)
}

/** Holds the status bar at `color` over whatever the screen paints, until the function handed back lets go. */
export function holdStatusBar(color: string): () => void {
  const hold = { color }
  holds.push(hold)
  write(color)
  return () => {
    const i = holds.indexOf(hold)
    if (i < 0) return
    holds.splice(i, 1)
    // A colour that no longer reads (its page gone) gives the page's own back rather than leaving the hold's.
    if (!write(holds.length ? holds[holds.length - 1].color : screen)) write(null)
  }
}

/** Writes the bar's colour (`null`: the page's own back); false when there was nothing to write it with. */
function write(color: string | null): boolean {
  if (typeof document === 'undefined') return false
  const c = color === null ? null : resolveColor(color)
  if (c === '') return false
  const metas = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')]
  for (const m of metas) {
    const mark = ours.get(m)
    if (c === null) {
      if (mark && m.content === mark.now) m.content = mark.was
      ours.delete(m)
      continue
    }
    // First touched, or changed by the page since (a new route's own colour): what it says now is what it gives back.
    ours.set(m, { was: mark && m.content === mark.now ? mark.was : m.content, now: c })
    if (m.content !== c) m.content = c
  }
  if (c !== null && !metas.length) {
    const m = document.createElement('meta')
    m.name = 'theme-color'
    m.content = c
    document.head.appendChild(m)
    ours.set(m, { was: '', now: c })
  }
  const html = document.documentElement.style, body = document.body?.style
  if (c === null) {
    if (painted) { html.removeProperty('background-color'); body?.removeProperty('background-color') }
    painted = false
    return true
  }
  html.setProperty('background-color', c)
  body?.setProperty('background-color', c)
  painted = true
  return true
}

/** While `on`, the status bar is `color`; off or gone, the page's own again. */
export function useStatusBar(color: string | null, on: boolean) {
  useEffect(() => {
    if (on && color) paintStatusBar(color)
  }, [color, on])
  useEffect(() => () => paintStatusBar(null), [])
}

/** While `color` is set, the status bar holds it (a screen over the page, as it shows); `null` lets go. */
export function useStatusBarHold(color: string | null) {
  useLayoutEffect(() => (color ? holdStatusBar(color) : undefined), [color])
}
