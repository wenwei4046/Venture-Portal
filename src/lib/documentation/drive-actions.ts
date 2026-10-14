'use server'

import { revalidatePath } from 'next/cache'
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { requireActionOn } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { DocIdOutcome, DocOutcome } from './actions'
import { driveFileLink } from './drive-server'
import { objectPath } from './model'
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
 * Since 2026-10-14 (mig 20261014190000 — the user: a person's own documents,
 * "view only me", move / copy / duplicate): a file moves too; a file or a
 * folder is copied — Copy to…, or Duplicate in its own place; View only me
 * on or off; and what is in a person's folder is shared with them or kept
 * back. The database decides who is shown what; these only ask it.
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

/** A share changed: the page, and the person's own documents wherever they read them. */
const shared = () => {
  revalidatePath(PAGE)
  revalidatePath('/member', 'layout')
  revalidatePath('/admin/documents')
}

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

// ── A person's own, View only me, Move / Copy (mig 20261014190000) ──────────

/** A file's ⋮ › Move to…: anywhere a folder may go — a person's folder too; "Moved" on its trail (Edit). */
export async function moveDriveFile(id: string, parent: string): Promise<DocOutcome> {
  await requireActionOn('/team/documentation', 'documentation', 'edit')
  const { error } = await (await client()).rpc('hr_drive_file_move', { p_id: id, p_parent: parent })
  if (error) return { ok: false, reason: refusal(error, 'The file could not be moved. Please try again.') }
  shared()
  return { ok: true }
}

export type CopyOutcome = { ok: true; name: string; files: number; skipped: number } | { ok: false; reason: string }

/** What `hr_drive_copy_plan` names: each file the copy takes, and its object. */
function planOf(raw: unknown): Array<{ id: string; path: string; fileName: string }> {
  return (Array.isArray(raw) ? raw : []).flatMap(x => {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
    return typeof o.id === 'string' && typeof o.path === 'string' ? [{ id: o.id, path: o.path, fileName: typeof o.fileName === 'string' ? o.fileName : 'file' }] : []
  })
}

/**
 * A file's or a folder's ⋮ › Copy to… / Duplicate (Create): the database first says whether the copy may go there —
 * the place, never a folder into itself, a folder's name — and what it takes (`hr_drive_copy_plan`), so nothing is
 * copied for a copy it would refuse; then each object is copied in the bucket under the reader's own session (the
 * bucket's policies ask Documentation · View of the original, Create of the copy — and leave out what they are not
 * shown; an object not recorded yet is its copier's alone), a few at a time; then the database records the copy
 * (`hr_drive_file_copy` / `hr_drive_folder_copy`) — what it takes along: View only me, never a share of its own. Refused
 * at that last step, the objects it copied are removed again (as far as the bucket lets this reader; the hourly sweep
 * takes any left a day later). `name`: the copy's — a file's own name when not given; a folder's "Copy of …".
 */
export async function copyDriveItem(input: { kind: 'file' | 'folder'; id: string; parent: string; name?: string | null }): Promise<CopyOutcome> {
  await requireActionOn('/team/documentation', 'documentation', 'create')
  const supabase = await client()
  const plan = await supabase.rpc('hr_drive_copy_plan', {
    p_kind: input.kind,
    p_id: input.id,
    p_parent: input.parent,
    p_name: input.kind === 'folder' ? input.name ?? null : null,
  })
  if (plan.error) return { ok: false, reason: refusal(plan.error, 'It could not be copied. Please try again.') }
  const items = planOf(plan.data)
  const copied: Record<string, string> = {}
  for (let i = 0; i < items.length; i += 6) {
    await Promise.all(items.slice(i, i + 6).map(async item => {
      const to = objectPath('drive', crypto.randomUUID(), item.fileName)
      const { error } = await supabase.storage.from(DOC_BUCKET).copy(item.path, to)
      if (!error) copied[item.id] = to
    }))
  }
  const undo = async () => {
    const paths = Object.values(copied)
    if (paths.length) await supabase.storage.from(DOC_BUCKET).remove(paths).then(() => undefined, () => undefined)
  }
  if (input.kind === 'file') {
    const to = copied[input.id]
    if (!to) return { ok: false, reason: 'The file could not be copied. Please try again.' }
    const { error } = await supabase.rpc('hr_drive_file_copy', { p_id: input.id, p_parent: input.parent, p_path: to, p_name: input.name ?? null })
    if (error) {
      await undo()
      return { ok: false, reason: refusal(error, 'The file could not be copied. Please try again.') }
    }
    done()
    return { ok: true, name: input.name || items[0]?.fileName || 'The file', files: 1, skipped: 0 }
  }
  const { data, error } = await supabase.rpc('hr_drive_folder_copy', {
    p_id: input.id,
    p_parent: input.parent,
    p_name: input.name ?? null,
    p_files: copied,
  })
  if (error) {
    await undo()
    return { ok: false, reason: refusal(error, 'The folder could not be copied. Please try again.') }
  }
  done()
  const said = (data ?? {}) as { name?: unknown; files?: unknown; skipped?: unknown }
  return {
    ok: true,
    name: typeof said.name === 'string' ? said.name : input.name || 'The copy',
    files: Number(said.files) || 0,
    skipped: Number(said.skipped) || 0,
  }
}

export type LockOutcome = { ok: true; on: boolean; wasShared: boolean } | { ok: false; reason: string }

/**
 * A file's or a folder's ⋮ › View only me (Edit): on — only the reader, whoever stands above them on the ladder and the
 * Principal are shown it (a login of their own with a title on the ladder; the database refuses anybody else) — or off.
 * On also keeps it from its person when it was shared with them (`wasShared`).
 */
export async function setDriveLock(kind: 'file' | 'folder', id: string, on: boolean): Promise<LockOutcome> {
  await requireActionOn('/team/documentation', 'documentation', 'edit')
  const { data, error } = await (await client()).rpc('hr_drive_private', { p_kind: kind, p_id: id, p_on: on })
  if (error) return { ok: false, reason: refusal(error, 'View only me could not be changed. Please try again.') }
  shared()
  const said = (data ?? {}) as { on?: unknown; wasShared?: unknown }
  return { ok: true, on: said.on === true, wasShared: said.wasShared === true }
}

export type ShareOutcome = { ok: true; person: string; sees: boolean } | { ok: false; reason: string }

/**
 * A file's or a folder's ⋮ › "<person> can view" (Edit): what is in a person's folder shared with them — they see it
 * in their own Documentation, on their phone with their own login — or kept back. A folder shared shares what is in
 * it, but what is kept back on its own.
 */
export async function setDriveShare(kind: 'file' | 'folder', id: string, on: boolean): Promise<ShareOutcome> {
  await requireActionOn('/team/documentation', 'documentation', 'edit')
  const { data, error } = await (await client()).rpc('hr_drive_member_view', { p_kind: kind, p_id: id, p_on: on })
  if (error) return { ok: false, reason: refusal(error, 'It could not be shared. Please try again.') }
  shared()
  const said = (data ?? {}) as { person?: unknown; sees?: unknown }
  return { ok: true, person: typeof said.person === 'string' ? said.person : '', sees: said.sees === true }
}
