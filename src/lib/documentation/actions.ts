'use server'

import { revalidatePath } from 'next/cache'
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { requireAction, requireAnyAction } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { documentationFileLink, type FileLink } from './server'

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
  await requireAction('documentation', 'create')
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
  await requireAction('documentation', 'edit')
  const { error } = await (await client()).rpc('hr_document_delete', { p_id: id })
  if (error) return { ok: false, reason: refusal(error, 'The document could not be deleted. Please try again.') }
  revalidateDocs()
  return { ok: true }
}

/**
 * A document's or a letter's file, opened from the page: a short link made
 * now, and a line on its trail (Viewed / Downloaded). While viewing as
 * somebody the line is not written — the link still opens.
 */
export async function openDocumentationFile(kind: 'document' | 'letter', id: string, mode: 'view' | 'download'): Promise<FileLink> {
  await requireAction('documentation', 'view')
  const link = await documentationFileLink(kind, id, mode)
  if (!link.ok) return link
  const { error } = await (await client()).rpc('hr_documentation_log', { p_kind: kind, p_id: id, p_what: mode === 'view' ? 'Viewed' : 'Downloaded' })
  if (!error) revalidateDocs()
  return link
}

// ── Letter types ────────────────────────────────────────────────────────────

export async function addLetterType(name: string): Promise<DocIdOutcome> {
  await requireAnyAction(['documentation', 'create'], ['documentation', 'edit'])
  const { data, error } = await (await client()).rpc('hr_letter_type_add', { p_name: name })
  if (error) return { ok: false, reason: refusal(error, 'The letter type could not be added. Please try again.') }
  revalidateDocs()
  return { ok: true, id: String(data) }
}

export async function setLetterTypeCompulsory(id: string, compulsory: boolean): Promise<DocOutcome> {
  await requireAction('documentation', 'edit')
  const { error } = await (await client()).rpc('hr_letter_type_set_compulsory', { p_id: id, p_compulsory: compulsory })
  if (error) return { ok: false, reason: refusal(error, 'The letter type could not be changed. Please try again.') }
  revalidateDocs()
  return { ok: true }
}

export async function deleteLetterType(id: string): Promise<DocOutcome> {
  await requireAction('documentation', 'edit')
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
  await requireAction('documentation', 'create')
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

// ── Publish ─────────────────────────────────────────────────────────────────

export async function addPublishType(name: string): Promise<DocIdOutcome> {
  await requireAnyAction(['documentation', 'create'], ['documentation', 'edit'])
  const { data, error } = await (await client()).rpc('hr_publish_type_add', { p_name: name })
  if (error) return { ok: false, reason: refusal(error, 'The type could not be added. Please try again.') }
  revalidateDocs()
  return { ok: true, id: String(data) }
}

export async function deletePublishType(id: string): Promise<DocOutcome> {
  await requireAction('documentation', 'edit')
  const { error } = await (await client()).rpc('hr_publish_type_delete', { p_id: id })
  if (error) return { ok: false, reason: refusal(error, 'The type could not be removed. Please try again.') }
  revalidateDocs()
  return { ok: true }
}

export type PublishOutcome = { ok: true; recipients: number } | { ok: false; reason: string }

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
  await requireAction('documentation', 'create')
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
