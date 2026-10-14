'use client'

import Link from 'next/link'
import { HrIcon, type HrIconName } from '@/components/hrv/icons'
import type { HrNavTone } from '@/components/layout/hr-nav'
import AppScreen from './AppScreen'
import { setIntent } from './nav'
import s from './fin-app.module.css'

// The Finance app's Overview (2026-10-15, the Finance revamp v2's phone — M01
// of `.design/fin-r2/handoff`): the office's date and quarter, the greeting,
// the line of what waits, the eight quick actions with their counts, then a
// card per category — the sidebar's, in its order (the desktop Overview's
// rows, `FinanceOverview`), each tile a page of the app. The server reads,
// this draws.

export interface OverviewTile {
  key: string
  label: string
  icon: HrIconName
  href: string
  badge?: number
  /** A hub (its tab fades in) or a page pushed over the Overview. */
  how: 'tab' | 'push'
}

export interface OverviewCategory {
  roman: string
  label: string
  tone: HrNavTone
  tiles: OverviewTile[]
}

export default function OverviewScreen({
  date,
  greeting,
  summary,
  quick,
  quickTone,
  categories,
}: {
  /** "Wed 14 Oct 2026 · Q4 2026" */
  date: string
  /** "Good afternoon, Aina." */
  greeting: string
  summary: string
  quick: OverviewTile[]
  /** Each quick action's own tone (Daily's clay, Fund's olive, the Ledger's slate). */
  quickTone: Record<string, HrNavTone>
  categories: OverviewCategory[]
}) {
  return (
    <AppScreen screenKey="/fin-app" head={{ kind: 'root', title: 'Overview' }} root>
      <div className={s.homeTop}>
        <div className={s.homeDate} suppressHydrationWarning>
          {date}
        </div>
        <div className={s.homeHello} suppressHydrationWarning>
          {greeting}
        </div>
        <div className={s.rule48} aria-hidden="true" />
        {summary ? <p className={s.homeSummary}>{summary}</p> : null}
      </div>

      {quick.length > 0 ? (
        <>
          <div className={s.capRow}>
            <span className={s.caps}>Quick actions</span>
          </div>
          <div className={s.quick}>
            {quick.map((q) => (
              <Link key={q.key} href={q.href} className={s.qTile} onClick={() => setIntent(q.how)}>
                <span className={`${s.qIcon} ${s[quickTone[q.key] ?? 'clay']}`}>
                  <HrIcon name={q.icon} size={22} />
                  {q.badge && q.badge > 0 ? <span className={s.badge}>{q.badge}</span> : null}
                </span>
                <span className={s.qLabel}>{q.label}</span>
              </Link>
            ))}
          </div>
        </>
      ) : null}

      {categories.map((c) => (
        <div key={c.label}>
          <div className={s.catHead}>
            <span className={s.roman}>{c.roman}</span>
            <span className={s.caps}>{c.label}</span>
            <span className={s.catRule} aria-hidden="true" />
            <span className={s.catCount}>
              {c.tiles.length} {c.tiles.length === 1 ? 'page' : 'pages'}
            </span>
          </div>
          <div className={s.catCard}>
            {c.tiles.map((t) => (
              <Link key={t.key} href={t.href} className={s.cTile} onClick={() => setIntent(t.how)}>
                <span className={`${s.cIcon} ${s[c.tone]}`}>
                  <HrIcon name={t.icon} size={18} />
                </span>
                <span className={s.cLabel}>{t.label}</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </AppScreen>
  )
}
