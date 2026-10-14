'use client'

import { useRouter } from 'next/navigation'
import AppScreen, { PageHead } from './AppScreen'
import { canStepBack, setIntent } from './nav'
import { Placeholder } from './parts'

// A page of the Finance phone app that is drawn in a later part (2026-10-15):
// its place is there — a page with its head — so the Overview's tiles all land
// somewhere. Every hub of the three middle tabs is drawn (parts 1–4); the
// portal's own page does the work of the rest until then, and the app is not
// opened for anybody by itself before every screen is drawn (lib/one-app.ts).

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
