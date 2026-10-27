'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { HrIcon, type HrIconName } from '@/components/hrv/icons'
import { ChangePasswordDialog, RequestEmailDialog, SignOutDialog } from '@/components/layout/AccountMenu'
import { EMAIL_WORDS } from '@/lib/account/email-change'
import { setViewAs } from '@/components/layout/view-as-actions'
import ViewAsPersonPicker from '@/components/layout/ViewAsPersonPicker'
import { SWITCH_VIEWS, phoneWhere, type SwitchTarget } from '@/lib/view-switch'
import { MeCard } from '@/components/me/MeCard'
import AppScreen from './AppScreen'
import { pushIntent } from './nav'
import PushRow from './PushRow'
import s from './fin-app.module.css'

const ROMAN = ['I.', 'II.', 'III.', 'IV.']

// The Finance app's Profile (2026-10-15, the Finance revamp v2's phone — M17,
// M18): who is signed in, I. Account — Change password, a login of one's own
// only, its window rising as a sheet (and, 2026-10-16, Request to change email
// beside it, HR approving it; Edit profile gone 2026-10-17 — the user: one's
// record changes through Me › Profile, which HR approves) — II. Admin —
// Audit Log, Departments, Meeting Rooms, the desktop's account menu's rows —
// and Sign out, asked first. The windows are the desktop's own (AccountMenu).
// For an account that may switch views (2026-10-16 — on a phone the portal's
// Finance pages open this app, lib/one-app.ts): the views of the one app, as
// the HR app's More has them — each opens where it lives.

const VIEW_ICON: Readonly<Record<SwitchTarget, HrIconName>> = {
  principal: 'home',
  finance: 'report',
  hr: 'people',
  marketing: 'megaphone',
  revenue_member: 'staff',
  lead: 'inbox',
  person: 'eye',
}

/**
 * The views of the one app — every view, as every switcher lists them (2026-10-27, lib/view-switch.ts): the view, its
 * name, where it opens, its icon. The Principal's own view opens this app too since 2026-10-17 — with its Approvals tab.
 */
const VIEWS: ReadonlyArray<readonly [SwitchTarget, string, string, HrIconName]> = SWITCH_VIEWS.map(
  v => [v.value, v.short, phoneWhere(v.value, 'finance'), VIEW_ICON[v.value]] as const,
)

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
  personal,
  admin,
  canSwitch = false,
  view = 'finance',
  push = false,
  me = false,
  itSupport = false,
}: {
  name: string
  email: string
  /** A login of the person's own: Change password and Request to change email are theirs. */
  personal: boolean
  admin: ProfileAdminRow[]
  /** The account may switch views (and is not viewing as a person). */
  canSwitch?: boolean
  /** The view the app is open in: Finance's, or the Principal's own (2026-10-17). */
  view?: 'finance' | 'principal'
  /** This phone's notifications (2026-10-17) — never while viewing as a person. */
  push?: boolean
  /** Me's card on top (2026-10-17): a login of one's own, not while viewing as a person. */
  me?: boolean
  /** Every signed-in account's own requests, including shared logins; hidden while viewing as a person. */
  itSupport?: boolean
}) {
  const [win, setWin] = useState<'password' | 'email' | 'signout' | null>(null)
  const [switching, startSwitch] = useTransition()
  // View as a person… (2026-10-27, every switcher's last row): the portal's own picker.
  const [picking, setPicking] = useState(false)
  const switchTo = (view: SwitchTarget) => {
    if (view === 'person') return setPicking(true)
    const form = new FormData()
    form.set('role', view)
    startSwitch(async () => {
      await setViewAs(form)
    })
  }
  const initial = (name.trim()[0] ?? 'F').toUpperCase()
  const hasAccount = personal || itSupport

  return (
    <>
      <AppScreen screenKey="/fin-app/profile" head={{ kind: 'root', title: 'Profile' }} root>
        <div className={s.profileCard}>
          <span className={s.avatar} aria-hidden="true">
            {initial}
          </span>
          <span className={s.pText}>
            <span className={s.pName}>{name}</span>
            <span className={s.pSub}>
              {email} · {view === 'principal' ? 'Principal view' : 'Finance view'}
            </span>
          </span>
        </div>

        {/* Me (2026-10-17): today's punch, and the way into one's own attendance, leave, payslips and record. */}
        {me ? <MeCard backLabel="Profile" /> : null}

        {hasAccount ? (
          <>
            <div className={s.menuHead}>
              <span className={s.roman}>I.</span>
              <span className={s.caps}>Account</span>
            </div>
            <div className={s.menu}>
              {personal ? (
                <>
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
                  <button type="button" className={s.menuRow} onClick={() => setWin('email')}>
                    <span className={`${s.menuIcon} ${s.walnut}`}>
                      <HrIcon name="mail" size={16} />
                    </span>
                    <span className={s.menuText}>
                      <span className={s.menuLabel}>{EMAIL_WORDS.title}</span>
                      {email ? <span className={s.menuSub}>{email}</span> : null}
                    </span>
                    <span className={s.menuChev} aria-hidden="true">
                      ›
                    </span>
                  </button>
                </>
              ) : null}
              {itSupport ? (
                <Link href="/fin-app/it-support" className={s.menuRow} onClick={pushIntent}>
                  <span className={`${s.menuIcon} ${s.walnut}`}>
                    <HrIcon name="buoy" size={16} />
                  </span>
                  <span className={s.menuText}>
                    <span className={s.menuLabel}>IT support</span>
                  </span>
                  <span className={s.menuChev} aria-hidden="true">›</span>
                </Link>
              ) : null}
            </div>
          </>
        ) : null}

        {admin.length > 0 ? (
          <>
            <div className={s.menuHead}>
              <span className={s.roman}>{ROMAN[hasAccount ? 1 : 0]}</span>
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
              <span className={s.roman}>{ROMAN[(hasAccount ? 1 : 0) + (admin.length > 0 ? 1 : 0)]}</span>
              <span className={s.caps}>Switch view</span>
            </div>
            <div className={s.menu} aria-label="Switch view">
              {VIEWS.map(([to, label, where, icon]) => {
                const here = to === view
                return (
                  <button key={to} type="button" className={s.menuRow} disabled={here || switching} aria-current={here ? 'true' : undefined} onClick={() => switchTo(to)}>
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

        {/* This phone's notifications (2026-10-17): the last section, drawn only where the phone can show them. */}
        {push ? <PushRow roman={ROMAN[(hasAccount ? 1 : 0) + (admin.length > 0 ? 1 : 0) + (canSwitch ? 1 : 0)]} /> : null}

        <div className={s.signOutWrap}>
          <button type="button" className={s.signOut} onClick={() => setWin('signout')}>
            Sign out
          </button>
          <p className={s.colophon}>HV Portal · Internal ledger · 内部账册</p>
        </div>
      </AppScreen>

      {personal ? (
        <>
          <ChangePasswordDialog open={win === 'password'} onClose={() => setWin(null)} />
          <RequestEmailDialog open={win === 'email'} onClose={() => setWin(null)} />
        </>
      ) : null}
      <SignOutDialog open={win === 'signout'} onClose={() => setWin(null)} view={view === 'principal' ? 'the Principal view' : 'the Finance view'} />
      {canSwitch ? <ViewAsPersonPicker open={picking} onClose={() => setPicking(false)} z={90} /> : null}
    </>
  )
}
