import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { officeClock } from '@/lib/office-clock'
import { firstName } from '@/lib/finance-view'
import { appHref, hubOfRow } from '@/lib/fin-app/routes'
import { finAppSections } from '@/lib/fin-app/server'
import { financeSummary, loadFinanceOverviewCounts } from '@/app/(portal)/dashboard/_lib/finance-overview'
import { QUICK } from '@/app/(portal)/dashboard/_components/FinanceOverview'
import OverviewScreen from '@/components/fin-app/OverviewScreen'

export const dynamic = 'force-dynamic'

/**
 * `/fin-app` — the Finance app's Overview (2026-10-15, the Finance revamp v2's
 * phone — M01): the desktop Overview's reads (`loadFinanceOverviewCounts` —
 * each part only for whoever opens its page) and its sidebar's categories,
 * each tile a screen of the app.
 */
export default async function FinAppOverview() {
  const user = await requireAuth()
  const supabase = await createClient()
  const counts = await loadFinanceOverviewCounts(supabase as unknown as SupabaseClient, user)
  const sections = finAppSections(user)
  const rows = new Set(sections.flatMap((sec) => sec.items.map((i) => i.key)))
  const badge = {
    payments: (counts.pending ?? 0) + (counts.draft ?? 0),
    invoices: counts.outstanding ?? 0,
    billing: counts.toBill ?? 0,
  }
  const clock = officeClock()
  const how = (key: string) => (hubOfRow(key) ? ('tab' as const) : ('push' as const))

  return (
    <OverviewScreen
      date={`${clock.date} · ${clock.quarter}`}
      greeting={`${clock.greeting}, ${firstName(user.name, 'Finance')}.`}
      summary={financeSummary(counts)}
      quick={QUICK.filter((q) => rows.has(q.key)).map((q) => ({
        key: q.key,
        label: q.label,
        icon: q.icon,
        href: appHref(q.key),
        badge: q.badge ? badge[q.badge] : undefined,
        how: how(q.key),
      }))}
      quickTone={Object.fromEntries(QUICK.map((q) => [q.key, q.tone]))}
      categories={sections
        .filter((sec) => sec.label !== null)
        .map((sec) => ({
          roman: sec.roman ?? '',
          label: sec.label as string,
          tone: sec.tone,
          tiles: sec.items.map((i) => ({ key: i.key, label: i.label, icon: i.icon, href: appHref(i.key), how: how(i.key) })),
        }))}
    />
  )
}
