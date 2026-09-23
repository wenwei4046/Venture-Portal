'use client'

import { useEffect } from 'react'
import { holdInstallPrompt, markInstalled } from './install-store'

/**
 * Mounted once in the root layout. Registers `/sw.js` (production only — a
 * service worker in `next dev` fights hot reload) and parks the browser's
 * install prompt for whichever install button asks for it.
 */
export default function PwaRegister() {
  useEffect(() => {
    window.addEventListener('beforeinstallprompt', holdInstallPrompt)
    window.addEventListener('appinstalled', markInstalled)

    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // No service worker only means no offline page; the portal still works.
      })
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', holdInstallPrompt)
      window.removeEventListener('appinstalled', markInstalled)
    }
  }, [])

  return null
}
