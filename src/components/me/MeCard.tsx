'use client'

import { useState } from 'react'
import { Button } from '@/components/ds/Button'
import { hm } from '@/lib/me/format'
import { todayCard } from '@/lib/me/today'
import { officeToday } from '@/lib/office-time'
import { NUM } from './kit'
import { MeOverlay } from './MeOverlay'
import { useClock, useMe } from './useMe'

/**
 * The Finance app's way into Me (2026-10-17 — the user: the Finance app keeps its Profile tab, "a Me card (today's
 * punch + entry) on top of Profile"): the hub's Today card — the day, the server's clock, the punch line and its
 * button — over Profile; a tap anywhere else opens Me. Only for a login a People record names (a shared login has
 * nothing to punch), never while viewing as somebody.
 */
export function MeCard({ backLabel = 'Profile' }: { backLabel?: string }) {
  const me = useMe(true)
  const [open, setOpen] = useState(false)
  const [punch, setPunch] = useState<'in' | 'out' | null>(null)
  const nowSec = useClock(me.s.today?.now, me.s.todayAt)
  const card = todayCard(me.s.today, nowSec, officeToday())
  if (!card) return null
  const enter = (p: 'in' | 'out' | null) => { setPunch(p); setOpen(true) }
  return (
    <>
      <div role="button" tabIndex={0} aria-label="Open Me" onClick={() => enter(null)} onKeyDown={e => { if (e.key === 'Enter') enter(null) }} data-me=""
        style={{ borderRadius: 16, background: 'var(--ds-dark)', color: 'var(--ds-on-dark)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', fontFamily: 'var(--ds-font-body)', margin: '0 0 22px' }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ds-dark-sub)' }}>Today · {card.chip}</span>
          <span style={{ ...NUM, fontSize: 26, lineHeight: 1.1 }}>{hm(nowSec)}</span>
          <span style={{ fontSize: 12, color: 'var(--ds-dark-sub)' }}>{card.line}</span>
        </div>
        {card.punch ? (
          <span onClick={e => e.stopPropagation()}>
            <Button onClick={() => enter(card.punch)}>{card.punch === 'in' ? 'Clock in' : 'Clock out'}</Button>
          </span>
        ) : <span aria-hidden="true" style={{ color: 'var(--ds-dark-sub)', fontSize: 20 }}>›</span>}
      </div>
      <MeOverlay me={me} open={open} onClose={() => { setOpen(false); setPunch(null) }} backLabel={backLabel} startPunch={punch} />
    </>
  )
}
