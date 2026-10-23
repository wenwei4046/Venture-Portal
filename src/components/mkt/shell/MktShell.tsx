'use client'

import { Suspense, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import type { User } from '@/types'
import { writeCookie } from '@/lib/hr-view'
import { actionsOnPage, opensPath } from '@/lib/page-tabs'
import { canDo } from '@/lib/permission-actions'
import { MKT_LOOK_COOKIE, MKT_NAV_COOKIE } from '@/lib/marketing-view'
import { densityOf, lookToCookie, LOOK_SIZES, type Look } from '@/lib/marketing/look'
import { mktCrumb, mktNavActive, mktNavRows, type MktNavKey } from '@/lib/marketing/nav'
import { initialOf } from '@/lib/marketing/shell'
import { ToastHost } from '@/components/hrv/toast'
import { ChangePasswordDialog, RequestEmailDialog, SignOutDialog } from '@/components/layout/AccountMenu'
import ViewingAsBanner from '@/components/layout/ViewingAsBanner'
import RouteFreshener from '@/components/layout/RouteFreshener'
import { dmSerif, grotesk, lookFamily, nunito, playfair, plex } from '../fonts'
import MktSidebar from './MktSidebar'
import MktTopBar from './MktTopBar'
import MktAccountMenu, { type MktAccountWindow } from './MktAccountMenu'
import { AppearancePanel, NoticesPanel } from './MktPanels'
import { useMktShell } from './useMktShell'
import s from './shell.module.css'

// Marketing's shell (2026-10-23, `Marketing Shell.dc.html`): the sidebar, the white top bar and the page on a white
// card 10px in from the ground. Marketing's own pages draw on the card as the handoff does; the portal's pages it
// keeps (one's claims, the meeting rooms, Change password, IT support) on HR's white sheet. Drawers and windows of the
// HR kit open over the card (`data-hrv-overlay`). Appearance — the font size, the face, the density — is a cookie,
// so the server draws it as chosen; the sidebar's fold the same.

type Panel = 'none' | 'notifications' | 'appearance' | 'menu'

const TEAM_BG: Record<string, string> = {
  manager: 'var(--mk-team-manager-bg)',
  content: 'var(--mk-team-content-bg)',
  social: 'var(--mk-team-social-bg)',
  design: 'var(--mk-team-design-bg)',
  ads: 'var(--mk-team-ads-bg)',
  brand: 'var(--mk-team-brand-bg)',
}

export default function MktShell({
  user,
  navUser,
  initialCollapsed,
  initialLook,
  children,
}: {
  user: User
  /** The account as the lens lists it (lib/view-as.ts lensNav): its rows. */
  navUser: User
  initialCollapsed: boolean
  initialLook: Look
  children: ReactNode
}) {
  const pathname = usePathname() ?? ''
  const search = useSearchParams()
  const { data: shell, reload } = useMktShell(pathname)
  const [collapsed, setCollapsed] = useState(initialCollapsed)
  const [look, setLook] = useState(initialLook)
  const [panel, setPanel] = useState<Panel>('none')
  const [subsOpen, setSubsOpen] = useState(true)
  const [win, setWin] = useState<MktAccountWindow | null>(null)
  // The row just clicked lights at once — the page answers after.
  const [pending, setPending] = useState<MktNavKey | `sub:${string}` | null>(null)
  const query = search?.toString() ?? ''
  useEffect(() => {
    setPending(null)
    setPanel(p => (p === 'appearance' ? p : 'none'))
  }, [pathname, query])

  const rows = useMemo(() => mktNavRows(navUser.tabs), [navUser.tabs])
  // + New Project: Marketing · Create as New Project's page keeps it — never while viewing as somebody.
  const newProject = useMemo(() => {
    if (user.viewingAs || !opensPath(navUser.tabs, '/marketing/new')) return false
    const acting = user.closed?.length ? { ...user, actions: actionsOnPage(user.actions ?? {}, user.closed, '/marketing/new') } : user
    return canDo(acting, 'marketing', 'create')
  }, [user, navUser.tabs])
  const active = pending ?? mktNavActive(pathname, search)
  const own = pathname === '/marketing' || pathname.startsWith('/marketing/')
  const personal = user.personalLogin === true && !user.viewingAs

  // The crumb: the row's own, or a subsidiary's when its page or its projects are open.
  const subPage = /^\/marketing\/subsidiaries\/([^/]+)$/.exec(pathname)
  const subCode = pathname === '/marketing/projects' ? search?.get('sub') : subPage ? decodeURIComponent(subPage[1]).toUpperCase() : null
  const sub = subCode ? shell?.subs.find(x => x.code === subCode) : null
  const crumb = sub ? { emoji: sub.emoji, label: sub.name } : mktCrumb(pathname)

  const me = shell?.me
  const name = me?.full || user.name || 'Marketing'
  const avatar = {
    letter: initialOf(me?.first || user.name),
    bg: (me?.team && TEAM_BG[me.team]) || 'var(--mk-team-manager-bg)',
    title: me ? [me.first || me.full, me.role || me.title].filter(Boolean).join(' · ') : user.canSwitchView ? `${name} · Marketing view` : name,
  }

  const fold = () => {
    const next = !collapsed
    writeCookie(MKT_NAV_COOKIE, next ? 'collapsed' : null)
    setCollapsed(next)
  }
  const pickLook = (next: Look) => {
    writeCookie(MKT_LOOK_COOKIE, lookToCookie(next))
    setLook(next)
  }
  const toggle = (p: Panel) => setPanel(cur => (cur === p ? 'none' : p))
  const d = densityOf(look.density)

  const style = {
    '--mk-base': `${LOOK_SIZES[look.size]}px`,
    '--mk-row-h': `${d.rowH}px`,
    '--mk-sub-h': `${d.subH}px`,
    '--mk-tile': `${d.tileS}px`,
    fontFamily: lookFamily(look.font),
  } as CSSProperties

  return (
    <div className={`mkt-shell ${s.root} ${nunito.variable} ${plex.variable} ${playfair.variable} ${dmSerif.variable} ${grotesk.variable} print:h-auto print:overflow-visible`} style={style} data-mkt-shell="">
      <div className="print:hidden contents">
        <MktSidebar
          rows={rows}
          active={panel === 'appearance' ? null : active}
          shell={shell}
          collapsed={collapsed}
          onFold={fold}
          subsOpen={subsOpen}
          onSubs={() => setSubsOpen(o => !o)}
          avatar={avatar}
          menuOpen={panel === 'menu'}
          onMenu={() => toggle('menu')}
          settingsOn={panel === 'appearance'}
          onSettings={() => toggle('appearance')}
          onPick={setPending}
        />
      </div>
      <div className={s.main}>
        <div className="print:hidden contents">
          {user.viewingAs ? <ViewingAsBanner name={user.viewingAs.name} /> : null}
          <MktTopBar
            user={user}
            crumb={crumb}
            personal={personal}
            unread={shell?.notices ?? 0}
            bellOn={panel === 'notifications'}
            onBell={() => toggle('notifications')}
            newProject={newProject}
          />
        </div>
        <div className={s.frame} data-hrv-overlay="">
          {own ? (
            <main className={`${s.content} route-surface page-enter print:p-0`} data-mkt-own="">{children}</main>
          ) : (
            <main className="sheet-theme sheet hrv-sheet route-surface page-enter print:p-0">{children}</main>
          )}
          <ToastHost />
        </div>
      </div>
      {panel === 'menu' ? (
        <>
          <div className={s.scrim} onClick={() => setPanel('none')} aria-hidden="true" />
          <MktAccountMenu
            name={name}
            sub={me ? [me.title, 'Marketing view'].filter(Boolean).join(' · ') : 'Marketing view'}
            personal={personal}
            onWindow={setWin}
            onClose={() => setPanel('none')}
          />
        </>
      ) : null}
      {panel === 'notifications' ? (
        <>
          <div className={s.scrim} onClick={() => setPanel('none')} aria-hidden="true" />
          <NoticesPanel onClose={() => setPanel('none')} onRead={reload} />
        </>
      ) : null}
      {panel === 'appearance' ? (
        <>
          <div className={s.scrim} onClick={() => setPanel('none')} aria-hidden="true" />
          <AppearancePanel look={look} onLook={pickLook} onClose={() => setPanel('none')} left={collapsed ? 74 : 10} />
        </>
      ) : null}
      <ChangePasswordDialog open={win === 'password'} onClose={() => setWin(null)} />
      <RequestEmailDialog open={win === 'email'} onClose={() => setWin(null)} />
      <SignOutDialog open={win === 'signout'} onClose={() => setWin(null)} view="the Marketing view" />
      <Suspense fallback={null}>
        <RouteFreshener />
      </Suspense>
    </div>
  )
}
