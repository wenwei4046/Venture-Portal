import { notFound } from 'next/navigation'
import { requireActionOn, requirePage } from '@/lib/auth'
import { monthParam } from '@/lib/marketing/billing'
import { readBilling } from '@/lib/marketing/server'
import BillingPage from '@/components/mkt/billing/BillingPage'

export const dynamic = 'force-dynamic'

/** Billing (②b-2b; the user's answers 43–48, 50, 51): the month's lines by client — a one-time project the month it was
 * done, a recurring one every month from its first run until stopped — confirmed by the manager for Finance's import.
 * `?m=2026-10` picks the month (never one still to come). */
export default async function MarketingBillingPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  await requirePage('/marketing/billing')
  // The manager's: Marketing · Manage.
  await requireActionOn('/marketing/billing', 'marketing', 'manage')
  const sp = await searchParams
  const page = await readBilling(monthParam(sp.m))
  if (!page) notFound()
  return <BillingPage key={page.month} initial={page} />
}
