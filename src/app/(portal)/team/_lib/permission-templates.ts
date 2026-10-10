import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
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
import type { PersonBox, TabAction } from '@/lib/permission-tabs'

/** A permission template as the Permissions tab edits it. */
export interface TemplateRecord {
  id: string
  key: string
  name: string
  description: string | null
  /**
   * The account kind its holders are given. Never shown: read only to say
   * what the template opens today (lib/permission-matrix.ts `openedKeys`).
   */
  baseRole: string
  /** Bumped by every save; a save over a newer one is refused. */
  version: number
  grants: Grants
  sensitive: SensitiveField[]
  /** Its ticked boxes, view › tab › action (2026-10-11) — null until its first save on tabs: then its cells give them. */
  tabs: string[] | null
}

export interface TemplateTitle {
  id: string
  name: string
  departmentId: string | null
  departmentName: string | null
  levelRank: number | null
  isActive: boolean
  isDepartmentHead: boolean
  templateId: string | null
  /** Active people holding it. */
  people: number
}

/** Somebody on the roster who can sign in. */
export interface TemplateLogin {
  userId: string
  staffId: string
  name: string
  email: string | null
  titleId: string | null
  /** Their own cells over their title's template. */
  cells: PersonCells
  /** Their own boxes over their title's template's ticks (2026-10-11). */
  boxes: PersonBox[]
  /**
   * Their old per-key exceptions (the matrix before templates), still applied
   * on top until somebody clears them. Empty when the reader may not see them.
   */
  legacy: Array<{ key: string; granted: boolean }>
}

export interface PermissionsData {
  functions: PermFunction[]
  cellKeys: CellKey[]
  templates: TemplateRecord[]
  titles: TemplateTitle[]
  logins: TemplateLogin[]
}

/** Cast once, at the boundary: the permission tables postdate database.types.ts. */
function rows<T>(data: unknown): T[] {
  return (data ?? []) as T[]
}

/**
 * Everything the Permissions tab, the Roles tab and the invite drawer draw a
 * template from, in one round of reads. The catalog and the templates are
 * readable by anybody signed in; the roster parts follow the roster's own RLS
 * (HR and the Principal), which is who opens People at all.
 */
export async function loadPermissionsData(client: SupabaseClient): Promise<PermissionsData> {
  const supabase = client as unknown as SupabaseClient
  const [fnRes, keyRes, tplRes, grantRes, sensRes, titleRes, levelRes, staffRes, cellRes, legacyRes, tabRes, boxRes] = await Promise.all([
    supabase.from('permission_functions').select('key, label, section, actions, scopes, description').order('sort_order'),
    supabase.from('permission_cell_keys').select('function_key, action, legacy_key, min_scope, gate'),
    supabase.from('permission_templates').select('id, key, name, description, base_role, version').order('sort_order'),
    supabase.from('permission_template_grants').select('template_id, function_key, action, scope'),
    supabase.from('permission_template_sensitive').select('template_id, field'),
    supabase
      .from('titles')
      .select('id, name, department_id, level_id, is_active, is_department_head, template_id, departments (name)')
      .order('name'),
    supabase.from('title_levels').select('id, rank'),
    supabase
      .from('hr_staff_costs')
      .select('id, employee_name, title_id, user_id, status, users!hr_staff_costs_user_id_fkey(email)'),
    supabase.from('user_permission_cells').select('user_id, function_key, action, scope'),
    // The old per-key exceptions: the Principal's to read. Anybody else simply
    // sees none, which is why a refusal here is not fatal.
    supabase.from('user_permissions').select('user_id, permission_key, granted').then(r => r, () => ({ data: null, error: null })),
    // The boxes (mig 20261011010000): every signed-in session reads a template's, a person's as their cells are read.
    supabase.from('permission_template_tabs').select('template_id, tab_id, action'),
    supabase.from('user_permission_tabs').select('user_id, tab_id, action, granted'),
  ])

  for (const [label, res] of [
    ['the permission catalog', fnRes], ['what each cell opens', keyRes], ['the templates', tplRes],
    ['the templates’ cells', grantRes], ['the sensitive fields', sensRes], ['the titles', titleRes],
    ['the ladder', levelRes], ['the roster', staffRes], ['personal exceptions', cellRes],
    ['the templates’ boxes', tabRes], ['personal boxes', boxRes],
  ] as const) {
    if (res.error) throw new Error(`Could not load ${label}: ${res.error.message}`)
  }

  const functions: PermFunction[] = functionsFromRows(
    rows<{ key: string; label: string; section: string; actions: string[]; scopes: string[]; description: string | null }>(fnRes.data),
  )
  const cellKeys: CellKey[] = cellKeysFromRows(
    rows<{ function_key: string; action: string; legacy_key: string; min_scope: string; gate: string | null }>(keyRes.data),
  )

  const grantRows = rows<{ template_id: string; function_key: string; action: string; scope: string }>(grantRes.data)
  const sensRows = rows<{ template_id: string; field: string }>(sensRes.data)
  const tabRows = rows<{ template_id: string; tab_id: string; action: string }>(tabRes.data)
  const templates: TemplateRecord[] = rows<{
    id: string; key: string; name: string; description: string | null; base_role: string; version: number
  }>(tplRes.data).map(t => ({
    id: t.id,
    key: t.key,
    name: t.name,
    description: t.description,
    baseRole: t.base_role,
    version: t.version,
    grants: grantsFromRows(grantRows.filter(g => g.template_id === t.id)),
    sensitive: sensRows.filter(s => s.template_id === t.id).map(s => s.field).filter(isSensitiveField),
    tabs: tabRows.some(r => r.template_id === t.id) ? tabRows.filter(r => r.template_id === t.id).map(r => `${r.tab_id}.${r.action}`) : null,
  }))

  const rungs = new Map(rows<{ id: string; rank: number }>(levelRes.data).map(l => [l.id, l.rank]))
  const staff = rows<{
    id: string; employee_name: string; title_id: string | null; user_id: string | null; status: string | null
    users: { email: string } | Array<{ email: string }> | null
  }>(staffRes.data)
  const headcount = new Map<string, number>()
  for (const s of staff) {
    if (s.status === 'inactive' || !s.title_id) continue
    headcount.set(s.title_id, (headcount.get(s.title_id) ?? 0) + 1)
  }

  const titles: TemplateTitle[] = rows<{
    id: string; name: string; department_id: string | null; level_id: string | null; is_active: boolean
    is_department_head: boolean | null; template_id: string | null
    departments: { name: string } | Array<{ name: string }> | null
  }>(titleRes.data).map(t => {
    const dept = Array.isArray(t.departments) ? (t.departments[0] ?? null) : t.departments
    return {
      id: t.id,
      name: t.name,
      departmentId: t.department_id,
      departmentName: dept?.name ?? null,
      levelRank: t.level_id ? (rungs.get(t.level_id) ?? null) : null,
      isActive: t.is_active,
      isDepartmentHead: t.is_department_head === true,
      templateId: t.template_id,
      people: headcount.get(t.id) ?? 0,
    }
  })

  const cellRows = rows<{ user_id: string; function_key: string; action: string; scope: string | null }>(cellRes.data)
  const legacyRows = rows<{ user_id: string; permission_key: string; granted: boolean }>(legacyRes.data)
  const boxRows = rows<{ user_id: string; tab_id: string; action: string; granted: boolean }>(boxRes.data)
  const logins: TemplateLogin[] = staff
    .filter(s => s.user_id)
    .map(s => {
      const user = Array.isArray(s.users) ? (s.users[0] ?? null) : s.users
      return {
        userId: s.user_id!,
        staffId: s.id,
        name: s.employee_name,
        email: user?.email ?? null,
        titleId: s.title_id,
        cells: personCellsFromRows(cellRows.filter(c => c.user_id === s.user_id)),
        boxes: boxRows.filter(b => b.user_id === s.user_id).map(b => ({ tab: b.tab_id, action: b.action as TabAction, granted: b.granted })),
        legacy: legacyRows
          .filter(l => l.user_id === s.user_id)
          .map(l => ({ key: l.permission_key, granted: l.granted })),
      }
    })

  return { functions, cellKeys, templates, titles, logins }
}
