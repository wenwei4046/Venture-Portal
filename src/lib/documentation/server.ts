import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { documentationFromRow, type Documentation } from './model'

/**
 * Documentation's reads (2026-10-11, HR revamp round 2): the page's one read
 * and the short signed links its files open by, under the reader's own
 * session — `hr_documentation()` / `hr_documentation_file()` ask
 * Documentation · View (mig 20261011070000), and the bucket's own policy asks
 * the same before it signs. Shared with the HR phone app's Data center.
 *
 * A link is made at the click and lives five minutes: never keep one in a
 * read that is cached or stored.
 */

export const DOC_BUCKET = 'hr-documents'

export type DocumentationRead = { ok: true; data: Documentation } | { ok: false; reason: string }

export type FileLink = { ok: true; url: string; fileName: string; contentType: string | null } | { ok: false; reason: string }

async function client(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient
}

export async function loadDocumentation(): Promise<DocumentationRead> {
  const { data, error } = await (await client()).rpc('hr_documentation')
  if (error) {
    return {
      ok: false,
      reason: error.code === '42501' ? 'Documentation needs Documentation · View.' : 'Documentation could not be read. Please try again.',
    }
  }
  const doc = documentationFromRow(data)
  return doc ? { ok: true, data: doc } : { ok: false, reason: 'Documentation could not be read. Please try again.' }
}

/** A document's or a letter's file: inline to look at, or as a download under its own name. */
export async function documentationFileLink(kind: 'document' | 'letter', id: string, mode: 'view' | 'download'): Promise<FileLink> {
  const supabase = await client()
  const { data, error } = await supabase.rpc('hr_documentation_file', { p_kind: kind, p_id: id })
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
