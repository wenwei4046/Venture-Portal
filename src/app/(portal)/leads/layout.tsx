import type { ReactNode } from 'react'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { isPhone } from '@/lib/one-app'

/**
 * Lead View's pages are the computer's (2026-11-28 — the Claude Design handoff `docs/design_handoff_lead_view_phone`):
 * on a phone, Lead View is its own phone face, `/lead-app` (lib/one-app.ts), as HR's view is the HR app and Finance's
 * the Finance app. A tablet keeps these pages.
 */
export default async function LeadsLayout({ children }: { children: ReactNode }) {
  if (isPhone((await headers()).get('user-agent'))) redirect('/lead-app')
  return children
}
