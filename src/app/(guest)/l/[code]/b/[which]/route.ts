import { isShareCode } from '@/lib/marketing/share'
import { readShared, shareClient } from '@/lib/marketing/share-server'

/**
 * GET /l/<code>/b/avatar | banner — the brand's own logo or cover (⑥-2) on a Library share link's page (⑥-3), signed
 * at the click as the stranger: the link's page names the picture its subsidiary's profile shows, and the bucket's
 * anon policy opens it only to that live link's code (mkt_lib_share_may_read).
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const none = () => new Response('Not found.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })

export async function GET(_request: Request, { params }: { params: Promise<{ code: string; which: string }> }) {
  const { code, which } = await params
  if (!isShareCode(code) || (which !== 'avatar' && which !== 'banner')) return none()
  const page = await readShared(code)
  const path = which === 'avatar' ? page?.sub.profile.avatarPath : page?.sub.profile.bannerPath
  if (!path) return none()
  const { data, error } = await shareClient(code).storage.from('marketing').createSignedUrl(path, 3600)
  if (error || !data?.signedUrl) return none()
  return new Response(null, { status: 302, headers: { Location: data.signedUrl, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
}
