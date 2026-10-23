import type { Metadata } from 'next'
import { readShared } from '@/lib/marketing/share-server'
import SharedPage from './_components/SharedPage'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'HOUZS Marketing · Shared files',
  robots: { index: false, follow: false },
}

/**
 * A Library share link (2026-10-23, Marketing ⑥-3 — `Library.dc.html` › *Share link*): public, no sign-in, outside the
 * portal's layout, as the guest link and the PIC's. The code in the address is the only key; the database answers
 * "closed" for a wrong one, a link stopped or past its expiry, a file or folder binned. Never requirePage — there is no
 * account here.
 */
export default async function SharedLinkPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const page = await readShared(code)
  return <SharedPage code={code} page={page} />
}
