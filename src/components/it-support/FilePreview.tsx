'use client'

import { useEffect, useState } from 'react'
import { DialogButton } from '@/components/finv/Dialog'
import { useEscape } from '@/components/hrv/overlay'
import { openItFile } from '@/lib/it-requests/actions'
import { fileSize, fileTag, previewKind, type ItFile } from '@/lib/it-requests/model'
import { downloadFile, openInNewTab } from './Attachments'
import s from './it-support.module.css'

/**
 * A filed file opened beside its request's window (2026-10-24 — the user: "我不要它跳到另外一个 screen，这样很麻烦 …
 * 直接在这个 floating window 的右边出现一个 preview"): a picture, a video, a PDF or a text file drawn in place from a short
 * link made at the tap — a picture's from the list's own link while it lasts — and anything else said so; *Open in new
 * tab* and *Download* for every file. Esc closes it before the window. The host keys it by the file.
 */
export default function FilePreview({ file, thumb, onClose }: { file: ItFile; thumb?: string; onClose: () => void }) {
  const kind = previewKind(file.name, file.contentType)
  const [url, setUrl] = useState<string | null>(kind === 'image' && thumb ? thumb : null)
  const [fromList, setFromList] = useState(kind === 'image' && !!thumb)
  const [loadError, setLoadError] = useState('')
  const [broken, setBroken] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState<'tab' | 'download' | null>(null)
  const [actError, setActError] = useState('')
  useEscape(true, onClose)
  useEffect(() => {
    if (!kind || url) return
    let live = true
    openItFile(file.id, 'view').then(result => {
      if (!live) return
      if (result.ok) setUrl(result.data.url)
      else setLoadError(result.error)
    }).catch(() => {
      if (live) setLoadError('The file could not be opened. Please try again.')
    })
    return () => { live = false }
  }, [file.id, kind, url, attempt])
  // The list's link lasts ten minutes: once it has run out, one made now.
  const failed = () => {
    if (fromList) {
      setFromList(false)
      setUrl(null)
    } else setBroken(true)
  }
  const act = async (what: 'tab' | 'download') => {
    setActError('')
    setBusy(what)
    const problem = what === 'tab' ? await openInNewTab(file.id) : await downloadFile(file.id)
    setBusy(null)
    if (problem) setActError(problem)
  }
  const tag = fileTag(file.name, file.contentType)
  const ext = `.${tag.toLowerCase()}`
  return (
    <section className={s.preview} aria-label={`Preview · ${file.name}`}>
      <div className={s.previewHead}>
        <div className={s.previewName}>
          <strong title={file.name}>{file.name}</strong>
          <span className={s.meta}>{[tag, fileSize(file.size)].filter(Boolean).join(' · ')}</span>
        </div>
        <button type="button" className={s.previewClose} onClick={onClose} aria-label="Close preview">×</button>
      </div>
      <div className={s.previewBody}>
        {!kind || broken ? (
          <div className={s.previewNone}>
            <span className={s.previewTag}>{tag}</span>
            {/* Documentation's preview says it the same way. */}
            <p>{broken ? 'This file could not be shown here.' : `No preview for ${ext} files.`}<br />Download it to open.</p>
          </div>
        ) : loadError ? (
          <div className={s.previewNone} role="alert">
            <p>{loadError}</p>
            <DialogButton onClick={() => { setLoadError(''); setAttempt(n => n + 1) }}>Try again</DialogButton>
          </div>
        ) : !url ? (
          <p className={s.meta} role="status">Opening…</p>
        ) : kind === 'image' ? (
          // eslint-disable-next-line @next/next/no-img-element -- a short signed link to a private attachment
          <img src={url} alt={file.name} onError={failed} />
        ) : kind === 'video' ? (
          <video src={url} controls playsInline preload="metadata" aria-label={file.name} onError={failed} />
        ) : (
          // A text file runs nothing; a PDF needs the browser's own viewer, which a sandbox would stop.
          <iframe src={url} title={file.name} sandbox={kind === 'text' ? '' : undefined} />
        )}
      </div>
      {actError && <p className={`${s.error} ${s.previewError}`} role="alert">{actError}</p>}
      <div className={s.previewFoot}>
        <DialogButton disabled={busy !== null} onClick={() => void act('tab')}>{busy === 'tab' ? 'Opening…' : 'Open in new tab'}</DialogButton>
        <DialogButton disabled={busy !== null} onClick={() => void act('download')}>{busy === 'download' ? 'Downloading…' : 'Download'}</DialogButton>
      </div>
    </section>
  )
}
