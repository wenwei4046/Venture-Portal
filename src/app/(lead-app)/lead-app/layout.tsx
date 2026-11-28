import type { ReactNode } from 'react'
import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = { title: 'Lead View · HOUZS Venture' }
// The keyboard shrinks the page on Android (the reply box stays above it), as a chat app's does.
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#ffffff', interactiveWidget: 'resizes-content' }

/**
 * Lead View on a phone (2026-11-28, the Claude Design handoff `docs/design_handoff_lead_view_phone`): Lead View's face
 * of the ONE app (lib/one-app.ts), not an install of its own — no portal shell, the white ground fixed to the screen
 * (pwa.md › A PHONE APP'S FRAME IS FIXED TO THE SCREEN). The page reads the account and the data.
 */
export default function LeadAppLayout({ children }: { children: ReactNode }) {
  return <div style={{ position: 'fixed', inset: 0, background: 'rgb(255 255 255)' }}>{children}</div>
}
