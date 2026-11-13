'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import t from './tip.module.css'

// A helper line shown only while its option is pointed at or reached by the keyboard (the user, 2026-11-13: "改成鼠标
// 指向选项才出现" — the Workflow Builder 2a's radio-card texts, toggle subtitles, the canvas legend and the rest). The
// prototype's toast look: ink, light words, radius 8, 12px, at most ~260px, a popover's shadow, a 0.12s fade. It is
// drawn on the page's body at a fixed place beside the option — below it, above when there is no room — so no
// `overflow` clips it and it never covers the option's own words. The wrapper takes no box (`display: contents`): the
// option keeps its layout. Instead of the browser's `title` wherever a line used to sit on the page.

const GAP = 6
const EDGE = 8
/** The Marketing view's tokens live on `.mkt-shell`; the body is outside it, so the tip carries them along. */
const TOKENS = ['--mk-ink', '--mk-on-ink', '--mk-shadow-pop'] as const

export default function Tip({ text, children }: { /** Nothing: no tip (the wrapper stays, so the option is not redrawn). */ text: ReactNode; children: ReactNode }) {
  const wrap = useRef<HTMLSpanElement>(null)
  const tip = useRef<HTMLDivElement>(null)
  const id = useId()
  const [open, setOpen] = useState(false)
  const [vars, setVars] = useState<CSSProperties>({})

  const anchor = () => {
    const el = wrap.current
    return (el?.firstElementChild as HTMLElement | null) ?? el
  }

  // Place it once it is drawn (its own size known): under the option, or over it when the screen ends first.
  useLayoutEffect(() => {
    if (!open) return
    const a = anchor()
    const box = tip.current
    if (!a || !box) return
    const r = a.getBoundingClientRect()
    const w = box.offsetWidth
    const h = box.offsetHeight
    const vw = window.innerWidth || document.documentElement.clientWidth
    const vh = window.innerHeight || document.documentElement.clientHeight
    const below = r.bottom + GAP + h <= vh - EDGE || r.top - GAP - h < EDGE
    // An option as tall as the screen (the celebration): kept on the screen, at its foot.
    const top = Math.max(EDGE, Math.min(below ? r.bottom + GAP : r.top - GAP - h, vh - h - EDGE))
    box.style.top = `${Math.round(top)}px`
    box.style.left = `${Math.round(Math.max(EDGE, Math.min(r.left, vw - w - EDGE)))}px`
    a.setAttribute('aria-describedby', id)
    return () => a.removeAttribute('aria-describedby')
  }, [open, id])

  // A scroll or a resize moves the option away from where the tip was put: it goes.
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  const show = () => {
    if (text === null || text === undefined || text === '' || text === false) return
    const a = anchor()
    if (a) {
      const css = getComputedStyle(a)
      const next: Record<string, string> = { fontFamily: css.fontFamily }
      for (const k of TOKENS) {
        const v = css.getPropertyValue(k).trim()
        if (v) next[k] = v
      }
      setVars(next as CSSProperties)
    }
    setOpen(true)
  }

  return (
    <span
      ref={wrap}
      className={t.wrap}
      onMouseEnter={show}
      onMouseLeave={() => setOpen(false)}
      onFocus={e => {
        // The keyboard's focus only — a click's focus already has the mouse over it.
        let keyboard = true
        try {
          keyboard = (e.target as HTMLElement).matches(':focus-visible')
        } catch {
          keyboard = true
        }
        if (keyboard) show()
      }}
      onBlur={() => setOpen(false)}
      onKeyDown={e => { if (e.key === 'Escape' && open) setOpen(false) }}
    >
      {children}
      {open && typeof document !== 'undefined'
        ? createPortal(<div ref={tip} id={id} role="tooltip" className={t.tip} style={vars}>{text}</div>, document.body)
        : null}
    </span>
  )
}
