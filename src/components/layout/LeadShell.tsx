'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { User } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { officeClock } from '@/lib/office-clock'
import { HR_NAV_COOKIE, writeCookie } from '@/lib/hr-view'
import { recordVisit, usualPages, warmWhenIdle } from '@/lib/nav-warm'
import { ToastHost } from '@/components/hrv/toast'
import { ViewSwitch } from './HrTopBar'
import MemoBell from './MemoBell'
import ViewingAsBanner from './ViewingAsBanner'
import { cormorant, lora } from './lead-fonts'
import { LeadIcon } from './lead-icons'
import { leadNavSections, visibleLeadNav } from './lead-nav'
import s from './LeadShell.module.css'

/**
 * Lead View's shell (2026-10-22, the redesign v2 handoff `docs/design_handoff_lead_view_inbox`, Inbox v2's frame):
 * the dark walnut sidebar (216px, folds to 62 — the same cookie as HR's fold, so the server draws it folded) and,
 * 10px in, the white top bar — search, Test mode, the office date, the bell, Sign out — over the page. The third
 * theme (`[data-lead-view]`, globals.css) and its two faces hang on the root. The Inbox draws straight on the paper
 * (`bare`); Lead View's other pages keep the white sheet until their own step of the redesign.
 */
export default function LeadShell({ user, initialCollapsed, children }: { user: User; initialCollapsed: boolean; children: ReactNode }) {
  const pathname = usePathname() ?? ''
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(initialCollapsed)
  const sections = useMemo(() => visibleLeadNav(leadNavSections(), user), [user])
  // The pages the redesign has drawn on the paper (step 1 the Inbox, step 2 Leads); the rest keep the sheet.
  const bare = pathname === '/leads' || pathname === '/leads/list'
  const clock = officeClock()

  const hrefs = useMemo(() => sections.flatMap(sec => sec.items.flatMap(i => (i.href ? [i.href] : []))), [sections])
  useEffect(() => {
    if (pathname) recordVisit(pathname)
  }, [pathname])
  useEffect(() => {
    if (!pathname || !window.matchMedia?.('(min-width: 768px)').matches) return
    return warmWhenIdle(router, usualPages(hrefs, pathname))
  }, [pathname, hrefs, router])

  const toggle = () => {
    const next = !collapsed
    writeCookie(HR_NAV_COOKIE, next ? 'collapsed' : null)
    setCollapsed(next)
  }
  const signOut = async () => {
    // This device only (2026-10-08): the shared accounts are switched on the office PC several times a day.
    await createClient().auth.signOut({ scope: 'local' })
    router.push('/login')
    router.refresh()
  }
  const search = (q: string) => {
    const t = q.trim()
    router.push(t ? `/leads?q=${encodeURIComponent(t)}` : '/leads')
  }
  const name = user.name || 'Customer Service'
  const mine = user.personalLogin === true && !user.viewingAs

  return (
    <div data-lead-view="" className={`${lora.variable} ${cormorant.variable} ${s.root}`}>
      <aside className={s.nav} data-collapsed={collapsed || undefined} aria-label="Lead View">
        <div className={s.brand}>
          <span className={s.logo} aria-hidden="true">H</span>
          <span className={s.brandText}>
            <span className={s.brandName}>HOUZS Venture</span>
            <span className={s.brandSub}>Internal ledger</span>
          </span>
        </div>
        {sections.map((sec, i) => (
          <div key={sec.label ?? i} className={s.group}>
            {sec.label ? <div className={s.groupLabel}>{sec.label.toUpperCase()}</div> : null}
            {sec.items.map(item => {
              const active = item.match(pathname)
              const body = (
                <>
                  <LeadIcon name={item.icon} />
                  <span className={s.itemLabel}>{item.label}</span>
                </>
              )
              if (!item.href) {
                return (
                  <span key={item.key} className={s.item} aria-disabled="true" title={collapsed ? `${item.label} · not built yet` : 'Not built yet'}>
                    {body}
                    <span className={s.soon}>Soon</span>
                  </span>
                )
              }
              return (
                <Link key={item.key} href={item.href} className={s.item} aria-current={active ? 'page' : undefined} title={collapsed ? item.label : undefined}>
                  {body}
                </Link>
              )
            })}
          </div>
        ))}
        <div className={s.spacer} />
        <button type="button" className={s.item} onClick={toggle} title={collapsed ? 'Expand menu' : 'Collapse menu'}>
          <LeadIcon name={collapsed ? 'panelOpen' : 'panelClose'} />
          <span className={s.itemLabel}>Collapse</span>
        </button>
        <div className={s.me}>
          <span className={s.avatar} aria-hidden="true">{initialsOf(name)}</span>
          <span className={s.meText}>
            <span className={s.meName}>{name}</span>
            <span className={s.meSub}>Customer Service</span>
          </span>
          <span className={s.version}>v0.3</span>
        </div>
      </aside>

      <div className={s.column}>
        {user.viewingAs ? <ViewingAsBanner name={user.viewingAs.name} /> : null}
        <header className={s.bar}>
          <form className={s.search} role="search" onSubmit={e => { e.preventDefault(); search(new FormData(e.currentTarget).get('q')?.toString() ?? '') }}>
            <LeadIcon name="search" size={15} />
            <input name="q" placeholder="Search customers, phone numbers or chats" aria-label="Search customers, phone numbers or chats" />
          </form>
          <span className={s.fill} />
          {user.canSwitchView ? <ViewSwitch value="lead" viewingAs={user.viewingAs?.name} /> : null}
          <span className={s.pill} title="Meta is not connected: only test conversations, and replies are recorded, not sent">
            <span className={s.pillDot} aria-hidden="true" />Test mode
          </span>
          <span className={s.date} suppressHydrationWarning>{clock.date}</span>
          {mine ? <MemoBell /> : (
            <span className={s.bell} title="Notifications" aria-hidden="true"><LeadIcon name="bell" /></span>
          )}
          <button type="button" className={s.signOut} onClick={signOut}>Sign out</button>
        </header>
        <div className={s.frame} data-hrv-overlay="">
          <main className={bare ? s.main : `sheet-theme sheet hrv-sheet ${s.sheet} route-surface page-enter`}>
            {bare ? <div className={`route-surface page-enter ${s.bare}`}>{children}</div> : children}
          </main>
          <ToastHost />
        </div>
      </div>
    </div>
  )
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[1][0]).toUpperCase()
}
