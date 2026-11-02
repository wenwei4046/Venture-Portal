'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { User } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { recordVisit, usualPages, warmWhenIdle } from '@/lib/nav-warm'
import { LeadToast } from '@/app/(portal)/leads/_components/ui/bits'
import ViewSwitch from './ViewSwitch'
import MemoBell from './MemoBell'
import ViewingAsBanner from './ViewingAsBanner'
import { LeadIcon } from './lead-icons'
import { figtree } from './lead-fonts'
import { useLeadUnread } from '@/lib/leads/unread-store'
import { leadNavSections, leadPageTitle, showsLeadSearch, visibleLeadNav } from './lead-nav'
import s from './LeadShell.module.css'

/**
 * Lead View's shell (2026-11-02, the v2 handoff `docs/design_handoff_lead_view_v2`, README §5 — value for value):
 * a 64px rust rail that opens to 232px over the page once the pointer has rested on it 120 ms and closes the moment
 * it leaves (`NAV_REST_MS`), and a 64px header with the page's Georgia title, the search (Inbox and Leads only),
 * Test mode and the bell. The prototype has no view switch or Sign out; both live in the avatar's menu (the user,
 * 2026-11-02: keep every earlier feature), so the Principal can still leave Lead View.
 */
export const NAV_REST_MS = 120

export default function LeadShell({ user, children }: { user: User; children: ReactNode }) {
  const pathname = usePathname() ?? ''
  const router = useRouter()
  const sections = useMemo(() => visibleLeadNav(leadNavSections(), user), [user])
  const [open, setOpen] = useState(false)
  const [menu, setMenu] = useState(false)
  const unread = useLeadUnread()
  const rest = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hrefs = useMemo(() => sections.flatMap(sec => sec.items.flatMap(i => (i.href ? [i.href] : []))), [sections])
  useEffect(() => {
    if (pathname) recordVisit(pathname)
  }, [pathname])
  useEffect(() => {
    if (!pathname || !window.matchMedia?.('(min-width: 768px)').matches) return
    return warmWhenIdle(router, usualPages(hrefs, pathname))
  }, [pathname, hrefs, router])
  useEffect(() => () => { if (rest.current) clearTimeout(rest.current) }, [])

  const enter = () => {
    if (rest.current) clearTimeout(rest.current)
    rest.current = setTimeout(() => setOpen(true), NAV_REST_MS)
  }
  const leave = () => {
    if (rest.current) clearTimeout(rest.current)
    setOpen(false)
    setMenu(false)
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
    <div data-lead-view="" className={`${s.root} ${figtree.variable}`}>
      <div className={s.navSlot}>
        <aside className={s.nav} data-open={open || undefined} aria-label="Lead View" onMouseEnter={enter} onMouseLeave={leave}>
          <div className={s.brand}>
            <span className={s.logo} aria-hidden="true">H</span>
            <span className={s.fade}>Lead View</span>
          </div>
          {sections.map((sec, i) => (
            <div key={sec.label ?? i} className={s.group}>
              {i > 0 ? <span className={s.sep} aria-hidden="true" /> : null}
              {sec.items.map(item => (
                <Link key={item.key} href={item.href ?? '#'} className={s.item} aria-current={item.match(pathname) ? 'page' : undefined} title={item.label}>
                  <LeadIcon name={item.icon} size={18} />
                  <span className={s.fade}>{item.label}</span>
                  {item.key === 'leads-inbox' && unread ? <span className={s.navDot} aria-hidden="true" /> : null}
                </Link>
              ))}
            </div>
          ))}
          <div className={s.spacer} />
          <button type="button" className={s.me} onClick={() => { setOpen(true); setMenu(m => !m) }} aria-expanded={menu} aria-haspopup="menu">
            <span className={s.avatar} aria-hidden="true">{initialsOf(name)}</span>
            <span className={`${s.meText} ${s.fade}`}>
              <span className={s.meName}>{name}</span>
              <span className={s.meSub}>Customer Service</span>
            </span>
          </button>
          {menu ? (
            <div className={s.meMenu} role="menu">
              {user.canSwitchView ? <ViewSwitch value="lead" viewingAs={user.viewingAs?.name} className={s.meSwitch} /> : null}
              <button type="button" role="menuitem" className={s.meItem} onClick={signOut}>Sign out</button>
            </div>
          ) : null}
        </aside>
      </div>

      <div className={s.column}>
        {user.viewingAs ? <ViewingAsBanner name={user.viewingAs.name} /> : null}
        <header className={s.bar}>
          <div className={s.heading}>
            <h1 className={s.title}>{leadPageTitle(pathname)}</h1>
          </div>
          <span className={s.fill} />
          {showsLeadSearch(pathname) ? (
            <form className={s.search} role="search" onSubmit={e => { e.preventDefault(); search(new FormData(e.currentTarget).get('q')?.toString() ?? '') }}>
              <LeadIcon name="search" size={15} />
              <input name="q" placeholder="Search customers, phones or chats" aria-label="Search customers, phones or chats" />
            </form>
          ) : null}
          <span className={s.test} title="Meta is not connected for every Page yet: test conversations, and replies to them are recorded, not sent">
            <span className={s.testDot} aria-hidden="true" />Test mode
          </span>
          {mine ? (
            <span className={s.bellSlot}><MemoBell /></span>
          ) : (
            <span className={s.bell} title="Notifications" aria-hidden="true">
              <LeadIcon name="bell" />
              <span className={s.bellDot} />
            </span>
          )}
        </header>
        <div className={s.frame} data-hrv-overlay="">
          <main className={`route-surface page-enter ${s.main}`}>{children}</main>
          <LeadToast />
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
