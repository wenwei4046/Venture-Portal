'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { prepareUpload, type UploadPlan } from './server'

/**
 * The browser's two storage calls that need the server (2026-10-23, the move to R2): the browser holds no R2 key, so
 * a file's link is made here and the file then goes from the browser straight to R2 — never through a function,
 * whose body stops at 4.5 MB. Neither asks a cell of its own: as with Storage, the bucket's policies on
 * `public.file_objects` decide, under the caller's own session (or, for the guest page, as the same stranger the
 * page is — never somebody signed in to the portal: `stranger`). While viewing as somebody the server's client is
 * read-only, so both answer in its words.
 */

const BUCKET = /^[a-z0-9][a-z0-9-]{1,62}$/

async function clientOf(stranger: boolean): Promise<SupabaseClient> {
  // The guest page's client is loaded only for a guest (it is server-only; this module is imported by the browser's client).
  if (stranger) return (await import('@/lib/guest/client')).guestClient() as unknown as SupabaseClient
  return (await createClient()) as unknown as SupabaseClient
}

/** A file about to go up: where it goes, or why not. */
export async function startUpload(input: { bucket: string; path: string; size: number; contentType: string | null; stranger?: boolean }): Promise<UploadPlan> {
  const bucket = typeof input?.bucket === 'string' ? input.bucket : ''
  if (!BUCKET.test(bucket)) return { ok: false, message: 'Bucket not found' }
  const db = await clientOf(input?.stranger === true)
  return prepareUpload(db, bucket, {
    path: typeof input?.path === 'string' ? input.path : '',
    size: Number(input?.size),
    contentType: typeof input?.contentType === 'string' ? input.contentType : null,
  })
}

/** Files taken off again from the browser — as far as the bucket's DELETE policy lets this person. */
export async function removeUploads(input: { bucket: string; paths: string[] }): Promise<{ data: Array<{ name: string }> | null; error: { message: string } | null }> {
  const bucket = typeof input?.bucket === 'string' ? input.bucket : ''
  if (!BUCKET.test(bucket)) return { data: null, error: { message: 'Bucket not found' } }
  const paths = (Array.isArray(input?.paths) ? input.paths : []).filter((p): p is string => typeof p === 'string').slice(0, 200)
  const db = await createClient()
  const res = await db.storage.from(bucket).remove(paths)
  if (res.error) return { data: null, error: { message: String(res.error.message ?? 'The files could not be removed.') } }
  return { data: (res.data ?? []).map(row => ({ name: String((row as { name?: unknown }).name ?? '') })), error: null }
}
