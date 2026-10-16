'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requireActionOn, requireAuth } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { cellKeysFromRows, grantsFromRows, isSensitiveField, personCellsFromRows, type CellKey, type PersonCells, type Scope } from '@/lib/permission-matrix'
import {
  TAB_VIEWS,
  boxesOf,
  cellMap,
  cellRows,
  cellsFromTabs,
  isTabView,
  parseGrant,
  personCellRows,
  personTicks,
  reapplied,
  templateTicks,
  ticksOfPerson,
  viewTicks,
  type PersonBox,
  type TabAction,
} from '@/lib/permission-tabs'
import { describeHistory, type AuditRow, type HistoryEntry } from '@/lib/permission-history'
import { isReachTickList, sortedTicks, type ReachTick } from '@/lib/sub-department-reach'
import { isSensitiveTickList, type SensitiveTick } from '@/lib/person-sensitive'

/**
 * Writing permission templates (2026-10-08, the People Management revamp;
 * by view and tab since 2026-10-11).
 *
 * Every write is one RPC, and the RPC is the authority: it checks the caller
 * holds accounts.manage (`permissions_manage`), refuses a cell the function
 * does not have or a reach it may not take, an action reaching further than
 * View, and a template saved over a newer save. The actions here only gate the
 * door and refuse what could not be a request at all. Every change lands in
 * `audit_events`, attributed to the caller.
 *
 * Refusals come back as `{ ok: false, reason }`: production hands a thrown
 * message to the browser only as a digest.
 */

export type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; reason: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function refresh() {
  revalidatePath('/team', 'layout')
}

async function db(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient
}

/** A person's old per-key exceptions, cleared so their template and their cells decide. */
export async function clearLegacyExceptions(userId: string): Promise<Result<{ cleared: number }>> {
  await requireActionOn('/team/people', 'accounts', 'manage')
  if (!UUID.test(userId)) return { ok: false, reason: 'Reload the page and try again.' }
  const supabase = await db()
  const { data, error } = await supabase.rpc('permission_user_clear_legacy', { p_user: userId })
  if (error) return { ok: false, reason: error.message }
  refresh()
  return { ok: true, cleared: Number(data ?? 0) }
}

/**
 * Who changed what — templates, titles' templates, people's own cells,
 * accounts — newest save first. Read by whoever manages permissions or reads
 * the audit log; the RPC asks the same.
 */
export async function loadPermissionHistory(): Promise<Result<{ entries: HistoryEntry[] }>> {
  const user = await requireAuth()
  if (!can(user, 'permissions_manage', 'audit_log')) {
    return { ok: false, reason: 'The history is for whoever manages permissions.' }
  }
  const supabase = await db()
  const [events, templates, functions, titles, users] = await Promise.all([
    supabase.rpc('permission_history', { p_limit: 800 }),
    supabase.from('permission_templates').select('id, name'),
    supabase.from('permission_functions').select('key, label'),
    supabase.from('titles').select('id, name'),
    supabase.from('users').select('id, name'),
  ])
  if (events.error) return { ok: false, reason: events.error.message }
  const pairs = (data: unknown, k: string, v: string) =>
    new Map(((data ?? []) as Array<Record<string, string>>).map(r => [r[k], r[v]]))
  return {
    ok: true,
    entries: describeHistory((events.data ?? []) as AuditRow[], {
      templates: pairs(templates.data, 'id', 'name'),
      functions: pairs(functions.data, 'key', 'label'),
      titles: pairs(titles.data, 'id', 'name'),
      people: pairs(users.data, 'id', 'name'),
    }),
  }
}

/**
 * A per-person exception in the old per-key model, for somebody whose title
 * has no permission template yet — their account's role still decides for
 * them, and this is how one key is granted or denied on top (moved here from
 * the retired Permissions page, 2026-10-08). `granted` false is an explicit
 * denial; null removes the exception.
 */
export async function setUserPermission(userId: string, key: string, granted: boolean | null): Promise<void> {
  await requireActionOn('/team/people', 'accounts', 'manage')
  if (!userId || !key) throw new Error('Which person, and which permission?')

  const supabase = await createClient()
  if (granted === null) {
    const { error } = await supabase.from('user_permissions').delete().eq('user_id', userId).eq('permission_key', key)
    if (error) throw new Error(`Could not clear the exception: ${error.message}`)
  } else {
    const { error } = await supabase
      .from('user_permissions')
      .upsert({ user_id: userId, permission_key: key, granted }, { onConflict: 'user_id,permission_key' })
    if (error) throw new Error(`Could not save the exception: ${error.message}`)
  }
  refresh()
}

// ── By view › tab (2026-10-11, the HR revamp's Permissions — the user's choice B) ──
//
// A template is ticked per tab; the cells the database asks for are worked out
// HERE from the ticks (`cellRows`), never taken from the browser, and saved
// with them in one transaction (`permission_template_tabs_save` →
// `permission_template_save`, its checks unchanged). A person's own boxes are
// laid over their title's ticks; the cells written for them are the ones their
// ticks give at another reach than their template stores (`personCellRows`) —
// so whenever what lies under their boxes changes (the template's ticks, or the
// template their title points at), their cells are worked out again in the
// same transaction (`reapplied`).

/** A template's ticks as stored, else as its cells give them — read on the server. */
async function ticksOf(supabase: SupabaseClient, templateId: string) {
  const [tpl, grants, sens, tabs, keys] = await Promise.all([
    supabase.from('permission_templates').select('id, base_role').eq('id', templateId).maybeSingle(),
    supabase.from('permission_template_grants').select('function_key, action, scope').eq('template_id', templateId),
    supabase.from('permission_template_sensitive').select('field').eq('template_id', templateId),
    supabase.from('permission_template_tabs').select('tab_id, action').eq('template_id', templateId),
    supabase.from('permission_cell_keys').select('function_key, action, legacy_key, min_scope, gate'),
  ])
  for (const res of [tpl, grants, sens, tabs, keys]) if (res.error) throw new Error(res.error.message)
  if (!tpl.data) return null
  const grantRows = (grants.data ?? []) as Array<{ function_key: string; action: string; scope: string }>
  const stored = (tabs.data ?? []) as Array<{ tab_id: string; action: string }>
  const record = {
    grants: grantsFromRows(grantRows),
    sensitive: ((sens.data ?? []) as Array<{ field: string }>).map(s => s.field).filter(isSensitiveField),
    baseRole: (tpl.data as { base_role: string }).base_role,
    tabs: stored.length ? stored.map(t => `${t.tab_id}.${t.action}`) : null,
  }
  const cellKeys = cellKeysFromRows((keys.data ?? []) as Array<{ function_key: string; action: string; legacy_key: string; min_scope: string; gate: string | null }>)
  return { record, cellKeys, ticks: templateTicks(record, cellKeys), cells: cellMap(record.grants) }
}

type Ticked = NonNullable<Awaited<ReturnType<typeof ticksOf>>>

/**
 * The people on these titles who have boxes or cells of their own — the only
 * ones a change under them can put out of step. Both tables hold exceptions
 * only, so they are read whole.
 */
async function ownersOn(supabase: SupabaseClient, titleIds: string[]): Promise<Array<{ userId: string; boxes: PersonBox[]; cells: PersonCells }>> {
  if (titleIds.length === 0) return []
  const [staff, cells, boxes] = await Promise.all([
    supabase.from('hr_staff_costs').select('user_id, title_id').in('title_id', titleIds).not('user_id', 'is', null),
    supabase.from('user_permission_cells').select('user_id, function_key, action, scope'),
    supabase.from('user_permission_tabs').select('user_id, tab_id, action, granted'),
  ])
  for (const res of [staff, cells, boxes]) if (res.error) throw new Error(res.error.message)
  const cellRowsOf = (cells.data ?? []) as Array<{ user_id: string; function_key: string; action: string; scope: string | null }>
  const boxRowsOf = (boxes.data ?? []) as Array<{ user_id: string; tab_id: string; action: string; granted: boolean }>
  const users = [...new Set(((staff.data ?? []) as Array<{ user_id: string }>).map(s => s.user_id))]
  return users
    .map(userId => ({
      userId,
      boxes: boxRowsOf.filter(b => b.user_id === userId).map(b => ({ tab: b.tab_id, action: b.action as TabAction, granted: b.granted })),
      cells: personCellsFromRows(cellRowsOf.filter(c => c.user_id === userId)),
    }))
    .filter(p => p.boxes.length > 0 || Object.keys(p.cells).length > 0)
}

/** Their boxes and cells again, over what now lies under them. */
function peopleOver(
  owners: Array<{ userId: string; boxes: PersonBox[]; cells: PersonCells }>,
  before: Ticked,
  after: { ticks: ReadonlySet<string>; cells: ReadonlyMap<string, Scope> },
  cellKeys: readonly CellKey[],
) {
  return owners.map(p => ({ user_id: p.userId, ...reapplied(before.ticks, ticksOfPerson(before.record, p, cellKeys), after) }))
}

const ticksAreShaped = (tabs: unknown): tabs is string[] =>
  Array.isArray(tabs) && tabs.length <= 400 && tabs.every(t => typeof t === 'string' && parseGrant(t) !== null)

/** Save a template's ticks (and the cells they stand for), its sensitive fields, and its holders' own cells over them. */
export async function saveTemplateTabs(input: {
  templateId: string
  version: number
  tabs: string[]
  sensitive: string[]
}): Promise<Result<{ version: number; titles: number }>> {
  await requireActionOn('/team/people', 'accounts', 'manage')
  if (
    !input ||
    !UUID.test(input.templateId) ||
    !Number.isInteger(input.version) ||
    !ticksAreShaped(input.tabs) ||
    !Array.isArray(input.sensitive) ||
    !input.sensitive.every(isSensitiveField)
  ) {
    return { ok: false, reason: 'Reload the page and try again.' }
  }
  const supabase = await db()
  const tabs = [...new Set(input.tabs)]
  const before = await ticksOf(supabase, input.templateId)
  if (!before) return { ok: false, reason: 'That template is gone. Reload the page.' }
  const titles = await supabase.from('titles').select('id').eq('template_id', input.templateId)
  if (titles.error) return { ok: false, reason: titles.error.message }
  const owners = await ownersOn(supabase, ((titles.data ?? []) as Array<{ id: string }>).map(t => t.id))
  const { data, error } = await supabase.rpc('permission_template_tabs_save', {
    p_template: input.templateId,
    p_version: input.version,
    p_tabs: tabs,
    p_grants: cellRows(tabs),
    p_sensitive: input.sensitive,
    p_people: peopleOver(owners, before, { ticks: new Set(tabs), cells: cellsFromTabs(tabs) }, before.cellKeys),
  })
  if (error) return { ok: false, reason: error.message }
  refresh()
  const saved = data as { version: number; titles: number }
  return { ok: true, version: saved.version, titles: saved.titles }
}

/**
 * A title onto another template — at once, the design's select. Whoever on it
 * has boxes of their own keeps them, over the new template's ticks.
 */
export async function setTitleTemplate(titleId: string, templateId: string | null): Promise<Result> {
  await requireActionOn('/team/people', 'accounts', 'manage')
  if (!UUID.test(titleId) || (templateId !== null && !UUID.test(templateId))) {
    return { ok: false, reason: 'Reload the page and try again.' }
  }
  const supabase = await db()
  const title = await supabase.from('titles').select('template_id').eq('id', titleId).maybeSingle()
  if (title.error) return { ok: false, reason: title.error.message }
  if (!title.data) return { ok: false, reason: 'That title is gone. Reload the page.' }
  const from = (title.data as { template_id: string | null }).template_id
  let people: ReturnType<typeof peopleOver> = []
  if (from && templateId && from !== templateId) {
    const [before, after] = await Promise.all([ticksOf(supabase, from), ticksOf(supabase, templateId)])
    if (!after) return { ok: false, reason: 'That template is gone. Reload the page.' }
    if (before) people = peopleOver(await ownersOn(supabase, [titleId]), before, after, before.cellKeys)
  }
  const { error } = await supabase.rpc('permission_title_move', { p_title: titleId, p_template: templateId, p_people: people })
  if (error) return { ok: false, reason: error.message }
  refresh()
  return { ok: true }
}

/** One person's boxes over their title's template — the whole set ([] = back to the title). */
export async function setPersonTabs(input: { userId: string; templateId: string; boxes: PersonBox[]; reach?: ReachTick[]; sensitive?: SensitiveTick[] }): Promise<Result> {
  await requireActionOn('/team/people', 'accounts', 'manage')
  if (
    !input ||
    !UUID.test(input.userId) ||
    !UUID.test(input.templateId) ||
    !Array.isArray(input.boxes) ||
    input.boxes.length > 400 ||
    !input.boxes.every(b => b && typeof b.granted === 'boolean' && parseGrant(`${b.tab}.${b.action}`) !== null) ||
    (input.reach !== undefined && !isReachTickList(input.reach)) ||
    (input.sensitive !== undefined && !isSensitiveTickList(input.sensitive))
  ) {
    return { ok: false, reason: 'Reload the page and try again.' }
  }
  const supabase = await db()
  const base = await ticksOf(supabase, input.templateId)
  if (!base) return { ok: false, reason: 'Their template is gone. Reload the page and try again.' }
  const ticks = personTicks(base.ticks, input.boxes)
  const { error } = await supabase.rpc('permission_user_tabs_set', {
    p_user: input.userId,
    p_tabs: boxesOf(base.ticks, ticks),
    p_cells: personCellRows(base.cells, ticks),
  })
  if (error) return { ok: false, reason: error.message }
  // Their sub-departments on the Revenue tabs (2026-10-16): the whole list of their own ticks.
  if (input.reach !== undefined) {
    const { error: reachError } = await supabase.rpc('permission_user_reach_set', { p_user: input.userId, p_ticks: sortedTicks(input.reach) })
    if (reachError) return { ok: false, reason: reachError.message }
  }
  // Their own Salary / NRIC / Bank over the template's (2026-10-16): the whole list.
  if (input.sensitive !== undefined) {
    const { error: sensitiveError } = await supabase.rpc('permission_user_sensitive_set', { p_user: input.userId, p_fields: input.sensitive })
    if (sensitiveError) return { ok: false, reason: sensitiveError.message }
  }
  refresh()
  return { ok: true }
}

/** The handoff's Delete: a template no title points at. */
export async function deleteTemplate(input: { templateId: string; version: number }): Promise<Result> {
  await requireActionOn('/team/people', 'accounts', 'manage')
  if (!input || !UUID.test(input.templateId) || !Number.isInteger(input.version)) {
    return { ok: false, reason: 'Reload the page and try again.' }
  }
  const supabase = await db()
  const { error } = await supabase.rpc('permission_template_delete', { p_template: input.templateId, p_version: input.version })
  if (error) return { ok: false, reason: error.message }
  refresh()
  return { ok: true }
}

/**
 * "+ New template" (the user, 2026-10-11 — a window asking its name and which
 * views it can see): a blank template with View ticked on every tab of those
 * views, the cells they stand for and its sensitive fields, made in one
 * transaction (`permission_template_new`). Only the Revenue app picked, its
 * holders are Revenue app accounts — the database works that out from the
 * ticks; nobody picks a kind.
 */
export async function createTemplate(input: { name: string; views: string[]; sensitive: string[] }): Promise<Result<{ id: string }>> {
  await requireActionOn('/team/people', 'accounts', 'manage')
  const name = (input?.name ?? '').trim()
  if (!name || name.length > 80) return { ok: false, reason: 'Give the template a name, up to 80 characters.' }
  if (!Array.isArray(input.views) || input.views.length === 0 || input.views.length > TAB_VIEWS.length || !input.views.every(isTabView)) {
    return { ok: false, reason: 'Pick at least one view it can see.' }
  }
  if (!Array.isArray(input.sensitive) || input.sensitive.length > 3 || !input.sensitive.every(isSensitiveField)) {
    return { ok: false, reason: 'Reload the page and try again.' }
  }
  const tabs = [...viewTicks(input.views)]
  const supabase = await db()
  const { data, error } = await supabase.rpc('permission_template_new', {
    p_name: name,
    p_tabs: tabs,
    p_grants: cellRows(tabs),
    p_sensitive: [...new Set(input.sensitive)],
  })
  if (error) return { ok: false, reason: error.message }
  refresh()
  return { ok: true, id: data as string }
}
