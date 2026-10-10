'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// The handoff's toast (2026-10-10): one short line at the foot of the screen
// that goes away by itself after 2.4 s — Daily Bank's "Image copied", where an
// alert() box used to stop the page. Drawn on <body>, so no transformed
// ancestor re-bases its `fixed`.

export function useToast(ms = 2400): { say: (message: string) => void; toast: ReactNode } {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const say = useCallback(
    (next: string) => {
      if (timer.current) clearTimeout(timer.current)
      setMessage(next)
      timer.current = setTimeout(() => setMessage(null), ms)
    },
    [ms],
  )

  const toast =
    message && typeof document !== 'undefined'
      ? createPortal(
          <div role="status" aria-live="polite" className="fund-toast">
            {message}
          </div>,
          document.body,
        )
      : null

  return { say, toast }
}
