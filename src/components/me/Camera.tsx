'use client'

import { useEffect, useRef, useState } from 'react'
import { TextField } from '@/components/ds/Field'
import { assignmentFor, policyOn } from '@/lib/attendance/engine'
import { hms } from '@/lib/me/format'
import { earlyOutWarning, placeOf, type Place, type Position } from '@/lib/me/today'
import { officeToday } from '@/lib/office-time'
import type { MeData, MeToday } from '@/lib/me/types'
import { useEscape } from '@/components/hrv/overlay'

/**
 * The punch camera (2026-10-17, the handoff's `camOpen`): full screen, the front camera live and mirrored inside an
 * oval guide — no gallery — the server's time to the second, where you stand against the fences, a reason when you
 * are outside one, and the shutter. "Stamping the time…" holds at least 900ms while the punch goes in.
 */

export interface Shot {
  photo: Blob | null
  pos: Position
  reason: string
  place: Place
}

export function Camera({ dir, data, today, nowSec, phone, computer, onClose, onShoot }: {
  dir: 'in' | 'out'
  data: MeData
  today: MeToday | null
  nowSec: number
  phone: boolean
  /** From a computer: HR sees the flag. */
  computer: boolean
  onClose: () => void
  /** Files the punch; resolves true when it went in. */
  onShoot: (s: Shot) => Promise<boolean>
}) {
  const video = useRef<HTMLVideoElement | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const [camOk, setCamOk] = useState(false)
  const [pos, setPos] = useState<Position>({ state: 'finding' })
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  useEscape(!saving, onClose)

  useEffect(() => {
    let on = true
    if (navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false }).then(async st => {
        if (!on) { st.getTracks().forEach(t => t.stop()); return }
        stream.current = st
        const v = video.current
        if (v) { v.srcObject = st; v.muted = true; await v.play().catch(() => {}) }
        if (on) setCamOk(true)
      }).catch(() => { if (on) setCamOk(false) })
    }
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        p => { if (on) setPos({ state: 'here', lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }) },
        () => { if (on) setPos({ state: 'off' }) },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      )
    } else setPos({ state: 'off' })
    return () => { on = false; stream.current?.getTracks().forEach(t => t.stop()); stream.current = null }
  }, [])

  const me = data.me
  const assignment = me ? assignmentFor(me, data.workDay, data.assignments) : null
  const policy = policyOn(data.workDay, data.policies)
  const place = placeOf(pos, data.locations, assignment, policy)
  const warn = earlyOutWarning(dir, nowSec, today, officeToday())
  const needPhoto = !!policy?.photoRequired
  const wantsReason = place.needReason && !reason.trim()
  const off = saving || wantsReason || place.refused || (needPhoto && !camOk)

  const shoot = async () => {
    if (off) return
    let photo: Blob | null = null
    const v = video.current
    try {
      if (camOk && v && v.videoWidth) {
        const c = document.createElement('canvas')
        const size = 480
        c.width = size; c.height = size
        const g = c.getContext('2d')
        const s = Math.min(v.videoWidth, v.videoHeight)
        if (g) {
          g.translate(size, 0); g.scale(-1, 1)
          g.drawImage(v, (v.videoWidth - s) / 2, (v.videoHeight - s) / 2, s, s, 0, 0, size, size)
          photo = await new Promise<Blob | null>(res => c.toBlob(b => res(b), 'image/jpeg', 0.82))
        }
      }
    } catch { photo = null }
    setSaving(true)
    const [ok] = await Promise.all([onShoot({ photo, pos, reason: reason.trim(), place }), new Promise(r => setTimeout(r, 900))])
    if (!ok) setSaving(false)
  }

  const dot = place.tone === 'ok' ? 'var(--me-cam-ok)' : place.tone === 'flag' ? 'var(--ds-accent)' : 'rgb(255 255 255 / .4)'
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 40, background: 'var(--me-cam)', color: 'rgb(255 255 255)', display: 'flex', flexDirection: 'column' }}>
      {phone ? <div style={{ height: 'env(safe-area-inset-top, 0px)', flex: 'none' }} /> : null}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px' }}>
        <button type="button" onClick={onClose} disabled={saving} aria-label="Close" style={{ width: 44, height: 44, border: 0, background: 'none', color: 'rgb(255 255 255)', fontSize: 24, cursor: 'pointer' }}>×</button>
        <span style={{ fontWeight: 500, fontSize: 16 }}>{dir === 'out' ? 'Clock out' : 'Clock in'}</span>
        <span style={{ width: 44 }} />
      </div>
      <div style={{ position: 'relative', flex: 1, minHeight: 0, margin: '6px 16px 0', borderRadius: 20, overflow: 'hidden', background: 'var(--me-cam-frame)', display: 'grid', placeItems: 'center' }}>
        <video ref={video} playsInline muted style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)', opacity: camOk ? 1 : 0 }} />
        <div style={{ position: 'relative', width: 190, height: 250, borderRadius: '50%', border: '2px solid rgb(255 255 255 / .7)', boxSizing: 'content-box' }} />
        <span style={{ position: 'absolute', left: 0, right: 0, bottom: 14, textAlign: 'center', fontSize: 12, color: 'rgb(255 255 255 / .75)' }}>
          {camOk ? 'Front camera · live — no gallery' : 'Front camera · allow camera access to take the selfie'}
        </span>
      </div>
      <div style={{ padding: '14px 20px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 12, color: 'rgb(255 255 255 / .65)' }}>Server time</span>
          <span style={{ fontFamily: 'var(--ds-font-body)', fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 22 }}>{hms(nowSec)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, padding: '9px 11px', borderRadius: 10, background: 'rgb(255 255 255 / .08)' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', flex: 'none', background: dot }} />
          <span style={{ flex: 1, minWidth: 0 }}>{place.line}</span>
        </div>
        {warn ? <div style={{ fontSize: 12, color: 'var(--me-cam-warn)' }}>{warn}</div> : null}
        {computer ? <div style={{ fontSize: 12, color: 'var(--me-cam-warn)' }}>From a computer — HR sees a flag.</div> : null}
        {place.needReason ? <TextField value={reason} onChange={setReason} placeholder="Why are you outside? e.g. Client visit, Mid Valley" /> : null}
      </div>
      <div style={{ display: 'grid', placeItems: 'center', padding: phone ? '16px 0 calc(30px + var(--safe-bottom))' : '16px 0 30px' }}>
        <button type="button" onClick={shoot} disabled={off} aria-label="Take photo and punch" style={{
          width: 76, height: 76, borderRadius: '50%', border: '4px solid rgb(255 255 255)', background: 'none', padding: 5, cursor: off ? 'default' : 'pointer',
          opacity: off && !saving ? 0.4 : 1, boxSizing: 'content-box',
        }}>
          <span style={{ display: 'block', width: '100%', height: '100%', borderRadius: '50%', background: 'var(--ds-accent)' }} />
        </button>
      </div>
      {saving ? <div style={{ position: 'absolute', inset: 0, background: 'rgb(14 12 11 / .72)', display: 'grid', placeItems: 'center', fontSize: 14 }}>Stamping the time…</div> : null}
    </div>
  )
}
