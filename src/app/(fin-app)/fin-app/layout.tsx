import type { ReactNode } from 'react'
import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/auth'
import { opensFinApp } from '@/lib/one-app'
import { finAppRows } from '@/lib/fin-app/server'
import FinAppFrame from '@/components/fin-app/FinAppFrame'

export const metadata: Metadata = { title: 'Finance · HOUZS Venture' }
// The head and the bars are the sidebar's off-white (--hvs-nav): the phone's status bar takes it too.
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#f8f5f0' }

/**
 * The Finance phone app (2026-10-15, the Finance revamp v2's phone — README §1
 * of `.design/fin-r2/handoff`, `Finance Mobile App.dc.html`, M01–M18): Finance's
 * view of the ONE app on a phone (lib/one-app.ts), not an install of its own.
 * No portal shell — its own frame, fixed to the screen, the five tabs at its
 * foot. Signed out, the sign-in returns here. Each screen asks the portal page
 * it stands for, as that page would (`requirePage`, its own gate).
 */
export default async function FinAppLayout({ children }: { children: ReactNode }) {
  const user = await getUser()
  if (!user) redirect('/login?next=/fin-app')
  if (!opensFinApp(user)) redirect('/dashboard')
  const ua = (await headers()).get('user-agent') ?? ''
  const platform = /iPhone|iPad|iPod/i.test(ua) ? 'ios' : 'android'
  return (
    <FinAppFrame platform={platform} rows={finAppRows(user)}>
      {children}
    </FinAppFrame>
  )
}
