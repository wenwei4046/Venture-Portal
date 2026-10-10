'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { requireAction, requireAnyAction } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { HIRING_BUCKET, contentTypeOf, fileRefusal, objectPath, previewKind } from './files'
import type { CandidateField, CandidateStage, HiringField } from './types'

/**
 * Hiring's writes (2026-10-11, HR revamp round 2 — README §11–13), shared by
 * the portal's pages and the HR phone app. Each stands behind the Hiring cell
 * it is (mig 20261011060000) and calls one of the module's own functions (mig
 * 20261011080000), which asks again: a request is filed with Create, decided
 * with Approve (acknowledge, more info, decline, fill, cancel, reopen),
 * worked on with Edit (candidates, settings, the Talent Bank's notes).
 *
 * Refusals come back as `{ ok: false, reason }`: a thrown message reaches
 * production's browser only as a digest.
 */

export type HiringOutcome = { ok: true } | { ok: false; reason: string }
export type HiringIdOutcome = { ok: true; id: string } | { ok: false; reason: string }

const NO_ACCESS = 'Hiring needs the right permission for that.'

async function client(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient
}

/** The database's refusal in words: its own sentence, or what went wrong. */
function refusal(error: PostgrestError, fallback: string): string {
  if (error.code === '42501') return NO_ACCESS
  if (error.code === '22023' || error.code === 'P0001' || error.code === '23505') return error.message
  return fallback
}

function refresh() {
  revalidatePath('/hiring', 'layout')
  revalidatePath('/hr-app', 'layout')
}

async function call(fn: string, args: Record<string, unknown>, fallback: string): Promise<HiringOutcome> {
  const { error } = await (await client()).rpc(fn, args)
  if (error) return { ok: false, reason: refusal(error, fallback) }
  refresh()
  return { ok: true }
}

/** A file from a form, put in the bucket: its path and name, or why not. */
async function keepFile(supabase: SupabaseClient, folder: 'resumes' | 'attachments', file: unknown): Promise<{ path: string; name: string } | { error: string } | null> {
  if (!(file instanceof File) || file.size === 0) return null
  const refused = fileRefusal(file)
  if (refused) return { error: refused }
  const path = objectPath(folder, randomUUID(), file.name)
  const { error } = await supabase.storage
    .from(HIRING_BUCKET)
    .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: contentTypeOf(file.name) ?? undefined, upsert: false })
  if (error) return { error: `The file could not be uploaded: ${error.message}` }
  return { path, name: file.name.trim().slice(0, 160) }
}

async function dropFile(supabase: SupabaseClient, path: string | null | undefined) {
  if (!path) return
  await supabase.storage.from(HIRING_BUCKET).remove([path]).then(() => undefined, () => undefined)
}

const text = (form: FormData, key: string) => {
  const v = form.get(key)
  return typeof v === 'string' ? v : ''
}

function answersFrom(raw: string): Record<string, string> | null {
  if (!raw) return {}
  try {
    const v = JSON.parse(raw) as unknown
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null
    const out: Record<string, string> = {}
    for (const [k, value] of Object.entries(v as Record<string, unknown>)) if (typeof value === 'string') out[k] = value
    return out
  } catch {
    return null
  }
}

// ── Requests ────────────────────────────────────────────────────────────────

/** "+ New request" → Submit to HR: filed for somebody working here today. */
export async function submitHiringRequest(input: { requestedBy: string; answers: Record<string, string> }): Promise<HiringIdOutcome> {
  await requireAction('hiring', 'create')
  if (!input.requestedBy) return { ok: false, reason: 'Pick who is asking.' }
  const { data, error } = await (await client()).rpc('hiring_submit', { p_requested_by: input.requestedBy, p_answers: input.answers })
  if (error) return { ok: false, reason: refusal(error, 'The request could not be sent. Please try again.') }
  refresh()
  return { ok: true, id: String(data) }
}

/** Acknowledge: somebody in HR takes the hire on. */
export async function acknowledgeHiringRequest(id: string, owner: string, note = ''): Promise<HiringOutcome> {
  await requireAction('hiring', 'approve')
  if (!owner) return { ok: false, reason: 'Pick the owner first.' }
  return call('hiring_acknowledge', { p_id: id, p_owner: owner, p_note: note || null }, 'The request could not be acknowledged. Please try again.')
}

export async function requestHiringInfo(id: string, note: string): Promise<HiringOutcome> {
  await requireAction('hiring', 'approve')
  if (!note.trim()) return { ok: false, reason: 'Write what you need from the requester.' }
  return call('hiring_request_info', { p_id: id, p_note: note }, 'The request could not be sent back. Please try again.')
}

export async function declineHiringRequest(id: string, note: string): Promise<HiringOutcome> {
  await requireAction('hiring', 'approve')
  if (!note.trim()) return { ok: false, reason: 'Give a reason for declining.' }
  return call('hiring_decline', { p_id: id, p_note: note }, 'The request could not be declined. Please try again.')
}

export async function cancelHiringRequest(id: string, note = ''): Promise<HiringOutcome> {
  await requireAction('hiring', 'approve')
  return call('hiring_cancel', { p_id: id, p_note: note || null }, 'The request could not be cancelled. Please try again.')
}

export async function reopenHiringRequest(id: string): Promise<HiringOutcome> {
  await requireAction('hiring', 'approve')
  return call('hiring_reopen', { p_id: id }, 'The request could not be reopened. Please try again.')
}

export async function setHiringOwner(id: string, owner: string): Promise<HiringOutcome> {
  await requireAction('hiring', 'approve')
  return call('hiring_set_owner', { p_id: id, p_owner: owner }, 'The owner could not be changed. Please try again.')
}

/** Helped by others: who assisted (or nobody again). */
export async function setHiringAssist(id: string, staff: string | null): Promise<HiringOutcome> {
  await requireAnyAction(['hiring', 'edit'], ['hiring', 'approve'])
  return call('hiring_set_assist', { p_id: id, p_staff: staff }, 'Who helped could not be recorded. Please try again.')
}

/** Mark filled: who was hired (this request's candidates), through which source, at what cost. */
export async function fillHiringRequest(id: string, input: { hired: string[]; source: string; cost: string; note: string }): Promise<HiringOutcome> {
  await requireAction('hiring', 'approve')
  const hired = input.hired.map(h => h.trim()).filter(Boolean)
  if (hired.length === 0) return { ok: false, reason: 'Choose who was hired, then Mark filled' }
  if (!input.source) return { ok: false, reason: 'Pick where you found them, then Mark filled' }
  const raw = input.cost.replace(/[^\d.]/g, '')
  const cost = raw === '' ? null : Number(raw)
  if (cost !== null && !Number.isFinite(cost)) return { ok: false, reason: 'The cost is a number of ringgit.' }
  return call('hiring_fill', { p_id: id, p_hired: hired, p_source: input.source, p_cost: cost, p_note: input.note || null }, 'The request could not be marked filled. Please try again.')
}

// ── Candidates ──────────────────────────────────────────────────────────────

/**
 * Add candidate / Edit candidate (the 560px window): name, phone, status,
 * the candidate fields, a note and a résumé. FormData: `request`, `candidate`
 * (absent to add), `name`, `phone`, `stage`, `note`, `answers` (JSON), `file`.
 */
export async function saveHiringCandidate(form: FormData): Promise<HiringOutcome> {
  const candidate = text(form, 'candidate')
  await requireAction('hiring', candidate ? 'edit' : 'create')
  const answers = answersFrom(text(form, 'answers'))
  if (!answers) return { ok: false, reason: 'The details are not in the right shape.' }
  if (!text(form, 'name').trim()) return { ok: false, reason: candidate ? 'Name can’t be empty' : 'Add the candidate’s name' }
  const supabase = await client()
  const kept = await keepFile(supabase, 'resumes', form.get('file'))
  if (kept && 'error' in kept) return { ok: false, reason: kept.error }
  const args = {
    p_name: text(form, 'name'),
    p_phone: text(form, 'phone'),
    p_stage: (text(form, 'stage') || 'shortlisted') as CandidateStage,
    p_note: text(form, 'note'),
    p_answers: answers,
    p_resume_path: kept?.path ?? null,
    p_resume_name: kept?.name ?? null,
  }
  const { error } = candidate
    ? await supabase.rpc('hiring_candidate_edit', { p_candidate: candidate, ...args })
    : await supabase.rpc('hiring_candidate_add', { p_request: text(form, 'request'), ...args })
  if (error) {
    await dropFile(supabase, kept?.path)
    return { ok: false, reason: refusal(error, 'The candidate could not be saved. Please try again.') }
  }
  refresh()
  return { ok: true }
}

/** Change status ▸ — one candidate's stage. */
export async function setCandidateStage(candidate: string, stage: CandidateStage): Promise<HiringOutcome> {
  await requireAction('hiring', 'edit')
  return call('hiring_candidate_stage', { p_candidate: candidate, p_stage: stage }, 'The status could not be changed. Please try again.')
}

/**
 * A résumé or an attachment, through a link that works for ten minutes — made
 * at the press, never kept in a page. A résumé downloaded is a step of the
 * request's trail.
 */
export async function hiringFileLink(kind: 'candidate' | 'talent' | 'attachment', id: string, download = false): Promise<
  { ok: true; url: string; name: string; preview: 'pdf' | 'image' | 'none' } | { ok: false; reason: string }
> {
  await requireAction('hiring', 'view')
  const supabase = await client()
  const { data, error } = await supabase.rpc('hiring_file_path', { p_kind: kind, p_id: id })
  if (error) return { ok: false, reason: refusal(error, 'The file could not be found. Please try again.') }
  const file = data as { path?: string; name?: string } | null
  if (!file?.path) return { ok: false, reason: 'No file has been attached.' }
  const name = file.name || 'file'
  const { data: link, error: linkError } = await supabase.storage
    .from(HIRING_BUCKET)
    .createSignedUrl(file.path, 600, download ? { download: name } : undefined)
  if (linkError || !link) return { ok: false, reason: 'The file could not be opened. Please try again.' }
  if (download && kind === 'candidate') {
    await supabase.rpc('hiring_resume_downloaded', { p_candidate: id })
    refresh()
  }
  return { ok: true, url: link.signedUrl, name, preview: previewKind(name) }
}

// ── Form settings ───────────────────────────────────────────────────────────

/** What requesters fill in — the whole list, in order. */
export async function saveHiringFormFields(fields: HiringField[]): Promise<HiringOutcome> {
  await requireAction('hiring', 'edit')
  const payload = fields.map(f => ({ id: f.id, label: f.label, type: f.type, options: f.options, required: f.required }))
  return call('hiring_save_form_fields', { p_fields: payload }, 'The form could not be saved. Please try again.')
}

/** Candidate fields — what HR fills in for each candidate. */
export async function saveCandidateFields(fields: CandidateField[]): Promise<HiringOutcome> {
  await requireAction('hiring', 'edit')
  const payload = fields.map(f => ({ id: f.id, label: f.label, type: f.type, options: f.options }))
  return call('hiring_save_candidate_fields', { p_fields: payload }, 'The candidate fields could not be saved. Please try again.')
}

export async function addHiringSource(name: string): Promise<HiringOutcome> {
  await requireAction('hiring', 'edit')
  return call('hiring_source_add', { p_name: name }, 'The source could not be added. Please try again.')
}

export async function setHiringSourceActive(id: string, active: boolean): Promise<HiringOutcome> {
  await requireAction('hiring', 'edit')
  return call('hiring_source_set_active', { p_id: id, p_active: active }, 'The source could not be changed. Please try again.')
}

export async function removeHiringSource(id: string): Promise<HiringOutcome> {
  await requireAction('hiring', 'edit')
  return call('hiring_source_remove', { p_id: id }, 'The source could not be removed. Please try again.')
}

// ── The Talent Bank ─────────────────────────────────────────────────────────

/**
 * Add talent, or Move to Talent Bank… from a candidate. FormData: `name`,
 * `phone`, `email`, `position`, `department`, `notes`, `candidate` (from a
 * request), `file`.
 */
export async function saveHiringTalent(form: FormData): Promise<HiringIdOutcome> {
  await requireAction('hiring', 'create')
  const candidate = text(form, 'candidate')
  if (!text(form, 'name').trim() || !text(form, 'position').trim()) {
    return { ok: false, reason: candidate ? 'Name and position are needed.' : 'Add a name and the position they fit.' }
  }
  const supabase = await client()
  const kept = await keepFile(supabase, 'resumes', form.get('file'))
  if (kept && 'error' in kept) return { ok: false, reason: kept.error }
  const { data, error } = await supabase.rpc('hiring_talent_save', {
    p_name: text(form, 'name'),
    p_phone: text(form, 'phone'),
    p_email: text(form, 'email'),
    p_position: text(form, 'position'),
    p_department: text(form, 'department'),
    p_notes: text(form, 'notes'),
    p_resume_path: kept?.path ?? null,
    p_resume_name: kept?.name ?? null,
    p_from_candidate: candidate || null,
  })
  if (error) {
    await dropFile(supabase, kept?.path)
    return { ok: false, reason: refusal(error, 'The talent could not be saved. Please try again.') }
  }
  refresh()
  return { ok: true, id: String(data) }
}

/** Pick from Talent Bank / Invite to interview: the talent joins a request as a shortlisted candidate. */
export async function inviteHiringTalent(talent: string, request: string): Promise<HiringOutcome> {
  await requireAction('hiring', 'create')
  return call('hiring_talent_invite', { p_talent: talent, p_request: request }, 'The talent could not be invited. Please try again.')
}

export async function saveTalentNotes(talent: string, notes: string): Promise<HiringOutcome> {
  await requireAction('hiring', 'edit')
  return call('hiring_talent_update', { p_talent: talent, p_notes: notes }, 'The notes could not be saved. Please try again.')
}

/** A talent's résumé replaced. FormData: `talent`, `file`. */
export async function replaceTalentResume(form: FormData): Promise<HiringOutcome> {
  await requireAction('hiring', 'edit')
  const supabase = await client()
  const kept = await keepFile(supabase, 'resumes', form.get('file'))
  if (!kept) return { ok: false, reason: 'Choose a file.' }
  if ('error' in kept) return { ok: false, reason: kept.error }
  const { error } = await supabase.rpc('hiring_talent_update', { p_talent: text(form, 'talent'), p_notes: null, p_resume_path: kept.path, p_resume_name: kept.name })
  if (error) {
    await dropFile(supabase, kept.path)
    return { ok: false, reason: refusal(error, 'The résumé could not be replaced. Please try again.') }
  }
  refresh()
  return { ok: true }
}

export async function removeHiringTalent(talent: string): Promise<HiringOutcome> {
  await requireAction('hiring', 'edit')
  return call('hiring_talent_remove', { p_talent: talent }, 'The talent could not be removed. Please try again.')
}
