import { headers } from 'next/headers'
import { requirePage, requirePermission } from '@/lib/auth'
import { readGuestLinkAdmin } from '@/lib/guest/read'
import { HvPage, PageHead } from '@/components/hrv/kit'
import GuestLinkView from './_components/GuestLinkView'

export const dynamic = 'force-dynamic'

/**
 * Admin › Guest Link (2026-10-11, the HR revamp's second package — README
 * §15): HR's view. Guest link · View reads it, Edit changes it. The address it
 * shows is this site's own /g/<code>.
 */
export default async function GuestLinkAdminPage() {
  await requirePage('/admin/guest-link')
  await requirePermission('guest_link')
  const [admin, h] = await Promise.all([readGuestLinkAdmin(), headers()])
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  if (!admin.ok) {
    return (
      <HvPage>
        <PageHead eyebrow="Admin · Guest Link" title="Guest link" />
        <div className="sheet-danger">{admin.reason}</div>
      </HvPage>
    )
  }
  return <GuestLinkView initial={admin.data} origin={`${proto}://${host}`} />
}
