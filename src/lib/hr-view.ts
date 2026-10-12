// HR's view (2026-10-10, the HR revamp handoff — `.design/hr-revamp`): the
// portal as HR reads it — the hr role, and the Principal viewing as HR — gets
// the revamped shell: a square, full-height sidebar of icon tiles in six
// sections (Hiring, HR & Payroll, Revenue, People, Admin, Directors), the white
// greeting bar, the 243 ground and the sheet that scrolls inside its frame.
// Every other view keeps the shell it had (user: the design is HR's view).

import type { UserRole } from '@/types'

export function isHrView(role: UserRole | string | null | undefined): boolean {
  return role === 'hr'
}

/** `collapsed` while HR's sidebar is folded to its 64px rail (the H tile toggles it). */
export const HR_NAV_COOKIE = 'vp-hr-nav'

/**
 * The Revenue sub-department last opened (its slug). The sidebar's Comm Cal /
 * Sales Groups / Rules open it — the sub-department switcher on those pages
 * is the only place it is chosen since the Fair | IR tree left the sidebar.
 */
export const REVENUE_SUB_COOKIE = 'vp-rev-sub'

/** Writes a one-year, site-wide cookie from the browser. */
export function writeCookie(name: string, value: string | null) {
  if (typeof document === 'undefined') return
  document.cookie = value === null
    ? `${name}=; Path=/; Max-Age=0; SameSite=Lax`
    : `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax`
}
