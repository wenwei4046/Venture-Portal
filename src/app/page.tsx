import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getUser } from '@/lib/auth'
import { isPhone, opensFinApp, opensHrAppOnPhone } from '@/lib/one-app'

export default async function Home() {
  const user = await getUser()
  if (user?.role === 'revenue_member') redirect('/member')
  // The one app's start (lib/one-app.ts): HR's view on a phone opens the HR app, Finance's the Finance app; the
  // portal layout asks the same.
  const phone = isPhone((await headers()).get('user-agent'))
  if (opensHrAppOnPhone(user) && phone) redirect('/hr-app')
  if (opensFinApp(user) && phone) redirect('/fin-app')
  redirect('/dashboard')
}
