import { READ_ONLY_MESSAGE } from '@/lib/supabase/read-only'
import { removeUploads, startUpload } from './actions'
import { fileBucket, keptFileBucket, publicFileUrl, type FileBucket } from './buckets'
import { contentTypeOf } from './names'

/**
 * `createClient().storage.from(bucket)` in the browser (2026-10-23, the move to R2). Which backend holds a bucket is
 * read from `file_buckets` (every session may), and a bucket still in Supabase Storage is asked exactly as before. For
 * a bucket in R2 — the browser holds no R2 key — :
 *
 *   - upload: the server makes the file's link (`startUpload`: its row under this person's own session, so the
 *     bucket's policy decides), then the file goes from here straight to R2 with it — size, type and "nothing there
 *     yet" are part of the link; it never passes through a function, whose body stops at 4.5 MB.
 *   - remove: done on the server (`removeUploads`), as far as the bucket lets this person.
 *   - a signed link: `/files/<bucket>/<path>` — the server signs it at the click, under the session, every time it
 *     is opened (app/files/[bucket]/[...path]/route.ts), so the browser needs no round trip to make one and a link
 *     kept on a page never runs out.
 *   - a public link: the bucket's own address (`file_buckets.public_url`).
 *
 * While viewing as somebody the browser writes nothing (lib/supabase/read-only.ts): an upload or a removal answers in
 * its words without asking anybody.
 */

type StorageFailure = { name: 'StorageError'; message: string; status: number }
type Answer<T> = { data: T; error: null } | { data: null; error: StorageFailure }

const fail = (message: string, status = 400): { data: null; error: StorageFailure } => ({ data: null, error: { name: 'StorageError', message, status } })

type SupabaseBucket = Record<string, (...args: unknown[]) => unknown>
type SupabaseStorage = { from: (bucket: string) => SupabaseBucket }
type Reader = { from: (table: string) => unknown }

/** Public addresses learned from uploads on this page: bucket → path → address. */
const publicAddresses = new Map<string, Map<string, string>>()

/** The link the server signs at the click, for a file of a bucket — opened in place, or saved under a name. */
export function fileRoute(bucket: string, path: string, download?: string | boolean): string {
  const at = `/files/${encodeURIComponent(bucket)}/${path.split('/').map(encodeURIComponent).join('/')}`
  if (download === true) return `${at}?download=1`
  return typeof download === 'string' && download ? `${at}?download=${encodeURIComponent(download)}` : at
}

function browserBucket(db: Reader, original: SupabaseStorage, bucket: string, opts: { readOnly: boolean; stranger: boolean }) {
  /** The bucket in R2, 'supabase' for one in Storage, or 'ask' when the list could not be read (the server decides). */
  const where = async (): Promise<FileBucket | 'supabase' | 'ask'> => {
    try {
      const b = await fileBucket(db, bucket)
      return b && b.backend === 'r2' ? b : 'supabase'
    } catch {
      return 'ask'
    }
  }
  const supabase = <T>(method: string, args: unknown[]): Promise<T> => {
    const b = original.from(bucket)
    return Promise.resolve(b[method].call(b, ...args) as T)
  }

  return {
    async upload(path: string, file: Blob, options?: { contentType?: string; upsert?: boolean; cacheControl?: string }): Promise<Answer<{ id: string; path: string; fullPath: string }>> {
      if (opts.readOnly) return fail(READ_ONLY_MESSAGE, 403)
      if ((await where()) === 'supabase') return supabase('upload', options === undefined ? [path, file] : [path, file, options])
      const contentType = contentTypeOf(options?.contentType, file)
      let plan: Awaited<ReturnType<typeof startUpload>>
      try {
        plan = await startUpload({ bucket, path, size: file.size, contentType, stranger: opts.stranger })
      } catch {
        return fail('The file could not be sent. Check the connection and try again.', 503)
      }
      if (!plan.ok) return fail(plan.message)
      if (plan.backend === 'supabase') return supabase('upload', options === undefined ? [path, file] : [path, file, options])
      let sent: Response | null = null
      try {
        sent = await fetch(plan.url, { method: 'PUT', body: file, headers: plan.headers })
      } catch {
        sent = null
      }
      if (!sent?.ok) {
        // Its row goes again where this person may take it off; otherwise the hourly sweep drops it.
        if (!opts.stranger) await removeUploads({ bucket, paths: [path] }).catch(() => undefined)
        return fail(sent?.status === 412 ? 'The resource already exists' : 'The file could not be sent. Check the connection and try again.', sent?.status ?? 503)
      }
      if (plan.publicUrl) {
        const learned = publicAddresses.get(bucket) ?? new Map<string, string>()
        learned.set(path, plan.publicUrl)
        publicAddresses.set(bucket, learned)
      }
      return { data: { id: plan.id, path, fullPath: `${bucket}/${path}` }, error: null }
    },

    async remove(paths: string[]): Promise<Answer<Array<{ name: string }>>> {
      if (opts.readOnly) return fail(READ_ONLY_MESSAGE, 403)
      if ((await where()) === 'supabase') return supabase('remove', [paths])
      try {
        const res = await removeUploads({ bucket, paths })
        return res.error ? fail(res.error.message) : { data: res.data ?? [], error: null }
      } catch {
        return fail('The files could not be removed. Please try again.', 503)
      }
    },

    async createSignedUrl(path: string, expiresIn: number, options?: { download?: string | boolean }): Promise<Answer<{ signedUrl: string }>> {
      if ((await where()) === 'supabase') return supabase('createSignedUrl', options === undefined ? [path, expiresIn] : [path, expiresIn, options])
      return { data: { signedUrl: fileRoute(bucket, path, options?.download) }, error: null }
    },

    async createSignedUrls(paths: string[], expiresIn: number): Promise<Answer<Array<{ path: string | null; signedUrl: string; error: string | null }>>> {
      if ((await where()) === 'supabase') return supabase('createSignedUrls', [paths, expiresIn])
      return { data: paths.map(path => ({ path, signedUrl: fileRoute(bucket, path), error: null })), error: null }
    },

    async download(path: string): Promise<Answer<Blob>> {
      if ((await where()) === 'supabase') return supabase('download', [path])
      try {
        const res = await fetch(fileRoute(bucket, path))
        return res.ok ? { data: await res.blob(), error: null } : fail('Object not found', 404)
      } catch {
        return fail('The file could not be read. Please try again.', 503)
      }
    },

    getPublicUrl(path: string): { data: { publicUrl: string } } {
      const kept = keptFileBucket(bucket)
      const address = publicAddresses.get(bucket)?.get(path) ?? (kept?.backend === 'r2' ? publicFileUrl(kept, path) : null)
      return address ? { data: { publicUrl: address } } : (original.from(bucket).getPublicUrl(path) as { data: { publicUrl: string } })
    },
  }
}

/** The calls a bucket answers in the browser. */
export type BrowserFileBucket = ReturnType<typeof browserBucket>

/**
 * The browser's client with its `.storage` answered here; everything else is the client itself. `stranger`: the
 * guest page's client, whose uploads the server makes as the same stranger (never as whoever is signed in).
 */
export function withBrowserFileStorage<T extends object>(client: T, opts: { readOnly?: boolean; stranger?: boolean } = {}): T {
  const flags = { readOnly: opts.readOnly === true, stranger: opts.stranger === true }
  let files: { from: (bucket: string) => BrowserFileBucket } | null = null
  return new Proxy(client, {
    get(target, prop) {
      if (prop === 'storage') {
        const original = Reflect.get(target, 'storage', target) as SupabaseStorage
        files ??= { from: (bucket: string) => browserBucket(target as unknown as Reader, original, bucket, flags) }
        return files
      }
      const value = Reflect.get(target, prop, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}
