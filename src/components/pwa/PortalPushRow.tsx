'use client'

import { useEffect, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { reportPushTrouble } from '@/lib/push/actions'
import PopUpGuide from './PopUpGuide'
import { popUpNeedsTurningOn, pushState, turnPushOff, turnPushOn, type PushState } from './push-client'
import { PORTAL_PUSH_APP, removePushFromBrowser, savePushFromBrowser } from './portal-push'

/** A state the switch cannot answer for, as its chip (DESIGN.md › No descriptions on the page). */
const CHIP: Partial<Record<PushState, string>> = { install: 'Add to Home Screen', denied: 'Blocked' }

/**
 * More › *Phone notifications* on the portal's phone face (2026-10-16): the switch the HR app's More and the Revenue
 * app's Profile carry. The phone's permission is asked only when it is pressed (push-client.ts › turnPushOn). An
 * iPhone not running the Home Screen app says *Add to Home Screen*; a phone that blocked them, *Blocked*; a browser
 * that cannot show them, nothing at all. On an Android phone once on, *Make them pop up*.
 */
export default function PortalPushRow({ open }: { open: boolean }) {
  const [state, setState] = useState<PushState | null>(null)
  const [reason, setReason] = useState('')
  const [guide, setGuide] = useState(false)
  const [busy, start] = useTransition()
  // Read again each time the sheet opens: the first open's question may have turned them on since.
  useEffect(() => {
    void pushState().then(setState).catch(() => setState('unsupported'))
  }, [open])
  if (state === null || state === 'unsupported') return null
  const on = state === 'on'
  const chip = CHIP[state]
  // The question is asked inside the press itself — turnPushOn asks before it awaits anything.
  const press = () =>
    start(async () => {
      const res = on ? await turnPushOff(removePushFromBrowser) : await turnPushOn(PORTAL_PUSH_APP, savePushFromBrowser, reportPushTrouble)
      setState(res.state)
      setReason(res.reason ?? '')
    })
  return (
    <div className="mt-4 border-t border-hairline" data-portal-push="">
      <button
        type="button"
        onClick={press}
        disabled={busy || !!chip}
        aria-pressed={on}
        className="w-full flex items-center gap-3 min-h-[48px] pl-1 pr-1 text-left text-[15px] text-ink"
      >
        <span className="flex-1 min-w-0 truncate">Phone notifications</span>
        {chip ? (
          <span className="chip alert shrink-0"><span className="dot" />{chip}</span>
        ) : (
          <span aria-hidden className={`relative shrink-0 w-7 h-4 rounded-full transition-colors ${on ? 'bg-ds-accent' : 'bg-ds-border'}${busy ? ' opacity-50' : ''}`}>
            <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-ds-surface shadow-sm transition-[left] ${on ? 'left-[14px]' : 'left-0.5'}`} />
          </span>
        )}
      </button>
      {reason ? <p role="alert" className="pl-1 pb-2 text-[12.5px] leading-snug text-danger">{reason}</p> : null}
      {on && popUpNeedsTurningOn() ? (
        <button type="button" onClick={() => setGuide(true)} className="w-full flex items-center min-h-[44px] pl-1 text-left text-[15px] text-ink">
          Make them pop up
        </button>
      ) : null}
      {/* Over the whole screen, not inside the sheet's moving panel. */}
      {guide ? createPortal(<PopUpGuide onClose={() => setGuide(false)} />, document.body) : null}
    </div>
  )
}
