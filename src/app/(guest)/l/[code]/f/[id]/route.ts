import { isFileId, isShareCode } from '@/lib/marketing/share'
import { shareClient } from '@/lib/marketing/share-server'
import { inlineSafe } from '@/lib/storage/names'

/**
 * GET /l/<code>/f/<id> — one file of a Library share link (2026-10-23, Marketing ⑥-3), signed at the click as the
 * stranger. A read-only file download (CLAUDE.md › Coding Conventions) whose gate is the link's code: the database
 * answers where the file is only for a live link that holds it (mkt_lib_shared_file), and the bucket's anon policy asks
 * the same code again before R2 is asked for a link (mkt_lib_share_may_read) — so a stopped, expired or binned link
 * opens nothing from the next click on. Without *Allow download*, only what a browser shows in place is ever sent.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const closed = () =>
  new Response('This link is closed.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })

export async function GET(request: Request, { params }: { params: Promise<{ code: string; id: string }> }) {
  const { code, id } = await params
  if (!isShareCode(code) || !isFileId(id)) return closed()
  const db = shareClient(code)
  const { data, error } = await db.rpc('mkt_lib_shared_file', { p_code: code, p_file: id })
  const f = !error && data && typeof data === 'object' ? (data as { path?: unknown; name?: unknown; mime?: unknown; download?: unknown }) : null
  if (!f || typeof f.path !== 'string') return closed()
  const wants = new URL(request.url).searchParams.get('download') === '1'
  // Without download: only what a browser shows in place — never one it would save.
  if (f.download !== true && (wants || !inlineSafe(typeof f.mime === 'string' ? f.mime : ''))) return closed()
  const ext = /\.[a-z0-9]{1,8}$/i.exec(f.path)?.[0] ?? ''
  const name = `${typeof f.name === 'string' && f.name.trim() ? f.name.trim() : 'file'}${ext}`
  const { data: signed, error: refused } = await db.storage.from('marketing').createSignedUrl(f.path, 3600, wants ? { download: name } : undefined)
  if (refused || !signed?.signedUrl) return closed()
  return new Response(null, { status: 302, headers: { Location: signed.signedUrl, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
}
