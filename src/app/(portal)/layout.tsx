import { cookies, headers } from 'next/headers'
import { requireAuth } from '@/lib/auth'
import PortalFrame from '@/components/layout/PortalFrame'
import { emptyNavData, readsDeptStatements, type NavData } from '@/components/layout/nav-config'
import { canAccessRevenue } from '@/lib/roles'
import { primedRegistryRows } from '@/lib/dept-registry'
import { statementDepts } from '@/lib/dept-statements'
import { HR_NAV_COOKIE, REVENUE_SUB_COOKIE, isHrView } from '@/lib/hr-view'
import { isFinanceShell } from '@/lib/finance-view'
import { listSubDepartments } from './revenue/_lib/sub-departments'
import { redirect } from 'next/navigation'
import { isPhone, opensFinApp, opensHrAppOnPhone } from '@/lib/one-app'
import { loginIsPersonal } from '@/lib/account/personal-login'
import { startRead } from '@/lib/start-read'

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireAuth()
  if (user.role === 'revenue_member') redirect('/member')
  const phone = isPhone((await headers()).get('user-agent'))
  // One app (2026-10-11, lib/one-app.ts): on a phone, HR's view IS the HR app — its other pages are the computer's.
  if (opensHrAppOnPhone(user) && phone) redirect('/hr-app')
  // …and Finance's view IS the Finance app (2026-10-16): every page of it is an app screen now (the user: 我不要再用那种
  // portal 的手机版了). A statement's print stands outside the portal — (paper) — and the files are route handlers.
  if (opensFinApp(user) && phone) redirect('/fin-app')
  const jar = await cookies()
  // Admin › Change password is a personal login's own (2026-10-12): asked beside the nav's rows.
  const personal = startRead(loginIsPersonal())

  // Almost all of the nav is a constant, but the Revenue group lists the
  // Revenue Department's sub-departments — Fair today, more when they are
  // created — so those rows have to be read per request. Only for the two
  // roles that can see the group; nobody else pays for the query.
  let navData: NavData = emptyNavData
  if (canAccessRevenue(user)) {
    const subs = await listSubDepartments()
    // Comm Cal / Sales Groups / Rules open the sub-department last picked on a
    // Revenue page's switcher (2026-10-10) — else the home one, the oldest.
    const picked = jar.get(REVENUE_SUB_COOKIE)?.value
    const home = subs.find(s => s.isHome) ?? subs[0]
    const revenueSub = subs.find(s => s.slug === picked)?.slug ?? home?.slug ?? null
    navData = { ...navData, revenueSubDepts: subs, revenueSub }
  }
  // Dept Pool lists each department for whoever reads them all (2026-10-09);
  // the ones added since — IT, Revenue Department — come from the registry
  // this request has already primed (signing in builds the server client),
  // so no read is made for them here.
  if (readsDeptStatements(user)) {
    navData = { ...navData, deptPoolDepts: statementDepts(primedRegistryRows()) }
  }
  const personalLogin = await personal

  return (
    <PortalFrame
      user={personalLogin ? { ...user, personalLogin } : user}
      navData={navData}
      // HR's sidebar and Finance's (2026-10-14) fold alike, on the one cookie.
      hrNavCollapsed={(isHrView(user.role) || isFinanceShell(user.role)) && jar.get(HR_NAV_COOKIE)?.value === 'collapsed'}
      phone={phone}
    >
      {children}
    </PortalFrame>
  )
}
