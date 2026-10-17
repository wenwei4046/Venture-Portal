import type { ReactNode } from 'react'
import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = { title: 'HR · HOUZS Venture' }
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#f7f4f0' }

/**
 * The HR phone app (2026-10-11, HR revamp round 2 — README §17): its own
 * screen, no portal shell, the warm ground running to every edge. It is HR's
 * view of the ONE app on a phone (lib/one-app.ts — the user: "他们都是一个
 * app"), not an install of its own: the root layout's manifest, the root's
 * name. The page reads the account and the data; this only lays the ground.
 *
 * The ground is fixed to the screen, as the app's frame is (2026-10-12): a
 * `min-height: 100dvh` here made the page a navigation bar taller than an
 * Android phone shows in the installed app, and the tab bar opened under the
 * phone's own buttons (hr-app.module.css › `.app`).
 */
export default function HrAppLayout({ children }: { children: ReactNode }) {
  // HR Mobile (2026-10-17): the app's column (430px at most, components/hr-app) on a white page, as the handoff draws it.
  return <div style={{ position: 'fixed', inset: 0, background: 'rgb(255 255 255)' }}>{children}</div>
}
