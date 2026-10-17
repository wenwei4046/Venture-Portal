import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getUser } from '@/lib/auth'
import { isPhone, startPlace } from '@/lib/one-app'
import { openTarget } from '@/lib/push/notices'

// The one app's start (lib/one-app.ts): HR's view on a phone opens the HR app, Finance's the Finance app; the portal
// layout asks the same. A tapped notice about one's own request (`open=me:<id>`) is carried on to Me.
export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getUser()
  const raw = (await searchParams).open
  const target = openTarget(typeof raw === 'string' ? raw : null)
  redirect(startPlace(user, isPhone((await headers()).get('user-agent')), target?.k === 'me' ? target.id : null))
}
