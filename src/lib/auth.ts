import { cache } from 'react'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { User, UserRole } from '@/types'
import { VIEW_AS_COOKIE, honouredViewAs, type ViewSurface } from '@/lib/view-as'
import { can, type Permission } from '@/lib/permissions'
import { canSeePayrollPayouts } from '@/lib/roles'

// Per-request dedup. Middleware, layout, and Server Actions all converge
// on getUser(); wrapping with React.cache() collapses the Supabase calls
// (JWT verification + users row + permissions) into one set per HTTP request.
// Keyed by surface, so a request reads the caller once for the surface it is
// answered on (the two never meet in one request).
const loadUser = cache(async (surface: ViewSurface): Promise<User | null> => {
  const supabase = await createClient()
  // Who is calling, from the JWT's own claims. `getClaims()` verifies the
  // token's signature locally against the project's cached public keys (the
  // tokens are ES256, asymmetric) where `getUser()` asked the auth server on
  // every request — three times per Server Action: the middleware, the action
  // and its render (2026-09-11). Everything about the PERSON is still read
  // fresh below, so a deactivated account or a changed title takes effect on
  // the next request exactly as before.
  const { data: verified } = await supabase.auth.getClaims()
  const authUserId = verified?.claims.sub
  if (!authUserId) return null

  // View-as mask (unified portal 2026-07-16): a Principal may flip the
  // app-layer role via the TopBar switcher. Every gate and role-driven UI
  // follows the masked role. auth.uid() (RLS, audit authorship) stays the
  // Principal — which is why the masked permissions have to be looked up here
  // rather than taken from current_permissions(), whose answer is about the
  // real account. The cookie is read first so that lookup shares the round
  // trip below instead of being a third one behind it (2026-09-11); it is
  // honoured only for an account that holds `view_switch` (Ultimate full
  // access, 2026-10-08 — it was the Principal role) — and the Revenue View
  // only in the member app (lib/view-as.ts, 2026-09-27).
  const viewAs = honouredViewAs((await cookies()).get(VIEW_AS_COOKIE)?.value, surface)

  const [{ data }, { data: perms }, masked] = await Promise.all([
    supabase.from('users').select('*').eq('id', authUserId).single(),
    // Resolved in the database because that is where the answer lives: an
    // explicit per-person row, then the holder's title, then their role's
    // defaults. RLS derives its scopes from the same set, so the page and its
    // queries cannot disagree.
    supabase.rpc('current_permissions'),
    viewAs
      ? supabase.from('role_default_permissions').select('permission_key').eq('role', viewAs)
      : null,
  ])

  const row = data as (Omit<User, 'permissions'> | null)
  if (!row || !row.is_active) return null

  const user: User = { ...row, permissions: (perms as string[] | null) ?? [] }
  // Switching views is its own permission since 2026-10-08: Ultimate full
  // access has it, Full access is everything else without it. Read off the
  // REAL account's keys — a masked session keeps it, so it can switch back.
  const canSwitchView = user.permissions.includes('view_switch')

  if (canSwitchView && viewAs && masked) {
    return {
      ...user,
      role: viewAs,
      actualRole: user.role,
      canSwitchView,
      permissions: (masked.data ?? []).map(r => (r as { permission_key: string }).permission_key),
    }
  }

  return { ...user, canSwitchView }
})

/** The caller, anywhere but the member app: the portal, `/`, print pages. */
export function getUser(): Promise<User | null> {
  return loadUser('portal')
}

/**
 * The caller as the member app sees them — the one surface where a Principal's
 * Revenue View applies. Everything under `(member)` and `lib/member` asks here.
 */
export function getMemberUser(): Promise<User | null> {
  return loadUser('member')
}

/**
 * The account as it is — no view mask, whatever the portal was left in. Only
 * the Product List asks (lib/member/product-access.ts): the Revenue app shows a
 * Principal as the Principal in every view, so an HR or Finance view left on in
 * the portal must not quietly take the Product List away there (2026-10-08).
 */
export function getAccountUser(): Promise<User | null> {
  return loadUser('account')
}

export async function requireAuth(): Promise<User> {
  const user = await getUser()
  if (!user) {
    redirect('/login')
  }
  return user
}

/**
 * The gate every page and Server Action stands behind.
 *
 * Several keys means OR — a few surfaces are legitimately reachable from two
 * directions (the payroll bank-transfer file belongs to whoever runs payroll
 * and to whoever pays it out).
 *
 * Redirects rather than throws, so somebody who has simply lost a permission
 * lands on the dashboard instead of an error page.
 */
export async function requirePermission(...keys: Permission[]): Promise<User> {
  const user = await requireAuth()
  if (!can(user, ...keys)) {
    redirect('/dashboard')
  }
  return user
}

/**
 * requirePermission, for a surface that is about what one named person is
 * paid: Payroll Requests, the payroll bank file, the Invoice Pool. Treasury
 * reaches those only with Payroll payouts on top (2026-10-02 — see
 * canSeePayrollPayouts in lib/roles.ts).
 */
export async function requirePayrollPayouts(...keys: Permission[]): Promise<User> {
  const user = await requirePermission(...keys)
  if (!canSeePayrollPayouts(user)) {
    redirect('/dashboard')
  }
  return user
}

/**
 * The old role gate. Still here for the dept_manager row policies no scope can
 * express — see the policies_on_permissions migration. Everything else moved
 * to requirePermission.
 */
export async function requireRole(roles: UserRole[]): Promise<User> {
  const user = await requireAuth()
  if (!roles.includes(user.role)) {
    redirect('/dashboard')
  }
  return user
}
