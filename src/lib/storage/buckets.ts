/**
 * The portal's buckets (2026-10-23, the move to R2): `public.file_buckets`, the twin of storage.buckets — each
 * bucket's size limit, the types it takes, whether it is public (and then its address), and which BACKEND holds its
 * files today: 'supabase' (Supabase Storage, as before) or 'r2' (Cloudflare R2, through `public.file_objects`). A
 * bucket moves by one migration that flips its backend and points its functions at file_objects
 * (supabase/migrations/*_file_storage_move_*).
 *
 * Every signed-in session — and the guest page's stranger — may read the list: it is configuration, the same for
 * everybody, so one read serves the whole server instance (or the whole page, in the browser) for a few seconds. A
 * failed read is never kept; a database that has no such table yet (before its migration) holds every bucket in
 * Supabase Storage.
 */

export type FileBackend = 'supabase' | 'r2'

export interface FileBucket {
  id: string
  public: boolean
  fileSizeLimit: number | null
  allowedMimeTypes: string[] | null
  backend: FileBackend
  /** A public bucket's address in R2 (`https://cdn.houzsventure.com/crm-auto-reply`), or null. */
  publicUrl: string | null
}

/** How long one read of the list serves — a bucket's move is seen everywhere within this. */
export const BUCKETS_KEPT_MS = 5_000

type Reader = { from: (table: string) => unknown }
type Rows = PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>

let kept: { at: number; buckets: Map<string, FileBucket> } | null = null

/** A row as the table holds it, or null when it is not one. */
export function bucketOf(row: unknown): FileBucket | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  if (typeof r.id !== 'string' || (r.backend !== 'supabase' && r.backend !== 'r2')) return null
  const limit = r.file_size_limit == null ? null : Number(r.file_size_limit)
  return {
    id: r.id,
    public: r.public === true,
    fileSizeLimit: limit != null && Number.isFinite(limit) && limit > 0 ? limit : null,
    allowedMimeTypes: Array.isArray(r.allowed_mime_types) ? r.allowed_mime_types.filter((m): m is string => typeof m === 'string') : null,
    backend: r.backend,
    publicUrl: typeof r.public_url === 'string' && /^https:\/\//.test(r.public_url) ? r.public_url.replace(/\/+$/, '') : null,
  }
}

/** PostgREST's "no such table" (before the migration that makes it). */
const TABLE_MISSING = new Set(['PGRST205', '42P01'])

/** Every bucket, read through the caller's own client (kept a few seconds). Throws when the list cannot be read. */
export async function fileBuckets(db: Reader): Promise<Map<string, FileBucket>> {
  if (kept && Date.now() - kept.at < BUCKETS_KEPT_MS) return kept.buckets
  const query = (db.from('file_buckets') as { select: (columns: string) => Rows })
    .select('id, public, file_size_limit, allowed_mime_types, backend, public_url')
  const { data, error } = await query
  if (error && TABLE_MISSING.has(String(error.code ?? ''))) {
    kept = { at: Date.now(), buckets: new Map() }
    return kept.buckets
  }
  if (error || !Array.isArray(data)) throw new Error('The file buckets could not be read.')
  const buckets = new Map<string, FileBucket>()
  for (const row of data) {
    const b = bucketOf(row)
    if (b) buckets.set(b.id, b)
  }
  if (buckets.size > 0) kept = { at: Date.now(), buckets }
  return buckets
}

/** One bucket, or null when the portal has none of that name. */
export async function fileBucket(db: Reader, id: string): Promise<FileBucket | null> {
  return (await fileBuckets(db)).get(id) ?? null
}

/** The bucket as last read here, however long ago — for the one question asked without waiting (a public address). */
export function keptFileBucket(id: string): FileBucket | null {
  return kept?.buckets.get(id) ?? null
}

/** A public file's address: its bucket's address and its name, each part encoded. */
export function publicFileUrl(bucket: FileBucket, name: string): string | null {
  return bucket.publicUrl ? `${bucket.publicUrl}/${name.split('/').map(encodeURIComponent).join('/')}` : null
}

/** Forget the kept list (tests). */
export function forgetFileBuckets(): void {
  kept = null
}
