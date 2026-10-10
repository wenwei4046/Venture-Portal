'use client'

import { useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useFormStatus } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import { getRoleLabel } from '@/lib/roles'
import { officeClock } from '@/lib/office-clock'
import type { User, UserRole } from '@/types'
import { setViewAs } from './view-as-actions'
import s from './HrTopBar.module.css'

// HR's greeting bar (2026-10-10, the HR revamp handoff): a white rounded panel
// 10px in from the frame — "Good afternoon, Principal." on the left, the
// view (an amber dot and "HR view"), the office date and quarter in mono, and
// SIGN OUT on the right. For an account that may switch views the "HR view"
// words ARE the switcher, drawn as the words.

export default function HrTopBar({ user }: { user: User }) {
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
        {user.canSwitchView ? (
          <ViewSwitch value={user.role} />
        ) : (
          <div className={s.view}>
            <span className={s.dot} aria-hidden="true" />
            <span className={s.viewLabel}>HR view</span>
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

function ViewSelect({ value, submit }: { value: UserRole; submit: () => void }) {
  const { pending } = useFormStatus()
  return (
    <select
      key={value}
      name="role"
      defaultValue={value}
      onChange={submit}
      disabled={pending}
      aria-label="View portal as role"
      className={s.select}
    >
      <option value="principal">Principal</option>
      <option value="finance">Finance view</option>
      <option value="hr">HR view</option>
      <option value="revenue_member">Revenue View</option>
    </select>
  )
}

function ViewSwitch({ value }: { value: UserRole }) {
  const form = useRef<HTMLFormElement>(null)
  return (
    <form ref={form} action={setViewAs} className={s.view} title="Switch workspace view while staying signed in as Principal">
      <span className={s.dot} aria-hidden="true" />
      <ViewSelect value={value} submit={() => form.current?.requestSubmit()} />
    </form>
  )
}
