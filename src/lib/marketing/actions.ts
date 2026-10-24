'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { requireActionOn } from '@/lib/auth'
import { addressFromParts, addressRefusal, cleanAddress, isEmptyAddress } from '@/lib/address/address'
import { MALAYSIA_DATA } from '@/lib/address/malaysia-data'
import { pushSoon } from '@/lib/push/outbox'
import { createClient } from '@/lib/supabase/server'
import { correctionOk, projectLogFromRow, type ProjectLog } from './audit'
import { billingFromRow, clientBillFromRow, type BillingPage } from './billing'
import { subFromRow, type MktSub } from './board'
import { freeFromRow, taskFromRow, type FreeBlock, type FreeType, type MktTaskPage } from './task'
import type { StageWork } from './tasks'
import { minutesTemplatesFromRow, type MinutesTemplate } from './minutes'
import { productBookFromRow, type ProductBook, type ProductStatus } from './products'
import { productProjectFromRow, type ProductProjectPage } from './project'
import { replaceDoneFromRow, type ReplaceDone } from './replace'
import { workflowsFromRow, type WfTemplate } from './workflows'
import { petStatsFromRow, spaceFromRow, spacePatchOf, type PetStats, type Space, type SpacePatch } from './space'
import { chatMessageFromRow, type ChatMessage } from './chat'
import { reviewOpenFromRow, type ChatReviewOpen } from './chat-review'
import {
  libraryFromRow, NO_PROFILE, profileFromRow, profileToRow, SHARE_EXPIRIES, taskFilesFromRow, type Library, type LibProfile, type ShareExpiry,
  type TaskFile,
} from './library'

/**
 * Marketing's writes (2026-10-23, migs 20261023234000, 20261023235500, 20261023235800, 20261023235900, 20261024002000 and
 * 20261024004000) — New Project's quick and recurring tasks, a stage accepted, worked, handed on, approved or sent back,
 * Nudge, a series paused or ended, the Free space; the Workflow Builder's, the Minutes Builder's and the Product Builder's
 * drafts saved and published (a workflow cloned, a product retired or reactivated); a 📦 product project started, its
 * intake minutes written, signed, sent to the PIC, started before approval, resent; Marketing's own client added, a
 * client's details edited (mig 20261025034000).
 * Each asks its gate here and its cell again in
 * the database, which also decides whose stage it is. A refusal answers `{ ok: false, reason }` in words (production
 * masks a thrown message).
 */
export type Done<T = object> = ({ ok: true } & T) | { ok: false; reason: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isId = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)
const words = (error: { message?: string } | null, fallback: string) => (error?.message?.trim() ? error.message.trim() : fallback)
/** A ringgit amount as sent: null for none, undefined for one that is not an amount (above zero, two decimals). */
const amountOf = (v: unknown): number | null | undefined =>
  v == null ? null : typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 1e13 && Math.round(v * 100) === v * 100 ? v : undefined
const MONTH = /^\d{4}-(0[1-9]|1[0-2])-01$/

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

/** A post marked posted with its link (④-2c — the user's answer 15) — its owner's (the task's, the stage's) or the
 * manager's, once its task is done. Answered with the task as it now stands. */
export async function markMktPost(project: string, stage: number, field: string, link: string): Promise<Done<{ page: MktTaskPage | null }>> {
  await requireActionOn('/marketing/projects/[id]', 'marketing', 'edit')
  if (!isId(project) || !Number.isInteger(stage) || stage < 0 || typeof field !== 'string' || !field) return { ok: false, reason: 'That post is not there.' }
  const db = await client()
  const { error } = await db.rpc('mkt_post_mark', { p_project: project, p_stage: stage, p_field: field.slice(0, 200), p_link: String(link ?? '').slice(0, 600) })
  if (error) return { ok: false, reason: words(error, 'The post could not be marked. Please try again.') }
  freshen()
  return { ok: true, page: await fresh(db, project) }
}

/** A post's posted mark taken back (④-2c) — its owner's or the manager's. */
export async function unmarkMktPost(project: string, stage: number, field: string): Promise<Done<{ page: MktTaskPage | null }>> {
  await requireActionOn('/marketing/projects/[id]', 'marketing', 'edit')
  if (!isId(project) || !Number.isInteger(stage) || stage < 0 || typeof field !== 'string' || !field) return { ok: false, reason: 'That post is not there.' }
  const db = await client()
  const { error } = await db.rpc('mkt_post_unmark', { p_project: project, p_stage: stage, p_field: field.slice(0, 200) })
  if (error) return { ok: false, reason: words(error, 'The mark could not be taken back. Please try again.') }
  freshen()
  return { ok: true, page: await fresh(db, project) }
}

/** A record of the formal log corrected (④-3b — the user's answer 19, the manager's): a record of its own, *correction
 * of #n*; the record and the project untouched. Answered with the log as it now stands. */
export async function correctMktLogRecord(project: string, record: number, text: string): Promise<Done<{ log: ProjectLog | null }>> {
  await requireActionOn('/marketing/projects/[id]', 'marketing', 'manage')
  if (!isId(project) || !Number.isSafeInteger(record) || record < 1) return { ok: false, reason: 'That record is not there.' }
  if (!correctionOk(String(text ?? ''))) return { ok: false, reason: 'Say what was wrong and what is right — 5 to 500 characters.' }
  const { data, error } = await (await client()).rpc('mkt_log_correct', { p_project: project, p_event: record, p_text: String(text).trim() })
  if (error) return { ok: false, reason: words(error, 'The correction could not be added. Please try again.') }
  freshen()
  return { ok: true, log: projectLogFromRow(data) }
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

/** Your stage's files (②b-2e, mig 20261025113000): the whole list — those already the stage's, the ones just sent to
 * the bucket under stage/ — each a File field's (field: its label) or the stage's own Files (null); one left out is
 * taken off. Answered with the task as it now stands (each file's size, who sent it, when). */
export async function saveMktStageFiles(project: string, files: { path: string; name: string; field: string | null }[]): Promise<Done<{ page: MktTaskPage | null }>> {
  await requireActionOn('/marketing/projects/[id]', 'marketing', 'edit')
  if (!isId(project)) return { ok: false, reason: 'That task is not there.' }
  const list = (Array.isArray(files) ? files : []).slice(0, 40).map(f => ({
    path: String(f?.path ?? '').slice(0, 1100), name: String(f?.name ?? '').slice(0, 300), field: f?.field ? String(f.field).slice(0, 200) : null,
  }))
  const db = await client()
  const { error } = await db.rpc('mkt_stage_save', { p_project: project, p_work: { files: list } })
  if (error) return { ok: false, reason: words(error, 'The files could not be saved. Please try again.') }
  freshen()
  return { ok: true, page: await fresh(db, project) }
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

// ── Subtasks (mig 20261025101000): split off the stage now by its owner, delivered by their assignee, reviewed by the
// stage's owner, or taken back — each answered with the task as it now stands. ──────────────────────────────────

/** ✂️ Split into subtasks: one deliverable for somebody else on the roster, due on or before the stage's own deadline. */
export async function addMktSubtask(project: string, title: string, assignee: string, due: string): Promise<Done<{ page: MktTaskPage | null }>> {
  await requireActionOn('/marketing/projects/[id]', 'marketing', 'edit')
  if (!isId(project)) return { ok: false, reason: 'That task is not there.' }
  if (!isId(assignee)) return { ok: false, reason: 'Pick who does it.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(due ?? ''))) return { ok: false, reason: 'Give it a deadline.' }
  const db = await client()
  const { error } = await db.rpc('mkt_subtask_add', { p_project: project, p_title: String(title ?? '').slice(0, 200), p_assignee: assignee, p_due: due })
  if (error) return { ok: false, reason: words(error, 'The subtask could not be made. Please try again.') }
  freshen()
  return { ok: true, page: await fresh(db, project) }
}

/** A delivery: the files just sent to the bucket (subtask/…), links and/or a note — v1, v2 … */
export async function deliverMktSubtask(project: string, subtask: string, note: string, links: { url: string; label: string }[],
  files: { path: string; name: string }[]): Promise<Done<{ page: MktTaskPage | null }>> {
  await requireActionOn('/marketing/projects/[id]', 'marketing', 'edit')
  if (!isId(project) || !isId(subtask)) return { ok: false, reason: 'That subtask is not there.' }
  const db = await client()
  const { error } = await db.rpc('mkt_subtask_deliver', {
    p_subtask: subtask,
    p_note: String(note ?? '').slice(0, 2000),
    p_links: (Array.isArray(links) ? links : []).slice(0, 20).map(l => ({ url: String(l?.url ?? '').slice(0, 600), label: String(l?.label ?? '').slice(0, 200) })),
    p_files: (Array.isArray(files) ? files : []).slice(0, 20).map(f => ({ path: String(f?.path ?? '').slice(0, 1100), name: String(f?.name ?? '').slice(0, 300) })),
  })
  if (error) return { ok: false, reason: words(error, 'The delivery could not be sent. Please try again.') }
  freshen()
  return { ok: true, page: await fresh(db, project) }
}

/** Review delivery, by the stage's owner: approve it, or return it with a reason. */
export async function reviewMktSubtask(project: string, subtask: string, approve: boolean, reason?: string): Promise<Done<{ page: MktTaskPage | null }>> {
  await requireActionOn('/marketing/projects/[id]', 'marketing', 'edit')
  if (!isId(project) || !isId(subtask)) return { ok: false, reason: 'That subtask is not there.' }
  const db = await client()
  const { error } = await db.rpc('mkt_subtask_review', { p_subtask: subtask, p_approve: approve === true, p_reason: approve === true ? null : String(reason ?? '').slice(0, 2000) })
  if (error) return { ok: false, reason: words(error, 'The review could not be saved. Please try again.') }
  freshen()
  return { ok: true, page: await fresh(db, project) }
}

/** A subtask not approved yet, taken back by the stage's owner. */
export async function removeMktSubtask(project: string, subtask: string): Promise<Done<{ page: MktTaskPage | null }>> {
  await requireActionOn('/marketing/projects/[id]', 'marketing', 'edit')
  if (!isId(project) || !isId(subtask)) return { ok: false, reason: 'That subtask is not there.' }
  const db = await client()
  const { error } = await db.rpc('mkt_subtask_remove', { p_subtask: subtask })
  if (error) return { ok: false, reason: words(error, 'The subtask could not be taken back. Please try again.') }
  freshen()
  return { ok: true, page: await fresh(db, project) }
}

/** The manager's Nudge: a notice to whoever the task waits on, at most one an hour. */
export async function nudgeMkt(project: string): Promise<Done<{ who: string; already: boolean }>> {
  await requireActionOn('/marketing/tracking', 'marketing', 'manage')
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

/** The Workflow Builder's templates as they now stand (mig 20261023235500); null when they cannot be read. */
async function freshWorkflows(db: SupabaseClient): Promise<WfTemplate[] | null> {
  const { data, error } = await db.rpc('mkt_workflows')
  return error ? null : workflowsFromRow(data)
}

/** A template made (`id` null: its action, name and first stages), or what changed of its draft saved — `rev`, the draft
 * the builder last saw; a draft somebody saved since is not written over. */
export async function saveMktWorkflow(id: string | null, rev: number | null, patch: Record<string, unknown>): Promise<Done<{ id: string; rev: number; workflows: WfTemplate[] | null }>> {
  // The Product Builder makes an action's Standard template too (+ New action workflow).
  await requireActionOn(['/marketing/workflows', '/marketing/products'], 'marketing', 'manage')
  if (id !== null && !isId(id)) return { ok: false, reason: 'That template is not there any more.' }
  if (id !== null && !Number.isInteger(rev)) return { ok: false, reason: 'Reload the builder and try again.' }
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return { ok: false, reason: 'Nothing to save.' }
  const db = await client()
  const { data, error } = await db.rpc('mkt_workflow_save', { p_id: id, p_rev: id === null ? null : rev, p_patch: patch })
  if (error) return { ok: false, reason: words(error, 'The template could not be saved. Please try again.') }
  revalidatePath('/marketing', 'layout')
  const r = (data ?? {}) as { id?: string; rev?: number }
  // A new template: the list again, so the builder shows it where it belongs.
  return { ok: true, id: String(r.id ?? ''), rev: Number(r.rev ?? 1), workflows: id === null ? await freshWorkflows(db) : null }
}

/** The draft, as its publisher saw it, published as the template's next version. */
export async function publishMktWorkflow(id: string, rev: number): Promise<Done<{ version: number; live: number }>> {
  await requireActionOn('/marketing/workflows', 'marketing', 'manage')
  if (!isId(id)) return { ok: false, reason: 'That template is not there any more.' }
  if (!Number.isInteger(rev)) return { ok: false, reason: 'Reload the builder and try again.' }
  const { data, error } = await (await client()).rpc('mkt_workflow_publish', { p_id: id, p_rev: rev })
  if (error) return { ok: false, reason: words(error, 'The template could not be published. Please try again.') }
  revalidatePath('/marketing', 'layout')
  const r = (data ?? {}) as { version?: number; live?: number }
  return { ok: true, version: Number(r.version ?? 0), live: Number(r.live ?? 0) }
}

/** A new template of the same action from this one's draft ("… copy"). */
export async function cloneMktWorkflow(id: string): Promise<Done<{ id: string; tname: string; workflows: WfTemplate[] | null }>> {
  await requireActionOn('/marketing/workflows', 'marketing', 'manage')
  if (!isId(id)) return { ok: false, reason: 'That template is not there any more.' }
  const db = await client()
  const { data, error } = await db.rpc('mkt_workflow_clone', { p_id: id })
  if (error) return { ok: false, reason: words(error, 'The template could not be cloned. Please try again.') }
  revalidatePath('/marketing', 'layout')
  const r = (data ?? {}) as { id?: string; tname?: string }
  return { ok: true, id: String(r.id ?? ''), tname: String(r.tname ?? ''), workflows: await freshWorkflows(db) }
}

/** A template never published, deleted (the user's answer 8, mig 20261025004100) — refused while a product's draft links
 * it; the list as it now stands. */
export async function deleteMktWorkflow(id: string, rev: number): Promise<Done<{ workflows: WfTemplate[] | null }>> {
  await requireActionOn('/marketing/workflows', 'marketing', 'manage')
  if (!isId(id)) return { ok: false, reason: 'That template is not there any more.' }
  if (!Number.isInteger(rev)) return { ok: false, reason: 'Reload the builder and try again.' }
  const db = await client()
  const { error } = await db.rpc('mkt_workflow_delete', { p_id: id, p_rev: rev })
  if (error) return { ok: false, reason: words(error, 'The template could not be deleted. Please try again.') }
  revalidatePath('/marketing', 'layout')
  return { ok: true, workflows: await freshWorkflows(db) }
}

/** The Minutes Builder's templates as they now stand (mig 20261023235800); null when they cannot be read. */
async function freshMinutes(db: SupabaseClient): Promise<MinutesTemplate[] | null> {
  const { data, error } = await db.rpc('mkt_minutes_templates')
  return error ? null : minutesTemplatesFromRow(data)
}

/** A minutes template made (`id` null: its name, first fields and rules), or what changed of its draft saved — `rev`,
 * the draft the builder last saw; a draft somebody saved since is not written over. */
export async function saveMktMinutes(id: string | null, rev: number | null, patch: Record<string, unknown>): Promise<Done<{ id: string; rev: number; templates: MinutesTemplate[] | null }>> {
  await requireActionOn('/marketing/minutes', 'marketing', 'manage')
  if (id !== null && !isId(id)) return { ok: false, reason: 'That template is not there any more.' }
  if (id !== null && !Number.isInteger(rev)) return { ok: false, reason: 'Reload the builder and try again.' }
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return { ok: false, reason: 'Nothing to save.' }
  const db = await client()
  const { data, error } = await db.rpc('mkt_minutes_save', { p_id: id, p_rev: id === null ? null : rev, p_patch: patch })
  if (error) return { ok: false, reason: words(error, 'The template could not be saved. Please try again.') }
  revalidatePath('/marketing', 'layout')
  const r = (data ?? {}) as { id?: string; rev?: number }
  // A new template: the list again, so the builder shows it where it belongs.
  return { ok: true, id: String(r.id ?? ''), rev: Number(r.rev ?? 1), templates: id === null ? await freshMinutes(db) : null }
}

/** The minutes template's draft, as its publisher saw it, published as its next version. */
export async function publishMktMinutes(id: string, rev: number): Promise<Done<{ version: number }>> {
  await requireActionOn('/marketing/minutes', 'marketing', 'manage')
  if (!isId(id)) return { ok: false, reason: 'That template is not there any more.' }
  if (!Number.isInteger(rev)) return { ok: false, reason: 'Reload the builder and try again.' }
  const { data, error } = await (await client()).rpc('mkt_minutes_publish', { p_id: id, p_rev: rev })
  if (error) return { ok: false, reason: words(error, 'The template could not be published. Please try again.') }
  revalidatePath('/marketing', 'layout')
  return { ok: true, version: Number((data as { version?: number } | null)?.version ?? 0) }
}

/** A minutes template never published, deleted (mig 20261025004100) — refused while a product takes it as its intake. */
export async function deleteMktMinutes(id: string, rev: number): Promise<Done<{ templates: MinutesTemplate[] | null }>> {
  await requireActionOn('/marketing/minutes', 'marketing', 'manage')
  if (!isId(id)) return { ok: false, reason: 'That template is not there any more.' }
  if (!Number.isInteger(rev)) return { ok: false, reason: 'Reload the builder and try again.' }
  const db = await client()
  const { error } = await db.rpc('mkt_minutes_delete', { p_id: id, p_rev: rev })
  if (error) return { ok: false, reason: words(error, 'The template could not be deleted. Please try again.') }
  revalidatePath('/marketing', 'layout')
  return { ok: true, templates: await freshMinutes(db) }
}

/** The Product Builder's book as it now stands (mig 20261023235900); null when it cannot be read. */
async function freshProducts(db: SupabaseClient): Promise<ProductBook | null> {
  const { data, error } = await db.rpc('mkt_products')
  return error ? null : productBookFromRow(data)
}

/** A product made (`id` null — its code made too), or what changed of its draft saved — `rev`, the draft the builder
 * last saw; a draft somebody saved since is not written over; a retired product is read-only. */
export async function saveMktProduct(id: string | null, rev: number | null, patch: Record<string, unknown>): Promise<Done<{ id: string; code: string; rev: number; book: ProductBook | null }>> {
  await requireActionOn('/marketing/products', 'marketing', 'manage')
  if (id !== null && !isId(id)) return { ok: false, reason: 'That product is not there any more.' }
  if (id !== null && !Number.isInteger(rev)) return { ok: false, reason: 'Reload the builder and try again.' }
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return { ok: false, reason: 'Nothing to save.' }
  const db = await client()
  const { data, error } = await db.rpc('mkt_product_save', { p_id: id, p_rev: id === null ? null : rev, p_patch: patch })
  if (error) return { ok: false, reason: words(error, 'The product could not be saved. Please try again.') }
  revalidatePath('/marketing', 'layout')
  const r = (data ?? {}) as { id?: string; code?: string; rev?: number }
  // A new product: the book again, so the builder shows it where it belongs.
  return { ok: true, id: String(r.id ?? ''), code: String(r.code ?? ''), rev: Number(r.rev ?? 1), book: id === null ? await freshProducts(db) : null }
}

/** The product's draft, as its publisher saw it, published as its next version — on sale from the day it takes effect. */
export async function publishMktProduct(id: string, rev: number): Promise<Done<{ version: number; effectiveFrom: string | null; live: number; book: ProductBook | null }>> {
  await requireActionOn('/marketing/products', 'marketing', 'manage')
  if (!isId(id)) return { ok: false, reason: 'That product is not there any more.' }
  if (!Number.isInteger(rev)) return { ok: false, reason: 'Reload the builder and try again.' }
  const db = await client()
  const { data, error } = await db.rpc('mkt_product_publish', { p_id: id, p_rev: rev })
  if (error) return { ok: false, reason: words(error, 'The product could not be published. Please try again.') }
  revalidatePath('/marketing', 'layout')
  const r = (data ?? {}) as { version?: number; effectiveFrom?: string; live?: number }
  return { ok: true, version: Number(r.version ?? 0), effectiveFrom: r.effectiveFrom ? String(r.effectiveFrom) : null, live: Number(r.live ?? 0), book: await freshProducts(db) }
}

/** A product still a draft, deleted (mig 20261025004100) — one once on sale is retired instead. */
export async function deleteMktProduct(id: string, rev: number): Promise<Done<{ book: ProductBook | null }>> {
  await requireActionOn('/marketing/products', 'marketing', 'manage')
  if (!isId(id)) return { ok: false, reason: 'That product is not there any more.' }
  if (!Number.isInteger(rev)) return { ok: false, reason: 'Reload the builder and try again.' }
  const db = await client()
  const { error } = await db.rpc('mkt_product_delete', { p_id: id, p_rev: rev })
  if (error) return { ok: false, reason: words(error, 'The product could not be deleted. Please try again.') }
  revalidatePath('/marketing', 'layout')
  return { ok: true, book: await freshProducts(db) }
}

/** A product retired (picked for no new project; those running keep their version) or reactivated. */
export async function setMktProductStatus(id: string, to: 'retire' | 'reactivate'): Promise<Done<{ status: ProductStatus; retiredOn: string | null; live: number; book: ProductBook | null }>> {
  await requireActionOn('/marketing/products', 'marketing', 'manage')
  if (!isId(id)) return { ok: false, reason: 'That product is not there any more.' }
  if (to !== 'retire' && to !== 'reactivate') return { ok: false, reason: 'Retire or reactivate.' }
  const db = await client()
  const { data, error } = await db.rpc('mkt_product_status', { p_id: id, p_to: to })
  if (error) return { ok: false, reason: words(error, 'The product could not be changed. Please try again.') }
  revalidatePath('/marketing', 'layout')
  const r = (data ?? {}) as { status?: string; retiredOn?: string; live?: number }
  return { ok: true, status: r.status === 'retired' ? 'retired' : 'active', retiredOn: r.retiredOn ? String(r.retiredOn) : null, live: Number(r.live ?? 0), book: await freshProducts(db) }
}

/** A product project's page as it now stands, for the page that wrote it. */
async function freshProject(db: SupabaseClient, project: string): Promise<ProductProjectPage | null> {
  const { data, error } = await db.rpc('mkt_product_project', { p_key: project })
  return error ? null : productProjectFromRow(data)
}

/** New Project › 📦 Product project: made on the product's version in effect, its intake minutes ready to fill in — with
 * the manager's amount (②b-2b: a quote; the list price when none is typed). */
export async function startMktProduct(sub: string, product: string, amount?: number | null): Promise<Done<{ id: string; track: string }>> {
  await requireActionOn('/marketing/new', 'marketing', 'manage')
  if (!isId(sub)) return { ok: false, reason: 'Pick who the project is for.' }
  if (!isId(product)) return { ok: false, reason: 'Pick a product.' }
  const a = amountOf(amount)
  if (a === undefined) return { ok: false, reason: 'An amount in ringgit above zero, at most two decimals.' }
  const { data, error } = await (await client()).rpc('mkt_product_start', { p_sub: sub, p_product: product, ...(a === null ? {} : { p_amount: a }) })
  if (error) return { ok: false, reason: words(error, 'The project could not be started. Please try again.') }
  freshen()
  const r = (data ?? {}) as { id?: string; track?: string }
  return { ok: true, id: String(r.id ?? ''), track: String(r.track ?? '') }
}

/** Minutes written: only what changed, on the minutes the page last saw. A change the PIC sees after they approved sends
 * the project back to them — the page then comes back as it now stands; so it does when the second PIC changed (their
 * own link made, or gone — mig 20261025034000). */
export async function fillMktMinutes(minutes: string, project: string, rev: number, patch: Record<string, unknown>): Promise<Done<{ rev: number; reapproval: boolean; page: ProductProjectPage | null }>> {
  await requireActionOn('/marketing/projects/[id]', 'marketing', 'manage')
  if (!isId(minutes) || !isId(project)) return { ok: false, reason: 'Those minutes are not there any more.' }
  if (!Number.isInteger(rev)) return { ok: false, reason: 'Reload the page and try again.' }
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return { ok: false, reason: 'Nothing to save.' }
  const db = await client()
  const { data, error } = await db.rpc('mkt_minutes_fill', { p_minutes: minutes, p_rev: rev, p_patch: patch })
  if (error) return { ok: false, reason: words(error, 'The minutes could not be saved. Please try again.') }
  const r = (data ?? {}) as { rev?: number; reapproval?: boolean }
  const again = r.reapproval === true || 'pic2' in patch
  if (again) freshen()
  return { ok: true, rev: Number(r.rev ?? rev + 1), reapproval: r.reapproval === true, page: again ? await freshProject(db, project) : null }
}

/** An attendee signs the minutes, as themselves. */
export async function signMktMinutes(minutes: string, project: string): Promise<Done<{ page: ProductProjectPage | null }>> {
  await requireActionOn('/marketing/projects/[id]', 'marketing', 'edit')
  if (!isId(minutes) || !isId(project)) return { ok: false, reason: 'Those minutes are not there any more.' }
  const db = await client()
  const { error } = await db.rpc('mkt_minutes_sign', { p_minutes: minutes })
  if (error) return { ok: false, reason: words(error, 'The minutes could not be signed. Please try again.') }
  return { ok: true, page: await freshProject(db, project) }
}

/** The intake minutes sent: the tracking link made, the project waits for the PIC (or, with no PIC sign-off, is approved). */
export async function sendMktMinutes(minutes: string, project: string, rev: number): Promise<Done<{ page: ProductProjectPage | null }>> {
  await requireActionOn('/marketing/projects/[id]', 'marketing', 'manage')
  if (!isId(minutes) || !isId(project)) return { ok: false, reason: 'Those minutes are not there any more.' }
  if (!Number.isInteger(rev)) return { ok: false, reason: 'Reload the page and try again.' }
  const db = await client()
  const { error } = await db.rpc('mkt_minutes_send', { p_minutes: minutes, p_rev: rev })
  if (error) return { ok: false, reason: words(error, 'The minutes could not be sent. Please try again.') }
  freshen()
  return { ok: true, page: await freshProject(db, project) }
}

/** Started before the PIC approves — the reason kept in the trail. */
export async function overrideMktProject(project: string, reason: string): Promise<Done<{ page: ProductProjectPage | null }>> {
  await requireActionOn('/marketing/projects/[id]', 'marketing', 'manage')
  if (!isId(project)) return { ok: false, reason: 'That project is not there.' }
  const db = await client()
  const { error } = await db.rpc('mkt_project_override', { p_project: project, p_reason: String(reason ?? '') })
  if (error) return { ok: false, reason: words(error, 'It could not be started. Please try again.') }
  freshen()
  return { ok: true, page: await freshProject(db, project) }
}

/** Sent to the PIC again, after the changes they asked for. */
export async function resendMktProject(project: string): Promise<Done<{ page: ProductProjectPage | null }>> {
  await requireActionOn('/marketing/projects/[id]', 'marketing', 'manage')
  if (!isId(project)) return { ok: false, reason: 'That project is not there.' }
  const db = await client()
  const { error } = await db.rpc('mkt_project_resend', { p_project: project })
  if (error) return { ok: false, reason: words(error, 'It could not be resent. Please try again.') }
  freshen()
  return { ok: true, page: await freshProject(db, project) }
}

/** The work starts (②b-2a): the product's deliverables made — each action × its quantity — each to be planned; a
 * recurring one's every month after on its run day (②b-2f — the user's answer 12). */
export async function beginMktProduct(project: string, runDay?: number | null): Promise<Done<{ page: ProductProjectPage | null; deliverables: number }>> {
  await requireActionOn('/marketing/projects/[id]', 'marketing', 'manage')
  if (!isId(project)) return { ok: false, reason: 'That project is not there.' }
  const db = await client()
  const { data, error } = await db.rpc('mkt_product_begin', { p_project: project, ...(Number.isInteger(runDay) ? { p_run_day: runDay } : {}) })
  if (error) return { ok: false, reason: words(error, 'The work could not be started. Please try again.') }
  freshen()
  const made = data && typeof data === 'object' ? Number((data as { deliverables?: unknown }).deliverables) || 0 : 0
  return { ok: true, page: await freshProject(db, project), deliverables: made }
}

/** A recurring product project's run day moved (②b-2f): the months not made yet are made on the new day. */
export async function setMktRunDay(project: string, day: number): Promise<Done<{ page: ProductProjectPage | null }>> {
  await requireActionOn('/marketing/projects/[id]', 'marketing', 'manage')
  if (!isId(project)) return { ok: false, reason: 'That project is not there.' }
  if (!Number.isInteger(day) || day < 1 || day > 28) return { ok: false, reason: 'Pick a day from the 1st to the 28th.' }
  const { data, error } = await (await client()).rpc('mkt_product_run_day', { p_project: project, p_day: day })
  if (error) return { ok: false, reason: words(error, 'The run day could not be saved. Please try again.') }
  freshen()
  return { ok: true, page: productProjectFromRow(data) }
}

/** A recurring project paused (②b-2g — no month's work made while it is paused; still billed, answer 51) or resumed
 * (from this month: a month whose run day came while it was paused is left out). */
export async function pauseMktProduct(project: string, pause: boolean): Promise<Done<{ page: ProductProjectPage | null }>> {
  await requireActionOn('/marketing/projects/[id]', 'marketing', 'manage')
  if (!isId(project)) return { ok: false, reason: 'That project is not there.' }
  if (typeof pause !== 'boolean') return { ok: false, reason: 'Reload the page and try again.' }
  const { data, error } = await (await client()).rpc('mkt_product_pause', { p_project: project, p_pause: pause })
  if (error) return { ok: false, reason: words(error, `The project could not be ${pause ? 'paused' : 'resumed'}. Please try again.`) }
  freshen()
  return { ok: true, page: productProjectFromRow(data) }
}

/** A deliverable's Assignment Plan saved (②b-2a): its start day, each stage's person, approvals, days and subtasks —
 * and, once it has opened, why a stage changes hands. */
export async function planMktDeliverable(project: string, plan: Record<string, unknown>): Promise<Done<{ page: MktTaskPage | null; reassigned: number }>> {
  await requireActionOn('/marketing/projects/[id]', 'marketing', 'manage')
  if (!isId(project)) return { ok: false, reason: 'That deliverable is not there.' }
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.stages)) return { ok: false, reason: 'Reload the page and try again.' }
  const db = await client()
  const { data, error } = await db.rpc('mkt_deliverable_plan', { p_project: project, p_plan: plan })
  if (error) return { ok: false, reason: words(error, 'The plan could not be saved. Please try again.') }
  freshen()
  const moved = data && typeof data === 'object' ? Number((data as { reassigned?: unknown }).reassigned) || 0 : 0
  return { ok: true, page: await fresh(db, project), reassigned: moved }
}

/** An address as a form sent it: the six parts checked against Malaysia's list (the page asked first), tidied — null for
 * none; a refusal in words. */
function billAddress(v: unknown): { ok: true; address: ReturnType<typeof cleanAddress> | null } | { ok: false; reason: string } {
  if (v == null) return { ok: true, address: null }
  const a = addressFromParts(v)
  if (!a) return { ok: false, reason: 'An address in its parts.' }
  if (isEmptyAddress(a)) return { ok: true, address: null }
  const refused = addressRefusal(a, MALAYSIA_DATA)
  return refused ? { ok: false, reason: refused } : { ok: true, address: cleanAddress(a) }
}
const words200 = (v: unknown) => (v == null ? null : String(v).slice(0, 200))

/** Marketing's own client (+ Add subsidiary): its name and PIC, and its billing details when given (②b-2b — the user's
 * answer 50); its code made by the database. */
export async function addMktClient(name: string, pic: string, bill?: { name?: string | null; address?: unknown; phone?: string | null; email?: string | null } | null): Promise<Done<{ sub: MktSub }>> {
  await requireActionOn('/marketing/new', 'marketing', 'manage')
  const n = String(name ?? '').trim()
  if (!n) return { ok: false, reason: 'Name the company or client.' }
  let p_bill: Record<string, unknown> | null = null
  if (bill) {
    const a = billAddress(bill.address)
    if (!a.ok) return a
    p_bill = { name: words200(bill.name), address: a.address, phone: words200(bill.phone), email: words200(bill.email) }
  }
  const { data, error } = await (await client()).rpc('mkt_sub_add', {
    p_name: n.slice(0, 200), p_pic: String(pic ?? '').trim().slice(0, 200) || null, ...(p_bill ? { p_bill } : {}),
  })
  if (error || !data || typeof data !== 'object') return { ok: false, reason: words(error, 'The client could not be added. Please try again.') }
  freshen()
  return { ok: true, sub: subFromRow(data as Record<string, unknown>) }
}

const CLIENT_KEYS = ['name', 'pic', 'whatsapp', 'pic2', 'whatsapp2', 'billName', 'billPhone', 'billEmail'] as const
export type ClientPatchKey = (typeof CLIENT_KEYS)[number] | 'billAddress'

/** A client's details edited on its page (②b-2d-2a, mig 20261025034000): only the fields that changed — its name
 * (Marketing's own clients; a group company keeps its own), its PIC and their WhatsApp, its second PIC and theirs; an
 * outside client's billing details (②b-2b, mig 20261025121000 — its name, address, phone, email). */
export async function editMktClient(sub: string, patch: Partial<Record<ClientPatchKey, unknown>>): Promise<Done<{ sub: MktSub; bill: ReturnType<typeof clientBillFromRow> }>> {
  await requireActionOn('/marketing/subsidiaries/[code]', 'marketing', 'manage')
  if (!isId(sub)) return { ok: false, reason: 'That client is not there.' }
  const clean: Record<string, unknown> = {}
  for (const k of CLIENT_KEYS) if (patch && k in patch) clean[k] = words200(patch[k])
  if (patch && 'billAddress' in patch) {
    const a = billAddress(patch.billAddress)
    if (!a.ok) return a
    clean.billAddress = a.address
  }
  if (!Object.keys(clean).length) return { ok: false, reason: 'Nothing changed.' }
  const { data, error } = await (await client()).rpc('mkt_sub_edit', { p_sub: sub, p_patch: clean })
  if (error || !data || typeof data !== 'object') return { ok: false, reason: words(error, 'The client could not be saved. Please try again.') }
  freshen()
  return { ok: true, sub: subFromRow(data as Record<string, unknown>), bill: clientBillFromRow((data as Record<string, unknown>).bill) }
}

/** A PIC's calendar link (⑤-2, mig 20261025161000 — `PIC Calendar.dc.html`): the first PIC's or the second's — made when
 * there is none (or its PIC changed since), the same one otherwise; `renew` makes a new one and the old one stops
 * working. Nothing on any page changes with it. */
export async function mktCalendarLink(sub: string, slot: 1 | 2, renew = false): Promise<Done<{ code: string }>> {
  await requireActionOn('/marketing/subsidiaries/[code]', 'marketing', 'manage')
  if (!isId(sub)) return { ok: false, reason: 'That subsidiary is not there.' }
  if (slot !== 1 && slot !== 2) return { ok: false, reason: 'Pick its first PIC or its second.' }
  const { data, error } = await (await client()).rpc('mkt_sub_cal_link', { p_sub: sub, p_slot: slot, p_renew: renew === true })
  if (error || typeof data !== 'string' || !/^[0-9a-f]{32}$/.test(data)) {
    return { ok: false, reason: words(error, 'The calendar link could not be made. Please try again.') }
  }
  return { ok: true, code: data }
}

// ── Billing (②b-2b, mig 20261025121000 — the user's answers 43–48, 50, 51), the manager's ──────────────────────

/** A product project's amount changed on its page: a one-time project's until its billing is confirmed; a recurring
 * one's for the months not confirmed yet. */
export async function setMktProjectAmount(project: string, amount: number): Promise<Done<{ page: ProductProjectPage | null }>> {
  await requireActionOn('/marketing/projects/[id]', 'marketing', 'manage')
  if (!isId(project)) return { ok: false, reason: 'That project is not there.' }
  const a = amountOf(amount)
  if (a == null) return { ok: false, reason: 'An amount in ringgit above zero, at most two decimals.' }
  const { data, error } = await (await client()).rpc('mkt_project_bill_set', { p_project: project, p_amount: a })
  if (error) return { ok: false, reason: words(error, 'The amount could not be saved. Please try again.') }
  freshen()
  return { ok: true, page: productProjectFromRow(data) }
}

/** A recurring project stopped: this month its last billed; it closes once nothing of it is under way. */
export async function stopMktProduct(project: string): Promise<Done<{ page: ProductProjectPage | null }>> {
  await requireActionOn('/marketing/projects/[id]', 'marketing', 'manage')
  if (!isId(project)) return { ok: false, reason: 'That project is not there.' }
  const { data, error } = await (await client()).rpc('mkt_product_stop', { p_project: project })
  if (error) return { ok: false, reason: words(error, 'The project could not be stopped. Please try again.') }
  freshen()
  return { ok: true, page: productProjectFromRow(data) }
}

/** A month's lines confirmed — these projects' (a client's *Confirm all*, or one line). */
export async function confirmMktBills(month: string, projects: readonly string[]): Promise<Done<{ page: BillingPage | null; confirmed: number }>> {
  await requireActionOn('/marketing/billing', 'marketing', 'manage')
  if (typeof month !== 'string' || !MONTH.test(month)) return { ok: false, reason: 'Pick the month.' }
  const ids = Array.isArray(projects) ? projects.filter(isId) : []
  if (!ids.length || ids.length !== projects.length || ids.length > 200) return { ok: false, reason: 'Pick what to confirm — at most 200 at once.' }
  const { data, error } = await (await client()).rpc('mkt_bill_confirm', { p_month: month, p_projects: ids })
  if (error) return { ok: false, reason: words(error, 'The billing could not be confirmed. Please try again.') }
  revalidatePath('/marketing/billing')
  const n = (data as Record<string, unknown> | null)?.confirmed
  return { ok: true, page: billingFromRow(data), confirmed: typeof n === 'number' ? n : 0 }
}

/** A confirmation taken back: the line is the month's to confirm again. */
export async function withdrawMktBill(bill: string): Promise<Done<{ page: BillingPage | null }>> {
  await requireActionOn('/marketing/billing', 'marketing', 'manage')
  if (!isId(bill)) return { ok: false, reason: 'That confirmation is not there.' }
  const { data, error } = await (await client()).rpc('mkt_bill_withdraw', { p_bill: bill })
  if (error) return { ok: false, reason: words(error, 'The confirmation could not be withdrawn. Please try again.') }
  revalidatePath('/marketing/billing')
  return { ok: true, page: billingFromRow(data) }
}

/** Replace Person (④-5, mig 20261025036000): one person for another in the places ticked, with the reason — the
 * database takes only those still theirs, and keeps the record. */
export async function replaceMktPerson(from: string, to: string, keys: readonly string[], reason: string): Promise<Done<{ done: ReplaceDone }>> {
  await requireActionOn('/marketing/replace', 'marketing', 'manage')
  if (!isId(from) || !isId(to)) return { ok: false, reason: 'Pick who is replaced and who takes over.' }
  const clean = [...new Set((Array.isArray(keys) ? keys : []).filter(k => typeof k === 'string' && k.length <= 120))].slice(0, 2000)
  if (!clean.length) return { ok: false, reason: 'Tick at least one place.' }
  const { data, error } = await (await client()).rpc('mkt_replace_person',
    { p_from: from, p_to: to, p_keys: clean, p_reason: String(reason ?? '').slice(0, 200) })
  const done = error ? null : replaceDoneFromRow(data)
  if (!done) return { ok: false, reason: words(error, 'The replacement could not be made. Please try again.') }
  freshen()
  return { ok: true, done }
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


// ── The Library (⑥-1, mig 20261024007000) ─────────────────────────────────────
// Each answers with the Library as it now stands, for the page that wrote it.

async function library(db: SupabaseClient): Promise<Library | null> {
  const { data, error } = await db.rpc('mkt_library')
  return error ? null : libraryFromRow(data)
}

async function libraryAfter(db: SupabaseClient, error: { message?: string } | null, fallback: string): Promise<Done<{ library: Library }>> {
  if (error) return { ok: false, reason: words(error, fallback) }
  revalidatePath('/marketing/library')
  const lib = await library(db)
  return lib ? { ok: true, library: lib } : { ok: false, reason: 'Saved — the Library could not be read again. Refresh the page.' }
}

/** A new folder type, for every subsidiary — the manager's; a link type (as Raw footage) keeps each folder elsewhere. */
export async function addMktLibType(name: string, color: string, cat: string, link = false): Promise<Done<{ library: Library }>> {
  await requireActionOn('/marketing/library', 'marketing', 'manage')
  const db = await client()
  const { error } = await db.rpc('mkt_lib_type_add', {
    p_name: String(name ?? '').slice(0, 80), p_color: String(color ?? ''), p_cat: String(cat ?? ''), p_link: link === true,
  })
  return libraryAfter(db, error, 'The folder type could not be added. Please try again.')
}

/** A subsidiary's folder of a type; a link type takes its https address. */
export async function addMktLibFolder(sub: string, type: string, url: string | null): Promise<Done<{ library: Library }>> {
  await requireActionOn('/marketing/library', 'marketing', 'edit')
  if (!isId(sub) || !isId(type)) return { ok: false, reason: 'Pick a subsidiary and a folder type.' }
  const db = await client()
  const { error } = await db.rpc('mkt_lib_folder_add', { p_sub: sub, p_type: type, p_url: url ? String(url).trim().slice(0, 1000) : null })
  return libraryAfter(db, error, 'The folder could not be added. Please try again.')
}

/** The file just put in the bucket, into a folder. */
export async function fileMktLib(folder: string, name: string, path: string): Promise<Done<{ library: Library }>> {
  await requireActionOn('/marketing/library', 'marketing', 'edit')
  if (!isId(folder)) return { ok: false, reason: 'That folder is not there.' }
  const db = await client()
  const { error } = await db.rpc('mkt_lib_file_add', { p_folder: folder, p_name: String(name ?? '').slice(0, 300), p_path: String(path ?? '') })
  return libraryAfter(db, error, 'The file could not be added. Please try again.')
}

/** A file to another folder; a folder to another subsidiary. */
export async function moveMktLib(kind: 'file' | 'folder', id: string, to: string): Promise<Done<{ library: Library }>> {
  await requireActionOn('/marketing/library', 'marketing', 'edit')
  if ((kind !== 'file' && kind !== 'folder') || !isId(id) || !isId(to)) return { ok: false, reason: 'Pick where it goes.' }
  const db = await client()
  const { error } = await db.rpc('mkt_lib_move', { p_kind: kind, p_id: id, p_to: to })
  return libraryAfter(db, error, 'It could not be moved. Please try again.')
}

/** To the Dustbin (a folder with its files), or out of it. */
export async function binMktLib(kind: 'file' | 'folder', id: string, restore = false): Promise<Done<{ library: Library }>> {
  await requireActionOn('/marketing/library', 'marketing', 'edit')
  if ((kind !== 'file' && kind !== 'folder') || !isId(id)) return { ok: false, reason: 'That is not there.' }
  const db = await client()
  const { error } = await db.rpc(restore ? 'mkt_lib_restore' : 'mkt_lib_bin', { p_kind: kind, p_id: id })
  return libraryAfter(db, error, restore ? 'It could not be restored. Please try again.' : 'It could not be moved to the Dustbin. Please try again.')
}

/** Gone for good, from the Dustbin — the manager's. */
export async function deleteMktLib(kind: 'file' | 'folder', id: string): Promise<Done<{ library: Library }>> {
  await requireActionOn('/marketing/library', 'marketing', 'manage')
  if ((kind !== 'file' && kind !== 'folder') || !isId(id)) return { ok: false, reason: 'That is not there.' }
  const db = await client()
  const { error } = await db.rpc('mkt_lib_delete', { p_kind: kind, p_id: id })
  return libraryAfter(db, error, 'It could not be deleted. Please try again.')
}

/** A file's or a folder's guest link (⑥-3, mig 20261024007300): made, or the live one's expiry and download changed. */
export async function shareMktLib(kind: 'file' | 'folder', id: string, expiry: ShareExpiry, download: boolean): Promise<Done<{ library: Library }>> {
  await requireActionOn('/marketing/library', 'marketing', 'edit')
  if ((kind !== 'file' && kind !== 'folder') || !isId(id)) return { ok: false, reason: 'That is not there.' }
  if (!SHARE_EXPIRIES.some(e => e.key === expiry)) return { ok: false, reason: 'Pick when the link expires.' }
  const db = await client()
  const { error } = await db.rpc('mkt_lib_share', { p_kind: kind, p_id: id, p_expiry: expiry, p_download: download !== false })
  return libraryAfter(db, error, 'The link could not be made. Please try again.')
}

/** Library files onto a task (⑥-4, mig 20261024007400) — from the Library's *Attach to task* or the task's *Attach from
 * Library*: the task's files as they now stand. */
export async function attachMktTaskFiles(project: string, files: string[]): Promise<Done<{ files: TaskFile[]; attached: number }>> {
  await requireActionOn(['/marketing/library', '/marketing/projects/[id]'], 'marketing', 'edit')
  const ids = (Array.isArray(files) ? files : []).filter(isId).slice(0, 50)
  if (!isId(project) || !ids.length) return { ok: false, reason: 'Pick a file and a task.' }
  const db = await client()
  const { data, error } = await db.rpc('mkt_task_attach', { p_project: project, p_files: ids })
  if (error) return { ok: false, reason: words(error, 'The files could not be attached. Please try again.') }
  freshen()
  const row = (data ?? {}) as { attached?: unknown; files?: unknown }
  return { ok: true, files: taskFilesFromRow(row.files), attached: Number(row.attached) || 0 }
}

/** A Library file taken off a task — it stays in the Library. */
export async function detachMktTaskFile(project: string, file: string): Promise<Done<{ files: TaskFile[] }>> {
  await requireActionOn('/marketing/projects/[id]', 'marketing', 'edit')
  if (!isId(project) || !isId(file)) return { ok: false, reason: 'That file is not on the task.' }
  const db = await client()
  const { data, error } = await db.rpc('mkt_task_detach', { p_project: project, p_file: file })
  if (error) return { ok: false, reason: words(error, 'The file could not be taken off. Please try again.') }
  freshen()
  return { ok: true, files: taskFilesFromRow(data) }
}

/** A guest link stopped at once. */
export async function stopMktLibShare(kind: 'file' | 'folder', id: string): Promise<Done<{ library: Library }>> {
  await requireActionOn('/marketing/library', 'marketing', 'edit')
  if ((kind !== 'file' && kind !== 'folder') || !isId(id)) return { ok: false, reason: 'That is not there.' }
  const db = await client()
  const { error } = await db.rpc('mkt_lib_share_stop', { p_kind: kind, p_id: id })
  return libraryAfter(db, error, 'The link could not be stopped. Please try again.')
}

/** A subsidiary's brand profile, saved whole (⑥-2, mig 20261024007200) — Marketing · Edit's since 2026-10-24 (the user:
 * "人人都能改 · but with audit log"; mig 20261025004000), every change kept in its history. */
export async function saveMktLibProfile(sub: string, profile: LibProfile): Promise<Done<{ library: Library }>> {
  await requireActionOn('/marketing/library', 'marketing', 'edit')
  if (!isId(sub)) return { ok: false, reason: 'That subsidiary is not on the list.' }
  const db = await client()
  // Whatever came in, read as a stored profile would be (only the handoff's colours and fonts, words as text).
  const p = profile ?? NO_PROFILE
  const clean = profileFromRow({ avatar: p.avatar, avatar_path: p.avatarPath, banner: p.banner, banner_path: p.bannerPath, font: p.font, name: p.name, caption: p.caption })
  const { error } = await db.rpc('mkt_lib_profile_save', { p_sub: sub, p_profile: profileToRow(clean) })
  return libraryAfter(db, error, 'The brand profile could not be saved. Please try again.')
}

/** My Space's own side (⑦-1, migs 20261024007500 and 20261024007600): only the parts sent — the layout, the look, the
 * cover, the avatar, the status, the notes, the photo. The page keeps what it drew; the space as saved comes back. */
export async function saveMktSpace(patch: SpacePatch): Promise<Done<{ space: Space }>> {
  await requireActionOn('/marketing', 'marketing', 'edit')
  const clean = spacePatchOf(patch ?? {})
  if (!Object.keys(clean).length) return { ok: false, reason: 'Nothing to save.' }
  const { data, error } = await (await client()).rpc('mkt_space_save', { p_patch: clean })
  if (error) return { ok: false, reason: words(error, 'Your space could not be saved. Please try again.') }
  revalidatePath('/marketing')
  return { ok: true, space: spaceFromRow(data) }
}

/** The viewer's pet fed (a snack, +20 energy) or worked out (−15 energy, +10 XP the first three a day) — ⑦-5, mig
 * 20261025037000. Marketing · Edit; the database asks the roster and the pet set up. */
export async function careMktPet(what: 'feed' | 'workout'): Promise<Done<{ pet: PetStats }>> {
  await requireActionOn('/marketing', 'marketing', 'edit')
  const { data, error } = await (await client()).rpc('mkt_pet_care', { p_what: what === 'workout' ? 'workout' : 'feed' })
  if (error) return { ok: false, reason: words(error, 'Your pet could not be looked after. Please try again.') }
  const pet = petStatsFromRow(data)
  if (!pet) return { ok: false, reason: 'Your pet could not be looked after. Please try again.' }
  revalidatePath('/marketing')
  return { ok: true, pet }
}

/** A chat message (⑦-3, mig 20261025039000) to the lobby or a teammate — its words and/or a task attached. Marketing ·
 * Edit; the database asks that both are on the roster with a login. Nobody is told (the user's answer 39). */
export async function sendMktChat(to: string, body: string | null, project: string | null = null): Promise<Done<{ message: ChatMessage }>> {
  await requireActionOn('/marketing', 'marketing', 'edit')
  if (to !== 'lobby' && !isId(to)) return { ok: false, reason: 'A message goes to the lobby or to somebody on Marketing’s roster.' }
  const { data, error } = await (await client()).rpc('mkt_chat_send', { p_with: to.toLowerCase(), p_body: body ?? null, p_project: project && isId(project) ? project : null })
  if (error) return { ok: false, reason: words(error, 'Your message could not be sent. Please try again.') }
  const message = chatMessageFromRow(data)
  if (!message) return { ok: false, reason: 'Your message could not be sent. Please try again.' }
  return { ok: true, message }
}

/** A direct message opened on a complaint (⑦-3b, mig 20261025039500; the user's answer 35, amended): the two people and
 * the reason first, then the record of it, then their messages. A full-access title's own login only — the database asks
 * the login (never the shared Principal one) and keeps the record for good; nobody is told. */
export async function openMktChatReview(a: string, b: string, reason: string): Promise<Done<{ open: ChatReviewOpen }>> {
  await requireActionOn('/marketing/chat-review', 'accounts', 'manage')
  if (!isId(a) || !isId(b)) return { ok: false, reason: 'Pick the two people whose chat it is.' }
  const { data, error } = await (await client()).rpc('mkt_chat_review_open', { p_a: a.toLowerCase(), p_b: b.toLowerCase(), p_reason: reason })
  if (error) return { ok: false, reason: words(error, 'The chat could not be opened. Please try again.') }
  const open = reviewOpenFromRow(data)
  if (!open) return { ok: false, reason: 'The chat could not be opened. Please try again.' }
  // The page's records, fresh on the next visit too.
  revalidatePath('/marketing/chat-review')
  return { ok: true, open }
}

/** The caller has read a thread to there (⑦-3) — their own mark, forward only. */
export async function readMktChat(to: string, last: number): Promise<Done> {
  await requireActionOn('/marketing', 'marketing', 'edit')
  if ((to !== 'lobby' && !isId(to)) || !Number.isFinite(last)) return { ok: false, reason: 'Nothing to mark.' }
  const { error } = await (await client()).rpc('mkt_chat_read', { p_with: to.toLowerCase(), p_last: Math.floor(last) })
  if (error) return { ok: false, reason: words(error, 'Could not mark it read.') }
  return { ok: true }
}
