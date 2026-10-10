'use client'

import { useEffect, useState, useTransition } from 'react'
import { Drawer } from '@/components/hrv/overlay'
import { flash } from '@/components/hrv/toast'
import { hiringFileLink } from '@/lib/hiring/actions'
import { STAGE, answerOf } from '@/lib/hiring/view'
import type { HiringCandidate, HiringRequest } from '@/lib/hiring/types'
import s from './hiring.module.css'

/**
 * A candidate's résumé (README §11 — the 600px drawer): the request, the
 * position and their stage over their name and the file, Download, then the
 * file itself — a PDF in a frame, an image as it is, anything else (a Word
 * document) said so, to download — and their note at the foot. The link is
 * made when the drawer opens and lasts ten minutes.
 */
export default function ResumeDrawer({ request: r, candidate: c, onClose }: { request: HiringRequest; candidate: HiringCandidate | null; onClose: () => void }) {
  const [link, setLink] = useState<{ url: string; preview: 'pdf' | 'image' | 'none' } | null>(null)
  const [, start] = useTransition()

  useEffect(() => {
    setLink(null)
    if (!c) return
    let live = true
    hiringFileLink('candidate', c.id).then(out => {
      if (!live) return
      if (out.ok) setLink({ url: out.url, preview: out.preview })
      else flash(out.reason)
    })
    return () => {
      live = false
    }
  }, [c])

  const download = () => {
    if (!c) return
    start(async () => {
      const out = await hiringFileLink('candidate', c.id, true)
      if (!out.ok) return flash(out.reason)
      window.location.assign(out.url)
    })
  }

  return (
    <Drawer
      open={!!c}
      onClose={onClose}
      width={600}
      headStyle={{ padding: '18px 22px' }}
      headGrow
      bodyStyle={{ padding: 0, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}
      head={
        c ? (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className={s.cvKicker}>{r.id + ' · ' + answerOf(r, 'position') + ' · ' + STAGE[c.stage].label}</div>
              <div className={s.cvName}>{c.name}</div>
              <div className={s.cvFile}>{c.resumeName}</div>
            </div>
            <button type="button" className={s.btnGhost} onClick={download}>
              Download
            </button>
          </div>
        ) : null
      }
    >
      {c ? (
        <>
          <div className={s.cvBody}>
            {link?.preview === 'pdf' ? <iframe src={link.url} title="Résumé" className={s.cvFrame} /> : null}
            {link?.preview === 'image' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={link.url} alt={c.resumeName ?? c.name} className={s.cvImg} />
            ) : null}
            {link?.preview === 'none' ? (
              <div className={s.cvNone}>
                <div className={s.cvNoneName}>{c.name}</div>
                <div className={s.cvNoneContact}>{[c.phone, c.source].filter(Boolean).join(' · ')}</div>
                <div className={s.cvNoneSay}>{c.resumeName} opens in Word — Download it to read it.</div>
              </div>
            ) : null}
          </div>
          {c.note ? (
            <div className={s.cvNote}>
              <span className={s.cvNoteLabel}>Note</span>
              <span>{c.note}</span>
            </div>
          ) : null}
        </>
      ) : null}
    </Drawer>
  )
}
