import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { officeClock } from '@/lib/office-clock'
import { officeTime } from '@/lib/office-time'
import { startRead } from '@/lib/start-read'
import { firstName, isPrincipalView } from '@/lib/finance-view'
import { canAccessTreasury } from '@/lib/roles'
import { appHref, hubOfRow } from '@/lib/fin-app/routes'
import { finAppSections, hasApprovalsTab } from '@/lib/fin-app/server'
import { financeSummary, loadFinanceOverviewCounts } from '@/app/(portal)/dashboard/_lib/finance-overview'
import { loadPrincipalOverview } from '@/app/(portal)/dashboard/_lib/principal-overview'
import { QUICK } from '@/app/(portal)/dashboard/_components/FinanceOverview'
import OverviewScreen, { type OverviewFigure } from '@/components/fin-app/OverviewScreen'

export const dynamic = 'force-dynamic'

/**
 * `/fin-app` — the Finance app's Overview (2026-10-15, the Finance revamp v2's
 * phone — M01): the desktop Overview's reads (`loadFinanceOverviewCounts` —
 * each part only for whoever opens its page) and its sidebar's categories,
 * each tile a screen of the app.
 *
 * The Principal's own view (2026-10-17) reads as its desktop Overview does:
 * the line leads with what waits for its decision, and the treasury's four
 * figures stand under it (the user kept them, "留一排金额卡"), each opening its
 * screen; Approvals is its own tab, so it takes no quick action here.
 */
export default async function FinAppOverview() {
  const user = await requireAuth()
  const supabase = await createClient()
  const principal = isPrincipalView(user)
  // The treasury's figures and its queue, for the Principal's own view that reads the treasury (the desktop's branch).
  const principalRead = principal && canAccessTreasury(user) ? startRead(loadPrincipalOverview(supabase as unknown as SupabaseClient, user)) : null
  const counts = await loadFinanceOverviewCounts(supabase as unknown as SupabaseClient, user)
  const extras = principalRead ? await principalRead : null
  const sections = finAppSections(user)
  const rows = new Set(sections.flatMap((sec) => sec.items.map((i) => i.key)))
  const badge = {
    payments: (counts.pending ?? 0) + (counts.draft ?? 0),
    invoices: counts.outstanding ?? 0,
    billing: counts.toBill ?? 0,
  }
  const clock = officeClock()
  const approvalsTab = hasApprovalsTab(user)
  const how = (key: string) => (hubOfRow(key) || (approvalsTab && key === 'approvals') ? ('tab' as const) : ('push' as const))
  const href = (key: string) => appHref(key, { approvalsTab })

  const f = extras?.figures ?? null
  const bare = (n: number) => n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const figures: OverviewFigure[] = f
    ? [
        { key: 'venture', row: 'venture-pool', label: 'Venture Pool', value: f.venturePool, sub: 'Live ledger' },
        { key: 'pool', row: 'dp', label: 'Pool', value: f.pool, sub: 'Dept + Venture' },
        { key: 'lent', row: 'fund-out', label: 'Lent out', value: f.lentOut, sub: 'Loans outstanding' },
        { key: 'interest', row: 'pnl', label: `Interest · ${officeTime().format('MMM')}`, value: f.interest.net, sub: `In ${bare(f.interest.income)}` },
      ]
        .filter((c) => rows.has(c.row))
        .map((c) => ({ key: c.key, label: c.label, value: c.value, sub: c.sub, href: href(c.row), how: how(c.row) }))
    : []

  return (
    <OverviewScreen
      date={`${clock.date} · ${clock.quarter}`}
      greeting={`${clock.greeting}, ${firstName(user.name, principal ? 'Principal' : 'Finance')}.`}
      summary={financeSummary(counts, extras ? { waiting: extras.waiting } : {})}
      figures={figures}
      quick={QUICK.filter((q) => rows.has(q.key)).map((q) => ({
        key: q.key,
        label: q.label,
        icon: q.icon,
        href: href(q.key),
        badge: q.badge && q.badge !== 'approvals' ? badge[q.badge] : undefined,
        how: how(q.key),
      }))}
      quickTone={Object.fromEntries(QUICK.map((q) => [q.key, q.tone]))}
      categories={sections
        .filter((sec) => sec.label !== null)
        .map((sec) => ({
          roman: sec.roman ?? '',
          label: sec.label as string,
          tone: sec.tone,
          tiles: sec.items.map((i) => ({ key: i.key, label: i.label, icon: i.icon, href: href(i.key), how: how(i.key) })),
        }))}
    />
  )
}
