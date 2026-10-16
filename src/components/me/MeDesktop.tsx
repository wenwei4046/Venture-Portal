'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEscape } from '@/components/hrv/overlay'
import { topLabel, todayCard } from '@/lib/me/today'
import { officeToday } from '@/lib/office-time'
import { Avatar } from './kit'
import { MeApp } from './MeApp'
import { useClock, useMe } from './useMe'

/**
 * Me on a computer (2026-10-17 — the user: a button on the top bar that says today, "Not in yet · Clock in", and a
 * 430px panel from the right): the greeting bar's button and the panel, in the HR, Finance and Principal views. A
 * punch from here is a computer's (`web`): HR sees "From a computer". Only for a login a People record names, never
 * while viewing as somebody.
 */
export function MeDesktop({ hostLabel }: { hostLabel: string }) {
  const me = useMe(true)
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useState(false)
  const [mounted, setMounted] = useState(false)
  const nowSec = useClock(me.s.today?.now, me.s.todayAt)
  const card = todayCard(me.s.today, nowSec, officeToday())
  useEscape(open, () => setOpen(false))
  useEffect(() => {
    if (open) {
      setMounted(true)
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
      return () => cancelAnimationFrame(r)
    }
    setShown(false)
    const t = setTimeout(() => setMounted(false), 340)
    return () => clearTimeout(t)
  }, [open])
  if (!card) return null
  const wants = card.punch === 'in' && card.chip === 'Late'
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`Me · ${topLabel(card)}`} title="Me — attendance, leave, payslips, profile" style={{
        display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: '0 12px 0 3px', borderRadius: 16, border: '1px solid rgb(var(--hvs-top-border, 229 228 223))',
        background: 'rgb(255 255 255)', color: 'rgb(var(--hvs-top-ink, 43 31 23))', fontFamily: 'inherit', fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap', lineHeight: 'normal',
      }}>
        <Avatar name={me.s.today?.name ?? me.s.record?.name ?? 'Me'} size={24} tone="dark" photo={me.s.photo} style={{ borderRadius: '50%', fontSize: 9 }} />
        {card.punch ? <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: wants ? 'var(--ds-danger)' : 'var(--ds-accent)' }} /> : null}
        <span>{topLabel(card)}</span>
      </button>
      {mounted && typeof document !== 'undefined' ? createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 60 }}>
          <div onClick={() => setOpen(false)} style={{ position: 'absolute', inset: 0, background: 'var(--ds-scrim)', opacity: shown ? 1 : 0, transition: 'opacity 250ms ease' }} />
          <div role="dialog" aria-modal="true" aria-label="Me" style={{
            position: 'absolute', top: 0, right: 0, bottom: 0, width: 430, maxWidth: '100%', background: 'rgb(255 255 255)', boxShadow: '-12px 0 32px rgb(43 31 23 / .12)',
            transform: shown ? 'none' : 'translateX(40px)', opacity: shown ? 1 : 0, transition: 'transform 340ms cubic-bezier(.2,.8,.2,1), opacity 340ms cubic-bezier(.2,.8,.2,1)',
          }}>
            <MeApp me={me} mode="panel" hostLabel={hostLabel} onClose={() => setOpen(false)} source="web" />
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  )
}
