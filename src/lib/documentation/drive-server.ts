import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { driveFromRow, type Drive } from './drive'
import { DOC_BUCKET, type FileLink } from './server'

/**
 * The Data center's own folders and files (2026-10-12, mig 20261012220000):
 * the page's second read, beside `hr_documentation()`, and the short signed
 * link a file opens by — both under the reader's own session, asking
 * Documentation · View in the database (`hr_drive()` / `hr_drive_file()`).
 * A link is made at the click and lives five minutes, as every Documentation
 * file's.
 */

export type DriveRead = { ok: true; data: Drive } | { ok: false; reason: string }

async function client(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient
}

export async function loadDrive(): Promise<DriveRead> {
  const { data, error } = await (await client()).rpc('hr_drive')
  if (error) {
    return {
      ok: false,
      reason: error.code === '42501' ? 'The Data center needs Documentation · View.' : 'The Data center’s folders could not be read. Please try again.',
    }
  }
  const drive = driveFromRow(data)
  // The Bin counts its days from the read, not from when the page was first drawn (mig 20261013183000).
  return drive
    ? { ok: true, data: { ...drive, readAt: new Date().toISOString() } }
    : { ok: false, reason: 'The Data center’s folders could not be read. Please try again.' }
}

/** A Data center file: inline to look at, or as a download under its own name. */
export async function driveFileLink(id: string, mode: 'view' | 'download'): Promise<FileLink> {
  const supabase = await client()
  const { data, error } = await supabase.rpc('hr_drive_file', { p_id: id })
  if (error || !data) {
    return { ok: false, reason: error?.code === '22023' ? error.message : 'The file could not be opened. Please try again.' }
  }
  const f = data as { path?: unknown; fileName?: unknown; contentType?: unknown }
  if (typeof f.path !== 'string' || !f.path) return { ok: false, reason: 'The file could not be opened. Please try again.' }
  const fileName = typeof f.fileName === 'string' ? f.fileName : ''
  const signed = await supabase.storage
    .from(DOC_BUCKET)
    .createSignedUrl(f.path, 300, mode === 'download' ? { download: fileName || true } : undefined)
  if (signed.error || !signed.data) return { ok: false, reason: 'The file could not be opened. Please try again.' }
  return { ok: true, url: signed.data.signedUrl, fileName, contentType: typeof f.contentType === 'string' ? f.contentType : null }
}
