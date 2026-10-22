import { requireAuth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ItSupportApp from '@/components/fin-app/ItSupportApp'
import { preloadItSupport } from '@/lib/it-requests/preload'

export const dynamic = 'force-dynamic'

export default async function FinAppItSupport({ searchParams }: {
  searchParams: Promise<{ it?: string | string[] }>
}) {
  const user = await requireAuth()
  if (user.viewingAs) redirect('/fin-app/profile')
  const query = await searchParams
  const initialId = typeof query.it === 'string' ? query.it : undefined
  const initial = await preloadItSupport(initialId)
  return <ItSupportApp initialId={initialId} {...initial} />
}
