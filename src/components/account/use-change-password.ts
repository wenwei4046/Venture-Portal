'use client'

import { useCallback, useState, useTransition } from 'react'
import { NOT_CHANGED, NO_PASSWORD_CHANGE, passwordChangeProblem, type PasswordChange } from '@/lib/account/password'

/** The Server Action, or a stand-in for it in a test or a preview. */
export type ChangePassword = (change: PasswordChange) => Promise<{ ok: true } | { ok: false; reason: string }>

/**
 * Change password's form, wherever it is drawn (2026-10-12): the portal's Admin › Change password,
 * the HR app's More, the Revenue app's Profile. The three boxes — current, new, new again — what is
 * wrong with them (lib/account/password.ts, the Server Action's own rules, asked before sending),
 * the send, and its answer. Each surface draws the boxes in its own look.
 */
export function useChangePassword(change: ChangePassword) {
  const [form, setForm] = useState<PasswordChange>(NO_PASSWORD_CHANGE)
  const [shown, setShown] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [busy, start] = useTransition()

  /** A box's setter: typing clears what was said about the last try. */
  const set = (key: keyof PasswordChange) => (value: string) => {
    setForm(f => ({ ...f, [key]: value }))
    setError('')
    setDone(false)
  }

  const submit = () => {
    if (busy) return
    const problem = passwordChangeProblem(form)
    if (problem) {
      setError(problem)
      return
    }
    start(async () => {
      try {
        const res = await change(form)
        if (!res.ok) {
          setError(res.reason)
          return
        }
        // Done: the boxes empty (nothing typed stays on the screen) and the passwords hide again.
        setForm(NO_PASSWORD_CHANGE)
        setShown(false)
        setDone(true)
      } catch {
        setError(NOT_CHANGED)
      }
    })
  }

  /** Back to empty boxes — a sheet closed starts afresh, and nothing typed stays behind it. Stable, for an effect. */
  const reset = useCallback(() => {
    setForm(NO_PASSWORD_CHANGE)
    setShown(false)
    setError('')
    setDone(false)
  }, [])

  return { form, set, shown, setShown, error, done, busy, submit, reset }
}

/** Said under the form once the password has changed. */
export const PASSWORD_CHANGED = 'Password changed. You stay signed in here — your other devices will ask for the new password.'
