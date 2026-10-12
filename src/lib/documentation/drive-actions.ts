'use server'

import { revalidatePath } from 'next/cache'
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { requireActionOn } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { DocIdOutcome, DocOutcome } from './actions'
import { driveFileLink } from './drive-server'
import { DOC_BUCKET, type FileLink } from './server'

/**
 * The Data center's folders and files (2026-10-12, mig 20261012220000): New
 * folder, Rename, Delete (an empty one), a file HR keeps in a folder and its
 * Delete. Each is one of the module's functions, which asks the Documentation
 * cell again in the database; the gate here is the same cell — Create makes,
 * Edit renames and deletes, View opens. Files are already in the bucket when
 * these run (lib/documentation/upload.ts, under `drive/`) — the database
 * checks they arrived.
 *
 * Refusals come back as `{ ok: false, reason }`: a thrown message never
 * reaches the browser in production.
 */

const PAGE = '/team/documentation'

async function client(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient
}

function refusal(error: PostgrestError, fallback: string): string {
  if (error.code === '42501') return 'You may not do that on Documentation.'
  if (error.code === '22023' || error.code === 'P0001' || error.code === '23505') {
    return error.code === '23505' ? 'That name is here already.' : error.message
  }
  if (error.code === 'VIEW_AS') return error.message
  return fallback
}

/** The files no live record holds any more go from the bucket — the same sweep as a document's delete (actions.ts). */
async function removeLeftoverFiles(supabase: SupabaseClient): Promise<void> {
  const listed = await supabase.rpc('hr_documentation_leftovers')
  const paths = Array.isArray(listed.data) ? listed.data.filter((p): p is string => typeof p === 'string' && p !== '') : []
  if (listed.error || paths.length === 0) return
  await supabase.storage.from(DOC_BUCKET).remove(paths)
  await supabase.rpc('hr_documentation_files_removed', { p_paths: paths })
}

const done = () => revalidatePath(PAGE)

export async function addDriveFolder(parent: string, name: string): Promise<DocIdOutcome> {
  await requireActionOn(PAGE, 'documentation', 'create')
  const { data, error } = await (await client()).rpc('hr_drive_folder_add', { p_parent: parent, p_name: name })
  if (error) return { ok: false, reason: refusal(error, 'The folder could not be made. Please try again.') }
  done()
  return { ok: true, id: String(data) }
}

export async function renameDriveFolder(id: string, name: string): Promise<DocOutcome> {
  await requireActionOn(PAGE, 'documentation', 'edit')
  const { error } = await (await client()).rpc('hr_drive_folder_rename', { p_id: id, p_name: name })
  if (error) return { ok: false, reason: refusal(error, 'The folder could not be renamed. Please try again.') }
  done()
  return { ok: true }
}

export async function deleteDriveFolder(id: string): Promise<DocOutcome> {
  await requireActionOn(PAGE, 'documentation', 'edit')
  const { error } = await (await client()).rpc('hr_drive_folder_delete', { p_id: id })
  if (error) return { ok: false, reason: refusal(error, 'The folder could not be deleted. Please try again.') }
  done()
  return { ok: true }
}

export async function saveDriveFile(input: {
  parent: string
  path: string
  fileName: string
  contentType: string | null
  size: number
}): Promise<DocIdOutcome> {
  await requireActionOn(PAGE, 'documentation', 'create')
  const { data, error } = await (await client()).rpc('hr_drive_file_add', {
    p_parent: input.parent,
    p_path: input.path,
    p_file_name: input.fileName,
    p_content_type: input.contentType,
    p_size: input.size,
  })
  if (error) return { ok: false, reason: refusal(error, 'The file could not be saved. Please try again.') }
  done()
  return { ok: true, id: String(data) }
}

/** Deleted: its row and trail stay (greyed under "Show deleted"), and its file goes from the bucket. */
export async function deleteDriveFile(id: string): Promise<DocOutcome> {
  await requireActionOn(PAGE, 'documentation', 'edit')
  const supabase = await client()
  const { error } = await supabase.rpc('hr_drive_file_delete', { p_id: id })
  if (error) return { ok: false, reason: refusal(error, 'The file could not be deleted. Please try again.') }
  await removeLeftoverFiles(supabase)
  done()
  return { ok: true }
}

/** A Data center file, opened from the page: a short link made now, and a line on its trail (Viewed / Downloaded). */
export async function openDriveFile(id: string, mode: 'view' | 'download'): Promise<FileLink> {
  await requireActionOn(PAGE, 'documentation', 'view')
  const link = await driveFileLink(id, mode)
  if (!link.ok) return link
  const { error } = await (await client()).rpc('hr_drive_log', { p_id: id, p_what: mode === 'view' ? 'Viewed' : 'Downloaded' })
  if (!error) done()
  return link
}
