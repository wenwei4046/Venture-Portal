'use server'

import { revalidatePath } from 'next/cache'
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { requireActionOn, requireAnyActionOn } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { DOC_BUCKET, documentationFileLink, type FileLink } from './server'

/**
 * Documentation's writes (2026-10-11, HR revamp round 2 — README §10). Each is
 * one of the module's own functions (mig 20261011070000), which asks the
 * Documentation cell again in the database; the gate here is the same cell.
 * Files are already in the bucket when these run (lib/documentation/upload.ts)
 * — the database checks they arrived.
 *
 * Refusals come back as `{ ok: false, reason }`: a thrown message never
 * reaches the browser in production.
 */

export type DocOutcome = { ok: true } | { ok: false; reason: string }
export type DocIdOutcome = { ok: true; id: string } | { ok: false; reason: string }

async function client(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient
}

function refusal(error: PostgrestError, fallback: string): string {
  if (error.code === '42501') return 'You may not do that on Documentation.'
  if (error.code === '22023' || error.code === 'P0001') return error.message
  if (error.code === 'VIEW_AS') return error.message
  return fallback
}

function revalidateDocs() {
  revalidatePath('/team/documentation')
  // Letters and memos reach the Revenue app as memos.
  revalidatePath('/member', 'layout')
}

// ── Documents ───────────────────────────────────────────────────────────────

export async function saveDocument(input: {
  name: string
  path: string
  fileName: string
  contentType: string | null
  size: number
  departmentIds: string[]
}): Promise<DocIdOutcome> {
  await requireActionOn('/team/documentation', 'documentation', 'create')
  const { data, error } = await (await client()).rpc('hr_document_add', {
    p_name: input.name,
    p_path: input.path,
    p_file_name: input.fileName,
    p_content_type: input.contentType,
    p_size: input.size,
    p_departments: input.departmentIds,
  })
  if (error) return { ok: false, reason: refusal(error, 'The document could not be saved. Please try again.') }
  revalidateDocs()
  return { ok: true, id: String(data) }
}

export async function deleteDocument(id: string): Promise<DocOutcome> {
  await requireActionOn('/team/documentation', 'documentation', 'edit')
  const supabase = await client()
  const { error } = await supabase.rpc('hr_document_delete', { p_id: id })
  if (error) return { ok: false, reason: refusal(error, 'The document could not be deleted. Please try again.') }
  await removeLeftoverFiles(supabase)
  revalidateDocs()
  return { ok: true }
}

/**
 * The files no live record holds any more go from the bucket (2026-10-11, the
 * user's answer E): a deleted document's, a withdrawn letter's, an upload
 * nobody saved a day ago. The database lists them (`hr_documentation_leftovers`)
 * and its delete policy lets Documentation · Edit remove only those, through
 * the Storage API under the user's own session; then each trail whose file is
 * really gone says "File deleted". A file that would not go is listed again
 * the next time anybody deletes or withdraws — it never holds up the answer.
 */
async function removeLeftoverFiles(supabase: SupabaseClient): Promise<void> {
  const listed = await supabase.rpc('hr_documentation_leftovers')
  const paths = Array.isArray(listed.data) ? listed.data.filter((p): p is string => typeof p === 'string' && p !== '') : []
  if (listed.error || paths.length === 0) return
  await supabase.storage.from(DOC_BUCKET).remove(paths)
  await supabase.rpc('hr_documentation_files_removed', { p_paths: paths })
}

/**
 * A document's or a letter's file, opened from the page: a short link made
 * now, and a line on its trail (Viewed / Downloaded). While viewing as
 * somebody the line is not written — the link still opens.
 */
export async function openDocumentationFile(kind: 'document' | 'letter', id: string, mode: 'view' | 'download'): Promise<FileLink> {
  await requireActionOn('/team/documentation', 'documentation', 'view')
  const link = await documentationFileLink(kind, id, mode)
  if (!link.ok) return link
  const { error } = await (await client()).rpc('hr_documentation_log', { p_kind: kind, p_id: id, p_what: mode === 'view' ? 'Viewed' : 'Downloaded' })
  if (!error) revalidateDocs()
  return link
}

// ── Letter types ────────────────────────────────────────────────────────────

export async function addLetterType(name: string): Promise<DocIdOutcome> {
  await requireAnyActionOn('/team/documentation', ['documentation', 'create'], ['documentation', 'edit'])
  const { data, error } = await (await client()).rpc('hr_letter_type_add', { p_name: name })
  if (error) return { ok: false, reason: refusal(error, 'The letter type could not be added. Please try again.') }
  revalidateDocs()
  return { ok: true, id: String(data) }
}

export async function setLetterTypeCompulsory(id: string, compulsory: boolean): Promise<DocOutcome> {
  await requireActionOn('/team/documentation', 'documentation', 'edit')
  const { error } = await (await client()).rpc('hr_letter_type_set_compulsory', { p_id: id, p_compulsory: compulsory })
  if (error) return { ok: false, reason: refusal(error, 'The letter type could not be changed. Please try again.') }
  revalidateDocs()
  return { ok: true }
}

export async function deleteLetterType(id: string): Promise<DocOutcome> {
  await requireActionOn('/team/documentation', 'documentation', 'edit')
  const { error } = await (await client()).rpc('hr_letter_type_delete', { p_id: id })
  if (error) return { ok: false, reason: refusal(error, 'The letter type could not be deleted. Please try again.') }
  revalidateDocs()
  return { ok: true }
}

// ── A letter on somebody's record ───────────────────────────────────────────

export async function fileLetter(input: {
  staffId: string
  typeId: string
  path: string
  fileName: string
  contentType: string | null
  size: number
}): Promise<DocIdOutcome> {
  await requireActionOn('/team/documentation', 'documentation', 'create')
  const { data, error } = await (await client()).rpc('hr_letter_file', {
    p_staff: input.staffId,
    p_type: input.typeId,
    p_path: input.path,
    p_file_name: input.fileName,
    p_content_type: input.contentType,
    p_size: input.size,
  })
  if (error) return { ok: false, reason: refusal(error, 'The letter could not be filed. Please try again.') }
  revalidateDocs()
  return { ok: true, id: String(data) }
}

export type WithdrawOutcome = { ok: true; person: string; type: string } | { ok: false; reason: string }

/**
 * Withdraw a letter filed to somebody's record (2026-10-11, the user's answer
 * E): its person stops receiving it (the Revenue app, View as included), it
 * stays on file as Withdrawn with its trail and counts for nothing — a
 * compulsory type flags its person again — and its file goes once no live
 * record holds it (`hr_letter_withdraw`, mig 20261011170000).
 */
export async function withdrawLetter(id: string): Promise<WithdrawOutcome> {
  await requireActionOn('/team/documentation', 'documentation', 'edit')
  const supabase = await client()
  const { data, error } = await supabase.rpc('hr_letter_withdraw', { p_id: id })
  if (error) return { ok: false, reason: refusal(error, 'The letter could not be withdrawn. Please try again.') }
  await removeLeftoverFiles(supabase)
  revalidateDocs()
  const said = (data ?? {}) as { person?: unknown; type?: unknown }
  return { ok: true, person: typeof said.person === 'string' ? said.person : '', type: typeof said.type === 'string' ? said.type : 'The letter' }
}

// ── Publish ─────────────────────────────────────────────────────────────────

export async function addPublishType(name: string): Promise<DocIdOutcome> {
  await requireAnyActionOn('/team/documentation', ['documentation', 'create'], ['documentation', 'edit'])
  const { data, error } = await (await client()).rpc('hr_publish_type_add', { p_name: name })
  if (error) return { ok: false, reason: refusal(error, 'The type could not be added. Please try again.') }
  revalidateDocs()
  return { ok: true, id: String(data) }
}

export async function deletePublishType(id: string): Promise<DocOutcome> {
  await requireActionOn('/team/documentation', 'documentation', 'edit')
  const { error } = await (await client()).rpc('hr_publish_type_delete', { p_id: id })
  if (error) return { ok: false, reason: refusal(error, 'The type could not be removed. Please try again.') }
  revalidateDocs()
  return { ok: true }
}

export type PublishOutcome = { ok: true; recipients: number } | { ok: false; reason: string }

export type MemoWithdrawOutcome = { ok: true; title: string; reached: number } | { ok: false; reason: string }

/**
 * Withdraw a published memo (2026-10-11, the user: "加"): it reaches nobody any
 * more — the Revenue app, View as, Member services — every copy "Publish &
 * save" filed into a Data center is withdrawn with it, and its attachment goes
 * from the bucket. It stays on the Published list as withdrawn, with what it
 * had reached (`hr_memo_withdraw`, mig 20261011200000).
 */
export async function withdrawMemo(id: string): Promise<MemoWithdrawOutcome> {
  await requireAction('documentation', 'edit')
  const supabase = await client()
  const { data, error } = await supabase.rpc('hr_memo_withdraw', { p_id: id })
  if (error) return { ok: false, reason: refusal(error, 'It could not be withdrawn. Please try again.') }
  await removeLeftoverFiles(supabase)
  revalidateDocs()
  const said = (data ?? {}) as { title?: unknown; reached?: unknown }
  const reached = Number(said.reached)
  return { ok: true, title: typeof said.title === 'string' ? said.title : 'The memo', reached: Number.isFinite(reached) ? reached : 0 }
}

export async function publishDocumentation(input: {
  kind: string
  letterTypeId: string | null
  title: string
  body: string
  attachment: { path: string; fileName: string; contentType: string | null; size: number } | null
  departmentIds: string[]
  staffIds: string[]
  audience: string
  save: boolean
}): Promise<PublishOutcome> {
  await requireActionOn('/team/documentation', 'documentation', 'create')
  const { data, error } = await (await client()).rpc('hr_publish', {
    p_kind: input.kind,
    p_letter_type: input.letterTypeId,
    p_title: input.title,
    p_body: input.body,
    p_attachment_path: input.attachment?.path ?? null,
    p_attachment_name: input.attachment?.fileName ?? null,
    p_attachment_type: input.attachment?.contentType ?? null,
    p_attachment_size: input.attachment?.size ?? null,
    p_departments: input.departmentIds,
    p_staff: input.staffIds,
    p_audience: input.audience,
    p_save: input.save,
  })
  if (error) return { ok: false, reason: refusal(error, 'It could not be published. Please try again.') }
  revalidateDocs()
  const recipients = Number((data as { recipients?: unknown } | null)?.recipients ?? input.staffIds.length)
  return { ok: true, recipients: Number.isFinite(recipients) ? recipients : input.staffIds.length }
}
