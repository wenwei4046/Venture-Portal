import { cache } from 'react'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { User, UserRole } from '@/types'
import { VIEW_AS_COOKIE, isViewAsRole } from '@/lib/view-as'
import { can, type Permission } from '@/lib/permissions'

// Per-request dedup. Middleware, layout, and Server Actions all converge
// on getUser(); wrapping with React.cache() collapses the Supabase calls
// (auth.getUser + users row + permissions) into one set per HTTP request.
export const getUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) return null

  const [{ data }, { data: perms }] = await Promise.all([
    supabase.from('users').select('*').eq('id', authUser.id).single(),
    // Resolved in the database because that is where the answer lives: an
    // explicit per-person row, then the holder's title, then their role's
    // defaults. RLS derives its scopes from the same set, so the page and its
    // queries cannot disagree.
    supabase.rpc('current_permissions'),
  ])

  const row = data as (Omit<User, 'permissions'> | null)
  if (!row) return null

  const user: User = { ...row, permissions: (perms as string[] | null) ?? [] }

  // View-as mask (unified portal 2026-07-16): a Principal may flip the
  // app-layer role via the TopBar switcher. Every gate and role-driven UI
  // follows the masked role. auth.uid() (RLS, audit authorship) stays the
  // Principal — which is why the masked permissions have to be looked up here
  // rather than taken from current_permissions(), whose answer is about the
  // real account.
  if (user.role === 'principal') {
    const viewAs = (await cookies()).get(VIEW_AS_COOKIE)?.value ?? ''
    if (isViewAsRole(viewAs)) {
      const { data: masked } = await supabase
        .from('role_default_permissions')
        .select('permission_key')
        .eq('role', viewAs)
      return {
        ...user,
        role: viewAs,
        actualRole: 'principal',
        permissions: (masked ?? []).map(r => (r as { permission_key: string }).permission_key),
      }
    }
  }

  return user
})

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
