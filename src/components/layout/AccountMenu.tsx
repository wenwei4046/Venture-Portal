'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { changeMyPassword, loadMyEmailChange, loadMyProfile, requestEmailChange, updateMyProfile, withdrawEmailChange } from '@/lib/account/actions'
import { MIN_PASSWORD_LENGTH, passwordChangeProblem } from '@/lib/account/password'
import { EMAIL_WORDS } from '@/lib/account/email-change'
import { useRequestEmail, type RequestEmailActions } from '@/components/account/use-request-email'
import { profileProblem } from '@/lib/account/profile'
import { HrIcon } from '@/components/hrv/icons'
import { flash } from '@/components/hrv/toast'
import { DialogButton, DialogConfirm, DialogForm, Field, FinDialog, Hint, Input } from '@/components/finv/Dialog'
import type { User } from '@/types'
import type { AccountMenuGroup } from './fin-nav'
import s from './HrSidebar.module.css'

// The Finance view's account menu (2026-10-14, the Finance revamp v2 — the
// design's D13): the sidebar's footer opens it. Account — Edit profile and
// Change password, a login of one's own only — then Admin — Audit Log,
// Departments, Meeting Rooms — then Sign out, which asks first. Edit profile
// and Change password open the design's dialog; the pages open in place.

export type AccountWindow = 'profile' | 'password' | 'signout'

export function AccountMenu({
  open,
  close,
  collapsed,
  groups,
  onWindow,
}: {
  open: boolean
  close: () => void
  collapsed: boolean
  groups: AccountMenuGroup[]
  onWindow: (w: AccountWindow) => void
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])
  if (!open) return null
  return (
    <>
      <div className={s.menuScrim} onClick={close} aria-hidden="true" />
      <div className={s.menu} data-collapsed={collapsed ? 'true' : 'false'} role="menu" aria-label="Profile · admin">
        {groups.map((g) => (
          <div key={g.title} role="group" aria-label={g.title}>
            <div className={s.menuTitle}>{g.title}</div>
            {g.items.map((m) =>
              m.href ? (
                <Link key={m.key} href={m.href} role="menuitem" className={s.menuItem} onClick={close}>
                  <HrIcon name={m.icon} size={15} />
                  <span>{m.label}</span>
                </Link>
              ) : (
                <button
                  key={m.key}
                  type="button"
                  role="menuitem"
                  className={s.menuItem}
                  onClick={() => {
                    close()
                    if (m.window) onWindow(m.window)
                  }}
                >
                  <HrIcon name={m.icon} size={15} />
                  <span>{m.label}</span>
                </button>
              ),
            )}
          </div>
        ))}
        <div className={s.menuRule} aria-hidden="true" />
        <button
          type="button"
          role="menuitem"
          className={s.menuSignOut}
          onClick={() => {
            close()
            onWindow('signout')
          }}
        >
          Sign out
        </button>
      </div>
    </>
  )
}

/** "Sign out?" — then this device only (2026-10-08: the shared accounts are switched on the office PC). */
export function SignOutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const signOut = async () => {
    setBusy(true)
    const supabase = createClient()
    await supabase.auth.signOut({ scope: 'local' })
    router.push('/login')
    router.refresh()
  }
  return (
    <FinDialog open={open} onClose={onClose} title="Sign out?" locked={busy}>
      <DialogConfirm
        text="You will need to sign in again to open the Finance view."
        confirmLabel="Sign out"
        danger
        busy={busy}
        onCancel={onClose}
        onConfirm={() => void signOut()}
      />
    </FinDialog>
  )
}

/** Edit profile: the name and the phone; the email is the sign-in and shows only (the user, 2026-10-14). */
export function EditProfileDialog({
  open,
  onClose,
  user,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  user: Pick<User, 'name' | 'email'>
  /** After a save (the phone app's Profile reads the name and phone again). */
  onSaved?: () => void
}) {
  const [name, setName] = useState(user.name ?? '')
  const [email, setEmail] = useState(user.email ?? '')
  const [phone, setPhone] = useState('')
  const [refusal, setRefusal] = useState('')
  const [pending, start] = useTransition()

  // Each opening starts from what is saved: the name and email at once, the phone once read.
  useEffect(() => {
    if (!open) return
    setName(user.name ?? '')
    setEmail(user.email ?? '')
    setPhone('')
    setRefusal('')
    let live = true
    void loadMyProfile().then((p) => {
      if (!live || !p) return
      setName(p.name)
      setEmail(p.email)
      setPhone(p.phone)
    })
    return () => {
      live = false
    }
  }, [open, user.name, user.email])

  const ok = !!(name.trim() && email)
  const save = () => {
    if (!ok || pending) return
    const problem = profileProblem({ name, phone })
    if (problem) {
      setRefusal(problem)
      return
    }
    start(async () => {
      const r = await updateMyProfile({ name, phone })
      if (!r.ok) {
        setRefusal(r.reason)
        return
      }
      onClose()
      onSaved?.()
      flash('Profile saved')
    })
  }

  return (
    <FinDialog open={open} onClose={onClose} title="Edit profile" sub="Shown on vouchers you create" locked={pending}>
      <DialogForm
        onSubmit={save}
        buttons={
          <>
            <DialogButton onClick={onClose} disabled={pending}>
              Cancel
            </DialogButton>
            <DialogButton type="submit" kind="primary" off={!ok || pending}>
              Save
            </DialogButton>
          </>
        }
      >
        <Field label="Full name" htmlFor="fv-profile-name">
          <Input id="fv-profile-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} />
        </Field>
        <Field label="Email" htmlFor="fv-profile-email">
          <Input id="fv-profile-email" type="email" value={email} readOnly disabled title="Your sign-in email" />
        </Field>
        <Field label="Phone" htmlFor="fv-profile-phone">
          <Input id="fv-profile-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" maxLength={30} />
        </Field>
        {refusal ? <Hint danger>{refusal}</Hint> : null}
      </DialogForm>
    </FinDialog>
  )
}

const EMAIL_ACTIONS: RequestEmailActions = { load: loadMyEmailChange, send: requestEmailChange, withdraw: withdrawEmailChange }

/**
 * Request to change email (2026-10-16 — the user: their email is the one they sign in with, changed only by their own
 * request; HR approves it on Attendance › Requests, which moves the sign-in too): the email they sign in with, their
 * latest request — waiting, with Withdraw; declined, with HR's words; done — and the new email.
 */
export function RequestEmailDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const f = useRequestEmail(EMAIL_ACTIONS, open)
  const W = EMAIL_WORDS
  const current = f.mine?.email ?? ''
  const st = f.state
  const waiting = st?.kind === 'waiting'
  return (
    <FinDialog open={open} onClose={onClose} title={W.title} sub="HR approves the new one" locked={f.busy}>
      <DialogForm
        onSubmit={waiting ? onClose : f.submit}
        buttons={
          waiting ? (
            <>
              <DialogButton onClick={f.withdraw} disabled={f.busy}>
                {f.busy ? W.withdrawing : W.withdraw}
              </DialogButton>
              <DialogButton type="submit" kind="primary" off={f.busy}>
                Done
              </DialogButton>
            </>
          ) : (
            <>
              <DialogButton onClick={onClose} disabled={f.busy}>
                Cancel
              </DialogButton>
              <DialogButton type="submit" kind="primary" off={!f.mine || f.busy}>
                {f.busy ? W.sending : W.send}
              </DialogButton>
            </>
          )
        }
      >
        <Field label={W.current} htmlFor="fv-email-now">
          <Input id="fv-email-now" type="email" value={f.loading && !current ? '…' : current} readOnly disabled />
        </Field>
        {st ? (
          <Hint>
            <span className={`chip ${st.kind === 'waiting' ? 'alert' : st.kind === 'approved' ? 'ledger' : 'danger'}`}>
              {st.kind === 'waiting' ? W.waiting : st.kind === 'approved' ? W.approved : W.declined}
            </span>{' '}
            {st.kind === 'approved' ? W.approvedLine(st.to) : `${W.next} · ${st.to}${st.kind === 'waiting' && st.ref ? ` · ${st.ref}` : ''}`}
            {st.kind === 'declined' && st.note ? <> — “{st.note}”</> : null}
          </Hint>
        ) : null}
        {waiting ? null : (
          <Field label={W.next} htmlFor="fv-email-new">
            <Input
              id="fv-email-new"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={f.next}
              onChange={(e) => f.setNext(e.target.value)}
              disabled={!f.mine}
            />
          </Field>
        )}
        {f.error ? <Hint danger>{f.error}</Hint> : f.sent && waiting ? <Hint>{W.sent(current)}</Hint> : null}
      </DialogForm>
    </FinDialog>
  )
}

/** Change password: the current one, then the new one twice (2026-10-12's rules, lib/account/password.ts). */
export function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [cur, setCur] = useState('')
  const [nw, setNw] = useState('')
  const [cf, setCf] = useState('')
  const [refusal, setRefusal] = useState('')
  const [pending, start] = useTransition()

  useEffect(() => {
    if (!open) return
    setCur('')
    setNw('')
    setCf('')
    setRefusal('')
  }, [open])

  const ok = !!cur && nw.length >= MIN_PASSWORD_LENGTH && nw === cf
  const change = () => {
    // Not ready: the button is drawn faint and does nothing, as the prototype's.
    if (!ok || pending) return
    const problem = passwordChangeProblem({ current: cur, next: nw, confirm: cf })
    if (problem) {
      setRefusal(problem)
      return
    }
    start(async () => {
      const r = await changeMyPassword({ current: cur, next: nw, confirm: cf })
      if (!r.ok) {
        setRefusal(r.reason)
        return
      }
      onClose()
      flash('Password changed')
    })
  }

  const mismatch = !!cf && nw !== cf
  return (
    <FinDialog open={open} onClose={onClose} title="Change password" sub={`At least ${MIN_PASSWORD_LENGTH} characters`} locked={pending}>
      <DialogForm
        onSubmit={change}
        buttons={
          <>
            <DialogButton onClick={onClose} disabled={pending}>
              Cancel
            </DialogButton>
            <DialogButton type="submit" kind="primary" off={!ok || pending}>
              Change password
            </DialogButton>
          </>
        }
      >
        {/* No `name` on the boxes: a submit before the page is live must not send them anywhere (2026-10-12). */}
        <Field label="Current password" htmlFor="fv-pw-cur">
          <Input id="fv-pw-cur" type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" />
        </Field>
        <Field label="New password" htmlFor="fv-pw-new">
          <Input id="fv-pw-new" type="password" value={nw} onChange={(e) => setNw(e.target.value)} autoComplete="new-password" />
        </Field>
        <Field label="Confirm new password" htmlFor="fv-pw-cf">
          <Input id="fv-pw-cf" type="password" value={cf} onChange={(e) => setCf(e.target.value)} autoComplete="new-password" />
        </Field>
        {refusal ? <Hint danger>{refusal}</Hint> : mismatch ? <Hint>The two new passwords don’t match.</Hint> : null}
      </DialogForm>
    </FinDialog>
  )
}
