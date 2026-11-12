'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { requireActionOn } from '@/lib/auth'
import { pushSoon } from '@/lib/push/outbox'
import { createClient } from '@/lib/supabase/server'
import { TASK_COL_TYPES, taskFromRow, type MktTaskPage, type TaskColType } from './task'

/**
 * The task page's writes of the Workflow Builder 2a (mig 20261113210000 — docs/design_handoff_workflow_builder/README.md ›
 * Task page): ⇄ Reassign a stage (Marketing · Manage), the doer's own table columns and a table's rows (Marketing · Edit,
 * the doer now — the database decides whose). Each asks its gate here and its cell again in the database; each answers
 * with the task as it now stands. A refusal answers `{ ok: false, reason }` in words (production masks a thrown message).
 */
export type TaskDone = { ok: true; page: MktTaskPage | null } | { ok: false; reason: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isId = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)
const words = (error: { message?: string } | null, fallback: string) => (error?.message?.trim() ? error.message.trim() : fallback)

async function client(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient
}

function freshen() {
  revalidatePath('/marketing', 'layout')
  pushSoon()
}

async function fresh(db: SupabaseClient, project: string): Promise<MktTaskPage | null> {
  const { data, error } = await db.rpc('mkt_project', { p_key: project })
  return error ? null : taskFromRow(data)
}

/** ⇄ Reassign: a stage not done changes hands — the new person and the old told, a line on the trail. */
export async function reassignMktStage(project: string, stage: number, staff: string, reason?: string | null): Promise<TaskDone> {
  await requireActionOn('/marketing/projects/[id]', 'marketing', 'manage')
  if (!isId(project)) return { ok: false, reason: 'That task is not there.' }
  if (!Number.isInteger(stage) || stage < 0 || stage > 29) return { ok: false, reason: 'That stage is not there.' }
  if (!isId(staff)) return { ok: false, reason: 'Pick a person on Marketing’s team.' }
  const why = String(reason ?? '').trim().replace(/\s+/g, ' ')
  if (why.length > 300) return { ok: false, reason: 'Say why in at most 300 characters.' }
  const db = await client()
  const { error } = await db.rpc('mkt_stage_reassign', { p_project: project, p_stage: stage, p_staff: staff, p_reason: why || null })
  if (error) return { ok: false, reason: words(error, 'The stage could not be reassigned. Please try again.') }
  freshen()
  return { ok: true, page: await fresh(db, project) }
}

/** + Add column: a column of this task only on a table the doer's stage fills in (`field`: the field's id, else its
 * label); at most 8 a table. */
export async function addMktTaskColumn(project: string, field: string, name: string, type: TaskColType): Promise<TaskDone> {
  await requireActionOn('/marketing/projects/[id]', 'marketing', 'edit')
  if (!isId(project)) return { ok: false, reason: 'That task is not there.' }
  const n = String(name ?? '').trim().replace(/\s+/g, ' ')
  if (n.length < 1 || n.length > 40) return { ok: false, reason: 'Name the column (at most 40 characters).' }
  if (!TASK_COL_TYPES.includes(type)) return { ok: false, reason: 'A column is Text, Number, Checkbox, Date or Person.' }
  const db = await client()
  const { error } = await db.rpc('mkt_task_column', { p_project: project, p_field: String(field ?? '').slice(0, 200), p_op: 'add', p_col: { name: n, type } })
  if (error) return { ok: false, reason: words(error, 'The column could not be added. Please try again.') }
  freshen()
  return { ok: true, page: await fresh(db, project) }
}

/** × on a column the doer added: taken off, its cells with it. */
export async function removeMktTaskColumn(project: string, field: string, column: string): Promise<TaskDone> {
  await requireActionOn('/marketing/projects/[id]', 'marketing', 'edit')
  if (!isId(project)) return { ok: false, reason: 'That task is not there.' }
  if (!/^x[0-9a-f]{6,20}$/.test(String(column ?? ''))) return { ok: false, reason: 'That column is not there.' }
  const db = await client()
  const { error } = await db.rpc('mkt_task_column', { p_project: project, p_field: String(field ?? '').slice(0, 200), p_op: 'remove', p_col: { id: column } })
  if (error) return { ok: false, reason: words(error, 'The column could not be taken off. Please try again.') }
  freshen()
  return { ok: true, page: await fresh(db, project) }
}

/** A table's rows, whole (+ Add row, a cell typed, a row taken off): each row the template's columns then the task's
 * own, each cell a text. `rows` null clears the table. */
export async function saveMktTable(project: string, label: string, rows: string[][] | null): Promise<TaskDone> {
  await requireActionOn('/marketing/projects/[id]', 'marketing', 'edit')
  if (!isId(project)) return { ok: false, reason: 'That task is not there.' }
  const key = String(label ?? '').slice(0, 200)
  if (!key) return { ok: false, reason: 'That table is not there.' }
  const clean = rows == null ? null
    : { rows: (Array.isArray(rows) ? rows : []).slice(0, 200).map(r => (Array.isArray(r) ? r : []).slice(0, 16).map(c => String(c ?? '').slice(0, 500))) }
  const db = await client()
  const { error } = await db.rpc('mkt_stage_save', { p_project: project, p_work: { vals: { [key]: clean } } })
  if (error) return { ok: false, reason: words(error, 'The table could not be saved. Please try again.') }
  return { ok: true, page: await fresh(db, project) }
}
