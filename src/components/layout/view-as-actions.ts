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
  const target = ((formData.get('role') as string) ?? '').trim()

  const supabase = await createClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: row } = await supabase
    .from('users')
    .select('role')
    .eq('id', authUser.id)
    .single()
  if (row?.role !== 'principal') redirect('/dashboard')

  const store = await cookies()
  if (isViewAsRole(target)) {
    store.set(VIEW_AS_COOKIE, target, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    })
  } else {
    store.delete(VIEW_AS_COOKIE)
  }
  redirect('/dashboard')
}
