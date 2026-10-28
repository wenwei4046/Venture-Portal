'use client'

import { useMemo, useState, useTransition } from 'react'
import { forwardMessage } from '@/lib/leads/actions'
import { isMediaPlaceholder, mediaFileName } from '@/lib/leads/inbox'
import { formatPhone } from '@/lib/leads/phone'
import type { LeadBrand, LeadContact, LeadMessage } from '@/lib/leads/types'
import { LeadIcon } from '@/components/layout/lead-icons'
import s from './photo-editor.module.css'

/**
 * Forward a message to another conversation (2026-10-28 — the user: "转发就好"): pick the chat, then Forward. It goes
 * there as a new reply from this person (forwardMessage) — Messenger's 24-hour window holds there too.
 */
export default function ForwardDialog({ message, others, brands, onClose, onDone }: {
  message: LeadMessage
  others: LeadContact[]
  brands: Map<string, LeadBrand>
  onClose: () => void
  onDone: (notice: string) => void
}) {
  const [q, setQ] = useState('')
  const [to, setTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, start] = useTransition()
  const hasFile = !!(message.mediaPath || message.mediaUrl)
  const what = hasFile ? (isMediaPlaceholder(message.body) ? mediaFileName(message) : message.body) : message.body
  const list = useMemo(() => {
    const k = q.trim().toLowerCase()
    return others.filter(c => !k || `${c.name} ${c.phone ?? ''} ${c.lastText}`.toLowerCase().includes(k)).slice(0, 60)
  }, [others, q])

  const go = () => {
    if (!to) return
    setError(null)
    start(async () => {
      const r = await forwardMessage(to, { body: message.body, mediaPath: message.mediaPath ?? null, mediaMime: message.mediaMime ?? null, mediaUrl: message.mediaUrl ?? null })
      if (!r.ok) { setError(r.reason); return }
      const name = others.find(c => c.id === to)?.name ?? 'the chat'
      onDone(r.data.notSent ? `Forwarded to ${name}, saved but not sent: ${r.data.notSent}` : `Forwarded to ${name}.`)
    })
  }

  return (
    <div className={s.scrim} role="dialog" aria-modal="true" aria-label="Forward the message">
      <div className={s.panel} style={{ width: 'min(520px, 100%)' }}>
        <div className={s.head}>
          <span className={s.title}>Forward</span>
          <span className={s.name}>{hasFile ? <LeadIcon name="paperclip" size={12} /> : null} {what}</span>
          <button type="button" className={s.close} onClick={onClose} aria-label="Close" disabled={busy}><LeadIcon name="x" size={16} /></button>
        </div>
        <div className={s.hint}>
          <input className={s.words} value={q} onChange={e => setQ(e.target.value)} placeholder="Search a customer by name or phone" autoFocus />
        </div>
        <div className={s.pickList} role="listbox" aria-label="Conversations">
          {list.length ? list.map(c => (
            <button key={c.id} type="button" role="option" aria-selected={to === c.id} className={s.pickRow} onClick={() => setTo(c.id)}>
              <span className={s.pickName}>{c.name || 'Customer'}</span>
              <span className={s.pickSub}>{[brands.get(c.brandId)?.name, c.phone ? formatPhone(c.phone) : null, c.isTest ? 'Test' : null].filter(Boolean).join(' · ')}</span>
            </button>
          )) : <div className={s.note} style={{ padding: 16 }}>No conversation matches.</div>}
        </div>
        {error ? <div className={s.fail} style={{ margin: '8px 16px 0' }} role="alert">{error}</div> : null}
        <div className={s.foot}>
          <span className={s.note}>It goes as a new message from you.</span>
          <button type="button" className={s.cancel} onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className={s.send} onClick={go} disabled={!to || busy}>{busy ? 'Forwarding…' : 'Forward'}</button>
        </div>
      </div>
    </div>
  )
}
