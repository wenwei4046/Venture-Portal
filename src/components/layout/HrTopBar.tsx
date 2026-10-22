'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useFormStatus } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import { getRoleLabel } from '@/lib/roles'
import { officeClock } from '@/lib/office-clock'
import type { User, UserRole } from '@/types'
import { Select } from '@/components/hrv/select'
import { setViewAs } from './view-as-actions'
import MemoBell from './MemoBell'
import ViewAsPersonPicker from './ViewAsPersonPicker'
import { MeDesktop } from '@/components/me/MeDesktop'

/** The select's value while a person is viewed (2026-10-11). */
const VIEWING = '__viewing'
import s from './HrTopBar.module.css'

// HR's greeting bar (2026-10-10, the HR revamp handoff): a white rounded panel
// 10px in from the frame — "Good afternoon, Principal." on the left, the
// view (an amber dot and "HR view"), the office date and quarter in mono, and
// SIGN OUT on the right. For an account that may switch views the "HR view"
// words ARE the switcher, drawn as the words. Finance's view wears the same
// bar since 2026-10-14 (the Finance revamp v2), its words "Finance view".

export default function HrTopBar({ user, viewLabel = 'HR view', viewValue }: {
  user: User
  viewLabel?: string
  /** What the switcher shows when it is not the account's role — 'lead' on Lead View's pages (2026-10-16). */
  viewValue?: 'lead'
}) {
  const router = useRouter()
  const clock = officeClock()
  const displayName = user.name || getRoleLabel(user.role)

  const signOut = async () => {
    const supabase = createClient()
    // This device only (2026-10-08): the shared accounts are switched on the
    // office PC several times a day.
    await supabase.auth.signOut({ scope: 'local' })
    router.push('/login')
    router.refresh()
  }

  return (
    <div className={`${s.bar} hidden md:flex`}>
      <div className={s.greet}>
        <span suppressHydrationWarning>{clock.greeting}, </span>
        <span className={s.name}>{displayName}</span>.
      </div>
      <div className={s.right}>
        {/* Me (2026-10-17): today's punch and one's own attendance, leave and payslips, in a panel from the right — a
            login a People record names, never while viewing as somebody. */}
        {user.personalLogin === true && !user.viewingAs ? <MeDesktop hostLabel={viewLabel.replace(/ view$/, '')} /> : null}
        {/* One's own memos, as in every view (2026-10-12): a login a People record names, never while viewing as somebody. */}
        {user.personalLogin === true && !user.viewingAs ? <MemoBell /> : null}
        {user.canSwitchView ? (
          <ViewSwitch value={viewValue ?? user.role} viewingAs={user.viewingAs?.name} />
        ) : (
          <div className={s.view}>
            <span className={s.dot} aria-hidden="true" />
            <span className={s.viewLabel}>{viewLabel}</span>
          </div>
        )}
        <div className={s.clock}>
          <span suppressHydrationWarning>{clock.date}</span>
          <span className={s.sep}>·</span>
          <span suppressHydrationWarning>{clock.quarter}</span>
        </div>
        <button type="button" className={s.signOut} onClick={signOut}>
          Sign out
        </button>
      </div>
    </div>
  )
}

function ViewSelect({ value, viewingAs, submit, onPerson }: { value: UserRole | 'lead'; viewingAs?: string; submit: () => void; onPerson: () => void }) {
  const { pending } = useFormStatus()
  const current = viewingAs ? VIEWING : value
  // The prototype draws "HR view" as words, so the field stays words (plain);
  // only the menu is the soft dropdown's (round 2's Part 1).
  return (
    <Select
      plain
      key={current}
      name="role"
      defaultValue={current}
      onChange={e => {
        // "View as a person…" opens the picker; the select keeps what is drawn.
        if (e.target.value === 'person') {
          e.target.value = current
          onPerson()
        } else if (e.target.value !== VIEWING) submit()
      }}
      disabled={pending}
      aria-label="View portal as role"
      className={s.select}
    >
      {viewingAs ? <option value={VIEWING}>Viewing as {viewingAs}</option> : null}
      <option value="principal">Principal</option>
      <option value="finance">Finance view</option>
      <option value="hr">HR view</option>
      <option value="revenue_member">Revenue View</option>
      <option value="lead">Lead View</option>
      <option value="person">View as a person…</option>
    </Select>
  )
}

function ViewSwitch({ value, viewingAs }: { value: UserRole | 'lead'; viewingAs?: string }) {
  const form = useRef<HTMLFormElement>(null)
  const [picking, setPicking] = useState(false)
  return (
    <>
      <form ref={form} action={setViewAs} className={s.view} title="Switch workspace view while staying signed in as Principal">
        <span className={s.dot} aria-hidden="true" />
        <ViewSelect value={value} viewingAs={viewingAs} submit={() => form.current?.requestSubmit()} onPerson={() => setPicking(true)} />
      </form>
      <ViewAsPersonPicker open={picking} onClose={() => setPicking(false)} />
    </>
  )
}
