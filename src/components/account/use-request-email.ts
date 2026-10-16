'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { NOT_READ, NOT_SENT, emailChangeState, emailProblem, type EmailAct, type EmailChangeState, type MyEmail } from '@/lib/account/email-change'

/** The Server Actions (lib/account/actions.ts), or stand-ins for them in a test or a preview. */
export interface RequestEmailActions {
  load: () => Promise<MyEmail | null>
  send: (email: string) => Promise<EmailAct>
  withdraw: (id: string) => Promise<EmailAct>
}

/**
 * Request to change email's sheet, wherever it is drawn (2026-10-16): the Revenue app's Profile, the HR app's More,
 * the Finance app's Profile. Opened, it reads the email they sign in with and their latest request; then the new
 * email, what is wrong with it (lib/account/email-change.ts, the database's own words, asked before sending), the
 * send, and Withdraw while it waits. Each surface draws it in its own look. Closed, it forgets what was typed.
 */
export function useRequestEmail(actions: RequestEmailActions, open: boolean) {
  const [mine, setMine] = useState<MyEmail | null>(null)
  const [loading, setLoading] = useState(false)
  const [next, setNextValue] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, start] = useTransition()
  // The actions as last handed in: a parent that hands in a new object each render must not read again each render.
  const latest = useRef(actions)
  useEffect(() => {
    latest.current = actions
  })

  const reset = useCallback(() => {
    setNextValue('')
    setError('')
    setSent(false)
  }, [])

  useEffect(() => {
    if (!open) {
      reset()
      return
    }
    let live = true
    setLoading(true)
    latest.current.load().then(
      m => {
        if (!live) return
        setMine(m)
        if (!m) setError(NOT_READ)
        setLoading(false)
      },
      () => {
        if (!live) return
        setError(NOT_READ)
        setLoading(false)
      },
    )
    return () => {
      live = false
    }
  }, [open, reset])

  /** Typing clears what was said about the last try. */
  const setNext = (value: string) => {
    setNextValue(value)
    setError('')
  }

  const answer = (res: EmailAct, after?: () => void) => {
    if (!res.ok) {
      setError(res.reason)
      return
    }
    setMine(res.mine)
    after?.()
  }

  const submit = () => {
    if (busy || !mine) return
    const problem = emailProblem(next, mine.email)
    if (problem) {
      setError(problem)
      return
    }
    start(async () => {
      try {
        answer(await actions.send(next), () => {
          setNextValue('')
          setSent(true)
        })
      } catch {
        setError(NOT_SENT)
      }
    })
  }

  const withdraw = () => {
    const id = mine?.latest?.status === 'pending' ? mine.latest.id : null
    if (busy || !id) return
    start(async () => {
      try {
        answer(await actions.withdraw(id), () => setSent(false))
      } catch {
        setError('Your request could not be withdrawn. Please try again.')
      }
    })
  }

  const state: EmailChangeState | null = emailChangeState(mine?.latest ?? null)
  return { mine, state, loading, next, setNext, error, sent, busy, submit, withdraw, reset }
}
