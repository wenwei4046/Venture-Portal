'use client'

import { useState } from 'react'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { Tabs } from '@/components/hrv/tabs'
import type { AdminMemberData } from '@/app/(member)/member/actions'
import type { ClaimRatesAdmin } from '@/lib/member/claim-rates-admin'
import type { FoodClaimAdmin } from '@/lib/member/food-claim-admin'
import type { RequestFacts } from '@/lib/member/member-services'
import RequestReviews from './RequestReviews'
import BrandWeeksPanel from './BrandWeeksPanel'
import ClaimRatesPanel from './ClaimRatesPanel'
import FoodClaimPanel from './FoodClaimPanel'

type Tab = 'requests' | 'weeks' | 'claims' | 'food'

/**
 * People › Member services (2026-10-10, the HR revamp handoff, variant A):
 * Request reviews · Brand weeks · Claim rates · Food claim (2026-10-13: Fair's
 * rate a day and the titles that may claim it). The headcount limit went to
 * Revenue › Rules › Capacity (PR2), Product options — only a pointer to the
 * Product List's Modular since 2026-09-24 — went with this redraw, and
 * Publish memo moved to People › Documentation › Publish (round 2,
 * 2026-10-11: the handoff's README §6 — a memo now goes to people, by
 * department, from any department).
 *
 * The tab is the page's own state, not the URL: Brand weeks reads its month
 * with a Server Action when it is opened, and a URL pushed while one is in
 * flight makes the App Router drop it and refresh (comm-cal.md › "Back while
 * an action is in flight"). `?request=` still opens one request.
 */
export default function MemberServicesView({
  data,
  facts,
  claimRates,
  foodClaim,
  initialRequestId,
}: {
  data: AdminMemberData
  facts: Record<string, RequestFacts> | null
  claimRates: ClaimRatesAdmin | null
  foodClaim: FoodClaimAdmin | null
  initialRequestId: string | null
}) {
  const tabs: Array<{ key: Tab; label: string }> = data.canManageRequests
    ? [{ key: 'requests', label: 'Request reviews' }, { key: 'weeks', label: 'Brand weeks' }, { key: 'claims', label: 'Claim rates' },
        { key: 'food', label: 'Food claim' }]
    : []
  const [tab, setTab] = useState<Tab>(tabs[0]?.key ?? 'requests')
  // A tab mounts when it is first opened and then stays, hidden, so what was
  // typed on it waits for the user's return — and Brand weeks reads once.
  const [opened, setOpened] = useState<Tab[]>(() => [tab])
  const show = (key: Tab) => opened.includes(key)
  const allowed = (key: Tab) => tabs.some(t => t.key === key)

  return (
    <HvPage>
      <PageHead eyebrow="People · Member services" title="Member services" />
      {tabs.length > 1 ? (
        <Tabs
          items={tabs}
          active={tab}
          onSelect={k => {
            setTab(k as Tab)
            setOpened(o => (o.includes(k as Tab) ? o : [...o, k as Tab]))
          }}
          size="compact"
          label="Member services"
          style={{ margin: '-4px 0 18px' }}
        />
      ) : null}
      {allowed('requests') && show('requests') ? (
        <div hidden={tab !== 'requests'}>
          <RequestReviews data={data} facts={facts} initialRequestId={initialRequestId} />
        </div>
      ) : null}
      {allowed('weeks') && show('weeks') ? (
        <div hidden={tab !== 'weeks'}>
          <BrandWeeksPanel departments={data.departments.map(({ id, name }) => ({ id, name }))} />
        </div>
      ) : null}
      {allowed('claims') && show('claims') ? (
        <div hidden={tab !== 'claims'}>
          <ClaimRatesPanel initial={claimRates} />
        </div>
      ) : null}
      {allowed('food') && show('food') ? (
        <div hidden={tab !== 'food'}>
          <FoodClaimPanel initial={foodClaim} />
        </div>
      ) : null}
      {tabs.length === 0 ? <p>Member services needs HR request management access. Memos are published from People › Documentation.</p> : null}
    </HvPage>
  )
}
