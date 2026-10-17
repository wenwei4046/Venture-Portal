'use client'

import { useEffect } from 'react'

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
 */
type Mark = { was: string; now: string }
const ours = new WeakMap<HTMLMetaElement, Mark>()
let painted = false

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

/** Paints the status bar `color`; `null` gives back what the page had (a meta someone changed since is left as it is). */
export function paintStatusBar(color: string | null) {
  if (typeof document === 'undefined') return
  const c = color === null ? null : resolveColor(color)
  if (c === '') return
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
    return
  }
  html.setProperty('background-color', c)
  body?.setProperty('background-color', c)
  painted = true
}

/** While `on`, the status bar is `color`; off or gone, the page's own again. */
export function useStatusBar(color: string | null, on: boolean) {
  useEffect(() => {
    if (on && color) paintStatusBar(color)
  }, [color, on])
  useEffect(() => () => paintStatusBar(null), [])
}
