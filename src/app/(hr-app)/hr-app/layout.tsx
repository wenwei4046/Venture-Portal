import type { ReactNode } from 'react'
import type { Metadata, Viewport } from 'next'
import HrAppManifest from '@/components/hr-app/HrAppManifest'

export const metadata: Metadata = { title: 'HR · HOUZS Venture', appleWebApp: { capable: true, title: 'HR' } }
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#f6f2ec' }

/**
 * The HR phone app (2026-10-11, HR revamp round 2 — README §17): its own
 * screen, no portal shell, the warm ground running to every edge, and its
 * own install (`HrAppManifest`). The page reads the account and the data;
 * this only lays the ground.
 */
export default function HrAppLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: '100dvh', background: 'rgb(246 242 236)' }}>
      <HrAppManifest />
      {children}
    </div>
  )
}
