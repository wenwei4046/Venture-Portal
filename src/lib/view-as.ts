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

// ONE COOKIE, EVERY TAB (2026-09-27). The mask is a cookie, so switching one
// tab switches the whole browser — while every other open tab still shows the
// shell it was drawn with. A Principal with the member app in one tab (Revenue
// View) and the Product List in another clicked Costing gaps and landed on
// Overview: the tab said Principal, the server judged the click as a
// salesperson, `requirePermission('product_list')` failed and redirected.
//
// So the Revenue View belongs to the member app, where it is drawn: the member
// app reads the caller with `getMemberUser()`, which honours it, and every
// other surface with `getUser()`, which does not. The portal is always the
// Principal's own, or HR's / Finance's when that is the view — and a portal
// tab follows those when another tab switches (`VIEW_AS_MIRROR_COOKIE`,
// `useViewAsSync`).

/**
 * Where a request is being answered: the member app, or anywhere else — or
 * `account`, the account as it is with no mask at all, asked only by the one
 * tool the Principal keeps in every view: the Product List (2026-10-08).
 */
export type ViewSurface = 'portal' | 'member' | 'account'

/** The mask a request on `surface` honours — null when it honours none. */
export function honouredViewAs(value: string | null | undefined, surface: ViewSurface): ViewAsRole | null {
  if (!value || !isViewAsRole(value) || surface === 'account') return null
  if (value === 'revenue_member' && surface !== 'member') return null
  return value
}

/**
 * A readable copy of the view (never read by the server, never trusted): the
 * mask cookie is httpOnly, so this is how a tab learns that ANOTHER tab
 * switched the view. Written as `principal` when switching back rather than
 * deleted, so "switched back" and "never switched" read differently.
 */
export const VIEW_AS_MIRROR_COOKIE = 'vp-view'

export type PortalView = 'principal' | 'hr' | 'finance'

/** Which view a portal page is drawn in for this cookie value. */
export function portalView(value: string | null | undefined): PortalView {
  return value === 'hr' || value === 'finance' ? value : 'principal'
}

/**
 * Whether a portal tab drawn as `rendered` must redraw, given the mirror
 * cookie now. No mirror = nobody switched since sign-in (or the session is
 * older than the mirror), so there is nothing to follow.
 */
export function viewAsChanged(mirror: string | null | undefined, rendered: UserRole): boolean {
  if (mirror == null || mirror === '') return false
  return portalView(mirror) !== rendered
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
