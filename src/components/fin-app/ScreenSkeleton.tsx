'use client'

import { useLayoutEffect } from 'react'
import { usePathname } from 'next/navigation'
import { skeletonHidden, skeletonShown } from '@/lib/nav-progress'
import { HUB_HREF, TOP_LABEL, hubOf, tabHubs, tabOf } from '@/lib/fin-app/routes'
import AppScreen from './AppScreen'
import { useFrame } from './FinAppFrame'
import s from './fin-app.module.css'

// While a screen of the Finance app is on its way (2026-10-15): the click
// answers at once (speed.md — a loading boundary in every route folder of the
// app), drawing the screen that is coming — a hub with its top tabs and the
// shapes of its total and cards, any other screen a head and lines — counted
// as a skeleton so the progress line and the freshener know the server was
// asked (lib/nav-progress.ts).

export default function ScreenSkeleton() {
  const pathname = usePathname() ?? '/fin-app'
  const { rows } = useFrame()
  useLayoutEffect(() => {
    skeletonShown()
    return skeletonHidden
  }, [])

  const hub = hubOf(pathname)
  const tab = tabOf(pathname)
  if (hub && (tab === 'daily' || tab === 'fund' || tab === 'report')) {
    const tabs = tabHubs(tab, rows).map((h) => ({ key: h, label: TOP_LABEL[h], href: HUB_HREF[h], current: h === hub }))
    return (
      <AppScreen screenKey={pathname} head={{ kind: 'bare' }} topTabs={tabs} root>
        <Shapes hub />
      </AppScreen>
    )
  }
  return (
    <AppScreen screenKey={pathname} head={tab === 'home' && pathname === '/fin-app' ? { kind: 'root', title: 'Overview' } : { kind: 'bare' }} root={pathname === '/fin-app' || pathname === '/fin-app/profile'}>
      <Shapes />
    </AppScreen>
  )
}

function Shapes({ hub = false }: { hub?: boolean }) {
  return (
    <div className={s.skel} role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading…</span>
      {hub ? <div className={s.skelHero} /> : null}
      {hub ? (
        <>
          <div className={s.skelCard} />
          <div className={s.skelCard} />
          <div className={s.skelCard} />
        </>
      ) : (
        <>
          <div className={s.skelLine} />
          <div className={s.skelLine} />
          <div className={s.skelLine} />
          <div className={s.skelLine} />
        </>
      )}
    </div>
  )
}
