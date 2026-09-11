'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { VIEW_AS_COOKIE, isViewAsRole } from '@/lib/view-as'

// Switch the Principal's app-layer view to another role (or back to
// principal, which clears the cookie). Reads the REAL role straight from the
// users row — getUser() reports the masked role, and a masked session must
// still be allowed to switch back. Session cookie (no maxAge): the mask
// resets when the browser closes.
export async function setViewAs(formData: FormData) {
  const role = formData.get('role')
  const target = typeof role === 'string' ? role.trim() : ''

  const supabase = await createClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: row } = await supabase
    .from('users')
    .select('role, is_active')
    .eq('id', authUser.id)
    .single()
  if (!row?.is_active) redirect('/login')
  if (row.role !== 'principal') redirect(row.role === 'revenue_member' ? '/member' : '/dashboard')
  if (target !== 'principal' && !isViewAsRole(target)) redirect('/dashboard')

  const store = await cookies()
  if (isViewAsRole(target)) {
    store.set(VIEW_AS_COOKIE, target, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
    })
  } else {
    store.delete(VIEW_AS_COOKIE)
  }
  if (target === 'revenue_member') redirect('/member')
  // Management links leave Revenue View without accepting arbitrary redirects.
  const destination = formData.get('destination')
  if (target === 'principal' && typeof destination === 'string' &&
    ['/member-admin', '/revenue', '/revenue/products'].includes(destination)) {
    redirect(destination)
  }
  redirect('/dashboard')
}
