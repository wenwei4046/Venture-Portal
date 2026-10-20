import { requireAuth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { HvPage, PageHead } from '@/components/hrv/kit'
import ItSupport from '@/components/it-support/ItSupport'
import { preloadItSupport } from '@/lib/it-requests/preload'
import { itSupportApp } from '@/lib/one-app'

export const dynamic = 'force-dynamic'

/** Every active account can submit and follow its own IT requests. No module tab closes it. */
export default async function ItSupportPage({ searchParams }: {
  searchParams: Promise<{ it?: string | string[] }>
}) {
  const user = await requireAuth()
  if (user.viewingAs) redirect('/dashboard')
  const query = await searchParams
  const initialId = typeof query.it === 'string' ? query.it : undefined
  const initial = await preloadItSupport(initialId)
  return (
    <HvPage>
      <PageHead eyebrow="Account" title="IT support" />
      <ItSupport app={itSupportApp(user)} initialId={initialId} {...initial} />
    </HvPage>
  )
}
