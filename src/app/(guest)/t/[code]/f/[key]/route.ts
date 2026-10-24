import { isPicCode } from '@/lib/marketing/pic'
import { picFileClient } from '@/lib/marketing/pic-server'
import { isFileId } from '@/lib/marketing/share'
import { inlineSafe } from '@/lib/storage/names'

/**
 * GET /t/<code>/f/<key> — a file of the work on a PIC's link (2026-10-24, Marketing ②b-2e), signed at the click as the
 * stranger. A read-only file download (CLAUDE.md › Coding Conventions) whose gate is the link's code: the database answers
 * where the file is only for one the PIC's page shows them — a deliverable's stage now, its own Files or a File field the
 * PIC sees (mkt_pic_file) — and the bucket's anon policy asks the same code again before R2 is asked for a link
 * (mkt_pic_may_read). Shown in place when a browser can show it safely; else saved (`?download=1` always saves).
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const closed = () =>
  new Response('This link is closed.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })

export async function GET(request: Request, { params }: { params: Promise<{ code: string; key: string }> }) {
  const { code, key } = await params
  if (!isPicCode(code) || !isFileId(key)) return closed()
  const db = picFileClient(code.toLowerCase())
  const { data, error } = await db.rpc('mkt_pic_file', { p_code: code.toLowerCase(), p_key: key })
  const f = !error && data && typeof data === 'object' ? (data as { path?: unknown; name?: unknown; mime?: unknown }) : null
  if (!f || typeof f.path !== 'string') return closed()
  const wants = new URL(request.url).searchParams.get('download') === '1'
  const save = wants || !inlineSafe(typeof f.mime === 'string' ? f.mime : '')
  const name = typeof f.name === 'string' && f.name.trim() ? f.name.trim() : 'file'
  const { data: signed, error: refused } = await db.storage.from('marketing').createSignedUrl(f.path, 3600, save ? { download: name } : undefined)
  if (refused || !signed?.signedUrl) return closed()
  return new Response(null, { status: 302, headers: { Location: signed.signedUrl, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
}
