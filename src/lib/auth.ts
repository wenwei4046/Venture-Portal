import { cache } from 'react'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { User, UserRole } from '@/types'
import { VIEW_AS_COOKIE, isViewAsRole } from '@/lib/view-as'

// Per-request dedup. Middleware, layout, and Server Actions all converge
// on getUser(); wrapping with React.cache() collapses the 2 Supabase calls
// (auth.getUser + users row) into one set per HTTP request.
export const getUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) return null

  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .single()

  const user = data as User | null

  // View-as mask (unified portal 2026-07-16): a Principal may flip the
  // app-layer role via the TopBar switcher. Every requireRole gate and
  // role-driven UI follows the masked role — including requireRole(['principal'])
  // failing while masked, so the simulation is faithful. auth.uid() (RLS,
  // audit authorship) stays the Principal.
  if (user?.role === 'principal') {
    const viewAs = (await cookies()).get(VIEW_AS_COOKIE)?.value ?? ''
    if (isViewAsRole(viewAs)) {
      return { ...user, role: viewAs, actualRole: 'principal' }
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

export async function requireRole(roles: UserRole[]): Promise<User> {
  const user = await requireAuth()
  if (!roles.includes(user.role)) {
    redirect('/dashboard')
  }
  return user
}
