'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { requireActionOn } from '@/lib/auth'
import { pushSoon } from '@/lib/push/outbox'
import { createClient } from '@/lib/supabase/server'
import { freeFromRow, taskFromRow, type FreeBlock, type FreeType, type MktTaskPage } from './task'
import type { StageWork } from './tasks'

/**
 * Marketing's writes (2026-10-23, mig 20261023234000) — New Project's quick and recurring tasks, a stage accepted,
 * worked, handed on, approved or sent back, Nudge, a series paused or ended, the Free space. Each asks its gate here
 * and its cell again in the database, which also decides whose stage it is. A refusal answers `{ ok: false, reason }`
 * in words (production masks a thrown message).
 */
export type Done<T = object> = ({ ok: true } & T) | { ok: false; reason: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isId = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)
const words = (error: { message?: string } | null, fallback: string) => (error?.message?.trim() ? error.message.trim() : fallback)

async function client(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient
}

/** Every Marketing page draws the board: fresh after a write; the people told hear it on their phones. */
function freshen() {
  revalidatePath('/marketing', 'layout')
  pushSoon()
}

/** The task as it now stands, for the page that wrote it — no router refresh (it would drop every page kept). */
async function fresh(db: SupabaseClient, project: string): Promise<MktTaskPage | null> {
  const { data, error } = await db.rpc('mkt_project', { p_key: project })
  return error ? null : taskFromRow(data)
}

export interface NewTaskInput {
  sub: string
  kind: 'quick' | 'recurring'
  title: string
  type: string
  brief: string
  stages: Record<string, unknown>[]
  recur: Record<string, unknown> | null
}

/** New Project: a quick task, or a recurring one and its runs. */
export async function createMktTask(input: NewTaskInput): Promise<Done<{ id: string; track: string; open: string }>> {
  await requireActionOn('/marketing/new', 'marketing', 'create')
  if (!isId(input.sub)) return { ok: false, reason: 'Pick who the task is for.' }
  if (input.kind !== 'quick' && input.kind !== 'recurring') return { ok: false, reason: 'Pick a quick task or a recurring task.' }
  if (!Array.isArray(input.stages) || input.stages.length === 0) return { ok: false, reason: 'A task has 1 to 20 stages.' }
  const { data, error } = await (await client()).rpc('mkt_task_create', {
    p_subsidiary: input.sub,
    p_kind: input.kind,
    p_title: String(input.title ?? ''),
    p_q_type: String(input.type ?? ''),
    p_brief: String(input.brief ?? ''),
    p_stages: input.stages,
    p_recur: input.kind === 'recurring' ? input.recur : null,
  })
  if (error) return { ok: false, reason: words(error, 'The task could not be created. Please try again.') }
  freshen()
  const r = (data ?? {}) as { id?: string; track?: string; open?: string }
  return { ok: true, id: String(r.id ?? ''), track: String(r.track ?? ''), open: String(r.open ?? r.id ?? '') }
}

/** Accept the stage that is yours — from My Space's tile or the task's page. */
export async function acceptMktStage(project: string): Promise<Done<{ page: MktTaskPage | null }>> {
  await requireActionOn(['/marketing', '/marketing/projects/[id]'], 'marketing', 'edit')
  if (!isId(project)) return { ok: false, reason: 'That task is not there.' }
  const db = await client()
  const { error } = await db.rpc('mkt_stage_accept', { p_project: project })
  if (error) return { ok: false, reason: words(error, 'The stage could not be accepted. Please try again.') }
  freshen()
  return { ok: true, page: await fresh(db, project) }
}

/** Your stage's work: only what changed — a field cleared is sent as null. */
export async function saveMktWork(project: string, work: Partial<{ notes: string; links: StageWork['links']; vals: Record<string, string | boolean | null> }>): Promise<Done<{ missing: string[] }>> {
  await requireActionOn('/marketing/projects/[id]', 'marketing', 'edit')
  if (!isId(project)) return { ok: false, reason: 'That task is not there.' }
  const { data, error } = await (await client()).rpc('mkt_stage_save', { p_project: project, p_work: work ?? {} })
  if (error) return { ok: false, reason: words(error, 'Your work could not be saved. Please try again.') }
  const missing = Array.isArray((data as { missing?: unknown })?.missing) ? ((data as { missing: unknown[] }).missing.map(String)) : []
  return { ok: true, missing }
}

/** Hand your stage on: to its approver, or — none — completed. `pick`: who takes the next stage, when it is yours to pick. */
export async function submitMktStage(project: string, pick?: string | null): Promise<Done<{ page: MktTaskPage | null }>> {
  await requireActionOn('/marketing/projects/[id]', 'marketing', 'edit')
  if (!isId(project)) return { ok: false, reason: 'That task is not there.' }
  if (pick != null && !isId(pick)) return { ok: false, reason: 'Pick who takes the next stage.' }
  const db = await client()
  const { error } = await db.rpc('mkt_stage_submit', { p_project: project, p_pick: pick ?? null })
  if (error) return { ok: false, reason: words(error, 'The stage could not be handed on. Please try again.') }
  freshen()
  return { ok: true, page: await fresh(db, project) }
}

/** The approver's answer: approve, or request changes with a reason. */
export async function decideMktStage(project: string, approve: boolean, reason?: string): Promise<Done<{ page: MktTaskPage | null }>> {
  await requireActionOn('/marketing/projects/[id]', 'marketing', 'approve')
  if (!isId(project)) return { ok: false, reason: 'That task is not there.' }
  const db = await client()
  const { error } = await db.rpc('mkt_stage_decide', { p_project: project, p_approve: approve === true, p_reason: reason ?? null })
  if (error) return { ok: false, reason: words(error, 'The answer could not be saved. Please try again.') }
  freshen()
  return { ok: true, page: await fresh(db, project) }
}

/** The manager's Nudge: a notice to whoever the task waits on, at most one an hour. */
export async function nudgeMkt(project: string): Promise<Done<{ who: string; already: boolean }>> {
  await requireActionOn(['/marketing/tracking', '/marketing/projects/[id]'], 'marketing', 'manage')
  if (!isId(project)) return { ok: false, reason: 'That task is not there.' }
  const { data, error } = await (await client()).rpc('mkt_nudge', { p_project: project })
  if (error) return { ok: false, reason: words(error, 'The nudge could not be sent. Please try again.') }
  pushSoon()
  const r = (data ?? {}) as { who?: string; already?: boolean }
  return { ok: true, who: String(r.who ?? ''), already: r.already === true }
}

/** A recurring task paused, resumed or ended (`current`: the run or series the page shows, read again). */
export async function setMktSeries(series: string, to: 'pause' | 'resume' | 'end', current?: string): Promise<Done<{ page: MktTaskPage | null }>> {
  await requireActionOn('/marketing/projects/[id]', 'marketing', 'manage')
  if (!isId(series) || (current != null && !isId(current))) return { ok: false, reason: 'That recurring task is not there.' }
  if (to !== 'pause' && to !== 'resume' && to !== 'end') return { ok: false, reason: 'Pause, resume or end.' }
  const db = await client()
  const { error } = await db.rpc('mkt_series_set', { p_series: series, p_to: to })
  if (error) return { ok: false, reason: words(error, 'The recurring task could not be changed. Please try again.') }
  freshen()
  return { ok: true, page: await fresh(db, current ?? series) }
}

/** The Free space: a block put (added, or its text and tick changed) or removed. */
export async function putMktFree(project: string, op: 'put' | 'remove', block: { id: string; type?: FreeType; text?: string; done?: boolean }): Promise<Done<{ free: FreeBlock[] }>> {
  await requireActionOn('/marketing/projects/[id]', 'marketing', 'edit')
  if (!isId(project)) return { ok: false, reason: 'That task is not there.' }
  if (op !== 'put' && op !== 'remove') return { ok: false, reason: 'Put or remove.' }
  const { data, error } = await (await client()).rpc('mkt_free_block', { p_project: project, p_op: op, p_block: block })
  if (error) return { ok: false, reason: words(error, 'The free space could not be saved. Please try again.') }
  return { ok: true, free: freeFromRow(data) }
}

