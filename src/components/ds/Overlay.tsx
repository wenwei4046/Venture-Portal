'use client'

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useEscape } from '@/components/hrv/overlay'
import { EASE } from './Button'

/**
 * Overlays as the Attendance handoff draws them (2026-10-15):
 * - Sheet — the design system's right-hand drawer (`core-feedback/Dialog.jsx`):
 *   inside the content frame (10px in), slides 40px + fades over 340ms, the
 *   scrim fades .25s, Esc closes. The person calendar and a punch record.
 * - SidePanel — the prototype's own fixed panel over the whole window (480px
 *   attachment viewer, 460px ledger entry): scrim rgb(51 36 27 / .28), shadow
 *   -18px 0 40px. It appears without a move, as the prototype's does.
 * - CenterWindow — Settings' floating window (620px, radius 14), scrim .32,
 *   with an optional second panel beside it (the leave type's Preview).
 * - Toast — one line, bottom-centre, dark with an accent dot, 2.2s.
 */

function useMounted(open: boolean, ms: number) {
  const [m, setM] = useState(open)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (open) {
      setM(true)
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
      return () => cancelAnimationFrame(r)
    }
    setShown(false)
    const t = setTimeout(() => setM(false), ms)
    return () => clearTimeout(t)
  }, [open, ms])
  return [m, shown] as const
}

/** Esc closes the overlay opened last (the kit's one stack, so a window over a drawer closes first). */
export function useEsc(open: boolean, onClose?: () => void) {
  useEscape(open && !!onClose, () => onClose?.())
}

/** Into HR's content frame (`[data-hrv-overlay]`), so a drawer covers the sheet only; the window outside HR's shell. */
function FramePortal({ children }: { children: (fixed: boolean) => ReactNode }) {
  const [root, setRoot] = useState<{ el: Element | null; ready: boolean }>({ el: null, ready: false })
  useEffect(() => setRoot({ el: document.querySelector('[data-hrv-overlay]'), ready: true }), [])
  if (!root.ready) return null
  return createPortal(<div className="sheet-theme" style={{ display: 'contents' }}>{children(!root.el)}</div>, root.el ?? document.body)
}

/** The DS drawer, absolute inside the nearest positioned frame (the sheet's `.hrv-frame`). */
export function Sheet({
  open,
  onClose,
  width = 440,
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  width?: number
  eyebrow?: ReactNode
  title?: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  const [m, shown] = useMounted(open, 340)
  useEsc(open, onClose)
  if (!m) return null
  return (
    <FramePortal>{fixed => (
    <div style={{ position: fixed ? 'fixed' : 'absolute', inset: 0, zIndex: 35 }} data-ds-sheet="">
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'var(--ds-scrim)', opacity: shown ? 1 : 0, transition: 'opacity 250ms ease' }} />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'absolute',
          background: 'var(--ds-surface)',
          display: 'flex',
          flexDirection: 'column',
          color: 'var(--ds-ink)',
          boxSizing: 'border-box',
          top: 10,
          right: 10,
          bottom: 10,
          width,
          maxWidth: 'calc(100% - 20px)',
          borderRadius: 'var(--ds-r-panel)',
          transform: shown ? 'none' : 'translateX(40px)',
          opacity: shown ? 1 : 0,
          transition: `transform 340ms ${EASE}, opacity 340ms ${EASE}`,
          boxShadow: '-12px 0 32px rgb(43 31 23 / .12)',
          lineHeight: 'normal',
          fontSize: 13,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '20px 22px', borderBottom: '1px solid var(--ds-border)' }}>
          <div>
            {eyebrow ? <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ds-ink-3)', marginBottom: 6 }}>{eyebrow}</div> : null}
            {title ? <h2 style={{ margin: 0, fontFamily: 'var(--ds-font-display)', fontSize: 19, fontWeight: 500, letterSpacing: 0 }}>{title}</h2> : null}
            {description ? <p style={{ margin: '4px 0 0', fontSize: 'var(--ds-small-size)', color: 'var(--ds-ink-2)' }}>{description}</p> : null}
          </div>
          <button type="button" aria-label="Close" onClick={onClose} style={{ width: 30, height: 30, flex: 'none', border: 0, borderRadius: 8, background: 'transparent', fontSize: 16, cursor: 'pointer', color: 'var(--ds-ink)' }}>
            ×
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
        {footer ? <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 22px', borderTop: '1px solid var(--ds-border)' }}>{footer}</div> : null}
      </div>
    </div>
    )}</FramePortal>
  )
}

function Portal({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  return ready ? createPortal(children, document.body) : null
}

/** The prototype's fixed right panel over the whole window. */
export function SidePanel({ open, onClose, width, children }: { open: boolean; onClose: () => void; width: number; children: ReactNode }) {
  useEsc(open, onClose)
  if (!open) return null
  return (
    <Portal>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgb(51 36 27 / .28)' }} />
      <div
        data-sheet-portal=""
        style={{ position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 61, width, maxWidth: '100%', boxSizing: 'border-box', background: 'var(--ds-surface)', borderLeft: '1px solid var(--ds-border)', boxShadow: '-18px 0 40px rgb(51 36 27 / .16)', display: 'flex', flexDirection: 'column', fontFamily: 'var(--ds-font-body)', color: 'var(--ds-ink)', fontSize: 13, lineHeight: 'normal' }}
      >
        {children}
      </div>
    </Portal>
  )
}

/** The head every fixed panel and window draws: eyebrow (mono or not), title, sub, ×. */
export function PanelHead({ eyebrow, mono = false, title, titleSize = 16, sub, onClose, padding = '18px 20px', breakAll = false }: { eyebrow: ReactNode; mono?: boolean; title: ReactNode; titleSize?: number; sub?: ReactNode; onClose: () => void; padding?: string; breakAll?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding, borderBottom: '1px solid var(--ds-border)' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ds-ink-3)', fontFamily: mono ? 'var(--font-mono)' : undefined }}>{eyebrow}</div>
        <div style={{ fontSize: titleSize, fontWeight: 500, marginTop: 4, wordBreak: breakAll ? 'break-all' : undefined }}>{title}</div>
        {sub ? <div style={{ fontSize: 12.5, color: 'var(--ds-ink-2)', marginTop: 3 }}>{sub}</div> : null}
      </div>
      <button type="button" onClick={onClose} aria-label="Close" style={{ border: 0, background: 'none', fontSize: 22, lineHeight: 1, color: 'var(--ds-ink-3)', cursor: 'pointer', padding: 0 }}>
        ×
      </button>
    </div>
  )
}

/** Settings' centred window (620px) and, beside it, an optional second panel. */
export function CenterWindow({ open, onClose, children, beside, width = 620 }: { open: boolean; onClose: () => void; children: ReactNode; beside?: ReactNode; width?: number }) {
  useEsc(open, onClose)
  if (!open) return null
  const panel: CSSProperties = { pointerEvents: 'auto', maxHeight: '100%', boxSizing: 'border-box', background: 'var(--ds-surface)', border: '1px solid var(--ds-border)', borderRadius: 14, boxShadow: '0 24px 60px rgb(51 36 27 / .22)', display: 'flex', flexDirection: 'column' }
  return (
    <Portal>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgb(51 36 27 / .32)' }} />
      <div data-sheet-portal="" style={{ position: 'fixed', inset: 0, zIndex: 71, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '30px 20px', boxSizing: 'border-box', pointerEvents: 'none', fontFamily: 'var(--ds-font-body)', color: 'var(--ds-ink)', fontSize: 13, lineHeight: 'normal' }}>
        <div style={{ ...panel, width, maxWidth: '100%' }}>{children}</div>
        {beside ? <div style={{ ...panel, width: 340 }}>{beside}</div> : null}
      </div>
    </Portal>
  )
}

/** One line, bottom-centre of the content frame, 2.2s. */
export function Toast({ message, bottom = 30 }: { message: string | null; bottom?: number }) {
  const [last, setLast] = useState(message)
  useEffect(() => {
    if (message) setLast(message)
  }, [message])
  const [m, shown] = useMounted(!!message, 200)
  if (!m) return null
  return (
    <FramePortal>{fixed => (
    <div
      role="status"
      style={{
        position: fixed ? 'fixed' : 'absolute',
        left: '50%',
        bottom,
        transform: `translate(-50%, ${shown ? 0 : 8}px)`,
        opacity: shown ? 1 : 0,
        transition: `transform 220ms ${EASE}, opacity 200ms ease`,
        zIndex: 50,
        background: 'rgb(43 31 23)',
        color: 'rgb(246 238 230)',
        padding: '10px 16px',
        borderRadius: 'var(--ds-r-row)',
        fontSize: 13,
        boxShadow: '0 8px 24px rgb(43 31 23 / .25)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        whiteSpace: 'nowrap',
        maxWidth: 'calc(100% - 40px)',
        lineHeight: 'normal',
      }}
    >
      <span style={{ color: 'var(--ds-accent)' }}>●</span>
      {message || last}
    </div>
    )}</FramePortal>
  )
}

/** A toast's state: `flash(words)` shows it for 2.2s. */
export function useFlash() {
  const [toast, setToast] = useState<string | null>(null)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(t)
  }, [toast])
  return [toast, (m: string) => setToast(m)] as const
}
