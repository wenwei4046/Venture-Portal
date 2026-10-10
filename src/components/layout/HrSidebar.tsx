'use client'

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cancelWarmIntent, railEntered, recordVisit, usualPages, warmOnIntent, warmWhenIdle } from '@/lib/nav-warm'
import { HR_NAV_COOKIE, writeCookie } from '@/lib/hr-view'
import { NavIcon } from '@/components/hrv/icons'
import type { User } from '@/types'
import { activeHrNavKey, hrNavSections, visibleHrNav } from './hr-nav'
import s from './HrSidebar.module.css'

// HR's sidebar (2026-10-10, the HR revamp handoff). One orange-edged pill sits
// behind the rows and SLIDES to the row you click (top .34s) — measured from
// that row's offsetTop after it renders — while the row's icon tile swaps its
// tones and grows to 1.06 and its label nudges 2px. The H tile folds the
// whole rail to 64px (.28s) and back; the words fade where they stand. The
// fold is a cookie, so the server draws it folded and nothing jumps.

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

export default function HrSidebar({
  user,
  revenueSub,
  initialCollapsed,
}: {
  user: User
  /** The Revenue sub-department Comm Cal / Sales Groups / Rules open (null = none yet). */
  revenueSub: string | null
  initialCollapsed: boolean
}) {
  const pathname = usePathname() ?? ''
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(initialCollapsed)
  // The row just clicked lights at once — the pill does not wait for the
  // server to answer before it moves.
  const [pending, setPending] = useState<string | null>(null)
  const sections = useMemo(() => visibleHrNav(hrNavSections(revenueSub), user), [revenueSub, user])
  const matched = activeHrNavKey(sections, pathname)
  const active = pending ?? matched
  const navRef = useRef<HTMLElement>(null)
  const [indTop, setIndTop] = useState<number | null>(null)

  useEffect(() => {
    setPending(null)
  }, [pathname])
  useEffect(() => {
    if (!pending) return
    const t = setTimeout(() => setPending(null), 8000)
    return () => clearTimeout(t)
  }, [pending])

  const measure = () => {
    const nav = navRef.current
    if (!nav) return
    const el = active ? nav.querySelector<HTMLElement>(`[data-nav-key="${active}"]`) : null
    const top = el ? el.offsetTop : null
    setIndTop(prev => (prev === top ? prev : top))
  }
  useIsoLayoutEffect(measure)
  useEffect(() => {
    const t = setTimeout(measure, 120)
    void document.fonts?.ready.then(measure)
    return () => clearTimeout(t)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // The portal's habits, as the old sidebar had them: the page under a resting
  // pointer is rendered ahead, and the pages this person opens most are warmed
  // while the portal sits idle.
  const hrefs = useMemo(() => sections.flatMap(sec => sec.items.map(i => i.href)), [sections])
  useEffect(() => {
    if (pathname) recordVisit(pathname)
  }, [pathname])
  useEffect(() => {
    if (!pathname || !window.matchMedia?.('(min-width: 768px)').matches) return
    return warmWhenIdle(router, usualPages(hrefs, pathname))
  }, [pathname, hrefs, router])

  function toggle() {
    const next = !collapsed
    writeCookie(HR_NAV_COOKIE, next ? 'collapsed' : null)
    setCollapsed(next)
    setTimeout(measure, 300)
  }

  const initial = (user.name || 'P').trim().charAt(0).toUpperCase()
  const viewing = user.actualRole ? 'Viewing as HR' : 'HR view'

  return (
    <aside className={`${s.aside} hidden md:flex`} data-collapsed={collapsed ? 'true' : 'false'} aria-label="Main navigation" onMouseEnter={() => railEntered()}>
      <div className={s.brand}>
        <button
          type="button"
          className={s.tile}
          onClick={toggle}
          title="Collapse / expand"
          aria-label={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'}
          aria-expanded={!collapsed}
        >
          H
        </button>
        <div className={s.brandText} aria-hidden={collapsed}>
          <div className={s.brandName}>HOUZS Venture</div>
          <div className={s.brandSub}>Internal ledger · 内部账册</div>
        </div>
      </div>
      <nav ref={navRef} className={s.nav}>
        <div className={s.pill} style={{ top: indTop ?? 0, opacity: indTop === null ? 0 : 1 }} aria-hidden="true">
          <span className={s.pillBar} />
        </div>
        {sections.map(section => (
          // Flat, as the prototype renders them: the rows are the nav's own children.
          <Fragment key={section.label ?? 'top'}>
            {section.label ? (
              <div className={s.section}>
                <span className={s.roman}>{section.roman}</span>
                <span>{section.label}</span>
              </div>
            ) : null}
            {section.items.map(item => {
              const on = item.key === active
              return (
                <div className={s.itemWrap} key={item.key}>
                  <Link
                    href={item.href}
                    className={`${s.item} ${s[section.tone]}`}
                    data-nav-key={item.key}
                    data-on={on ? 'true' : 'false'}
                    aria-current={item.key === matched ? 'page' : undefined}
                    title={item.label}
                    onClick={e => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
                      if (item.key !== matched) setPending(item.key)
                    }}
                    onMouseEnter={() => warmOnIntent(router, item.href)}
                    onMouseLeave={cancelWarmIntent}
                  >
                    <span className={s.itemTile}>
                      <NavIcon name={item.icon} size={16} />
                    </span>
                    <span className={s.itemLabel}>{item.label}</span>
                  </Link>
                </div>
              )
            })}
          </Fragment>
        ))}
      </nav>
      <div className={s.foot}>
        <span className={s.avatar} aria-hidden="true">{initial}</span>
        <div className={s.footText}>
          <div className={s.footName}>{user.name || 'HR'}</div>
          <div className={s.footSub}>{viewing}</div>
        </div>
        <span className={s.version}>v0.3</span>
      </div>
    </aside>
  )
}
