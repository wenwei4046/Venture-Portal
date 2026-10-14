'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { HrIcon, type HrIconName } from '@/components/hrv/icons'
import { useCurrentToast } from '@/components/hrv/toast'
import { FinSurface, type FinPlatform } from '@/components/finv/surface'
import { useTuckOnScroll } from '@/components/pwa/tuck'
import RouteFreshener from '@/components/layout/RouteFreshener'
import { FinViewProvider } from '@/components/layout/fin-view'
import { HUB_HREF, tabHubs, tabOf, type AppTab, type HubKey } from '@/lib/fin-app/routes'
import { notePop, setIntent } from './nav'
import s from './fin-app.module.css'

// The Finance phone app's frame (2026-10-15, the Finance revamp v2's phone —
// README §1, `Finance Mobile App.dc.html`): the screen the phone shows, the
// five tabs at its foot, the toast. A screen says what stands over its foot
// (`useChrome`): the tab bar only on a tab's root, sliding away when a screen
// is pushed over it (and on the Overview while reading down), the action bar
// over the tab bar, the toast over both. Each tab remembers its last top tab.

interface Chrome {
  root: boolean
  bar: boolean
  bulk: boolean
}

interface FrameCtx {
  platform: FinPlatform
  /** The sidebar rows this reader sees (fin-nav.ts keys). */
  rows: ReadonlySet<string>
  setChrome: (c: Chrome) => void
}

const Frame = createContext<FrameCtx | null>(null)

export function useFrame(): FrameCtx {
  const f = useContext(Frame)
  if (!f) throw new Error('A Finance app screen is drawn inside FinAppFrame.')
  return f
}

/** A screen tells the frame what stands over its foot. */
export function useChrome(c: Chrome) {
  const { setChrome } = useFrame()
  const { root, bar, bulk } = c
  useEffect(() => {
    setChrome({ root, bar, bulk })
  }, [setChrome, root, bar, bulk])
}

const LAST = 'fin-app-last:'

/** The top tab a tab was last on (each tab remembers its own). */
export function rememberHub(tab: 'daily' | 'fund' | 'report', hub: HubKey) {
  try {
    sessionStorage.setItem(LAST + tab, hub)
  } catch {
    /* storage closed — the tab opens on its first hub */
  }
}

function lastHub(tab: 'daily' | 'fund' | 'report', open: HubKey[]): HubKey | null {
  try {
    const kept = sessionStorage.getItem(LAST + tab) as HubKey | null
    if (kept && open.includes(kept)) return kept
  } catch {
    /* storage closed */
  }
  return open[0] ?? null
}

const TABS: ReadonlyArray<{ key: AppTab; label: string; icon: HrIconName }> = [
  { key: 'home', label: 'Overview', icon: 'home' },
  { key: 'daily', label: 'Daily', icon: 'calendar' },
  { key: 'fund', label: 'Fund', icon: 'payroll' },
  { key: 'report', label: 'Report', icon: 'report' },
  { key: 'profile', label: 'Profile', icon: 'staff' },
]

/** A screen pushed over its tab — a list, a record (`?f=`, `?id=`), a page of its own — has no tab bar. */
export function isRootScreen(pathname: string, search: Pick<URLSearchParams, 'has'>): boolean {
  return !pathname.startsWith('/fin-app/page/') && !search.has('f') && !search.has('id')
}

export default function FinAppFrame({ platform, rows, children }: { platform: FinPlatform; rows: string[]; children: ReactNode }) {
  const pathname = usePathname() ?? '/fin-app'
  const search = useSearchParams()
  const router = useRouter()
  const rowSet = useMemo(() => new Set(rows), [rows])
  // As the address says from the first paint, so a link into a list never shows the tab bar sliding away.
  const [chrome, setChromeState] = useState<Chrome>(() => ({ root: isRootScreen(pathname, search), bar: false, bulk: false }))
  const setChrome = useCallback((c: Chrome) => {
    setChromeState((prev) => (prev.root === c.root && prev.bar === c.bar && prev.bulk === c.bulk ? prev : c))
  }, [])
  const ctx = useMemo(() => ({ platform, rows: rowSet, setChrome }), [platform, rowSet, setChrome])
  const surface = useMemo(() => ({ platform }), [platform])

  // The browser's own Back (a phone's back gesture) is a pop, whichever screen hears it first.
  useEffect(() => {
    const onPop = (e: PopStateEvent) => notePop(e)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const tab = tabOf(pathname)
  // On the Overview the tab bar steps away while reading down and comes back up (README › Motion).
  const tabsRef = useRef<HTMLElement>(null)
  const tucked = useTuckOnScroll(tabsRef, chrome.root && tab === 'home', pathname)
  const tabShown = chrome.root && !tucked

  const hubsOf = (t: 'daily' | 'fund' | 'report') => tabHubs(t, rowSet)
  const tabHref = (t: AppTab): string | null => {
    if (t === 'home') return '/fin-app'
    if (t === 'profile') return '/fin-app/profile'
    const open = hubsOf(t)
    if (open.length === 0) return null
    return HUB_HREF[open[0]]
  }
  const shown = TABS.filter((t) => tabHref(t.key) !== null)

  const toast = useCurrentToast()
  const [toastShown, setToastShown] = useState<{ id: number; message: string } | null>(null)
  const [toastIn, setToastIn] = useState(false)
  useEffect(() => {
    if (toast) {
      setToastShown(toast)
      setToastIn(false)
      const f = requestAnimationFrame(() => requestAnimationFrame(() => setToastIn(true)))
      return () => cancelAnimationFrame(f)
    }
    setToastIn(false)
    const t = setTimeout(() => setToastShown(null), 280)
    return () => clearTimeout(t)
  }, [toast])

  const style = {
    '--tab-space': tabShown ? (platform === 'ios' ? 'calc(56px + var(--safe-bottom, 0px))' : 'calc(68px + var(--safe-bottom, 0px))') : '0px',
    '--home-pad': tabShown ? '0px' : 'var(--safe-bottom, 0px)',
    '--bar-space': chrome.bulk ? '80px' : chrome.bar ? '70px' : '0px',
    '--toast-lift': chrome.bar ? '82px' : '14px',
  } as CSSProperties

  return (
    <Frame.Provider value={ctx}>
      <FinSurface.Provider value={surface}>
        {/* It is the Finance view: the shared parts speak English and wear the revamp (layout/fin-view.tsx). */}
        <FinViewProvider value>
        <div className={s.app} data-fin-kit="" data-fin-app="" data-platform={platform} style={style}>
          {/* A screen shown from the router's memory is read again behind itself, as the portal's (speed.md). */}
          <RouteFreshener />
          {children}
          {toastShown ? (
            <div role="status" aria-live="polite" className={s.toast} data-shown={toastIn ? 'true' : 'false'} key={toastShown.id}>
              <span className={s.toastDot} aria-hidden="true">●</span>
              <span className={s.toastText}>{toastShown.message}</span>
            </div>
          ) : null}
          <nav ref={tabsRef} className={s.tabs} data-hidden={tabShown ? 'false' : 'true'} aria-label="Finance" inert={!tabShown || undefined}>
            {shown.map((t) => {
              const on = t.key === tab
              return (
                <Link
                  key={t.key}
                  href={tabHref(t.key) as string}
                  className={s.tab}
                  aria-current={on ? 'page' : undefined}
                  onClick={(e) => {
                    if (on && chrome.root) {
                      // The tab you are on, at its root: back to the top of it (the prototype's smooth scroll).
                      e.preventDefault()
                      document.querySelector<HTMLElement>('[data-fin-scroller]')?.scrollTo({ top: 0, behavior: 'smooth' })
                      return
                    }
                    setIntent('tab')
                    if (t.key === 'daily' || t.key === 'fund' || t.key === 'report') {
                      // The top tab it was last on, not always the first.
                      const hub = lastHub(t.key, hubsOf(t.key))
                      if (hub && HUB_HREF[hub] !== (tabHref(t.key) as string)) {
                        e.preventDefault()
                        router.push(HUB_HREF[hub])
                      }
                    }
                  }}
                >
                  <span className={s.tabPill}>
                    <HrIcon name={t.icon} size={platform === 'ios' ? 22 : 19} />
                  </span>
                  <span className={s.tabLabel}>{t.label}</span>
                </Link>
              )
            })}
          </nav>
        </div>
        </FinViewProvider>
      </FinSurface.Provider>
    </Frame.Provider>
  )
}
