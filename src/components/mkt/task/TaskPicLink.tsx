'use client'

import { useEffect, useRef, useState } from 'react'
import { linkUrl, whatsappUrl } from '@/lib/marketing/project'
import { picWho } from '@/lib/marketing/task-minutes'
import { picMessage, picWaiting, type MktTaskPage, type TaskPicLink as PicLink } from '@/lib/marketing/task'
import p from '../project/project.module.css'
import s from './task.module.css'

// The PIC's link on a task whose stages they approve and whose minutes they do not (②a-5 — the user's answer 52), above
// its requirements as the PIC APPROVAL card is on one whose minutes they approve: the PICs, each one's own link to copy or
// share on WhatsApp — the message names the stage ready for their approval, else the task to follow — and the stage
// waiting for them now. The links are made at Create; nothing here sends them.

export default function TaskPicLink({ page, pl, say }: { page: MktTaskPage; pl: PicLink; say: (words: string) => void }) {
  const [copied, setCopied] = useState<string | null>(null)
  const [origin, setOrigin] = useState('')
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    setOrigin(window.location.origin)
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current)
    }
  }, [])

  const title = page.project.title
  const waiting = picWaiting(page)
  // Each PIC their own link (the user's answer 29).
  const links = [
    { key: 'pic', who: pl.pic.trim(), code: pl.link, whatsapp: pl.whatsapp },
    { key: 'pic2', who: pl.pic2.trim(), code: pl.pic2.trim() ? pl.link2 : null, whatsapp: pl.whatsapp2 },
  ].flatMap(l => {
    if (!l.code || !origin) return []
    const url = linkUrl(origin, l.code)
    return [{ ...l, url, wa: whatsappUrl(l.whatsapp, picMessage(l.who, title, url, waiting)) }]
  })

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(text)
      if (copyTimer.current) clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(null), 2000)
    } catch {
      say('Copy it from the box')
    }
  }

  return (
    <div className={s.picCard} aria-label="PIC link">
      <div className={s.picHead}>
        <span className={p.cardTitle}>PIC link</span>
        <span className={s.picWho}>{picWho({ pic: pl.pic, pic2: pl.pic2 })}</span>
      </div>
      {links.length ? (
        <div className={p.linkBox}>
          {links.map(l => (
            <div key={l.key} className={p.linkOne}>
              {links.length > 1 ? <div className={p.linkWho}>{l.who || 'The PIC'}</div> : null}
              <div className={p.linkUrl}><span>{l.url}</span></div>
              <div className={p.linkBtns}>
                <button type="button" className={p.ghost} onClick={() => void copy(l.url)}>{copied === l.url ? 'Copied ✓' : 'Copy link'}</button>
                {l.wa ? <a className={`${p.ghost} ${p.ghostWide}`} href={l.wa} target="_blank" rel="noreferrer">Share via WhatsApp</a> : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {waiting ? <div className={p.wait}>Ready for their approval: {waiting.name} · version {waiting.ver}</div> : null}
    </div>
  )
}
