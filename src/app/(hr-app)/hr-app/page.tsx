import { redirect } from 'next/navigation'
import { getUser } from '@/lib/auth'
import { loadHrAppData, opensHrApp } from '@/lib/hr-app/server'
import HrAppLive from '@/components/hr-app/HrAppLive'

export const dynamic = 'force-dynamic'

/**
 * `/hr-app` — the HR phone app (2026-10-11, HR revamp round 2; the user:
 * a separate address, installable, for accounts with HR's view). It opens for
 * a holder of one of HR's own areas (Hiring, Documentation, member requests);
 * each part then shows what that account's cells read — Meeting rooms are
 * everybody's. Anybody else goes back to the portal.
 */
export default async function HrAppPage() {
  // Signed out: sign in and come straight back (the installed app opens here).
  const user = await getUser()
  if (!user) redirect('/login?next=/hr-app')
  if (!opensHrApp(user)) redirect('/dashboard')
  const data = await loadHrAppData(user)
  return <HrAppLive data={data} />
}
