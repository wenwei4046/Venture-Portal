'use server'

import { revalidatePath } from 'next/cache'
import { pushSoon } from '@/lib/push/outbox'
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { requireActionOn, requireAnyActionOn } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { HIRING_BUCKET, previewKind } from './files'
import type { CandidateField, CandidateStage, HiringField } from './types'

/**
 * Hiring's writes (2026-10-11, HR revamp round 2 — README §11–13), shared by
 * the portal's pages and the HR phone app. Each stands behind the Hiring cell
 * it is (mig 20261011060000) and calls one of the module's own functions (mig
 * 20261011080000), which asks again: a request is filed with Create, decided
 * with Approve (acknowledge, more info, decline, fill, cancel, reopen),
 * worked on with Edit (candidates, settings, the Talent Bank's notes).
 *
 * Files (mig 20261011160000): the browser uploads (`upload.ts`), these file
 * them — several per candidate and talent, each with a type — and delete from
 * the bucket what no record names any more, under the caller's own session
 * (the bucket's delete policy asks Edit). A deletion the bucket refuses is
 * SAID (`warning`), never swallowed; the object is then a leftover that a
 * later file write clears (`sweep`).
 *
 * Refusals come back as `{ ok: false, reason }`: a thrown message reaches
 * production's browser only as a digest.
 */

export type HiringOutcome = { ok: true; warning?: string } | { ok: false; reason: string }
export type HiringIdOutcome = { ok: true; id: string } | { ok: false; reason: string }
/** A file the browser has put in the bucket, to be filed: where, its own name, its type. */
export type UploadedFile = { path: string; name: string; typeId: string }

const NO_ACCESS = 'Hiring needs the right permission for that.'
/** Said when the record changed but the bucket kept a file nobody needs any more. */
const LEFT_IN_STORAGE = 'Saved, but the removed file is still in storage. It will be deleted with the next file change.'

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
  // A request's step tells whoever asked (mig 20261011180000): their phone hears it once the answer has gone.
  pushSoon()
}

async function call(fn: string, args: Record<string, unknown>, fallback: string): Promise<HiringOutcome> {
  const { error } = await (await client()).rpc(fn, args)
  if (error) return { ok: false, reason: refusal(error, fallback) }
  refresh()
  return { ok: true }
}

/**
 * Objects deleted from the bucket. True only when every one went: the bucket
 * answers a refused deletion with nothing deleted, not an error.
 */
async function deleteObjects(supabase: SupabaseClient, paths: readonly string[]): Promise<boolean> {
  if (!paths.length) return true
  const res = await supabase.storage.from(HIRING_BUCKET).remove([...paths]).then(r => r, () => null)
  return !!res && !res.error && (res.data?.length ?? 0) >= paths.length
}

/** The objects a function says nobody names any more (`{ orphans: [...] }`). */
function orphansOf(data: unknown): string[] {
  const list = data && typeof data === 'object' ? (data as { orphans?: unknown }).orphans : null
  return Array.isArray(list) ? list.filter((p): p is string => typeof p === 'string') : []
}

/**
 * The leftovers (`hiring_orphan_files`): objects nobody names, put in the bucket
 * over a day ago — a guest's upload never sent, a window closed before Save, a
 * deletion refused. Each file write by somebody with Edit clears up to 50.
 * Best effort: it never fails the write it follows (without Edit it is refused
 * and nothing happens).
 */
async function sweep(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc('hiring_orphan_files', { p_limit: 50 })
  if (error || !Array.isArray(data) || data.length === 0) return
  await supabase.storage.from(HIRING_BUCKET).remove(data.filter((p): p is string => typeof p === 'string')).then(() => undefined, () => undefined)
}

const text = (form: FormData, key: string) => {
  const v = form.get(key)
  return typeof v === 'string' ? v : ''
}

/** Uploads handed in by the browser, as the database files them, or null when not in shape. */
function uploadsFrom(raw: string): Array<{ path: string; name: string; type: string }> | null {
  if (!raw) return []
  try {
    const v = JSON.parse(raw) as unknown
    if (!Array.isArray(v) || v.length > 20) return null
    const out: Array<{ path: string; name: string; type: string }> = []
    for (const f of v) {
      const o = f && typeof f === 'object' ? (f as Record<string, unknown>) : null
      if (!o || typeof o.path !== 'string' || typeof o.name !== 'string' || typeof o.typeId !== 'string') return null
      out.push({ path: o.path, name: o.name, type: o.typeId })
    }
    return out
  } catch {
    return null
  }
}

function idsFrom(raw: string): string[] | null {
  if (!raw) return []
  try {
    const v = JSON.parse(raw) as unknown
    return Array.isArray(v) && v.every(x => typeof x === 'string') ? (v as string[]) : null
  } catch {
    return null
  }
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
  await requireActionOn('/hiring/requests', 'hiring', 'create')
  if (!input.requestedBy) return { ok: false, reason: 'Pick who is asking.' }
  const { data, error } = await (await client()).rpc('hiring_submit', { p_requested_by: input.requestedBy, p_answers: input.answers })
  if (error) return { ok: false, reason: refusal(error, 'The request could not be sent. Please try again.') }
  refresh()
  return { ok: true, id: String(data) }
}

/** Acknowledge: somebody in HR takes the hire on. */
export async function acknowledgeHiringRequest(id: string, owner: string, note = ''): Promise<HiringOutcome> {
  await requireActionOn('/hiring/requests', 'hiring', 'approve')
  if (!owner) return { ok: false, reason: 'Pick the owner first.' }
  return call('hiring_acknowledge', { p_id: id, p_owner: owner, p_note: note || null }, 'The request could not be acknowledged. Please try again.')
}

export async function requestHiringInfo(id: string, note: string): Promise<HiringOutcome> {
  await requireActionOn('/hiring/requests', 'hiring', 'approve')
  if (!note.trim()) return { ok: false, reason: 'Write what you need from the requester.' }
  return call('hiring_request_info', { p_id: id, p_note: note }, 'The request could not be sent back. Please try again.')
}

export async function declineHiringRequest(id: string, note: string): Promise<HiringOutcome> {
  await requireActionOn('/hiring/requests', 'hiring', 'approve')
  if (!note.trim()) return { ok: false, reason: 'Give a reason for declining.' }
  return call('hiring_decline', { p_id: id, p_note: note }, 'The request could not be declined. Please try again.')
}

export async function cancelHiringRequest(id: string, note = ''): Promise<HiringOutcome> {
  await requireActionOn('/hiring/requests', 'hiring', 'approve')
  return call('hiring_cancel', { p_id: id, p_note: note || null }, 'The request could not be cancelled. Please try again.')
}

export async function reopenHiringRequest(id: string): Promise<HiringOutcome> {
  await requireActionOn('/hiring/requests', 'hiring', 'approve')
  return call('hiring_reopen', { p_id: id }, 'The request could not be reopened. Please try again.')
}

export async function setHiringOwner(id: string, owner: string): Promise<HiringOutcome> {
  await requireActionOn('/hiring/requests', 'hiring', 'approve')
  return call('hiring_set_owner', { p_id: id, p_owner: owner }, 'The owner could not be changed. Please try again.')
}

/** Helped by others: who assisted (or nobody again). */
export async function setHiringAssist(id: string, staff: string | null): Promise<HiringOutcome> {
  await requireAnyActionOn('/hiring/requests', ['hiring', 'edit'], ['hiring', 'approve'])
  return call('hiring_set_assist', { p_id: id, p_staff: staff }, 'Who helped could not be recorded. Please try again.')
}

/** Mark filled: who was hired (this request's candidates), through which source, at what cost. */
export async function fillHiringRequest(id: string, input: { hired: string[]; source: string; cost: string; note: string }): Promise<HiringOutcome> {
  await requireActionOn('/hiring/requests', 'hiring', 'approve')
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
 * the candidate fields, a note and their files. FormData: `request`,
 * `candidate` (absent to add), `name`, `phone`, `stage`, `note`, `answers`
 * (JSON), `files` (JSON — the uploads to file, `UploadedFile[]`), `remove`
 * (JSON — ids of files to take off; Edit only).
 */
export async function saveHiringCandidate(form: FormData): Promise<HiringOutcome> {
  const candidate = text(form, 'candidate')
  await requireActionOn('/hiring/requests', 'hiring', candidate ? 'edit' : 'create')
  const answers = answersFrom(text(form, 'answers'))
  if (!answers) return { ok: false, reason: 'The details are not in the right shape.' }
  const files = uploadsFrom(text(form, 'files'))
  const remove = idsFrom(text(form, 'remove'))
  if (!files || !remove) return { ok: false, reason: 'The files are not in the right shape.' }
  if (!text(form, 'name').trim()) return { ok: false, reason: candidate ? 'Name can’t be empty' : 'Add the candidate’s name' }
  const supabase = await client()
  const args = {
    p_name: text(form, 'name'),
    p_phone: text(form, 'phone'),
    p_stage: (text(form, 'stage') || 'shortlisted') as CandidateStage,
    p_note: text(form, 'note'),
    p_answers: answers,
    p_files: files.length ? files : null,
  }
  const { data, error } = candidate
    ? await supabase.rpc('hiring_candidate_edit', { p_candidate: candidate, ...args, p_remove: remove.length ? remove : null })
    : await supabase.rpc('hiring_candidate_add', { p_request: text(form, 'request'), ...args })
  if (error) {
    await deleteObjects(supabase, files.map(f => f.path))
    return { ok: false, reason: refusal(error, 'The candidate could not be saved. Please try again.') }
  }
  const deleted = await deleteObjects(supabase, orphansOf(data))
  if (files.length || remove.length) await sweep(supabase)
  refresh()
  return deleted ? { ok: true } : { ok: true, warning: LEFT_IN_STORAGE }
}

/** Change status ▸ — one candidate's stage. */
export async function setCandidateStage(candidate: string, stage: CandidateStage): Promise<HiringOutcome> {
  await requireActionOn('/hiring/requests', 'hiring', 'edit')
  return call('hiring_candidate_stage', { p_candidate: candidate, p_stage: stage }, 'The status could not be changed. Please try again.')
}

/**
 * A file, through a link that works for ten minutes — made at the press, never
 * kept in a page: a candidate's or a talent's résumé (`candidate` / `talent`,
 * their newest), any one of their files (`file`, by its id), a request's
 * attachment, or a file the Talent Bank keeps in a folder (`bank`, mig
 * 20261013030000). A candidate's file downloaded is a step of the request's trail.
 */
export async function hiringFileLink(kind: 'candidate' | 'talent' | 'file' | 'attachment' | 'bank', id: string, download = false): Promise<
  { ok: true; url: string; name: string; preview: 'pdf' | 'image' | 'none' } | { ok: false; reason: string }
> {
  await requireActionOn(['/hiring/requests', '/hiring/talent'], 'hiring', 'view')
  const supabase = await client()
  const { data, error } = await supabase.rpc('hiring_file_path', { p_kind: kind, p_id: id })
  if (error) return { ok: false, reason: refusal(error, 'The file could not be found. Please try again.') }
  const file = data as { path?: string; name?: string } | null
  if (!file?.path) return { ok: false, reason: kind === 'candidate' || kind === 'talent' ? 'No résumé yet' : 'No file has been attached.' }
  const name = file.name || 'file'
  const { data: link, error: linkError } = await supabase.storage
    .from(HIRING_BUCKET)
    .createSignedUrl(file.path, 600, download ? { download: name } : undefined)
  if (linkError || !link) return { ok: false, reason: 'The file could not be opened. Please try again.' }
  if (download && kind === 'candidate') {
    await supabase.rpc('hiring_resume_downloaded', { p_candidate: id })
    refresh()
  } else if (download && kind === 'file') {
    await supabase.rpc('hiring_file_downloaded', { p_file: id })
    refresh()
  }
  return { ok: true, url: link.signedUrl, name, preview: previewKind(name) }
}

// ── Files (mig 20261011160000) ──────────────────────────────────────────────

/** "+ Add file" on a candidate or a talent: the browser's uploads filed, each with its type (Create or Edit). */
export async function addHiringFiles(kind: 'candidate' | 'talent', owner: string, uploads: UploadedFile[]): Promise<HiringOutcome> {
  // A talent's files are the Talent Bank's write, a candidate's the request's (2026-10-11, plan C).
  await requireAnyActionOn(kind === 'talent' ? '/hiring/talent' : '/hiring/requests', ['hiring', 'create'], ['hiring', 'edit'])
  const files = uploadsFrom(JSON.stringify(uploads ?? []))
  if (!files) return { ok: false, reason: 'The files are not in the right shape.' }
  if (!files.length) return { ok: false, reason: 'Choose a file.' }
  const supabase = await client()
  const { error } = await supabase.rpc('hiring_files_add', { p_kind: kind, p_owner: owner, p_files: files })
  if (error) {
    await deleteObjects(supabase, files.map(f => f.path))
    return { ok: false, reason: refusal(error, 'The file could not be added. Please try again.') }
  }
  await sweep(supabase)
  refresh()
  return { ok: true }
}

/** Replace: a new upload in a file's place, its type kept; the old one is deleted once nobody names it (Edit). */
export async function replaceHiringFile(file: string, upload: { path: string; name: string }): Promise<HiringOutcome> {
  await requireActionOn('/hiring/talent/[id]', 'hiring', 'edit')
  const supabase = await client()
  const { data, error } = await supabase.rpc('hiring_file_replace', { p_file: file, p_path: upload.path, p_name: upload.name })
  if (error) {
    await deleteObjects(supabase, [upload.path])
    return { ok: false, reason: refusal(error, 'The file could not be replaced. Please try again.') }
  }
  const deleted = await deleteObjects(supabase, orphansOf(data))
  await sweep(supabase)
  refresh()
  return deleted ? { ok: true } : { ok: true, warning: LEFT_IN_STORAGE }
}

/**
 * Remove: a file off its record (Edit). A Talent Bank person's waits in the Bin for 30 days (mig 20261013061500); a
 * candidate's leaves the bucket once nobody else's record names it.
 */
export async function removeHiringFile(file: string): Promise<HiringOutcome> {
  await requireActionOn('/hiring/talent/[id]', 'hiring', 'edit')
  const supabase = await client()
  const { data, error } = await supabase.rpc('hiring_file_remove', { p_file: file })
  if (error) return { ok: false, reason: refusal(error, 'The file could not be removed. Please try again.') }
  const deleted = await deleteObjects(supabase, orphansOf(data))
  await sweep(supabase)
  refresh()
  return deleted ? { ok: true } : { ok: true, warning: LEFT_IN_STORAGE }
}

/** "+ Add a new file type…": the type of that name — made if new, turned back on if it was off (Edit). */
export async function addHiringFileType(name: string): Promise<HiringIdOutcome> {
  await requireActionOn(['/hiring/requests/[id]', '/hiring/talent'], 'hiring', 'edit')
  if (!name.trim()) return { ok: false, reason: 'Name the file type.' }
  const { data, error } = await (await client()).rpc('hiring_file_type_add', { p_name: name })
  if (error) return { ok: false, reason: refusal(error, 'The file type could not be added. Please try again.') }
  refresh()
  return { ok: true, id: String(data) }
}

/** Form settings › File types: a new name; the files under it read it at once. Résumé keeps its own (Edit). */
export async function renameHiringFileType(type: string, name: string): Promise<HiringOutcome> {
  await requireActionOn('/hiring/requests', 'hiring', 'edit')
  if (!name.trim()) return { ok: false, reason: 'Name the file type.' }
  return call('hiring_file_type_rename', { p_type: type, p_name: name }, 'The file type could not be renamed. Please try again.')
}

/** Form settings › File types › On / Off: off leaves the picker, the files filed under it keep it. Résumé stays on (Edit). */
export async function setHiringFileTypeActive(type: string, active: boolean): Promise<HiringOutcome> {
  await requireActionOn('/hiring/requests', 'hiring', 'edit')
  return call('hiring_file_type_set_active', { p_type: type, p_active: active }, 'The file type could not be changed. Please try again.')
}

// ── Form settings ───────────────────────────────────────────────────────────

/** What requesters fill in — the whole list, in order. */
export async function saveHiringFormFields(fields: HiringField[]): Promise<HiringOutcome> {
  await requireActionOn('/hiring/requests', 'hiring', 'edit')
  const payload = fields.map(f => ({ id: f.id, label: f.label, type: f.type, options: f.options, required: f.required }))
  return call('hiring_save_form_fields', { p_fields: payload }, 'The form could not be saved. Please try again.')
}

/** Candidate fields — what HR fills in for each candidate. */
export async function saveCandidateFields(fields: CandidateField[]): Promise<HiringOutcome> {
  await requireActionOn('/hiring/requests', 'hiring', 'edit')
  const payload = fields.map(f => ({ id: f.id, label: f.label, type: f.type, options: f.options }))
  return call('hiring_save_candidate_fields', { p_fields: payload }, 'The candidate fields could not be saved. Please try again.')
}

export async function addHiringSource(name: string): Promise<HiringOutcome> {
  await requireActionOn('/hiring/requests', 'hiring', 'edit')
  return call('hiring_source_add', { p_name: name }, 'The source could not be added. Please try again.')
}

export async function setHiringSourceActive(id: string, active: boolean): Promise<HiringOutcome> {
  await requireActionOn('/hiring/requests', 'hiring', 'edit')
  return call('hiring_source_set_active', { p_id: id, p_active: active }, 'The source could not be changed. Please try again.')
}

export async function removeHiringSource(id: string): Promise<HiringOutcome> {
  await requireActionOn('/hiring/requests', 'hiring', 'edit')
  return call('hiring_source_remove', { p_id: id }, 'The source could not be removed. Please try again.')
}

// ── The Talent Bank ─────────────────────────────────────────────────────────

/**
 * Move to Talent Bank… from a candidate (who brings all their files) — the
 * database keeps them in their company › department (mig 20261013030000; the
 * Talent Bank's own + Add talent is `addBankTalent`). FormData: `name`,
 * `phone`, `email`, `position`, `department`, `notes`, `candidate` (from a
 * request), `files` (JSON — the uploads to file, `UploadedFile[]`).
 */
export async function saveHiringTalent(form: FormData): Promise<HiringIdOutcome> {
  await requireActionOn('/hiring/requests/[id]', 'hiring', 'create')
  const candidate = text(form, 'candidate')
  if (!text(form, 'name').trim() || !text(form, 'position').trim()) {
    return { ok: false, reason: candidate ? 'Name and position are needed.' : 'Add a name and the position they fit.' }
  }
  const files = uploadsFrom(text(form, 'files'))
  if (!files) return { ok: false, reason: 'The files are not in the right shape.' }
  const supabase = await client()
  const { data, error } = await supabase.rpc('hiring_talent_save', {
    p_name: text(form, 'name'),
    p_phone: text(form, 'phone'),
    p_email: text(form, 'email'),
    p_position: text(form, 'position'),
    p_department: text(form, 'department'),
    p_notes: text(form, 'notes'),
    p_from_candidate: candidate || null,
    p_files: files.length ? files : null,
  })
  if (error) {
    await deleteObjects(supabase, files.map(f => f.path))
    return { ok: false, reason: refusal(error, 'The talent could not be saved. Please try again.') }
  }
  if (files.length) await sweep(supabase)
  refresh()
  return { ok: true, id: String(data) }
}

// ── The Talent Bank as a Drive (mig 20261013030000) ─────────────────────────

/** + New › New folder: in the bank, a company, a department or another folder (Create). */
export async function addBankFolder(parent: string, name: string): Promise<HiringIdOutcome> {
  await requireActionOn('/hiring/talent', 'hiring', 'create')
  if (!name.trim()) return { ok: false, reason: 'Name the folder.' }
  const { data, error } = await (await client()).rpc('hiring_bank_folder_add', { p_parent: parent, p_name: name })
  if (error) return { ok: false, reason: refusal(error, 'The folder could not be made. Please try again.') }
  refresh()
  return { ok: true, id: String(data) }
}

/** A folder's ⋮ › Rename (Edit). */
export async function renameBankFolder(id: string, name: string): Promise<HiringOutcome> {
  await requireActionOn('/hiring/talent', 'hiring', 'edit')
  if (!name.trim()) return { ok: false, reason: 'Name the folder.' }
  return call('hiring_bank_folder_rename', { p_id: id, p_name: name }, 'The folder could not be renamed. Please try again.')
}

/** A folder's ⋮ › Move to Bin — only an empty one; the Bin keeps it 30 days (Edit). */
export async function deleteBankFolder(id: string): Promise<HiringOutcome> {
  await requireActionOn('/hiring/talent', 'hiring', 'edit')
  return call('hiring_bank_folder_delete', { p_id: id }, 'The folder could not be deleted. Please try again.')
}

/** A folder's Move to…: the folder and everything in it go together — into the bank, a company, a department or a folder (Edit). */
export async function moveBankFolder(id: string, parent: string): Promise<HiringOutcome> {
  await requireActionOn('/hiring/talent', 'hiring', 'edit')
  return call('hiring_bank_folder_move', { p_id: id, p_parent: parent }, 'The folder could not be moved. Please try again.')
}

/** A department's Move everyone to…: its people, folders and files go to another place together (Edit). */
export async function moveBankEveryone(from: string, to: string): Promise<
  { ok: true; people: number; folders: number; files: number } | { ok: false; reason: string }
> {
  await requireActionOn('/hiring/talent', 'hiring', 'edit')
  const { data, error } = await (await client()).rpc('hiring_bank_move_all', { p_from: from, p_to: to })
  if (error) return { ok: false, reason: refusal(error, 'They could not be moved. Please try again.') }
  refresh()
  const n = (k: string) => Number((data as Record<string, unknown> | null)?.[k]) || 0
  return { ok: true, people: n('people'), folders: n('folders'), files: n('files') }
}

/** A person's Move to…: a company, a department or a folder (Edit). On their History as Moved. */
export async function moveBankTalent(talent: string, place: string): Promise<HiringOutcome> {
  await requireActionOn('/hiring/talent', 'hiring', 'edit')
  return call('hiring_bank_move', { p_talent: talent, p_place: place }, 'They could not be moved. Please try again.')
}

/**
 * + New › Add talent, in the place it is pressed (Create). FormData: `name`, `phone`, `email`, `position`, `notes`,
 * `files` (JSON — the uploads to file, `UploadedFile[]`).
 */
export async function addBankTalent(place: string, form: FormData): Promise<HiringIdOutcome> {
  await requireActionOn('/hiring/talent', 'hiring', 'create')
  if (!text(form, 'name').trim() || !text(form, 'position').trim()) return { ok: false, reason: 'Add a name and the position they fit.' }
  const files = uploadsFrom(text(form, 'files'))
  if (!files) return { ok: false, reason: 'The files are not in the right shape.' }
  const supabase = await client()
  const { data, error } = await supabase.rpc('hiring_bank_add_talent', {
    p_place: place,
    p_name: text(form, 'name'),
    p_phone: text(form, 'phone'),
    p_email: text(form, 'email'),
    p_position: text(form, 'position'),
    p_notes: text(form, 'notes'),
    p_files: files.length ? files : null,
  })
  if (error) {
    await deleteObjects(supabase, files.map(f => f.path))
    return { ok: false, reason: refusal(error, 'The talent could not be saved. Please try again.') }
  }
  if (files.length) await sweep(supabase)
  refresh()
  return { ok: true, id: String(data) }
}

/** + New › Upload files: one file the browser has put in the bucket, kept in a place of the bank (Create). */
export async function saveBankFile(input: { place: string; path: string; name: string; type: string; size: number }): Promise<HiringOutcome> {
  await requireActionOn('/hiring/talent', 'hiring', 'create')
  const supabase = await client()
  const { error } = await supabase.rpc('hiring_bank_file_add', {
    p_place: input.place,
    p_path: input.path,
    p_name: input.name,
    p_type: input.type,
    p_size: Number.isFinite(input.size) ? Math.round(input.size) : null,
  })
  if (error) {
    await deleteObjects(supabase, [input.path])
    return { ok: false, reason: refusal(error, 'The file could not be kept. Please try again.') }
  }
  refresh()
  return { ok: true }
}

/** A file's ⋮ › Move to Bin: off the bank, its object kept while the Bin keeps it — 30 days (Edit). */
export async function deleteBankFile(id: string): Promise<HiringOutcome> {
  await requireActionOn('/hiring/talent', 'hiring', 'edit')
  const supabase = await client()
  const { data, error } = await supabase.rpc('hiring_bank_file_delete', { p_id: id })
  if (error) return { ok: false, reason: refusal(error, 'The file could not be deleted. Please try again.') }
  const deleted = await deleteObjects(supabase, orphansOf(data))
  await sweep(supabase)
  refresh()
  return deleted ? { ok: true } : { ok: true, warning: LEFT_IN_STORAGE }
}

/** Pick from Talent Bank / Invite to interview: the talent joins a request as a shortlisted candidate. */
export async function inviteHiringTalent(talent: string, request: string): Promise<HiringOutcome> {
  await requireActionOn(['/hiring/requests/[id]', '/hiring/talent/[id]'], 'hiring', 'create')
  return call('hiring_talent_invite', { p_talent: talent, p_request: request }, 'The talent could not be invited. Please try again.')
}

export async function saveTalentNotes(talent: string, notes: string): Promise<HiringOutcome> {
  await requireActionOn('/hiring/talent', 'hiring', 'edit')
  return call('hiring_talent_update', { p_talent: talent, p_notes: notes }, 'The notes could not be saved. Please try again.')
}

/**
 * Remove from Talent Bank: they leave the bank for its Bin, their files with
 * them, for 30 days (mig 20261013061500) — Restore brings them back; then the
 * hourly sweep deletes the files (their row stays, removed, for its history).
 */
export async function removeHiringTalent(talent: string): Promise<HiringOutcome> {
  await requireActionOn('/hiring/talent', 'hiring', 'edit')
  const supabase = await client()
  const { data, error } = await supabase.rpc('hiring_talent_remove', { p_talent: talent })
  if (error) return { ok: false, reason: refusal(error, 'The talent could not be removed. Please try again.') }
  const deleted = await deleteObjects(supabase, orphansOf(data))
  await sweep(supabase)
  refresh()
  return deleted ? { ok: true } : { ok: true, warning: LEFT_IN_STORAGE }
}

// ── The Talent Bank's Bin (mig 20261013061500) ──────────────────────────────

/** Bin › Restore: back where it was — what it was in with it, when that is in the Bin too (Edit). Answers where, in words. */
export async function restoreBankItem(id: string): Promise<{ ok: true; label: string } | { ok: false; reason: string }> {
  await requireActionOn('/hiring/talent', 'hiring', 'edit')
  const { data, error } = await (await client()).rpc('hiring_bank_bin_restore', { p_bin: id })
  if (error) return { ok: false, reason: refusal(error, 'It could not be restored. Please try again.') }
  refresh()
  const label = data && typeof data === 'object' ? (data as { label?: unknown }).label : null
  return { ok: true, label: typeof label === 'string' && label ? label : 'the Talent Bank' }
}

/** Bin › Delete forever: out of the Bin now, and out of the bucket once nobody else's record names it (Edit). */
export async function deleteBankItemForever(id: string): Promise<HiringOutcome> {
  await requireActionOn('/hiring/talent', 'hiring', 'edit')
  const supabase = await client()
  const { data, error } = await supabase.rpc('hiring_bank_bin_delete', { p_bin: id })
  if (error) return { ok: false, reason: refusal(error, 'It could not be deleted. Please try again.') }
  const deleted = await deleteObjects(supabase, orphansOf(data))
  await sweep(supabase)
  refresh()
  return deleted ? { ok: true } : { ok: true, warning: LEFT_IN_STORAGE }
}

/** Bin › Empty bin: everything in it, now (Edit). Answers how many went. */
export async function emptyBankBin(): Promise<{ ok: true; count: number; warning?: string } | { ok: false; reason: string }> {
  await requireActionOn('/hiring/talent', 'hiring', 'edit')
  const supabase = await client()
  const { data, error } = await supabase.rpc('hiring_bank_bin_empty')
  if (error) return { ok: false, reason: refusal(error, 'The Bin could not be emptied. Please try again.') }
  const deleted = await deleteObjects(supabase, orphansOf(data))
  await sweep(supabase)
  refresh()
  const count = Number((data as { count?: unknown } | null)?.count) || 0
  return deleted ? { ok: true, count } : { ok: true, count, warning: LEFT_IN_STORAGE }
}
