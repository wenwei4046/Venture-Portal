import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getUser } from '@/lib/auth'
import { isPhone, opensHrAppOnPhone } from '@/lib/one-app'

export default async function Home() {
  const user = await getUser()
  if (user?.role === 'revenue_member') redirect('/member')
  // The one app's start (lib/one-app.ts): HR's view on a phone opens the HR app; the portal layout asks the same.
  if (opensHrAppOnPhone(user) && isPhone((await headers()).get('user-agent'))) redirect('/hr-app')
  redirect('/dashboard')
}
