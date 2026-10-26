'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { mktCalendarLink } from '@/lib/marketing/actions'
import type { MktSub } from '@/lib/marketing/board'
import { calendarMessage, calendarUrl } from '@/lib/marketing/pic-calendar'
import { whatsappUrl } from '@/lib/marketing/project'
import p from '../project/project.module.css'
import t from '../task/task.module.css'
import s from './subsidiary.module.css'

// A PIC's calendar link, the manager's (⑤-2 — the prototype's "Calendar link (Carres · Kelvin)", `PIC Calendar.dc.html`):
// opened, it is made — or the one there is, while its PIC is still the one it was made for — shown, copied or shared on
// WhatsApp. *New link* makes another; the old one stops working.

export default function CalendarLink({ sub, slot, onClose }: { sub: MktSub; slot: 1 | 2; onClose: () => void }) {
  const pic = (slot === 1 ? sub.pic : sub.pic2) ?? ''
  const number = (slot === 1 ? sub.whatsapp : sub.whatsapp2) ?? ''
  // undefined: being made; null: refused (the reason shown).
  const [code, setCode] = useState<string | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const [copied, setCopied] = useState(false)
  const [pending, start] = useTransition()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (code !== undefined) return
    let live = true
    void mktCalendarLink(sub.id, slot).then(r => {
      if (!live) return
      if (r.ok) setCode(r.code)
      else {
        setCode(null)
        setError(r.reason)
      }
    })
    return () => { live = false }
  }, [code, sub.id, slot])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const url = code ? calendarUrl(window.location.origin, code) : null
  const wa = url ? whatsappUrl(number, calendarMessage(pic, sub.name, url)) : null
  const copy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Copy it from the box')
    }
  }
  const renew = () =>
    start(async () => {
      setError(null)
      const r = await mktCalendarLink(sub.id, slot, true)
      if (!r.ok) return setError(r.reason)
      setCode(r.code)
      setCopied(false)
      setAsking(false)
    })

  return (
    <div className={t.scrim} onClick={() => !pending && onClose()}>
      <div className={t.dialog} role="dialog" aria-modal="true" aria-label={`${pic}’s calendar link`} onClick={e => e.stopPropagation()}>
        <div className={t.dialogTitle}>📅 {pic}’s calendar</div>
        {url ? (
          <div className={s.calBox}>
            <div className={p.linkUrl}><span>{url}</span></div>
            <div className={p.linkBtns}>
              <button type="button" className={p.ghost} onClick={() => void copy()}>{copied ? 'Copied ✓' : 'Copy link'}</button>
              {wa ? <a className={`${p.ghost} ${p.ghostWide}`} href={wa} target="_blank" rel="noreferrer">Share via WhatsApp</a> : null}
            </div>
          </div>
        ) : code === undefined ? <div className={s.calWait}>Making the link…</div> : null}
        {error ? <div className={s.editError} role="alert">{error}</div> : null}
        <div className={t.dialogBtns}>
          {asking ? (
            <>
              <span className={s.calAsk}>The old link stops working.</span>
              <button type="button" className={t.dialogBtn} onClick={() => setAsking(false)} disabled={pending}>Keep it</button>
              <button type="button" className={`${t.dialogBtn} ${t.dialogOk}`} onClick={renew} disabled={pending}>{pending ? 'Making…' : 'New link'}</button>
            </>
          ) : (
            <>
              {url ? <button type="button" className={t.dialogBtn} onClick={() => setAsking(true)}>New link…</button> : null}
              <button type="button" className={`${t.dialogBtn} ${t.dialogOk}`} onClick={onClose} autoFocus>Done</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
