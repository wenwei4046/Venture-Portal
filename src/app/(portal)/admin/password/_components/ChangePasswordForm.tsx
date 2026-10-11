'use client'

import { useId } from 'react'
import { btn } from '@/components/hrv/kit'
import { PASSWORD_CHANGED, useChangePassword, type ChangePassword } from '@/components/account/use-change-password'
import { MIN_PASSWORD_LENGTH, type PasswordChange } from '@/lib/account/password'
import s from './change-password.module.css'

/** The three boxes, in the order the user asked for them. */
const BOXES: Array<{ key: keyof PasswordChange; label: string; autoComplete: 'current-password' | 'new-password' }> = [
  { key: 'current', label: 'Current password', autoComplete: 'current-password' },
  { key: 'next', label: 'New password', autoComplete: 'new-password' },
  { key: 'confirm', label: 'Confirm new password', autoComplete: 'new-password' },
]

/**
 * Admin › Change password's form (2026-10-12): the current password, the new one, the new one again,
 * Show passwords, what happened, and the button. Enter sends it. `change` is the Server Action,
 * handed in by the page — a stand-in in tests.
 */
export default function ChangePasswordForm({ email, change }: { email: string; change: ChangePassword }) {
  const f = useChangePassword(change)
  const id = useId()
  return (
    <form
      className={s.card}
      aria-label="Change password"
      noValidate
      onSubmit={e => {
        e.preventDefault()
        f.submit()
      }}
    >
      {/* Whose password this is, for the browser's password manager (a hidden field is how Chrome asks for it). */}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      {BOXES.map(box => (
        <div key={box.key} className={s.field}>
          <label className={s.label} htmlFor={`${id}-${box.key}`}>
            {box.label}
          </label>
          <input
            id={`${id}-${box.key}`}
            className={s.input}
            type={f.shown ? 'text' : 'password'}
            name={`${box.key}-password`}
            autoComplete={box.autoComplete}
            spellCheck={false}
            value={f.form[box.key]}
            onChange={e => f.set(box.key)(e.target.value)}
            aria-describedby={box.key === 'next' ? `${id}-hint` : undefined}
          />
          {box.key === 'next' ? (
            <span id={`${id}-hint`} className={s.hint}>
              At least {MIN_PASSWORD_LENGTH} characters, and not the current one.
            </span>
          ) : null}
        </div>
      ))}
      <label className={s.show}>
        <input type="checkbox" checked={f.shown} onChange={e => f.setShown(e.target.checked)} />
        Show passwords
      </label>
      {f.error ? (
        <div className={s.error} role="alert">
          {f.error}
        </div>
      ) : null}
      {f.done ? (
        <div className={s.done} role="status">
          {PASSWORD_CHANGED}
        </div>
      ) : null}
      <div className={s.foot}>
        <button type="submit" className={`${btn('primary')} ${s.send}`} disabled={f.busy}>
          {f.busy ? 'Changing…' : 'Change password'}
        </button>
      </div>
    </form>
  )
}
