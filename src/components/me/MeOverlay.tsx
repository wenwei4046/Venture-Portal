'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { MeApp } from './MeApp'
import type { MeHandle } from './useMe'

/**
 * Me on a phone (2026-10-17): the whole screen over the app it opened from — the HR app's avatar, the Finance app's
 * Profile — pushed in as the HR app's sub screens are (28px from the right and a fade, .26s on the house curve) and
 * back out the same way.
 */
export function MeOverlay({ me, open, onClose, backLabel, startPunch, accountRows }: {
  me: MeHandle
  open: boolean
  onClose: () => void
  backLabel: string
  startPunch?: 'in' | 'out' | null
  accountRows?: ReactNode
}) {
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (open) {
      setMounted(true)
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
      return () => cancelAnimationFrame(r)
    }
    setShown(false)
    const t = setTimeout(() => setMounted(false), 260)
    return () => clearTimeout(t)
  }, [open])
  if (!mounted || typeof document === 'undefined') return null
  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 80, background: 'rgb(255 255 255)', transform: shown ? 'none' : 'translateX(28px)', opacity: shown ? 1 : 0,
      transition: 'transform .26s cubic-bezier(.2,.8,.2,1), opacity .26s cubic-bezier(.2,.8,.2,1)',
    }}>
      <div style={{ height: '100%', maxWidth: 560, margin: '0 auto' }}>
        <MeApp me={me} mode="phone" hostLabel="" backLabel={backLabel} onClose={onClose} source="app" startPunch={startPunch} accountRows={accountRows} />
      </div>
    </div>,
    document.body,
  )
}
