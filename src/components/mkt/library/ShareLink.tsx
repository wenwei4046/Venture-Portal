'use client'

import { useState } from 'react'
import { flash } from '@/components/hrv/toast'
import { shareMktLib, stopMktLibShare } from '@/lib/marketing/actions'
import { SHARE_EXPIRIES, shareAddress, shareEnds, shareOf, type Library, type ShareExpiry } from '@/lib/marketing/library'
import s from './library.module.css'

// A file's or a folder's guest link (`Library.dc.html` › *Share link*, ⑥-3): its address and Copy, *Link expires*
// (24 hours · 7 days · 30 days · Never), *Allow download*. Nothing is shared until *Create link*; once live, a change
// is saved as it is made, and *Stop link* closes it at once (the handoff has no way to — a link that never expires
// could not be taken back).

export default function ShareLink({ lib, what, id, name, onClose, onLibrary }: {
  lib: Library
  what: 'file' | 'folder'
  id: string
  name: string
  onClose: () => void
  onLibrary: (lib: Library) => void
}) {
  const live = shareOf(lib, what, id)
  const [expiry, setExpiry] = useState<ShareExpiry>(live?.expiry ?? '7d')
  const [download, setDownload] = useState(live?.download ?? true)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const address = live ? shareAddress(typeof window === 'undefined' ? '' : window.location.origin, live.code) : ''

  const save = async (next: { expiry: ShareExpiry; download: boolean }) => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const r = await shareMktLib(what, id, next.expiry, next.download)
      if (!r.ok) { setError(r.reason); return }
      onLibrary(r.library)
      if (!live) flash('Link created')
    } finally {
      setBusy(false)
    }
  }
  // Once live, each change goes at once; before, it waits for Create link.
  const pick = (next: { expiry: ShareExpiry; download: boolean }) => {
    setExpiry(next.expiry)
    setDownload(next.download)
    if (live) void save(next)
  }
  const stop = async () => {
    if (busy) return
    setBusy(true)
    try {
      const r = await stopMktLibShare(what, id)
      if (!r.ok) { setError(r.reason); return }
      onLibrary(r.library)
      flash('Link stopped')
      onClose()
    } finally {
      setBusy(false)
    }
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
    } catch {
      setError('Copy it from the box.')
    }
  }

  return (
    <div className={s.scrim} onClick={onClose}>
      <div className={s.dialog} role="dialog" aria-modal="true" aria-label={`Share "${name}"`} onClick={e => e.stopPropagation()}>
        <div className={s.dialogHead}>
          <div className={s.dialogTitle}>Share &ldquo;{name}&rdquo;</div>
          <button type="button" className={s.x} aria-label="Close" onClick={onClose}>×</button>
        </div>

        {live ? (
          <div className={s.shareRow}>
            <input className={s.shareUrl} value={address} readOnly aria-label="Guest link" onFocus={e => e.currentTarget.select()} />
            <button type="button" className={s.copyBtn} onClick={() => void copy()}>{copied ? 'Copied ✓' : 'Copy'}</button>
          </div>
        ) : null}

        <div className={s.field}>
          <span className={s.profileHead}>Link expires</span>
          <div className={s.expiries} role="radiogroup" aria-label="Link expires">
            {SHARE_EXPIRIES.map(e => (
              <button key={e.key} type="button" role="radio" aria-checked={expiry === e.key} className={`${s.expiry} ${expiry === e.key ? s.expiryOn : ''}`}
                disabled={busy} onClick={() => pick({ expiry: e.key, download })}>{e.label}</button>
            ))}
          </div>
          {live ? <span className={s.mono}>{shareEnds(live.expires)}</span> : null}
        </div>

        <button type="button" role="switch" aria-checked={download} className={s.toggleRow} disabled={busy} onClick={() => pick({ expiry, download: !download })}>
          <span className={`${s.track} ${download ? s.trackOn : ''}`} aria-hidden="true"><span className={s.knob} /></span>
          Allow download
        </button>

        {error ? <div className={s.err} role="status">{error}</div> : null}
        <div className={`${s.dialogBtns} ${s.dialogFoot}`}>
          {live ? (
            <>
              <button type="button" className={`${s.btn} ${s.danger}`} disabled={busy} onClick={() => void stop()}>Stop link</button>
              <span className={s.grow} />
              <button type="button" className={s.btnPrimary} onClick={onClose}>Done</button>
            </>
          ) : (
            <>
              <button type="button" className={s.btn} onClick={onClose}>Cancel</button>
              <button type="button" className={s.btnPrimary} disabled={busy} onClick={() => void save({ expiry, download })}>Create link</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
