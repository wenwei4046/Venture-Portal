'use client'

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { installPath, type InstallPath } from '@/lib/pwa/install'

/**
 * Chrome fires `beforeinstallprompt` ONCE, early — usually before the login
 * form or the member Profile has mounted. `PwaRegister` (root layout) catches
 * it and parks it here; any install button reads it back through
 * `useInstallApp`.
 */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let held: BeforeInstallPromptEvent | null = null
let installed = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function holdInstallPrompt(event: Event) {
  // Stop Chrome's own mini-infobar; our button asks instead.
  event.preventDefault()
  held = event as BeforeInstallPromptEvent
  emit()
}

export function markInstalled() {
  held = null
  installed = true
  emit()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const snapshot = () => (installed ? 'installed' : held ? 'held' : 'none')

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/**
 * `path` is null on the server and on the first client render (the user agent
 * is only known in the browser), so nothing flashes before hydration.
 */
export function useInstallApp(): {
  path: InstallPath | null
  install: () => Promise<'accepted' | 'dismissed' | 'unavailable'>
} {
  const state = useSyncExternalStore(subscribe, snapshot, () => 'none')
  const [path, setPath] = useState<InstallPath | null>(null)

  useEffect(() => {
    setPath(
      installPath({
        userAgent: navigator.userAgent,
        maxTouchPoints: navigator.maxTouchPoints ?? 0,
        standalone: state === 'installed' || isStandalone(),
        hasPrompt: state === 'held',
      }),
    )
  }, [state])

  const install = useCallback(async () => {
    const event = held
    if (!event) return 'unavailable' as const
    await event.prompt()
    const { outcome } = await event.userChoice
    // A prompt can be shown once; Chrome fires a fresh event if it may ask again.
    held = null
    if (outcome === 'accepted') markInstalled()
    else emit()
    return outcome
  }, [])

  return { path, install }
}
