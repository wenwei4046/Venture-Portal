'use client'

import { useEffect } from 'react'

/**
 * The HR phone app installs as an app of its own (2026-10-11, the user: "/hr-app,
 * installable like the Revenue app"): while it is on screen the head's manifest
 * link — the portal's, put there by hand in the root layout — points at
 * `/hr-app.webmanifest` (start_url and scope `/hr-app`), so "Add to Home
 * Screen" / Install opens the HR app, not the portal. Put back on the way out.
 */
export default function HrAppManifest() {
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    if (!link) return
    const before = link.getAttribute('href')
    link.setAttribute('href', '/hr-app.webmanifest')
    return () => {
      if (before) link.setAttribute('href', before)
    }
  }, [])
  return null
}
