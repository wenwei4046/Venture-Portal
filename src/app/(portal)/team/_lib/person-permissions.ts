import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { PersonPermissionRow } from '../_components/PersonPermissions'

/**
 * What one account's permissions actually resolve to, and why.
 *
 * Lifted out of /team/people/[id] on 2026-09-01 when the person card started
 * showing the same thing in a floating window. Two copies of this would drift,
 * and the answer it gives is the one an audit reads — the title's list if it
 * has one, otherwise the defaults for the role the account was created with,
 * and then any exception filed against the person on top.
 */
export async function resolvePersonPermissions(
  supabase: SupabaseClient<Database>,
  account: { id: string; role: string },
  title: { id: string | null; name: string | null },
): Promise<{ rows: PersonPermissionRow[]; source: string }> {
  const [{ data: defs }, { data: titleGrants }, { data: roleGrants }, { data: overrides }] =
    await Promise.all([
      supabase.from('permission_defs').select('key, label, section').order('sort_order'),
      title.id
        ? supabase.from('title_permissions').select('permission_key').eq('title_id', title.id)
        : Promise.resolve({ data: [] as { permission_key: string }[] }),
      supabase
        .from('role_default_permissions')
        .select('permission_key')
        .eq('role', account.role as 'principal' | 'finance' | 'hr' | 'dept_manager'),
      supabase.from('user_permissions').select('permission_key, granted').eq('user_id', account.id),
    ])

  const titleKeys = (titleGrants ?? []).map(g => (g as { permission_key: string }).permission_key)
  // A title with no rows of its own is "inherit", not "grant nothing" — the
  // distinction the cutover depends on.
  const configured = titleKeys.length > 0
  const inherited = new Set(
    configured
      ? titleKeys
      : (roleGrants ?? []).map(g => (g as { permission_key: string }).permission_key),
  )
  const source = configured
    ? `the ${title.name ?? 'title'} title`
    : `the ${account.role} role, because ${title.name ?? 'their title'} has no permissions of its own`

  const overrideBy = new Map(
    (overrides ?? []).map(o => {
      const r = o as { permission_key: string; granted: boolean }
      return [r.permission_key, r.granted]
    }),
  )

  const rows: PersonPermissionRow[] = (defs ?? []).map(d => {
    const def = d as { key: string; label: string; section: string }
    return {
      key: def.key,
      label: def.label,
      section: def.section,
      inherited: inherited.has(def.key),
      override: overrideBy.has(def.key) ? overrideBy.get(def.key)! : null,
    }
  })

  return { rows, source }
}
