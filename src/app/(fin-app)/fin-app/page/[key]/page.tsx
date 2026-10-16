import { notFound } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import { loginIsPersonal } from '@/lib/account/personal-login'
import { finAccountMenu, visibleAccountMenu } from '@/components/layout/fin-nav'
import { finAppSections } from '@/lib/fin-app/server'
import type { SearchParams } from '@/lib/fin-app/report-page'
import { ComingPage } from '@/components/fin-app/ComingScreen'
import DeptStatementScreen from './dept-statement'

export const dynamic = 'force-dynamic'

/**
 * `/fin-app/page/<row>` — a Finance page the app has no screen of its own for
 * yet, and Profile's Admin rows: only a row this reader's sidebar or account
 * menu shows opens, as on the computer. A department's row (`dp-<slug>`, Dept
 * Pool's departments) is its own page — its Cash Flow and P&L (2026-10-15,
 * part E3); the rest are drawn in a later part.
 */
export default async function FinAppPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<SearchParams> }) {
  const { key } = await params
  const user = await requireAuth()
  const sections = finAppSections(user)
  for (const sec of sections) {
    const item = sec.items.find((i) => i.key === key)
    if (!item) continue
    if (key.startsWith('dp-')) return <DeptStatementScreen slug={key.slice(3)} sp={await searchParams} />
    return <ComingPage roman={sec.roman ?? ''} section={sec.label ?? 'Overview'} label={item.label} />
  }
  const personal = (await loginIsPersonal()) === true
  const admin = visibleAccountMenu(finAccountMenu(), { ...user, personalLogin: personal }).find((g) => g.title === 'Admin')
  const row = admin?.items.find((i) => i.key === key)
  if (row) return <ComingPage roman="" section="Admin" label={row.label} />
  notFound()
}
