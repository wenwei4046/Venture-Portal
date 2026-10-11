import type { UserRole } from '@/types'

// View-as mask (unified portal 2026-07-16). A Principal account can flip the
// whole app-layer experience to another role from the TopBar switcher; the
// auth identity (auth.uid, RLS, audit authorship) stays the Principal. Pure
// module — safe to import from client, server, and tests alike.
export const VIEW_AS_COOKIE = 'vp-view-as'

/**
 * View as a PERSON (2026-10-11): the account id somebody who may switch views
 * is seeing the portal as — read-only for the whole browser while it is set
 * (lib/supabase/read-only.ts). httpOnly; a session cookie.
 */
export const VIEW_AS_PERSON_COOKIE = 'vp-view-as-person'

/** Its readable mark, so the BROWSER client reads only too (lib/supabase/client.ts). Trusted for nothing else. */
export const VIEW_AS_PERSON_MARK = 'vp-viewing-as'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The person a cookie names, or null. */
export function viewAsPersonId(value: string | null | undefined): string | null {
  return value && UUID.test(value) ? value : null
}

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

export type MaskableUser = { role: UserRole; actualRole?: UserRole; viewingAs?: { id: string; name: string } }

// The switcher shows for the Principal account whether or not it is currently
// masked (a masked session must always be able to switch back).
export function isPrincipalAccount(user: MaskableUser): boolean {
  return user.role === 'principal' || user.actualRole === 'principal'
}

export function isMasked(user: MaskableUser): boolean {
  return !!user.actualRole && user.actualRole !== user.role
}

// ── HR's and Finance's views are LENSES (2026-10-11) ─────────────────────────
// The user: "switch view is still can be edit, full access means = ultimate
// access". Switching to HR's or Finance's view changes the shell, the sidebar
// and the Overview — never what the account may do (lib/auth.ts keeps its own
// keys, actions, tabs and sensitive fields). Seeing the portal exactly as
// somebody else does is View as a person, read-only.

export type LensView = 'hr' | 'finance'

/** The view a lens draws, when the account switched to HR's or Finance's — null in its own. */
export function lensView(user: MaskableUser): LensView | null {
  // Viewing as a person draws THEIR portal, not a lens over one.
  if (user.viewingAs) return null
  return isMasked(user) && (user.role === 'hr' || user.role === 'finance') ? user.role : null
}

const LENS_TABS: Readonly<Record<LensView, string>> = { hr: 'hr.', finance: 'fin.' }

/**
 * The account as a lens's sidebar reads it: only that view's tabs (the user's
 * point 5 — the sidebar is the view's View-ticked tabs), so Finance's view
 * lists Finance's pages although the account opens every page. Pages are not
 * narrowed: a link from elsewhere still opens what the account may open.
 */
export function lensNav<T extends MaskableUser & { tabs?: string[] }>(user: T): T {
  const view = lensView(user)
  if (!view) return user
  return { ...user, tabs: (user.tabs ?? []).filter(t => t.startsWith(LENS_TABS[view])) }
}

/** The Overview a lens opens on — HR's, or the treasury's for Finance — null in the account's own view. */
export function lensOverview(user: MaskableUser): 'hr' | 'treasury' | null {
  const view = lensView(user)
  return view === 'hr' ? 'hr' : view === 'finance' ? 'treasury' : null
}
