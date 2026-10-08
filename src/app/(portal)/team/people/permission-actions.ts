'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requireAction, requireAuth } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { isAction, isScope, isSensitiveField } from '@/lib/permission-matrix'
import { describeHistory, type AuditRow, type HistoryEntry } from '@/lib/permission-history'

/**
 * Writing permission templates (2026-10-08, the People Management revamp).
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
const FUNCTION_KEY = /^[a-z_]{2,40}$/

function refresh() {
  revalidatePath('/team', 'layout')
}

async function db(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient
}

interface CellInput {
  function_key: string
  action: string
  scope: string | null
}

function cellsAreShaped(cells: unknown, allowNone: boolean): cells is CellInput[] {
  return (
    Array.isArray(cells) &&
    cells.length <= 400 &&
    cells.every(
      c =>
        c !== null &&
        typeof c === 'object' &&
        typeof (c as CellInput).function_key === 'string' &&
        FUNCTION_KEY.test((c as CellInput).function_key) &&
        isAction((c as CellInput).action) &&
        (isScope((c as CellInput).scope) || (allowNone && (c as CellInput).scope === null)),
    )
  )
}

export async function saveTemplate(input: {
  templateId: string
  version: number
  grants: CellInput[]
  sensitive: string[]
  /** People whose own cells on the changed cells the Principal chose to put back on the template. */
  reset: Array<{ userId: string; functionKey: string; action: string }>
}): Promise<Result<{ version: number; titles: number }>> {
  await requireAction('accounts', 'manage')
  if (
    !input ||
    !UUID.test(input.templateId) ||
    !Number.isInteger(input.version) ||
    !cellsAreShaped(input.grants, false) ||
    !Array.isArray(input.sensitive) ||
    !input.sensitive.every(isSensitiveField) ||
    !Array.isArray(input.reset) ||
    !input.reset.every(r => UUID.test(r.userId) && FUNCTION_KEY.test(r.functionKey) && isAction(r.action))
  ) {
    return { ok: false, reason: 'Reload the page and try again.' }
  }

  const supabase = await db()
  const { data, error } = await supabase.rpc('permission_template_save', {
    p_template: input.templateId,
    p_version: input.version,
    p_grants: input.grants,
    p_sensitive: input.sensitive,
    p_reset: input.reset.map(r => ({ user_id: r.userId, function_key: r.functionKey, action: r.action })),
  })
  if (error) return { ok: false, reason: error.message }
  refresh()
  const saved = data as { version: number; titles: number }
  return { ok: true, version: saved.version, titles: saved.titles }
}

export async function createTemplate(input: {
  name: string
  description: string
  copyFrom: string | null
}): Promise<Result<{ id: string }>> {
  await requireAction('accounts', 'manage')
  const name = (input?.name ?? '').trim()
  if (!name || name.length > 80) return { ok: false, reason: 'Give the template a name, up to 80 characters.' }
  if ((input.description ?? '').length > 400) return { ok: false, reason: 'Keep the description under 400 characters.' }
  if (input.copyFrom !== null && !UUID.test(input.copyFrom)) return { ok: false, reason: 'Reload the page and try again.' }

  const supabase = await db()
  const { data, error } = await supabase.rpc('permission_template_create', {
    p_name: name,
    p_description: input.description?.trim() || null,
    p_copy_from: input.copyFrom,
  })
  if (error) return { ok: false, reason: error.message }
  refresh()
  return { ok: true, id: data as string }
}

/** A title onto another template — at once, the design's select. */
export async function setTitleTemplate(titleId: string, templateId: string | null): Promise<Result> {
  await requireAction('accounts', 'manage')
  if (!UUID.test(titleId) || (templateId !== null && !UUID.test(templateId))) {
    return { ok: false, reason: 'Reload the page and try again.' }
  }
  const supabase = await db()
  const { error } = await supabase.rpc('permission_title_set_template', { p_title: titleId, p_template: templateId })
  if (error) return { ok: false, reason: error.message }
  refresh()
  return { ok: true }
}

/** One person's own cells, the whole set (✕ = null). */
export async function setPersonCells(userId: string, cells: CellInput[]): Promise<Result> {
  await requireAction('accounts', 'manage')
  if (!UUID.test(userId) || !cellsAreShaped(cells, true)) return { ok: false, reason: 'Reload the page and try again.' }
  const supabase = await db()
  const { error } = await supabase.rpc('permission_user_cells_set', { p_user: userId, p_cells: cells })
  if (error) return { ok: false, reason: error.message }
  refresh()
  return { ok: true }
}

/** A person's old per-key exceptions, cleared so their template and their cells decide. */
export async function clearLegacyExceptions(userId: string): Promise<Result<{ cleared: number }>> {
  await requireAction('accounts', 'manage')
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
  await requireAction('accounts', 'manage')
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
