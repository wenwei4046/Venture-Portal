import { notFound } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import { loginIsPersonal } from '@/lib/account/personal-login'
import { finAccountMenu, visibleAccountMenu } from '@/components/layout/fin-nav'
import { finAppSections } from '@/lib/fin-app/server'
import { ComingPage } from '@/components/fin-app/ComingScreen'

/**
 * `/fin-app/page/<row>` — a Finance page the app has no tab for (Daily Bank,
 * the General Ledger, Dept Pool …, and Profile's Admin rows): only a row this
 * reader's sidebar or account menu shows opens, as on the computer. Drawn in
 * a later part.
 */
export default async function FinAppPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const user = await requireAuth()
  const sections = finAppSections(user)
  for (const sec of sections) {
    const item = sec.items.find((i) => i.key === key)
    if (item) return <ComingPage roman={sec.roman ?? ''} section={sec.label ?? 'Overview'} label={item.label} />
  }
  const personal = (await loginIsPersonal()) === true
  const admin = visibleAccountMenu(finAccountMenu(), { ...user, personalLogin: personal }).find((g) => g.title === 'Admin')
  const row = admin?.items.find((i) => i.key === key)
  if (row) return <ComingPage roman="" section="Admin" label={row.label} />
  notFound()
}
