'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { HrIcon, type HrIconName } from '@/components/hrv/icons'
import { ChangePasswordDialog, EditProfileDialog, SignOutDialog } from '@/components/layout/AccountMenu'
import { setViewAs } from '@/components/layout/view-as-actions'
import AppScreen from './AppScreen'
import { pushIntent } from './nav'
import s from './fin-app.module.css'

// The Finance app's Profile (2026-10-15, the Finance revamp v2's phone — M17,
// M18): who is signed in, I. Account — Edit profile and Change password, a
// login of one's own only, each its window rising as a sheet — II. Admin —
// Audit Log, Departments, Meeting Rooms, the desktop's account menu's rows —
// and Sign out, asked first. The windows are the desktop's own (AccountMenu).
// For an account that may switch views (2026-10-16 — on a phone the portal's
// Finance pages open this app, lib/one-app.ts): the views of the one app, as
// the HR app's More has them — each opens where it lives.

/** The views of the one app: the view, its name, where it opens, its icon. */
const VIEWS: ReadonlyArray<readonly [string, string, string, HrIconName]> = [
  ['principal', 'Principal', 'The portal', 'home'],
  ['finance', 'Finance', 'This app', 'report'],
  ['hr', 'HR', 'The HR app', 'people'],
  ['revenue_member', 'Revenue team', 'The Revenue app', 'staff'],
]

export interface ProfileAdminRow {
  key: string
  label: string
  icon: HrIconName
  sub: string
  href: string
}

export default function ProfileScreen({
  name,
  email,
  phone,
  personal,
  admin,
  canSwitch = false,
}: {
  name: string
  email: string
  phone: string
  /** A login of the person's own: Edit profile and Change password are theirs. */
  personal: boolean
  admin: ProfileAdminRow[]
  /** The account may switch views (and is not viewing as a person). */
  canSwitch?: boolean
}) {
  const router = useRouter()
  const [win, setWin] = useState<'profile' | 'password' | 'signout' | null>(null)
  const [switching, startSwitch] = useTransition()
  const switchTo = (view: string) => {
    const form = new FormData()
    form.set('role', view)
    startSwitch(async () => {
      await setViewAs(form)
    })
  }
  const initial = (name.trim()[0] ?? 'F').toUpperCase()

  return (
    <>
      <AppScreen screenKey="/fin-app/profile" head={{ kind: 'root', title: 'Profile' }} root>
        <div className={s.profileCard}>
          <span className={s.avatar} aria-hidden="true">
            {initial}
          </span>
          <span className={s.pText}>
            <span className={s.pName}>{name}</span>
            <span className={s.pSub}>{email} · Finance view</span>
          </span>
        </div>

        {personal ? (
          <>
            <div className={s.menuHead}>
              <span className={s.roman}>I.</span>
              <span className={s.caps}>Account</span>
            </div>
            <div className={s.menu}>
              <button type="button" className={s.menuRow} onClick={() => setWin('profile')}>
                <span className={`${s.menuIcon} ${s.walnut}`}>
                  <HrIcon name="staff" size={16} />
                </span>
                <span className={s.menuText}>
                  <span className={s.menuLabel}>Edit profile</span>
                  {phone ? <span className={s.menuSub}>{phone}</span> : null}
                </span>
                <span className={s.menuChev} aria-hidden="true">
                  ›
                </span>
              </button>
              <button type="button" className={s.menuRow} onClick={() => setWin('password')}>
                <span className={`${s.menuIcon} ${s.walnut}`}>
                  <HrIcon name="lock" size={16} />
                </span>
                <span className={s.menuText}>
                  <span className={s.menuLabel}>Change password</span>
                </span>
                <span className={s.menuChev} aria-hidden="true">
                  ›
                </span>
              </button>
            </div>
          </>
        ) : null}

        {admin.length > 0 ? (
          <>
            <div className={s.menuHead}>
              <span className={s.roman}>{personal ? 'II.' : 'I.'}</span>
              <span className={s.caps}>Admin</span>
            </div>
            <div className={s.menu}>
              {admin.map((a) => (
                <Link key={a.key} href={a.href} className={s.menuRow} onClick={pushIntent}>
                  <span className={`${s.menuIcon} ${s.walnut}`}>
                    <HrIcon name={a.icon} size={16} />
                  </span>
                  <span className={s.menuText}>
                    <span className={s.menuLabel}>{a.label}</span>
                    {a.sub ? <span className={s.menuSub}>{a.sub}</span> : null}
                  </span>
                  <span className={s.menuChev} aria-hidden="true">
                    ›
                  </span>
                </Link>
              ))}
            </div>
          </>
        ) : null}

        {canSwitch ? (
          <>
            <div className={s.menuHead}>
              <span className={s.roman}>{['I.', 'II.', 'III.'][(personal ? 1 : 0) + (admin.length > 0 ? 1 : 0)]}</span>
              <span className={s.caps}>Switch view</span>
            </div>
            <div className={s.menu} aria-label="Switch view">
              {VIEWS.map(([view, label, where, icon]) => {
                const here = view === 'finance'
                return (
                  <button key={view} type="button" className={s.menuRow} disabled={here || switching} aria-current={here ? 'true' : undefined} onClick={() => switchTo(view)}>
                    <span className={`${s.menuIcon} ${s.walnut}`}>
                      <HrIcon name={icon} size={16} />
                    </span>
                    <span className={s.menuText}>
                      <span className={s.menuLabel}>{label}</span>
                      <span className={s.menuSub}>{here ? 'You are here' : where}</span>
                    </span>
                    {here ? null : (
                      <span className={s.menuChev} aria-hidden="true">
                        ›
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </>
        ) : null}

        <div className={s.signOutWrap}>
          <button type="button" className={s.signOut} onClick={() => setWin('signout')}>
            Sign out
          </button>
          <p className={s.colophon}>HV Portal · Internal ledger · 内部账册</p>
        </div>
      </AppScreen>

      {personal ? (
        <>
          <EditProfileDialog open={win === 'profile'} onClose={() => setWin(null)} user={{ name, email }} onSaved={() => router.refresh()} />
          <ChangePasswordDialog open={win === 'password'} onClose={() => setWin(null)} />
        </>
      ) : null}
      <SignOutDialog open={win === 'signout'} onClose={() => setWin(null)} />
    </>
  )
}
