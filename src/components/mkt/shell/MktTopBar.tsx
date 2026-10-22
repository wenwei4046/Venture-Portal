'use client'

import { useRef, useState } from 'react'
import type { User } from '@/types'
import { setViewAs } from '@/components/layout/view-as-actions'
import ViewAsPersonPicker from '@/components/layout/ViewAsPersonPicker'
import MemoBell from '@/components/layout/MemoBell'
import { MeDesktop } from '@/components/me/MeDesktop'
import MktSearch from './MktSearch'
import s from './shell.module.css'

// Marketing's top bar (`Marketing Shell.dc.html`): the page's crumb, the search, then on the right — for a login of
// one's own, Me (today's punch, one's leave and payslips) and one's memos, as in every view — the bell. An account
// that may switch views (the Principal's) picks the view here, as on HR's and Finance's bars.

const VIEWING = '__viewing'

export default function MktTopBar({
  user,
  crumb,
  personal,
  unread,
  bellOn,
  onBell,
}: {
  user: User
  crumb: { emoji: string; label: string }
  personal: boolean
  unread: number
  bellOn: boolean
  onBell: () => void
}) {
  return (
    <div className={s.top}>
      <div className={s.crumb}>
        <span className={s.crumbEmoji} aria-hidden="true">{crumb.emoji}</span>
        <span className={s.crumbLabel}>{crumb.label}</span>
      </div>
      <MktSearch />
      <div className={s.grow} />
      <div className={s.right}>
        {user.canSwitchView ? <ViewSwitch value={user.role} viewingAs={user.viewingAs?.name} /> : null}
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

/** The view the account draws the portal in (the Principal's; setViewAs asks the database again). */
function ViewSwitch({ value, viewingAs }: { value: string; viewingAs?: string }) {
  const form = useRef<HTMLFormElement>(null)
  const [picking, setPicking] = useState(false)
  const current = viewingAs ? VIEWING : value
  return (
    <>
      <form ref={form} action={setViewAs}>
        <select
          key={current}
          name="role"
          defaultValue={current}
          className={s.viewSelect}
          aria-label="View portal as role"
          onChange={e => {
            if (e.target.value === 'person') {
              e.target.value = current
              setPicking(true)
            } else if (e.target.value !== VIEWING) form.current?.requestSubmit()
          }}
        >
          {viewingAs ? <option value={VIEWING}>Viewing as {viewingAs}</option> : null}
          <option value="principal">Principal</option>
          <option value="finance">Finance view</option>
          <option value="hr">HR view</option>
          <option value="marketing">Marketing view</option>
          <option value="revenue_member">Revenue View</option>
          <option value="person">View as a person…</option>
        </select>
      </form>
      <ViewAsPersonPicker open={picking} onClose={() => setPicking(false)} />
    </>
  )
}
