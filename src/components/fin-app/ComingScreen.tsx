'use client'

import { useRouter } from 'next/navigation'
import { HUB_HREF, TOP_LABEL, type HubKey } from '@/lib/fin-app/routes'
import AppScreen, { PageHead } from './AppScreen'
import { useHubTabs } from './hub-tabs'
import { canStepBack, setIntent } from './nav'
import { Placeholder } from './parts'

// A screen of the Finance phone app that is drawn in a later part (2026-10-15):
// its place is there — a hub with its top tabs, a page with its head — so the
// tabs and the Overview's tiles all land somewhere. The portal's own page does
// the work until then; the app is not opened for anybody by itself before
// every screen is drawn (lib/one-app.ts).

export function ComingHub({ hub, tab }: { hub: HubKey; tab: 'daily' | 'fund' | 'report' }) {
  const { topTabs, swipe } = useHubTabs(tab, hub)
  return (
    <AppScreen screenKey={HUB_HREF[hub]} head={{ kind: 'bare' }} root topTabs={topTabs} onSwipe={swipe}>
      <Placeholder>{TOP_LABEL[hub]} is drawn in the next part of the app.</Placeholder>
    </AppScreen>
  )
}

export function ComingPage({ roman, section, label }: { roman: string; section: string; label: string }) {
  const router = useRouter()
  const back = () => {
    if (canStepBack()) {
      window.history.back()
      return
    }
    setIntent('pop')
    router.replace('/fin-app')
  }
  return (
    <AppScreen screenKey={`page:${label}`} head={{ kind: 'back', title: label, backLabel: 'Overview', onBack: back }}>
      <PageHead roman={roman} eyebrow={`${section} · ${label}`} title={label} />
      <Placeholder>{label} is drawn in the next part of the app.</Placeholder>
    </AppScreen>
  )
}
