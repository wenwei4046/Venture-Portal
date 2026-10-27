'use client'

import Link from 'next/link'
import type { User } from '@/types'
import ViewSwitch from '@/components/layout/ViewSwitch'
import MemoBell from '@/components/layout/MemoBell'
import { MeDesktop } from '@/components/me/MeDesktop'
import MktSearch from './MktSearch'
import s from './shell.module.css'

// Marketing's top bar (`Marketing Shell.dc.html`): the page's crumb, the search, then on the right — + New Project for
// whoever may start one, for a login of one's own Me (today's punch, one's leave and payslips) and one's memos, as in
// every view — the bell. An account that may switch views (the Principal's) picks the view here with the Principal's
// own switch (2026-10-27 — the user: "marketing 的这个 dropdown 就照它的那个设计风格"): the dot and the words, the soft
// menu, every view.

export default function MktTopBar({
  user,
  crumb,
  personal,
  unread,
  bellOn,
  onBell,
  newProject,
}: {
  user: User
  crumb: { emoji: string; label: string }
  personal: boolean
  unread: number
  bellOn: boolean
  onBell: () => void
  /** Marketing · Create on New Project's page: its button. */
  newProject: boolean
}) {
  return (
    <div className={s.top} data-mkt-own="">
      <div className={s.crumb}>
        <span className={s.crumbEmoji} aria-hidden="true">{crumb.emoji}</span>
        <span className={s.crumbLabel}>{crumb.label}</span>
      </div>
      <MktSearch />
      <div className={s.grow} />
      <div className={s.right}>
        {user.canSwitchView ? (
          <span className={s.view}>
            <ViewSwitch value={user.role} viewingAs={user.viewingAs?.name} />
          </span>
        ) : null}
        {newProject ? (
          <Link href="/marketing/new" className={s.newBtn}>
            <span className={s.newPlus} aria-hidden="true">+</span>
            <span>New Project</span>
          </Link>
        ) : null}
        {personal ? <MeDesktop hostLabel="Marketing" /> : null}
        {personal ? <MemoBell /> : null}
        <button
          type="button"
          className={`${s.bell}${bellOn ? ` ${s.bellOn}` : ''}`}
          onClick={onBell}
          title="Notifications"
          aria-label={unread ? `Notifications · ${unread} unread` : 'Notifications'}
          aria-expanded={bellOn}
        >
          🔔
          {unread > 0 ? <span className={s.bellCount}>{unread > 99 ? '99+' : unread}</span> : null}
        </button>
      </div>
    </div>
  )
}
