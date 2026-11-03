'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { handLeadToGroup } from '@/lib/leads/actions'
import { copyText } from '@/lib/leads/clipboard'
import { handoffText } from '@/lib/leads/handoff'
import { formatPhone } from '@/lib/leads/phone'
import type { LeadBrand, LeadContact } from '@/lib/leads/types'
import { LeadIcon } from '@/components/layout/lead-icons'
import Modal from './ui/Modal'
import s from './handoff.module.css'

/**
 * Hand a lead to the brand's SALES GROUP (2026-10-27 — the user: no salespeople in Lead View, CS pastes the lead into
 * the brand's WhatsApp group; v2 2026-11-02 — the salespeople list is gone, point 2). The message to "team", editable,
 * copied by *Copy & mark as handed*, which records the hand-over with nobody named (lead_handoff_group). Drawn on the
 * v2 modal (the reference draws the button, not a window).
 */
export default function HandoffWindow({ contact, brand, csName, onClose, onDone }: {
  contact: LeadContact
  csName: string
  brand: LeadBrand
  onClose: () => void
  onDone: () => void
}) {
  const [text, setText] = useState(() => handoffText(contact, brand.name, null, csName))
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [busy, onClose])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const copy = async () => {
    await copyText(text)
    setCopied(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 1500)
  }
  const go = () => {
    setError(null)
    void copy() // at the click, while the browser still lets the page write the clipboard
    start(async () => {
      const r = await handLeadToGroup(contact.id)
      if (!r.ok) { setError(r.reason); return }
      onDone()
    })
  }

  return (
    <Modal open onClose={() => { if (!busy) onClose() }} title={`Hand over to ${brand.name} sales`} width={480}
      foot={<>
        <button type="button" className={s.cancel} onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className={s.go} onClick={go} disabled={busy || !text.trim()}>{busy ? 'Handing over…' : 'Copy & mark as handed'}</button>
      </>}>
      <span className={s.who}>{contact.name || '—'} · {formatPhone(contact.phone)}</span>
      <div className={s.msgHead}>
        <span className={s.kicker}>WHATSAPP MESSAGE · YOU CAN EDIT IT</span>
        <button type="button" className={s.copy} onClick={copy} disabled={!text}><LeadIcon name="copy" size={13} />{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <textarea className={s.text} rows={11} value={text} onChange={e => setText(e.target.value)} aria-label="WhatsApp message" />
      <span className={s.hint}>Copies this message — paste it in {brand.name}’s sales group on WhatsApp. The lead counts as handed.</span>
      {error ? <span className={s.error} role="alert">{error}</span> : null}
    </Modal>
  )
}
