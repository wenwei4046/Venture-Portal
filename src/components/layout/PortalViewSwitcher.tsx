'use client'

import type { UserRole } from '@/types'
import ViewSwitch from './ViewSwitch'

/**
 * The view switch on the portal's own bar (TopBar — the phone's, and the computer's for an account drawn in no view's
 * shell): ViewSwitch, the Principal's (2026-10-27 — every row of lib/view-switch.ts, the soft dropdown's menu), in this
 * bar's field — 44px to tap, its dot green in the Principal's own view and amber in any other.
 * Visibility is decided by trusted parent data; the action verifies the real account.
 */
export default function PortalViewSwitcher({ value, viewingAs, className = '' }: {
  value: UserRole
  /** Whose portal is drawn, while a person is viewed (2026-10-11). */
  viewingAs?: string
  className?: string
}) {
  return (
    <ViewSwitch
      value={value}
      viewingAs={viewingAs}
      className={`inline-flex min-w-0 max-w-full items-center gap-1.5 ${className}`}
      dotClassName={`w-[5px] h-[5px] shrink-0 rounded-full ${value === 'principal' && !viewingAs ? 'bg-ledger' : 'bg-alert'}`}
      selectClassName="min-h-[44px] max-w-full bg-transparent font-sans font-normal text-[13.5px] text-graphite hover:text-accent cursor-pointer rounded-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60"
    />
  )
}
