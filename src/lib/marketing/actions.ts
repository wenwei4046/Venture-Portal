'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { requireActionOn } from '@/lib/auth'
import { pushSoon } from '@/lib/push/outbox'
import { createClient } from '@/lib/supabase/server'
import { subFromRow, type MktSub } from './board'
import { freeFromRow, taskFromRow, type FreeBlock, type FreeType, type MktTaskPage } from './task'
import type { StageWork } from './tasks'
import { minutesTemplatesFromRow, type MinutesTemplate } from './minutes'
import { productBookFromRow, type ProductBook, type ProductStatus } from './products'
import { productProjectFromRow, type ProductProjectPage } from './project'
import { workflowsFromRow, type WfTemplate } from './workflows'
import { libraryFromRow, type Library } from './library'

/**
 * Marketing's writes (2026-10-23, migs 20261023234000, 20261023235500, 20261023235800, 20261023235900, 20261024002000 and
 * 20261024004000) — New Project's quick and recurring tasks, a stage accepted, worked, handed on, approved or sent back,
 * Nudge, a series paused or ended, the Free space; the Workflow Builder's, the Minutes Builder's and the Product Builder's
 * drafts saved and published (a workflow cloned, a product retired or reactivated); a 📦 product project started, its
 * intake minutes written, signed, sent to the PIC, started before approval, resent; Marketing's own client added.
 * Each asks its gate here and its cell again in
 * the database, which also decides whose stage it is. A refusal answers `{ ok: false, reason }` in words (production
 * masks a thrown message).
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

/** New Project › 📦 Product project: made on the product's version in effect, its intake minutes ready to fill in. */
export async function startMktProduct(sub: string, product: string): Promise<Done<{ id: string; track: string }>> {
  await requireActionOn('/marketing/new', 'marketing', 'manage')
  if (!isId(sub)) return { ok: false, reason: 'Pick who the project is for.' }
  if (!isId(product)) return { ok: false, reason: 'Pick a product.' }
  const { data, error } = await (await client()).rpc('mkt_product_start', { p_sub: sub, p_product: product })
  if (error) return { ok: false, reason: words(error, 'The project could not be started. Please try again.') }
  freshen()
  const r = (data ?? {}) as { id?: string; track?: string }
  return { ok: true, id: String(r.id ?? ''), track: String(r.track ?? '') }
}

/** Minutes written: only what changed, on the minutes the page last saw. A change the PIC sees after they approved sends
 * the project back to them — the page then comes back as it now stands. */
export async function fillMktMinutes(minutes: string, project: string, rev: number, patch: Record<string, unknown>): Promise<Done<{ rev: number; reapproval: boolean; page: ProductProjectPage | null }>> {
  await requireActionOn('/marketing/projects/[id]', 'marketing', 'manage')
  if (!isId(minutes) || !isId(project)) return { ok: false, reason: 'Those minutes are not there any more.' }
  if (!Number.isInteger(rev)) return { ok: false, reason: 'Reload the page and try again.' }
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return { ok: false, reason: 'Nothing to save.' }
  const db = await client()
  const { data, error } = await db.rpc('mkt_minutes_fill', { p_minutes: minutes, p_rev: rev, p_patch: patch })
  if (error) return { ok: false, reason: words(error, 'The minutes could not be saved. Please try again.') }
  const r = (data ?? {}) as { rev?: number; reapproval?: boolean }
  if (r.reapproval) freshen()
  return { ok: true, rev: Number(r.rev ?? rev + 1), reapproval: r.reapproval === true, page: r.reapproval ? await freshProject(db, project) : null }
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

/** Marketing's own client (+ Add subsidiary): its name and PIC; its code made by the database. */
export async function addMktClient(name: string, pic: string): Promise<Done<{ sub: MktSub }>> {
  await requireActionOn('/marketing/new', 'marketing', 'manage')
  const n = String(name ?? '').trim()
  if (!n) return { ok: false, reason: 'Name the company or client.' }
  const { data, error } = await (await client()).rpc('mkt_sub_add', { p_name: n.slice(0, 200), p_pic: String(pic ?? '').trim().slice(0, 200) || null })
  if (error || !data || typeof data !== 'object') return { ok: false, reason: words(error, 'The client could not be added. Please try again.') }
  freshen()
  return { ok: true, sub: subFromRow(data as Record<string, unknown>) }
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

/** A new folder type, for every subsidiary — the manager's. */
export async function addMktLibType(name: string, color: string, cat: string): Promise<Done<{ library: Library }>> {
  await requireActionOn('/marketing/library', 'marketing', 'manage')
  const db = await client()
  const { error } = await db.rpc('mkt_lib_type_add', { p_name: String(name ?? '').slice(0, 80), p_color: String(color ?? ''), p_cat: String(cat ?? '') })
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
