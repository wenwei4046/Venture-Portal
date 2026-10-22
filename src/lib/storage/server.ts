import type { SupabaseClient } from '@supabase/supabase-js'
import { fileBucket, keptFileBucket, type FileBucket } from './buckets'
import { contentTypeOf, inlineSafe, objectNameProblem, uploadSize } from './names'

/**
 * `supabase.storage.from(bucket)` on the server, for every bucket (2026-10-23, the move to Cloudflare R2). A bucket
 * still in Supabase Storage (`file_buckets.backend = 'supabase'`) is handed to Supabase as before; one in R2 is served
 * here — the same calls, the same `{ data, error }` answers, so no page, action or route changes how it asks:
 *
 *   - WHO may is the database's, as it was: `public.file_objects` (the twin of storage.objects — bucket_id, name,
 *     owner_id, metadata { size, mimetype }, created_at) carries every policy storage.objects had, word for word, and
 *     every question goes through the CALLER's own client. Uploading = inserting the object's row (its bucket's
 *     INSERT policy; the size and type checked against the bucket by `file_objects_stamp`), reading or signing =
 *     selecting it, removing = deleting it. Only once the database said yes is R2 touched (lib/storage/r2.ts).
 *   - The functions that ask whether a file arrived (`hr_doc_file_present`, `it_request_files_check` …) read
 *     file_objects once their bucket has moved, so a file filed under a record is one the database knows.
 *   - The service role's client (admin.ts — the hourly sweeps) passes every policy, as with Storage.
 *   - While viewing as somebody the client handed in is read-only (lib/supabase/read-only.ts): the row an upload,
 *     a copy or a removal writes is refused there, in its words, before R2 is reached.
 *
 * R2 is imported only when a moved bucket is used, so nothing that merely builds a client loads the R2 key.
 */

export interface StorageError {
  name: 'StorageError'
  message: string
  status: number
}

type Answer<T> = { data: T; error: null } | { data: null; error: StorageError }

const fail = (message: string, status: number): { data: null; error: StorageError } => ({ data: null, error: { name: 'StorageError', message, status } })

/** A row of `file_objects`, as removal answers it (Supabase answered storage.objects' rows). */
export interface FileObjectRow {
  id: string
  bucket_id: string
  name: string
  owner: string | null
  owner_id: string | null
  metadata: { size?: number; mimetype?: string } | null
  created_at: string
}

const ROW_COLUMNS = 'id, bucket_id, name, owner, owner_id, metadata, created_at'

/** How many names go into one `.in()` — a long list is a long URL. */
const NAMES_PER_READ = 50

type UploadBody = Blob | ArrayBuffer | ArrayBufferView
type UploadOptions = { contentType?: string; upsert?: boolean; cacheControl?: string }
type SignOptions = { download?: string | boolean }

/** The calls a bucket answers — the ones the portal makes. */
export interface FileBucketApi {
  upload(path: string, body: UploadBody, options?: UploadOptions): Promise<Answer<{ id: string; path: string; fullPath: string }>>
  download(path: string): Promise<Answer<Blob>>
  remove(paths: string[]): Promise<Answer<FileObjectRow[]>>
  copy(fromPath: string, toPath: string): Promise<Answer<{ path: string }>>
  createSignedUrl(path: string, expiresIn: number, options?: SignOptions): Promise<Answer<{ signedUrl: string }>>
  createSignedUrls(paths: string[], expiresIn: number): Promise<Answer<Array<{ path: string | null; signedUrl: string; error: string | null }>>>
  getPublicUrl(path: string): { data: { publicUrl: string } }
}

type SupabaseBucket = Record<string, (...args: unknown[]) => unknown>
type SupabaseStorage = { from: (bucket: string) => SupabaseBucket }

const r2 = () => import('./r2')

/** The name a file saves as when nothing else names it: the last part of its path. */
const baseName = (path: string) => path.split('/').pop() || 'file'

/** What PostgREST said when the row was refused, in the words Supabase Storage used for the same refusal. */
export function insertRefusal(error: { code?: string; message?: string }): StorageError {
  const code = String(error.code ?? '')
  if (code === '23505') return { name: 'StorageError', message: 'The resource already exists', status: 409 }
  if (code === '42501') return { name: 'StorageError', message: error.message?.startsWith('new row violates') ? error.message : 'new row violates row-level security policy', status: 403 }
  if (code === 'VIEW_AS') return { name: 'StorageError', message: String(error.message ?? ''), status: 403 }
  // file_objects_stamp: the bucket's size and type rules, said as Storage said them.
  if (code === '22023' || code === 'P0001') return { name: 'StorageError', message: String(error.message ?? 'The file was refused.'), status: 400 }
  return { name: 'StorageError', message: 'The file could not be stored. Please try again.', status: 500 }
}

function r2Bucket(db: SupabaseClient, original: SupabaseStorage | null, id: string): FileBucketApi {
  /** The bucket, or 'supabase' to hand the call to Supabase Storage (a bucket not moved, or none the portal lists). */
  const which = async (): Promise<FileBucket | 'supabase' | StorageError> => {
    try {
      const b = await fileBucket(db, id)
      return b && b.backend === 'r2' ? b : 'supabase'
    } catch {
      return { name: 'StorageError', message: 'File storage could not be reached. Please try again.', status: 503 }
    }
  }
  const pass = <T>(method: string, args: unknown[]): Promise<T> => {
    if (!original) return Promise.resolve(fail('This bucket is not in file storage.', 404) as T)
    const bucket = original.from(id)
    const fn = bucket[method]
    if (typeof fn !== 'function') return Promise.resolve(fail(`${method} is not available.`, 400) as T)
    return Promise.resolve(fn.apply(bucket, args) as T)
  }
  const isError = (v: unknown): v is StorageError => !!v && typeof v === 'object' && (v as StorageError).name === 'StorageError'

  /** The rows of these names the caller may read (their bucket's SELECT policy). */
  const readable = async (names: readonly string[]): Promise<Map<string, FileObjectRow> | StorageError> => {
    const out = new Map<string, FileObjectRow>()
    for (let i = 0; i < names.length; i += NAMES_PER_READ) {
      const chunk = names.slice(i, i + NAMES_PER_READ)
      const { data, error } = await db.from('file_objects').select(ROW_COLUMNS).eq('bucket_id', id).in('name', chunk)
      if (error) return { name: 'StorageError', message: String(error.message ?? 'The files could not be read.'), status: 400 }
      for (const row of (data ?? []) as FileObjectRow[]) out.set(row.name, row)
    }
    return out
  }

  const sign = async (b: FileBucket, row: FileObjectRow, expiresIn: number, download: SignOptions['download']) => {
    const { presignGet, r2Location } = await r2()
    const mimetype = row.metadata?.mimetype ?? null
    // A file a browser could run (HTML, SVG …) is only ever a download, never shown in place on R2's address.
    const name = download === true ? baseName(row.name) : typeof download === 'string' && download ? download : inlineSafe(mimetype) ? undefined : baseName(row.name)
    return presignGet(r2Location(id, row.name, b.public), expiresIn, { download: name })
  }

  return {
    async upload(path, body, options) {
      const b = await which()
      if (isError(b)) return fail(b.message, b.status)
      if (b === 'supabase') return pass('upload', [path, body, options])
      const problem = objectNameProblem(path)
      if (problem) return fail(problem, 400)
      if (options?.upsert) return fail('A file already there is never replaced — give the new one its own name.', 400)
      const contentType = contentTypeOf(options?.contentType, body)
      const bytes = body instanceof Blob ? body : ArrayBuffer.isView(body) ? new Uint8Array(body.buffer, body.byteOffset, body.byteLength) : new Uint8Array(body)
      const size = uploadSize(bytes)
      const rowId = crypto.randomUUID()
      const { error } = await db.from('file_objects').insert({ id: rowId, bucket_id: id, name: path, metadata: { size, mimetype: contentType } })
      if (error) {
        const refusal = insertRefusal(error)
        return fail(refusal.message, refusal.status)
      }
      const { r2Location, r2Put } = await r2()
      const put = await r2Put(r2Location(id, path, b.public), bytes, contentType).catch(() => ({ ok: false as const, status: 502, message: 'R2 could not be reached' }))
      if (!put.ok) {
        // As far as this caller's own policy lets it; otherwise the hourly sweep drops a row whose file never came.
        await db.from('file_objects').delete().eq('id', rowId)
        return fail('The file could not be stored. Please try again.', 502)
      }
      return { data: { id: rowId, path, fullPath: `${id}/${path}` }, error: null }
    },

    async download(path) {
      const b = await which()
      if (isError(b)) return fail(b.message, b.status)
      if (b === 'supabase') return pass('download', [path])
      const rows = await readable([path])
      if (isError(rows)) return fail(rows.message, rows.status)
      if (!rows.has(path)) return fail('Object not found', 404)
      const { r2Get, r2Location } = await r2()
      const res = await r2Get(r2Location(id, path, b.public)).catch(() => null)
      if (!res || !res.ok) return fail('Object not found', 404)
      return { data: await res.blob(), error: null }
    },

    async remove(paths) {
      const b = await which()
      if (isError(b)) return fail(b.message, b.status)
      if (b === 'supabase') return pass('remove', [paths])
      const names = [...new Set((Array.isArray(paths) ? paths : []).filter((p): p is string => typeof p === 'string' && p !== ''))]
      const gone: FileObjectRow[] = []
      let refused: StorageError | null = null
      for (let i = 0; i < names.length && !refused; i += NAMES_PER_READ) {
        const chunk = names.slice(i, i + NAMES_PER_READ)
        // Only the rows the caller's DELETE policy lets go come back — "refused" is "nothing deleted", as with Storage.
        const { data, error } = await db.from('file_objects').delete().eq('bucket_id', id).in('name', chunk).select(ROW_COLUMNS)
        if (error) refused = { name: 'StorageError', message: String(error.message ?? 'The files could not be removed.'), status: error.code === 'VIEW_AS' ? 403 : 400 }
        else gone.push(...((data ?? []) as FileObjectRow[]))
      }
      if (gone.length) {
        const { r2DeleteMany, r2Location } = await r2()
        // An object R2 would not delete now has no row; the hourly sweep takes it.
        await r2DeleteMany(gone.map(row => r2Location(id, row.name, b.public))).catch(() => [])
      }
      return refused ? fail(refused.message, refused.status) : { data: gone, error: null }
    },

    async copy(fromPath, toPath) {
      const b = await which()
      if (isError(b)) return fail(b.message, b.status)
      if (b === 'supabase') return pass('copy', [fromPath, toPath])
      const problem = objectNameProblem(toPath)
      if (problem) return fail(problem, 400)
      const rows = await readable([fromPath])
      if (isError(rows)) return fail(rows.message, rows.status)
      const source = rows.get(fromPath)
      if (!source) return fail('Object not found', 404)
      const rowId = crypto.randomUUID()
      const { error } = await db.from('file_objects').insert({ id: rowId, bucket_id: id, name: toPath, metadata: source.metadata ?? {} })
      if (error) {
        const refusal = insertRefusal(error)
        return fail(refusal.message, refusal.status)
      }
      const { r2Copy, r2Location } = await r2()
      const copied = await r2Copy(r2Location(id, fromPath, b.public), r2Location(id, toPath, b.public)).catch(() => ({ ok: false as const, status: 502, message: '' }))
      if (!copied.ok) {
        await db.from('file_objects').delete().eq('id', rowId)
        return fail('The file could not be copied. Please try again.', 502)
      }
      return { data: { path: toPath }, error: null }
    },

    async createSignedUrl(path, expiresIn, options) {
      const b = await which()
      if (isError(b)) return fail(b.message, b.status)
      if (b === 'supabase') return pass('createSignedUrl', options === undefined ? [path, expiresIn] : [path, expiresIn, options])
      const rows = await readable([path])
      if (isError(rows)) return fail(rows.message, rows.status)
      const row = rows.get(path)
      if (!row) return fail('Object not found', 404)
      return { data: { signedUrl: await sign(b, row, expiresIn, options?.download) }, error: null }
    },

    async createSignedUrls(paths, expiresIn) {
      const b = await which()
      if (isError(b)) return fail(b.message, b.status)
      if (b === 'supabase') return pass('createSignedUrls', [paths, expiresIn])
      const wanted = (Array.isArray(paths) ? paths : []).filter((p): p is string => typeof p === 'string')
      const rows = await readable([...new Set(wanted)])
      if (isError(rows)) return fail(rows.message, rows.status)
      const out = await Promise.all(wanted.map(async path => {
        const row = rows.get(path)
        return row
          ? { path, signedUrl: await sign(b, row, expiresIn, undefined), error: null }
          : { path, signedUrl: '', error: 'Object not found' }
      }))
      return { data: out, error: null }
    },

    getPublicUrl(path) {
      // Asked without waiting (Storage answers it at once): the bucket as last read here decides.
      const b = keptFileBucket(id)
      const base = process.env.R2_PUBLIC_URL?.trim().replace(/\/+$/, '')
      if (b?.backend === 'r2' && b.public && base) return { data: { publicUrl: `${base}/${[id, ...path.split('/')].map(encodeURIComponent).join('/')}` } }
      if (original) return original.from(id).getPublicUrl(path) as { data: { publicUrl: string } }
      return { data: { publicUrl: '' } }
    },
  }
}

/** What the browser does with a file it is about to send (lib/storage/browser.ts, through lib/storage/actions.ts). */
export type UploadPlan =
  | { ok: true; backend: 'supabase' }
  | { ok: true; backend: 'r2'; id: string; url: string; headers: Record<string, string>; publicUrl: string | null }
  | { ok: false; message: string }

/** How long the browser has to START sending a file; a big video still arriving after that is fine. */
const PUT_LINK_SECONDS = 15 * 60

/**
 * A file the browser is about to send to a moved bucket: its row first — under the sender's own client, so the
 * bucket's INSERT policy and its size and type rules decide, exactly as Storage's upload did — then a link R2 takes
 * that one file on, of that size and type only, never over a file already there. A bucket still in Supabase Storage
 * answers 'supabase' and the browser sends it there as before. A file that never arrives leaves its row; the hourly
 * sweep drops it a day later (lib/storage/sweep.ts).
 */
export async function prepareUpload(db: SupabaseClient, bucketId: string, file: { path: string; size: number; contentType: string | null }): Promise<UploadPlan> {
  let b: FileBucket | null
  try {
    b = await fileBucket(db, bucketId)
  } catch {
    return { ok: false, message: 'File storage could not be reached. Please try again.' }
  }
  if (!b || b.backend !== 'r2') return { ok: true, backend: 'supabase' }
  const problem = objectNameProblem(file.path)
  if (problem) return { ok: false, message: problem }
  if (!Number.isSafeInteger(file.size) || file.size < 0) return { ok: false, message: 'That file could not be read.' }
  const contentType = contentTypeOf(file.contentType)
  const rowId = crypto.randomUUID()
  const { error } = await db.from('file_objects').insert({ id: rowId, bucket_id: bucketId, name: file.path, metadata: { size: file.size, mimetype: contentType } })
  if (error) return { ok: false, message: insertRefusal(error).message }
  try {
    const { presignPut, publicObjectUrl, r2Location } = await r2()
    const signed = await presignPut(r2Location(bucketId, file.path, b.public), { size: file.size, contentType }, PUT_LINK_SECONDS)
    return { ok: true, backend: 'r2', id: rowId, url: signed.url, headers: signed.headers, publicUrl: b.public ? publicObjectUrl(bucketId, file.path) : null }
  } catch {
    await db.from('file_objects').delete().eq('id', rowId)
    return { ok: false, message: 'File storage could not be reached. Please try again.' }
  }
}

/** The storage of one client: `.from(bucket)` as Supabase's, R2 underneath for the buckets that moved. */
export function fileStorage(db: SupabaseClient, original: SupabaseStorage | null): { from: (bucket: string) => FileBucketApi } {
  return { from: (bucket: string) => r2Bucket(db, original, bucket) }
}

/**
 * The client with its `.storage` answered here. Everything else is the client itself, so a read-only client stays
 * read-only for the rows an upload writes (wrap the read-only one, never the other way round).
 */
export function withFileStorage<T extends object>(client: T): T {
  let files: ReturnType<typeof fileStorage> | null = null
  return new Proxy(client, {
    get(target, prop) {
      if (prop === 'storage') {
        files ??= fileStorage(target as unknown as SupabaseClient, Reflect.get(target, 'storage', target) as SupabaseStorage)
        return files
      }
      const value = Reflect.get(target, prop, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}
