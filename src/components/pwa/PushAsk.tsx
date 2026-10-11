'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import type { PushApp } from '@/lib/push/config'
import { askedBefore, healPush, rememberAsked, turnPushOn, type PushState, type PushTrouble } from './push-client'
import s from './push-ask.module.css'

type Saved = { ok: true } | { ok: false; reason: string }

const BODY: Readonly<Record<PushApp, string>> = {
  hr: 'New requests, hiring updates and meeting bookings reach this phone the moment they happen — even with the app closed.',
  revenue: 'Meetings booked for you and news on your requests reach this phone the moment they happen — even with the app closed.',
}

/**
 * The first open's question (2026-10-11 — the user: "当我第一次点进去这个 app
 * … 它就会跳上来一个窗口，问我可不可以 allow notification"): once per phone,
 * while its notifications are off and its browser has not been asked, a window
 * asks whether to turn them on. *Allow notifications* is the press the phone's
 * own permission prompt needs; *Not now* is not asked again — *Phone
 * notifications* in the app turns them on any time. Every open also signs up
 * again, without asking, a phone that already said yes (`healPush`).
 */
export default function PushAsk({ app, save, trouble, onState }: {
  app: PushApp
  save: (s: { endpoint: string; p256dh: string; auth: string; app: PushApp }) => Promise<Saved>
  trouble?: PushTrouble
  /** The state after the open's sign-up, and after an answer — for the app's own row. */
  onState?: (state: PushState) => void
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, start] = useTransition()
  const tell = useRef(onState)
  tell.current = onState

  useEffect(() => {
    let alive = true
    void (async () => {
      const state = await healPush(app, save, trouble).catch(() => 'unsupported' as PushState)
      if (!alive) return
      tell.current?.(state)
      if (state === 'off' && typeof Notification !== 'undefined' && Notification.permission === 'default' && !askedBefore()) setOpen(true)
    })()
    return () => {
      alive = false
    }
    // Once per open of the app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!open) return null
  const allow = () =>
    start(async () => {
      const res = await turnPushOn(app, save, trouble)
      tell.current?.(res.state)
      if (res.state === 'off' && res.reason) {
        setReason(res.reason)
        return
      }
      // On, blocked, or the phone's own prompt waved away: the question was answered.
      rememberAsked()
      setOpen(false)
    })
  const later = () => {
    rememberAsked()
    setOpen(false)
  }
  return (
    <div className={s.scrim} data-push-ask="">
      <div className={s.card} role="dialog" aria-modal="true" aria-labelledby="push-ask-title">
        <span className={s.bell} aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </span>
        <h2 id="push-ask-title" className={s.title}>Turn on notifications?</h2>
        <p className={s.body}>{BODY[app]}</p>
        {reason ? <p className={s.reason} role="alert">{reason}</p> : null}
        <button type="button" className={s.allow} onClick={allow} disabled={busy}>{busy ? 'Turning on…' : 'Allow notifications'}</button>
        <button type="button" className={s.later} onClick={later} disabled={busy}>Not now</button>
      </div>
    </div>
  )
}
