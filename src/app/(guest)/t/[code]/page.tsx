import type { Metadata } from 'next'
import { readPicPage } from '@/lib/marketing/pic-server'
import PicPage from './_components/PicPage'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'HOUZS Marketing · Project tracking',
  robots: { index: false, follow: false },
}

/**
 * The PIC's link (2026-10-23, Marketing ⑤-1 — `PIC Link.dc.html`): public, no sign-in, outside the portal's layout,
 * as the guest link. The code in the address is the only key; the database answers "closed" for a wrong one, a project
 * never sent or cancelled. Never requirePage — there is no account here.
 */
export default async function PicLinkPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const page = await readPicPage(code)
  return <PicPage code={code} initial={page} />
}
