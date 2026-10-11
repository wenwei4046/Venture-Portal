import type { Metadata } from 'next'
import { readGuestDay, readGuestPage } from '@/lib/guest/read'
import GuestPage from './_components/GuestPage'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'HOUZS Venture · Guest services',
  robots: { index: false, follow: false },
}

/**
 * The guest link (2026-10-11, the HR revamp's second package — README §16):
 * public, no sign-in, outside the portal's layout. The code in the address is
 * the only key; the database answers "closed" for a wrong one, an old one, or
 * while HR has the link off. Never requirePage — there is no account here.
 */
export default async function GuestLinkPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const data = await readGuestPage(code)
  const taken = data.on && data.booking ? await readGuestDay(code, data.today) : []
  return <GuestPage code={code} initial={data} initialTaken={taken} />
}
