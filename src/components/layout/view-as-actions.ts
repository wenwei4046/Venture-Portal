'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { VIEW_AS_COOKIE, VIEW_AS_MIRROR_COOKIE, VIEW_AS_PERSON_COOKIE, VIEW_AS_PERSON_MARK, isViewAsRole, viewAsPersonId } from '@/lib/view-as'

// Switch the app-layer view to another role (or back to principal, which
// clears the cookie). Allowed to an account holding `view_switch` — Ultimate
// full access (2026-10-08; it was the Principal role) — read from the REAL
// account: current_permissions() answers for auth.uid(), never for the mask,
// and a masked session must still be allowed to switch back. Session cookie (no maxAge): the mask
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
  const { data: perms } = await supabase.rpc('current_permissions')
  if (!((perms as string[] | null) ?? []).includes('view_switch')) {
    redirect(row.role === 'revenue_member' ? '/member' : '/dashboard')
  }
  // Lead View (2026-10-16) is pages of its own, not a mask: the account's own view, opened on /leads.
  if (target !== 'principal' && target !== 'lead' && !isViewAsRole(target)) redirect('/dashboard')

  const store = await cookies()
  // Picking a view ends viewing as a person (2026-10-11).
  store.delete(VIEW_AS_PERSON_COOKIE)
  store.delete(VIEW_AS_PERSON_MARK)
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
  // The copy other tabs can read, so a portal tab still drawn in the old view
  // redraws when it is next looked at (useViewAsSync). Never read by the
  // server: the httpOnly cookie above is the only one that decides anything.
  store.set(VIEW_AS_MIRROR_COOKIE, isViewAsRole(target) ? target : 'principal', {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  })
  if (target === 'revenue_member') redirect('/member')
  if (target === 'lead') redirect('/leads')
  // Management links leave Revenue View without accepting arbitrary redirects.
  const destination = formData.get('destination')
  if (target === 'principal' && typeof destination === 'string' &&
    ['/member-admin', '/revenue', '/revenue/products'].includes(destination)) {
    redirect(destination)
  }
  redirect('/dashboard')
}

// ── View as a person (2026-10-11, the user: "can set a function is view as a
// user, same like in revenue app, i can view as a member") ────────────────────
// The portal drawn as one named account sees it, read-only for the whole
// browser while it is on (lib/supabase/read-only.ts). For an account that may
// switch views — the database asks again (view_as_person / view_as_people).

/** Somebody the portal may be viewed as. */
export interface ViewablePerson {
  id: string
  name: string
  email: string
  title: string | null
  department: string | null
}

/** Everybody who signs in to the portal, but the viewer — for the picker. */
export async function listViewablePeople(): Promise<{ ok: true; people: ViewablePerson[] } | { ok: false; reason: string }> {
  const supabase = await createClient()
  const { data, error } = await (supabase as unknown as { rpc: (fn: string) => PromiseLike<{ data: unknown; error: { message: string } | null }> })
    .rpc('view_as_people')
  if (error) return { ok: false, reason: error.message }
  return { ok: true, people: (Array.isArray(data) ? data : []) as ViewablePerson[] }
}

/** Start viewing as a person: the database checks the viewer may and the person is an active portal account. */
export async function setViewAsPerson(formData: FormData): Promise<{ ok: false; reason: string } | void> {
  const person = viewAsPersonId(String(formData.get('person') ?? ''))
  if (!person) return { ok: false, reason: 'Pick somebody to view as.' }
  const supabase = await createClient()
  const { error } = await (supabase as unknown as { rpc: (fn: string, args: object) => PromiseLike<{ error: { message: string } | null }> })
    .rpc('view_as_person', { p_user: person })
  if (error) return { ok: false, reason: error.message }
  const store = await cookies()
  store.set(VIEW_AS_PERSON_COOKIE, person, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  })
  // The readable mark beside it: the browser's own client reads only too.
  store.set(VIEW_AS_PERSON_MARK, '1', { httpOnly: false, sameSite: 'lax', path: '/', secure: process.env.NODE_ENV === 'production' })
  redirect('/dashboard')
}

/** Stop viewing as a person: back to the account's own portal. */
export async function stopViewingAsPerson(): Promise<void> {
  const store = await cookies()
  store.delete(VIEW_AS_PERSON_COOKIE)
  store.delete(VIEW_AS_PERSON_MARK)
  redirect('/dashboard')
}
