import type { ReactNode } from 'react'
import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = { title: 'HR · HOUZS Venture' }
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#f6f2ec' }

/**
 * The HR phone app (2026-10-11, HR revamp round 2 — README §17): its own
 * screen, no portal shell, the warm ground running to every edge. It is HR's
 * view of the ONE app on a phone (lib/one-app.ts — the user: "他们都是一个
 * app"), not an install of its own: the root layout's manifest, the root's
 * name. The page reads the account and the data; this only lays the ground.
 */
export default function HrAppLayout({ children }: { children: ReactNode }) {
  return <div style={{ minHeight: '100dvh', background: 'rgb(246 242 236)' }}>{children}</div>
}
