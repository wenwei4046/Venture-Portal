import { objectNameProblem } from '@/lib/storage/names'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /files/<bucket>/<path> — a file of any bucket, signed at the click (2026-10-23, the move to R2). A read-only
 * file download (CLAUDE.md › Coding Conventions): the file is looked up under the caller's OWN session, so the
 * bucket's policy on `public.file_objects` (or, for a bucket not moved yet, Storage's) decides whether they may see
 * it — nothing here asks anything else, and a file they may not see is simply not found. Then a redirect to a link
 * that works for an hour; `?download=<name>` saves it under that name (`1`: its own).
 *
 * The browser's storage calls make these links (lib/storage/browser.ts) — it holds no R2 key — so a photo on a page
 * never needs a round trip to be signed, and a link kept on a page never runs out. A video keeps seeking on the link
 * it was sent to (R2 answers a Range with 206).
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUCKET = /^[a-z0-9][a-z0-9-]{1,62}$/

const notFound = () =>
  new Response('Not found.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store' } })

/** A segment as written in the address; Next may hand it over encoded or not. */
function segment(part: string): string {
  if (!/%[0-9A-Fa-f]{2}/.test(part)) return part
  try {
    return decodeURIComponent(part)
  } catch {
    return part
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ bucket: string; path: string[] }> }) {
  const { bucket, path } = await params
  if (!BUCKET.test(bucket) || !Array.isArray(path) || path.length === 0) return notFound()
  const name = path.map(segment).join('/')
  if (objectNameProblem(name)) return notFound()
  const asked = new URL(request.url).searchParams.get('download')
  const download = asked === '1' ? true : asked ? asked.slice(0, 200) : undefined

  const db = await createClient()
  const { data, error } = await db.storage.from(bucket).createSignedUrl(name, 3600, download ? { download } : undefined)
  if (error || !data?.signedUrl) return notFound()
  return new Response(null, {
    status: 302,
    headers: { Location: data.signedUrl, 'Cache-Control': 'private, max-age=600', 'Referrer-Policy': 'no-referrer' },
  })
}
