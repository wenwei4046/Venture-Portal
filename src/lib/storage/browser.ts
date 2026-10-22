import { READ_ONLY_MESSAGE } from '@/lib/supabase/read-only'
import { removeUploads, startUpload } from './actions'
import { contentTypeOf } from './names'

/**
 * `createClient().storage.from(bucket)` in the browser (2026-10-23, the move to R2). The browser holds no R2 key, so:
 *
 *   - upload: the server makes the file's link (`startUpload`: its row under this person's own session, so the
 *     bucket's policy decides), then the file goes from here straight to R2 with it — size, type and "nothing there
 *     yet" are part of the link. A bucket still in Supabase Storage is answered 'supabase' and goes there as before.
 *   - remove: done on the server (`removeUploads`), as far as the bucket lets this person.
 *   - a signed link: `/files/<bucket>/<path>` — the server signs it at the click, under the session, every time it
 *     is opened (app/files/[bucket]/[...path]/route.ts), so the browser needs no round trip to make one and a link
 *     kept on a page never runs out.
 *   - a public link: the public bucket's own address, learned when the file went up.
 *
 * While viewing as somebody the browser writes nothing (lib/supabase/read-only.ts): an upload or a removal answers in
 * its words without asking anybody.
 */

type Answer<T> = { data: T; error: null } | { data: null; error: { name: 'StorageError'; message: string; status: number } }

const fail = (message: string, status = 400): { data: null; error: { name: 'StorageError'; message: string; status: number } } => ({ data: null, error: { name: 'StorageError', message, status } })

type SupabaseBucket = Record<string, (...args: unknown[]) => unknown>
type SupabaseStorage = { from: (bucket: string) => SupabaseBucket }

/** Public addresses learned from uploads on this page: bucket → path → address. */
const publicAddresses = new Map<string, Map<string, string>>()

/** The link the server signs at the click, for a file of a bucket — opened in place, or saved under a name. */
export function fileRoute(bucket: string, path: string, download?: string | boolean): string {
  const at = `/files/${encodeURIComponent(bucket)}/${path.split('/').map(encodeURIComponent).join('/')}`
  if (download === true) return `${at}?download=1`
  return typeof download === 'string' && download ? `${at}?download=${encodeURIComponent(download)}` : at
}

function browserBucket(original: SupabaseStorage, bucket: string, opts: { readOnly: boolean; stranger: boolean }) {
  return {
    async upload(path: string, file: Blob, options?: { contentType?: string; upsert?: boolean; cacheControl?: string }): Promise<Answer<{ id: string; path: string; fullPath: string }>> {
      if (opts.readOnly) return fail(READ_ONLY_MESSAGE, 403)
      const contentType = contentTypeOf(options?.contentType, file)
      let plan: Awaited<ReturnType<typeof startUpload>>
      try {
        plan = await startUpload({ bucket, path, size: file.size, contentType, stranger: opts.stranger })
      } catch {
        return fail('The file could not be sent. Check the connection and try again.', 503)
      }
      if (!plan.ok) return fail(plan.message)
      if (plan.backend === 'supabase') return original.from(bucket).upload(path, file, options) as Promise<Answer<{ id: string; path: string; fullPath: string }>>
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
        const kept = publicAddresses.get(bucket) ?? new Map<string, string>()
        kept.set(path, plan.publicUrl)
        publicAddresses.set(bucket, kept)
      }
      return { data: { id: plan.id, path, fullPath: `${bucket}/${path}` }, error: null }
    },

    async remove(paths: string[]): Promise<Answer<Array<{ name: string }>>> {
      if (opts.readOnly) return fail(READ_ONLY_MESSAGE, 403)
      try {
        const res = await removeUploads({ bucket, paths })
        return res.error ? fail(res.error.message) : { data: res.data ?? [], error: null }
      } catch {
        return fail('The files could not be removed. Please try again.', 503)
      }
    },

    async createSignedUrl(path: string, _expiresIn: number, options?: { download?: string | boolean }): Promise<Answer<{ signedUrl: string }>> {
      return { data: { signedUrl: fileRoute(bucket, path, options?.download) }, error: null }
    },

    async createSignedUrls(paths: string[], _expiresIn: number): Promise<Answer<Array<{ path: string; signedUrl: string; error: null }>>> {
      return { data: paths.map(path => ({ path, signedUrl: fileRoute(bucket, path), error: null })), error: null }
    },

    async download(path: string): Promise<Answer<Blob>> {
      try {
        const res = await fetch(fileRoute(bucket, path))
        return res.ok ? { data: await res.blob(), error: null } : fail('Object not found', 404)
      } catch {
        return fail('The file could not be read. Please try again.', 503)
      }
    },

    getPublicUrl(path: string): { data: { publicUrl: string } } {
      const learned = publicAddresses.get(bucket)?.get(path)
      return learned ? { data: { publicUrl: learned } } : (original.from(bucket).getPublicUrl(path) as { data: { publicUrl: string } })
    },
  }
}

/**
 * The browser's client with its `.storage` answered here; everything else is the client itself. `stranger`: the
 * guest page's client, whose uploads the server makes as the same stranger (never as whoever is signed in).
 */
export function withBrowserFileStorage<T extends object>(client: T, opts: { readOnly?: boolean; stranger?: boolean } = {}): T {
  const flags = { readOnly: opts.readOnly === true, stranger: opts.stranger === true }
  let files: { from: (bucket: string) => ReturnType<typeof browserBucket> } | null = null
  return new Proxy(client, {
    get(target, prop) {
      if (prop === 'storage') {
        const original = Reflect.get(target, 'storage', target) as SupabaseStorage
        files ??= { from: (bucket: string) => browserBucket(original, bucket, flags) }
        return files
      }
      const value = Reflect.get(target, prop, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}
