import type { UserRole } from '@/types'

// View-as mask (unified portal 2026-07-16). A Principal account can flip the
// whole app-layer experience to another role from the TopBar switcher; the
// auth identity (auth.uid, RLS, audit authorship) stays the Principal. Pure
// module — safe to import from client, server, and tests alike.
export const VIEW_AS_COOKIE = 'vp-view-as'

// dept_manager is excluded: their pages key off user.department_id, which a
// Principal account doesn't have.
export const VIEW_AS_ROLES = ['hr', 'finance', 'revenue_member'] as const
export type ViewAsRole = (typeof VIEW_AS_ROLES)[number]

export function isViewAsRole(value: string): value is ViewAsRole {
  return (VIEW_AS_ROLES as readonly string[]).includes(value)
}

export type MaskableUser = { role: UserRole; actualRole?: UserRole }

// The switcher shows for the Principal account whether or not it is currently
// masked (a masked session must always be able to switch back).
export function isPrincipalAccount(user: MaskableUser): boolean {
  return user.role === 'principal' || user.actualRole === 'principal'
}

export function isMasked(user: MaskableUser): boolean {
  return !!user.actualRole && user.actualRole !== user.role
}
