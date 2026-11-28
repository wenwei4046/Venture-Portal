import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/auth'
import { opensMktApp } from '@/lib/one-app'
import { loadMktAppData } from '@/lib/mkt-app/server'
import MktAppLive from '@/components/mkt-app/MktAppLive'

export const dynamic = 'force-dynamic'

/**
 * `/mkt-app` — the Marketing phone app (2026-11-28). It opens for an account in Marketing's view with Marketing's cell
 * (`opensMktApp`); each part then shows what that account's tabs and cells open (lib/mkt-app/server.ts). Anybody else
 * goes back to the portal. Signed out, the sign-in comes straight back here (the installed app opens on it).
 */
export default async function MktAppPage() {
  const user = await getUser()
  if (!user) redirect('/login?next=/mkt-app')
  if (!opensMktApp(user)) redirect('/dashboard')
  const ua = (await headers()).get('user-agent') ?? ''
  const platform = /iPhone|iPad|iPod/i.test(ua) ? 'ios' : 'android'
  const data = await loadMktAppData(user)
  return <MktAppLive data={data} platform={platform} />
}
