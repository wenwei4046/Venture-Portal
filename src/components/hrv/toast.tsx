'use client'

import { useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import s from './hrv.module.css'

// The prototype's toast (2026-10-10): one line, bottom-centre of the content
// frame, walnut with an orange dot, gone after 2.2 s; a new one replaces the
// old. Any client component calls `flash(message)` — after a Server Action
// answers, or for a step that needs no round trip — and the one host in the
// shell shows it.

type Listener = () => void
let current: { id: number; message: string } | null = null
let timer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<Listener>()

function emit() {
  for (const l of listeners) l()
}

/**
 * Show a message for 2.2 seconds (the prototype's `flash`) — or longer, for one that says something did not happen and
 * is read only once (a letter that was not filed, 2026-10-24).
 */
export function flash(message: string, ms = 2200) {
  if (timer) clearTimeout(timer)
  current = { id: (current?.id ?? 0) + 1, message }
  emit()
  timer = setTimeout(() => {
    current = null
    timer = null
    emit()
  }, ms)
}

/** How long a toast that says what did not happen stays (a letter not filed). */
export const FLASH_LONG = 8000

function subscribe(l: Listener) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

/** The toast on show (null between them) — for a host that draws it its own way (the Finance view's pill). */
export function useCurrentToast(): { id: number; message: string } | null {
  return useSyncExternalStore(subscribe, () => current, () => null)
}

/** Test-only: forget whatever is showing. */
export function resetToast() {
  if (timer) clearTimeout(timer)
  timer = null
  current = null
  emit()
}

/**
 * Where toasts appear. Inside HR's frame it is drawn there (absolute, like the
 * prototype's); anywhere else it is fixed to the bottom of the window.
 */
export function ToastHost({ fixed = false }: { fixed?: boolean }) {
  const toast = useSyncExternalStore(subscribe, () => current, () => null)
  if (!toast) return null
  const node = (
    <div role="status" aria-live="polite" className={`${s.toast}${fixed ? ` ${s.toastFixed}` : ''}`} key={toast.id}>
      <span className={s.toastDot} aria-hidden="true">●</span>
      {toast.message}
    </div>
  )
  return fixed && typeof document !== 'undefined' ? createPortal(node, document.body) : node
}
