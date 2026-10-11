'use client'

import { useEffect, useState, useTransition } from 'react'
import { Drawer } from '@/components/hrv/overlay'
import { flash } from '@/components/hrv/toast'
import { hiringFileLink } from '@/lib/hiring/actions'
import { resumeOf } from '@/lib/hiring/files'
import { STAGE, answerOf } from '@/lib/hiring/view'
import type { HiringCandidate, HiringRequest } from '@/lib/hiring/types'
import s from './hiring.module.css'

/**
 * A candidate's files (README §11 — the 600px résumé drawer, 2026-10-11 for
 * several files): the request, the position and their stage over their name
 * and the file shown, Download, a pill per file when there are more than one
 * (the résumé first), then the file itself — a PDF in a frame, an image as it
 * is, anything else (a Word document) said so, to download — and their note at
 * the foot. The link is made when a file is shown and lasts ten minutes.
 */
export default function FilesDrawer({ request: r, candidate: c, onClose }: { request: HiringRequest; candidate: HiringCandidate | null; onClose: () => void }) {
  const [picked, setPicked] = useState<string | null>(null)
  const [link, setLink] = useState<{ url: string; preview: 'pdf' | 'image' | 'none' } | null>(null)
  const [, start] = useTransition()
  const file = c ? (c.files.find(f => f.id === picked) ?? resumeOf(c.files) ?? c.files[0] ?? null) : null
  const fileId = file?.id ?? null

  // A candidate opens on their résumé.
  const candidateId = c?.id ?? null
  useEffect(() => {
    setPicked(null)
  }, [candidateId])

  useEffect(() => {
    setLink(null)
    if (!fileId) return
    let live = true
    hiringFileLink('file', fileId).then(out => {
      if (!live) return
      if (out.ok) setLink({ url: out.url, preview: out.preview })
      else flash(out.reason)
    })
    return () => {
      live = false
    }
  }, [fileId])

  const download = () => {
    if (!file) return
    start(async () => {
      const out = await hiringFileLink('file', file.id, true)
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
              <div className={s.cvFile}>{file ? `${file.type} · ${file.name}` : ''}</div>
            </div>
            <button type="button" className={s.btnGhost} onClick={download} disabled={!file}>
              Download
            </button>
          </div>
        ) : null
      }
    >
      {c ? (
        <>
          {c.files.length > 1 ? (
            <div className={s.cvPills} role="group" aria-label="Files">
              {c.files.map(f => (
                <button key={f.id} type="button" className={s.cvPill} aria-pressed={f.id === file?.id} title={f.name} onClick={() => setPicked(f.id)}>
                  {`${f.type} · ${f.name}`}
                </button>
              ))}
            </div>
          ) : null}
          <div className={s.cvBody}>
            {link?.preview === 'pdf' ? <iframe src={link.url} title={file?.type ?? 'File'} className={s.cvFrame} /> : null}
            {link?.preview === 'image' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={link.url} alt={file?.name ?? c.name} className={s.cvImg} />
            ) : null}
            {link?.preview === 'none' ? (
              <div className={s.cvNone}>
                <div className={s.cvNoneName}>{c.name}</div>
                <div className={s.cvNoneContact}>{[c.phone, c.source].filter(Boolean).join(' · ')}</div>
                <div className={s.cvNoneSay}>{file?.name} opens in Word — Download it to read it.</div>
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
