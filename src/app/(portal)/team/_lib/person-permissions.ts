import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import {
  type CellKey,
  type Grants,
  type PermFunction,
  type PersonCells,
  type SensitiveField,
  cellKeysFromRows,
  functionsFromRows,
  grantsFromRows,
  isSensitiveField,
  personCellsFromRows,
} from '@/lib/permission-matrix'
import type { PersonPermissionRow } from '../_components/PersonPermissions'
import type { PersonBox, TabAction } from '@/lib/permission-tabs'
import { personReachFromJson, type PersonReach } from '@/lib/sub-department-reach'

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
        .eq('role', account.role as Database['public']['Enums']['user_role']),
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
    : `the ${account.role} role, because ${title.name ?? 'their title'} has no permission template yet`

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

/**
 * A person's access as the person card draws it (2026-10-08): their title's
 * permission template with their own cells over it — or, while their title has
 * no template, the old per-key view (their account's role, and its exceptions).
 */
export type PersonAccessData =
  | {
      kind: 'template'
      userId: string
      titleName: string
      template: { id: string; name: string; baseRole: string; grants: Grants; sensitive: SensitiveField[]; tabs: string[] | null }
      cells: PersonCells
      /** Their own boxes over the template's ticks (2026-10-11); none stored yet = their cells give them. */
      boxes: PersonBox[]
      /** Old per-key exceptions, still applied on top until cleared. */
      legacy: Array<{ key: string; label: string; granted: boolean }>
      /** Their sub-departments on the Revenue tabs (2026-10-16); null when the reader may not see them. */
      reach: PersonReach | null
      functions: PermFunction[]
      cellKeys: CellKey[]
    }
  | { kind: 'legacy'; userId: string; rows: PersonPermissionRow[]; source: string }

export async function loadPersonAccess(
  supabase: SupabaseClient<Database>,
  account: { id: string; role: string },
  title: { id: string | null; name: string | null; templateId: string | null },
): Promise<PersonAccessData> {
  if (!title.templateId) {
    const legacy = await resolvePersonPermissions(supabase, account, title)
    return { kind: 'legacy', userId: account.id, ...legacy }
  }
  // The permission tables postdate database.types.ts.
  const db = supabase as unknown as SupabaseClient
  const [tpl, grants, sens, fns, keys, cells, legacy, defs, tabs, boxes, reach] = await Promise.all([
    db.from('permission_templates').select('id, name, base_role').eq('id', title.templateId).maybeSingle(),
    db.from('permission_template_grants').select('function_key, action, scope').eq('template_id', title.templateId),
    db.from('permission_template_sensitive').select('field').eq('template_id', title.templateId),
    db.from('permission_functions').select('key, label, section, actions, scopes, description').order('sort_order'),
    db.from('permission_cell_keys').select('function_key, action, legacy_key, min_scope, gate'),
    db.from('user_permission_cells').select('function_key, action, scope').eq('user_id', account.id),
    db.from('user_permissions').select('permission_key, granted').eq('user_id', account.id),
    db.from('permission_defs').select('key, label'),
    db.from('permission_template_tabs').select('tab_id, action').eq('template_id', title.templateId),
    db.from('user_permission_tabs').select('tab_id, action, granted').eq('user_id', account.id),
    // Their sub-departments (2026-10-16): the active ones, what they handle, their own ticks.
    db.rpc('person_sub_department_reach', { p_user: account.id }),
  ])
  for (const [label, res] of [['their template', tpl], ['its cells', grants], ['the permission catalog', fns], ['their own cells', cells], ['its boxes', tabs], ['their own boxes', boxes]] as const) {
    if (res.error) throw new Error(`Could not load ${label}: ${res.error.message}`)
  }
  const template = tpl.data as { id: string; name: string; base_role: string } | null
  if (!template) {
    const fallback = await resolvePersonPermissions(supabase, account, title)
    return { kind: 'legacy', userId: account.id, ...fallback }
  }
  const labels = new Map(((defs.data ?? []) as Array<{ key: string; label: string }>).map(d => [d.key, d.label]))
  return {
    kind: 'template',
    userId: account.id,
    titleName: title.name ?? 'their title',
    template: {
      id: template.id,
      name: template.name,
      baseRole: template.base_role,
      grants: grantsFromRows((grants.data ?? []) as Array<{ function_key: string; action: string; scope: string }>),
      sensitive: ((sens.data ?? []) as Array<{ field: string }>).map(s => s.field).filter(isSensitiveField),
      tabs: (tabs.data ?? []).length ? ((tabs.data ?? []) as Array<{ tab_id: string; action: string }>).map(t => `${t.tab_id}.${t.action}`) : null,
    },
    boxes: ((boxes.data ?? []) as Array<{ tab_id: string; action: string; granted: boolean }>).map(b => ({ tab: b.tab_id, action: b.action as TabAction, granted: b.granted })),
    cells: personCellsFromRows((cells.data ?? []) as Array<{ function_key: string; action: string; scope: string | null }>),
    legacy: ((legacy.data ?? []) as Array<{ permission_key: string; granted: boolean }>).map(l => ({
      key: l.permission_key,
      label: labels.get(l.permission_key) ?? l.permission_key,
      granted: l.granted,
    })),
    reach: reach.error ? null : personReachFromJson(reach.data),
    functions: functionsFromRows(
      (fns.data ?? []) as Array<{ key: string; label: string; section: string; actions: string[]; scopes: string[]; description: string | null }>,
    ),
    cellKeys: cellKeysFromRows(
      (keys.data ?? []) as Array<{ function_key: string; action: string; legacy_key: string; min_scope: string; gate: string | null }>,
    ),
  }
}
