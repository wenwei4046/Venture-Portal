'use client'

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useProductDraftState } from './ProductWorkspace'
import c from './products.module.css'

/**
 * A window floating over the Product List (the prototype's model window and
 * Add combo window): the list dims behind it and takes no input, a click on the
 * dim or Esc asks to close (`onDismiss` — the window's own guard decides), and
 * focus goes into it and back to where it was.
 *
 * The model window is ALWAYS there, open or not (`layer="model"`), as in the
 * prototype: it fades and rises in (opacity 220ms, translateY(14px) scale(.98)
 * → none over 260ms) and sinks back out when it closes. The new-combo window
 * (`layer="combo"`) sits above it and simply appears, as the prototype draws it.
 */
export default function FloatingWindow({ open, layer, labelledBy, onDismiss, children }: {
  open: boolean
  layer: 'model' | 'combo'
  labelledBy?: string
  onDismiss: () => void
  children: ReactNode
}) {
  const { overlayHost, setOverlayOpen } = useProductDraftState()
  const win = useRef<HTMLElement>(null)

  // The list behind takes no input while a window is open; focus moves in and comes back.
  useEffect(() => {
    if (!open) return
    setOverlayOpen(true)
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    win.current?.focus({ preventScroll: true })
    return () => {
      setOverlayOpen(false)
      // After the list stops being inert, or the focus would not land.
      requestAnimationFrame(() => { if (previous?.isConnected) previous.focus({ preventScroll: true }) })
    }
  }, [open, setOverlayOpen])

  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== 'Escape' || !open) return
    e.stopPropagation()
    onDismiss()
  }

  const frame = (
    <div className={c.overlay} data-open={open || undefined} data-layer={layer} onKeyDown={onKeyDown} aria-hidden={open ? undefined : true}>
      <div className={c.backdrop} onClick={() => { if (open) onDismiss() }} />
      <aside ref={win} className={c.win} role={open ? 'dialog' : undefined} aria-modal={open || undefined} aria-labelledby={open ? labelledBy : undefined} tabIndex={-1}>
        {children}
      </aside>
    </div>
  )
  return overlayHost ? createPortal(frame, overlayHost) : frame
}
