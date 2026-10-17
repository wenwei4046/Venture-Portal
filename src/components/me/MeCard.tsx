'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ds/Button'
import { hm } from '@/lib/me/format'
import { todayCard } from '@/lib/me/today'
import { officeToday } from '@/lib/office-time'
import { NUM } from './kit'
import { MeOverlay } from './MeOverlay'
import { useClock, useMe, useOpenedRequest } from './useMe'

const ONE_LINE = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const

/**
 * The Finance app's way into Me (2026-10-17 — the user: the Finance app keeps its Profile tab, "a Me card (today's
 * punch + entry) on top of Profile"): the hub's Today card — the day, the server's clock, the punch line and its
 * button — over Profile; a tap anywhere else opens Me. Only for a login a People record names (a shared login has
 * nothing to punch), never while viewing as somebody.
 *
 * A bar, not a card (2026-10-17 — the user, on an iPhone: "这个 bar 本身太大了，做小一点"): one row inside the page's
 * 16px margins like the cards around it — the clock, the day and its line beside it, a small *Clock in*. At 42 px it
 * was then "too narrow" ("let the bar thicker a bit"): 56 px, its clock and lines a step larger — still well under the
 * hub's card (91).
 */
export function MeCard({ backLabel = 'Profile' }: { backLabel?: string }) {
  const me = useMe(true)
  const [open, setOpen] = useState(false)
  const [punch, setPunch] = useState<'in' | 'out' | null>(null)
  // A tapped notice about one's own request (`/fin-app/profile?open=me:<id>`, 2026-10-17): Me opens on it.
  const [asked, askedDone] = useOpenedRequest()
  useEffect(() => { if (asked) setOpen(true) }, [asked])
  const nowSec = useClock(me.s.today?.now, me.s.todayAt)
  const card = todayCard(me.s.today, nowSec, officeToday())
  if (!card) return null
  const enter = (p: 'in' | 'out' | null) => { setPunch(p); setOpen(true) }
  return (
    <>
      <div role="button" tabIndex={0} aria-label="Open Me" onClick={() => enter(null)} onKeyDown={e => { if (e.key === 'Enter') enter(null) }} data-me=""
        style={{ borderRadius: 14, background: 'var(--ds-dark)', color: 'var(--ds-on-dark)', padding: '12px 12px 12px 16px', minHeight: 32, display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', fontFamily: 'var(--ds-font-body)', margin: '12px 16px 0' }}>
        <span style={{ ...NUM, fontSize: 21, lineHeight: 1, flex: 'none' }}>{hm(nowSec)}</span>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ ...ONE_LINE, fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ds-dark-sub)' }}>Today · {card.chip}</span>
          <span style={{ ...ONE_LINE, fontSize: 13, color: 'var(--ds-dark-sub)' }}>{card.line}</span>
        </div>
        {card.punch ? (
          <span onClick={e => e.stopPropagation()} style={{ flex: 'none' }}>
            <Button size="sm" onClick={() => enter(card.punch)}>{card.punch === 'in' ? 'Clock in' : 'Clock out'}</Button>
          </span>
        ) : <span aria-hidden="true" style={{ color: 'var(--ds-dark-sub)', fontSize: 20, flex: 'none' }}>›</span>}
      </div>
      <MeOverlay me={me} open={open} onClose={() => { setOpen(false); setPunch(null); askedDone() }} backLabel={backLabel} startPunch={punch} startRequest={asked} />
    </>
  )
}
