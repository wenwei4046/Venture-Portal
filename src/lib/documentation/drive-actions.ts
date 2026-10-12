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
 * Since 2026-10-13 (mig 20261013183000, the Talent Bank's rules): Delete is
 * Move to Bin — the Bin keeps a file (and its object) or an empty folder 30
 * days — with Restore, Delete forever and Empty bin; a folder moves with
 * Move to…, everything in it going along.
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
  await requireActionOn('/team/documentation', 'documentation', 'create')
  const { data, error } = await (await client()).rpc('hr_drive_folder_add', { p_parent: parent, p_name: name })
  if (error) return { ok: false, reason: refusal(error, 'The folder could not be made. Please try again.') }
  done()
  return { ok: true, id: String(data) }
}

export async function renameDriveFolder(id: string, name: string): Promise<DocOutcome> {
  await requireActionOn('/team/documentation', 'documentation', 'edit')
  const { error } = await (await client()).rpc('hr_drive_folder_rename', { p_id: id, p_name: name })
  if (error) return { ok: false, reason: refusal(error, 'The folder could not be renamed. Please try again.') }
  done()
  return { ok: true }
}

/** A folder's ⋮ › Move to Bin — only an empty one; the Bin keeps it 30 days (Edit). */
export async function deleteDriveFolder(id: string): Promise<DocOutcome> {
  await requireActionOn('/team/documentation', 'documentation', 'edit')
  const { error } = await (await client()).rpc('hr_drive_folder_delete', { p_id: id })
  if (error) return { ok: false, reason: refusal(error, 'The folder could not be deleted. Please try again.') }
  done()
  return { ok: true }
}

/** A folder's ⋮ › Move to…: the folder and everything in it go together (Edit). */
export async function moveDriveFolder(id: string, parent: string): Promise<DocOutcome> {
  await requireActionOn('/team/documentation', 'documentation', 'edit')
  const { error } = await (await client()).rpc('hr_drive_folder_move', { p_id: id, p_parent: parent })
  if (error) return { ok: false, reason: refusal(error, 'The folder could not be moved. Please try again.') }
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
  await requireActionOn('/team/documentation', 'documentation', 'create')
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

/**
 * A file's ⋮ › Move to Bin: it waits there 30 days, its file kept (Edit). Deleted from the Bin, its row and trail stay
 * greyed under "Show deleted" and its file goes from the bucket, as a delete always did.
 */
export async function deleteDriveFile(id: string): Promise<DocOutcome> {
  await requireActionOn('/team/documentation', 'documentation', 'edit')
  const supabase = await client()
  const { error } = await supabase.rpc('hr_drive_file_delete', { p_id: id })
  if (error) return { ok: false, reason: refusal(error, 'The file could not be deleted. Please try again.') }
  await removeLeftoverFiles(supabase)
  done()
  return { ok: true }
}

// ── The Bin (mig 20261013183000) ────────────────────────────────────────────

/** Bin › Restore: back where it was — the folders it was in with it, when they are in the Bin too (Edit). */
export async function restoreDriveItem(id: string): Promise<{ ok: true; label: string } | { ok: false; reason: string }> {
  await requireActionOn('/team/documentation', 'documentation', 'edit')
  const { data, error } = await (await client()).rpc('hr_drive_bin_restore', { p_bin: id })
  if (error) return { ok: false, reason: refusal(error, 'It could not be restored. Please try again.') }
  done()
  const label = data && typeof data === 'object' ? (data as { label?: unknown }).label : null
  return { ok: true, label: typeof label === 'string' && label ? label : 'the Data center' }
}

/** Bin › Delete forever: deleted now — a file's row greyed under "Show deleted", its file out of the bucket (Edit). */
export async function deleteDriveItemForever(id: string): Promise<DocOutcome> {
  await requireActionOn('/team/documentation', 'documentation', 'edit')
  const supabase = await client()
  const { error } = await supabase.rpc('hr_drive_bin_delete', { p_bin: id })
  if (error) return { ok: false, reason: refusal(error, 'It could not be deleted. Please try again.') }
  await removeLeftoverFiles(supabase)
  done()
  return { ok: true }
}

/** Bin › Empty bin: everything in it, now (Edit). Answers how many went; their files leave the bucket a hundred at a time. */
export async function emptyDriveBin(): Promise<{ ok: true; count: number } | { ok: false; reason: string }> {
  await requireActionOn('/team/documentation', 'documentation', 'edit')
  const supabase = await client()
  const { data, error } = await supabase.rpc('hr_drive_bin_empty')
  if (error) return { ok: false, reason: refusal(error, 'The Bin could not be emptied. Please try again.') }
  const count = Number((data as { count?: unknown } | null)?.count) || 0
  for (let i = 0; i < Math.min(10, Math.ceil(count / 100)); i++) await removeLeftoverFiles(supabase)
  done()
  return { ok: true, count }
}

/** A Data center file, opened from the page: a short link made now, and a line on its trail (Viewed / Downloaded). */
export async function openDriveFile(id: string, mode: 'view' | 'download'): Promise<FileLink> {
  await requireActionOn('/team/documentation', 'documentation', 'view')
  const link = await driveFileLink(id, mode)
  if (!link.ok) return link
  const { error } = await (await client()).rpc('hr_drive_log', { p_id: id, p_what: mode === 'view' ? 'Viewed' : 'Downloaded' })
  if (!error) done()
  return link
}
