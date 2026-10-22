'use client'

import { useEffect, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { HrIcon } from '@/components/hrv/icons'
import { reportPushTrouble } from '@/lib/push/actions'
import PopUpGuide from '@/components/pwa/PopUpGuide'
import { PUSH_WORDS, popUpNeedsTurningOn, pushState, turnPushOff, turnPushOn, type PushState } from '@/components/pwa/push-client'
import { PORTAL_PUSH_APP, removePushFromBrowser, savePushFromBrowser } from '@/components/pwa/portal-push'
import s from './fin-app.module.css'

/**
 * Profile › *This phone* › *Phone notifications* in the Finance app (2026-10-17). The Principal's own view opens this
 * app on a phone now — the portal's phone face, where #514 (2026-10-16) gave the user's iPhone its question and its
 * switch, is no longer where it lands — so the app carries the same switch (and the frame the same first question):
 * the portal's own (`portal-push.ts`, the HR app's places, signed up from the browser). The phone's permission is
 * asked only inside the press (push-client.ts › turnPushOn).
 *
 * The whole section — its head with `roman` and its card — or nothing at all where the phone cannot show
 * notifications (so Profile never draws an empty card); the last section, so its numeral moves no other.
 */
export default function PushRow({ roman }: { roman: string }) {
  const [state, setState] = useState<PushState | null>(null)
  const [reason, setReason] = useState('')
  const [guide, setGuide] = useState(false)
  const [busy, start] = useTransition()
  useEffect(() => {
    void pushState().then(setState).catch(() => setState('unsupported'))
  }, [])
  if (state === null || state === 'unsupported') return null
  const on = state === 'on'
  const stuck = state === 'install' || state === 'denied'
  const press = () =>
    start(async () => {
      const res = on ? await turnPushOff(removePushFromBrowser) : await turnPushOn(PORTAL_PUSH_APP, savePushFromBrowser, reportPushTrouble)
      setState(res.state)
      setReason(res.reason ?? '')
    })
  return (
    <>
      <div className={s.menuHead}>
        <span className={s.roman}>{roman}</span>
        <span className={s.caps}>This phone</span>
      </div>
      <div className={s.menu}>
        <button type="button" className={s.menuRow} onClick={press} disabled={busy || stuck} aria-pressed={on}>
          <span className={`${s.menuIcon} ${s.walnut}`}>
            <HrIcon name="phone" size={16} />
          </span>
          <span className={s.menuText}>
            <span className={s.menuLabel}>Phone notifications</span>
            <span className={s.menuSub}>{PUSH_WORDS[state]}</span>
          </span>
          <span className={s.pushSwitch} data-on={on ? 'true' : undefined} data-busy={busy ? 'true' : undefined} aria-hidden="true" />
        </button>
        {reason ? (
          <p role="alert" className={s.pushReason}>
            {reason}
          </p>
        ) : null}
        {on && popUpNeedsTurningOn() ? (
          <button type="button" className={s.menuRow} onClick={() => setGuide(true)}>
            <span className={`${s.menuIcon} ${s.walnut}`}>
              <HrIcon name="phone" size={16} />
            </span>
            <span className={s.menuText}>
              <span className={s.menuLabel}>Make them pop up</span>
              <span className={s.menuSub}>Pop on screen, once per phone</span>
            </span>
            <span className={s.menuChev} aria-hidden="true">
              ›
            </span>
          </button>
        ) : null}
      </div>
      {guide ? createPortal(<PopUpGuide onClose={() => setGuide(false)} />, document.body) : null}
    </>
  )
}
