'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useCurrentToast } from '@/components/hrv/toast'
import s from './finv.module.css'

// The Finance view's toast (2026-10-14, the Finance revamp v2 — README ›
// Motion: "walnut pill, ● accent dot; translateY(16px→0) .28s + fade .2s;
// holds 2.2s", the desktop's 12px): the same `flash()` every page calls, drawn
// as the design's pill at the window's foot, and played out as well as in.

const EXIT_MS = 280

export function FinToastHost() {
  const toast = useCurrentToast()
  // The last message stays on screen while it plays out.
  const [shown, setShown] = useState<{ id: number; message: string } | null>(null)
  const [visible, setVisible] = useState(false)
  const exit = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (exit.current) {
      clearTimeout(exit.current)
      exit.current = null
    }
    if (toast) {
      setShown(toast)
      setVisible(false)
      const frame = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
      return () => cancelAnimationFrame(frame)
    }
    setVisible(false)
    exit.current = setTimeout(() => setShown(null), EXIT_MS)
    return () => {
      if (exit.current) clearTimeout(exit.current)
    }
  }, [toast])

  if (!shown || typeof document === 'undefined') return null
  return createPortal(
    <div role="status" aria-live="polite" className={s.toast} data-shown={visible ? 'true' : 'false'} key={shown.id}>
      <span className={s.toastDot} aria-hidden="true">●</span>
      <span className={s.toastText}>{shown.message}</span>
    </div>,
    document.body,
  )
}
