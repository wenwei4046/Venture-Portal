'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { handLeadOver, handLeadToGroup } from '@/lib/leads/actions'
import { copyText } from '@/lib/leads/clipboard'
import { handoffText, SALES_GROUP, suggestedSales } from '@/lib/leads/handoff'
import { formatPhone, whatsAppLink } from '@/lib/leads/phone'
import type { LeadBrand, LeadContact } from '@/lib/leads/types'
import { LeadIcon } from '@/components/layout/lead-icons'
import s from './inbox.module.css'

/**
 * Hand a lead to one of the brand's salespeople (Inbox v2's window, 2026-10-22). SALESPERSON · IN TURN: the
 * rotation's NEXT is the one with the fewest leads this week, picked to start; Customer Service may pick anybody.
 * The WhatsApp message is filled in and may be changed, or copied. *Mark as handed* records it (lead_handoff) and
 * opens WhatsApp to the salesperson with it — the hand-over the KPI counts.
 *
 * Or the brand's SALES GROUP (2026-10-27 — the user: no salespeople in Lead View for now, CS pastes the lead into the
 * brand's WhatsApp group): the message to "team", copied by *Copy & mark as handed*, which records the hand-over with
 * nobody named (lead_handoff_group). Picked to start when the brand has no salespeople.
 */
const GROUP = 'group'

export default function HandoffWindow({ contact, brand, csName, onClose, onDone }: {
  contact: LeadContact
  csName: string
  brand: LeadBrand
  onClose: () => void
  onDone: () => void
}) {
  const next = suggestedSales(brand)
  const [pick, setPick] = useState<string>(next?.id ?? GROUP)
  const chosen = brand.sales.find(x => x.id === pick) ?? null
  const toGroup = pick === GROUP
  const [text, setText] = useState(() => handoffText(contact, brand.name, next, csName))
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [busy, onClose])
  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current) }, [])

  // Picking somebody writes the message to them afresh, as the handoff does.
  const choose = (id: string) => {
    setPick(id)
    setText(handoffText(contact, brand.name, brand.sales.find(x => x.id === id) ?? null, csName))
  }
  const copy = async () => {
    await copyText(text)
    setCopied(true)
    if (copiedTimer.current) clearTimeout(copiedTimer.current)
    copiedTimer.current = setTimeout(() => setCopied(false), 1200)
  }
  const go = () => {
    if (toGroup) {
      setError(null)
      void copy() // at the click, while the browser still lets the page write the clipboard
      start(async () => {
        const r = await handLeadToGroup(contact.id)
        if (!r.ok) { setError(r.reason); return }
        onDone()
      })
      return
    }
    if (!chosen) return
    setError(null)
    // Opened now, while the click still counts, so the browser does not block it; pointed at WhatsApp once saved.
    const tab = window.open('', '_blank')
    start(async () => {
      const r = await handLeadOver(contact.id, chosen.id)
      if (!r.ok) {
        tab?.close()
        setError(r.reason)
        return
      }
      const url = whatsAppLink(r.data.phone, text)
      if (tab) tab.location.href = url
      else window.location.href = url
      onDone()
    })
  }

  return (
    <div className={s.overlay} onClick={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div className={s.window} role="dialog" aria-modal="true" aria-label={`Hand over to ${brand.name} sales`}>
        <div className={s.windowHead}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h2 className={s.windowTitle}>Hand over to {brand.name} sales</h2>
            <span className={s.sub} style={{ color: 'rgb(var(--lv-text-2))' }}>{contact.name || '—'} · {formatPhone(contact.phone)}</span>
          </div>
          <button type="button" className={s.close} onClick={onClose} disabled={busy} aria-label="Close"><LeadIcon name="x" size={15} /></button>
        </div>
        <div className={s.windowBody}>
          <div className={s.people} role="radiogroup" aria-label="Salesperson">
            <span className={s.caps} style={{ paddingBottom: 4 }}>SALESPERSON · IN TURN</span>
            {brand.sales.map(x => (
              <button key={x.id} type="button" role="radio" aria-checked={x.id === pick} className={s.person} onClick={() => choose(x.id)}>
                <span className={s.radio} aria-hidden="true" />
                <span className={s.personText}>
                  <span className={s.personName}>{x.name}{next?.id === x.id ? <span className={s.next}>NEXT</span> : null}</span>
                  <span className={s.personSub}>{x.showroom ? `${x.showroom} · ` : ''}{formatPhone(x.phone)}</span>
                </span>
                <span className={s.week}>{x.week} this wk</span>
              </button>
            ))}
            <button type="button" role="radio" aria-checked={toGroup} className={s.person} onClick={() => choose(GROUP)}>
              <span className={s.radio} aria-hidden="true" />
              <span className={s.personText}>
                <span className={s.personName}>{SALES_GROUP}</span>
                <span className={s.personSub}>{`Copy the message, paste it in ${brand.name}'s WhatsApp group`}</span>
              </span>
            </button>
          </div>
          <div className={s.message}>
            <div className={s.messageHead}>
              <span className={s.caps}>WHATSAPP MESSAGE · YOU CAN EDIT IT</span>
              <button type="button" className={s.close} onClick={copy} disabled={!text} title="Copy message" aria-label="Copy message"><LeadIcon name="copy" size={15} /></button>
            </div>
            <textarea className={s.waText} rows={11} value={text} onChange={e => setText(e.target.value)} disabled={!chosen && !toGroup} aria-label="WhatsApp message" />
            {error ? <div className={s.error} role="alert">{error}</div> : null}
            <div className={s.windowFoot}>
              <span className={s.hint}>{toGroup ? `Copies this message — paste it in ${brand.name}'s sales group on WhatsApp.` : `Opens WhatsApp to ${chosen?.name ?? 'them'} with this message.`}</span>
              <button type="button" className={s.markBtn} onClick={go} disabled={(!chosen && !toGroup) || busy || !text.trim()}>{busy ? 'Handing over…' : toGroup ? 'Copy & mark as handed' : 'Mark as handed'}</button>
            </div>
          </div>
        </div>
      </div>
      {copied ? <div className={s.toast} aria-live="polite"><span>Copied</span></div> : null}
    </div>
  )
}
