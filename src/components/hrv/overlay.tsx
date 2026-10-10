'use client'

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import s from './hrv.module.css'

// Drawers and windows of the HR revamp (2026-10-10), as the prototype draws
// them: inside HR's content frame, over the sheet only — a right drawer
// (400–600px) on a rgb(43 31 23 / .18) scrim, a centred window on .28 — and
// Esc closes the one on top. Outside HR's shell (the Principal's own view
// opens the same pages) they are fixed to the window instead.

const OVERLAY_ROOT = '[data-hrv-overlay]'

/** HR's content frame when it is on screen, else null (fixed to the window). */
function useOverlayRoot(): { root: Element | null; ready: boolean } {
  const [state, setState] = useState<{ root: Element | null; ready: boolean }>({ root: null, ready: false })
  useEffect(() => {
    setState({ root: document.querySelector(OVERLAY_ROOT), ready: true })
  }, [])
  return state
}

// Esc closes the overlay opened last, never every one at once.
const escStack: Array<() => void> = []
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || escStack.length === 0) return
  e.preventDefault()
  escStack[escStack.length - 1]()
}

export function useEscape(active: boolean, close: () => void) {
  const ref = useRef(close)
  ref.current = close
  useEffect(() => {
    if (!active) return
    const fn = () => ref.current()
    escStack.push(fn)
    if (escStack.length === 1) window.addEventListener('keydown', onKey)
    return () => {
      const i = escStack.lastIndexOf(fn)
      if (i >= 0) escStack.splice(i, 1)
      if (escStack.length === 0) window.removeEventListener('keydown', onKey)
    }
  }, [active])
}

function Portal({ children }: { children: (fixed: boolean) => ReactNode }) {
  const { root, ready } = useOverlayRoot()
  if (!ready) return null
  const target = root ?? document.body
  return createPortal(
    <div className="sheet-theme hrv-overlay" style={{ display: 'contents' }}>{children(!root)}</div>,
    target,
  )
}

/** Puts focus inside an overlay when it opens and gives it back when it closes. */
function useFocusIn(open: boolean) {
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const before = document.activeElement as HTMLElement | null
    panel.current?.focus({ preventScroll: true })
    return () => before?.focus?.({ preventScroll: true })
  }, [open])
  return panel
}

export function CloseButton({ onClick, label = 'Close' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className={s.close} onClick={onClick} aria-label={label}>
      ×
    </button>
  )
}

export function Drawer({
  open,
  onClose,
  width = 440,
  eyebrow,
  eyebrowStyle,
  title,
  titleStyle,
  sub,
  head,
  headStyle,
  children,
  footer,
  bodyStyle,
}: {
  open: boolean
  onClose: () => void
  width?: number
  eyebrow?: ReactNode
  eyebrowStyle?: CSSProperties
  title?: ReactNode
  titleStyle?: CSSProperties
  sub?: ReactNode
  /** Replaces eyebrow / title / sub with a head of its own (the × stays). */
  head?: ReactNode
  /** The head's box (round 2's drawers pad it 18px 22px). */
  headStyle?: CSSProperties
  children: ReactNode
  footer?: ReactNode
  bodyStyle?: CSSProperties
}) {
  const id = useId()
  useEscape(open, onClose)
  const panel = useFocusIn(open)
  if (!open) return null
  return (
    <Portal>
      {fixed => (
        <>
          <div className={`${s.scrim}${fixed ? ` ${s.scrimFixed}` : ''}`} onClick={onClose} aria-hidden="true" />
          <div
            ref={panel}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${id}-title`}
            className={`${s.drawer}${fixed ? ` ${s.drawerFixed}` : ''}`}
            style={{ width, outline: 'none' }}
          >
            <div className={s.drawerHead} style={headStyle}>
              <div id={`${id}-title`}>
                {head ?? (
                  <>
                    {eyebrow ? <div className={s.drawerEyebrow} style={eyebrowStyle}>{eyebrow}</div> : null}
                    {title ? <div className={s.drawerTitle} style={titleStyle}>{title}</div> : null}
                    {sub ? <div className={s.drawerSub}>{sub}</div> : null}
                  </>
                )}
              </div>
              <CloseButton onClick={onClose} />
            </div>
            <div className={s.drawerBody} style={bodyStyle}>{children}</div>
            {footer ? <div className={s.drawerFoot}>{footer}</div> : null}
          </div>
        </>
      )}
    </Portal>
  )
}

/** A centred window (the person window, Invite user): `scrim` .28 or .22. */
export function Window({
  open,
  onClose,
  width,
  scrim = 0.28,
  z = 30,
  label,
  children,
  style,
}: {
  open: boolean
  onClose: () => void
  width: number
  scrim?: number
  /** The scrim's z-index; the window sits one above. */
  z?: number
  label: string
  children: ReactNode
  style?: CSSProperties
}) {
  useEscape(open, onClose)
  const panel = useFocusIn(open)
  if (!open) return null
  return (
    <Portal>
      {fixed => (
        <>
          <div
            className={`${s.scrim}${fixed ? ` ${s.scrimFixed}` : ''}`}
            style={{ background: `rgb(43 31 23 / ${scrim})`, zIndex: z }}
            onClick={onClose}
            aria-hidden="true"
          />
          <div
            ref={panel}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            className={`${s.window}${fixed ? ` ${s.windowFixed}` : ''}`}
            style={{ width, zIndex: z + 1, outline: 'none', ...style }}
          >
            {children}
          </div>
        </>
      )}
    </Portal>
  )
}
