import { redirect } from 'next/navigation'
import { getAccountUser, requireAuth } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { preloadItSupport } from '@/lib/it-requests/preload'
import { HvPage, PageHead } from '@/components/hrv/kit'
import ItSupport from '@/components/it-support/ItSupport'

export const dynamic = 'force-dynamic'

/** One desk for requests from every app. Its existing account permission is the gate, independent of view tabs. */
export default async function ItRequestsPage({ searchParams }: {
  searchParams: Promise<{ it?: string | string[] }>
}) {
  const user = await requireAuth()
  if (user.viewingAs) redirect('/dashboard')
  const account = await getAccountUser()
  if (!canDo(account, 'it_requests', 'view')) redirect('/dashboard')
  const query = await searchParams
  const initialId = typeof query.it === 'string' ? query.it : undefined
  const initial = await preloadItSupport(initialId, true)
  return (
    <HvPage>
      <PageHead eyebrow="IT support" title="IT requests" />
      <ItSupport app="portal" desk canEdit={canDo(account, 'it_requests', 'edit')} initialId={initialId} {...initial} />
    </HvPage>
  )
}
