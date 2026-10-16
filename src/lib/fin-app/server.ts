import 'server-only'

import { finNavSections } from '@/components/layout/fin-nav'
import { visibleHrNav, type HrNavSection } from '@/components/layout/hr-nav'
import { emptyNavData, readsDeptStatements, type NavData } from '@/components/layout/nav-config'
import { primedRegistryRows } from '@/lib/dept-registry'
import { statementDepts } from '@/lib/dept-statements'
import { isPrincipalView } from '@/lib/finance-view'
import type { User } from '@/types'

// What the Finance phone app shows a reader (2026-10-15, the Finance revamp
// v2's phone): the sidebar's own sections and rows (fin-nav.ts — each row's
// `visible` and its page's tabs), so the app opens exactly the pages the
// computer's sidebar would. Dept Pool's departments come from the registry the
// request has primed (signing in builds the server client), as the portal
// layout's.

export function finAppSections(user: User): Array<HrNavSection & { roman: string | null }> {
  const data: NavData = readsDeptStatements(user) ? { ...emptyNavData, deptPoolDepts: statementDepts(primedRegistryRows()) } : emptyNavData
  return visibleHrNav(finNavSections(data), user)
}

/** The sidebar rows this reader sees (fin-nav keys). */
export function finAppRows(user: User): string[] {
  return finAppSections(user).flatMap((sec) => sec.items.map((i) => i.key))
}

/**
 * The Approvals tab (2026-10-17 — the Principal's own view on a phone: "the same view with finance app …
 * just add on then tab for approval tab"): the Principal's own view, where its sidebar would show Approvals
 * (the queue's own gate and its page's tabs — the row's `visible`).
 */
export function hasApprovalsTab(user: User): boolean {
  return isPrincipalView(user) && finAppRows(user).includes('approvals')
}
