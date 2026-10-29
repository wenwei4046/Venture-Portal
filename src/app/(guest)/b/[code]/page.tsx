import type { Metadata } from 'next'
import { readPartnerPage } from '@/lib/crm-partner/read'
import PartnerBooking from './_components/PartnerBooking'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'HOUZS · Showroom booking',
  robots: { index: false, follow: false },
}

/**
 * A partner's booking link (2026-10-29, mig 20261029190000 — The Conts' own salespeople book a showroom slot): public, no
 * sign-in, outside the portal's layout. The code in the address is the only key; the database answers "closed" for a
 * wrong one, an old one, or while the CRM has the link off. Never requirePage — there is no account here.
 */
export default async function PartnerBookingPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  return <PartnerBooking code={code} initial={await readPartnerPage(code)} />
}
