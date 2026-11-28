import type { ReactNode } from 'react'
import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = { title: 'Marketing · HOUZS Venture' }
// The Tasks tab's ground (--mk-app): the phone's status bar opens in it, then each screen paints its own (useStatusBar).
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#f3f3f1' }

/**
 * The Marketing phone app (2026-11-28 — the Claude Design handoff "Marketing View 电话版设计"): Marketing's view of the
 * ONE app on a phone (lib/one-app.ts), not an install of its own — the root layout's manifest, the root's name. No
 * portal shell: its own frame, the ground fixed to the screen as the frame is (pwa.md › A PHONE APP'S FRAME IS FIXED TO
 * THE SCREEN), in Marketing's tokens (`.mkt-shell`, globals.css). The page reads the account and the data.
 */
export default function MktAppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mkt-shell" style={{ position: 'fixed', inset: 0, background: 'rgb(var(--mk-app))' }}>
      {children}
    </div>
  )
}
