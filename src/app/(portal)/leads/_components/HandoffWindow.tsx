'use client'

import { useEffect, useState, useTransition } from 'react'
import { btn } from '@/components/hrv/kit'
import { handLeadOver } from '@/lib/leads/actions'
import { handoffText, suggestedSales } from '@/lib/leads/handoff'
import { formatPhone, whatsAppLink } from '@/lib/leads/phone'
import type { LeadBrand, LeadContact } from '@/lib/leads/types'
import { initials } from './bits'
import s from './lead.module.css'

/**
 * Hand a lead to one of the brand's salespeople (the user: 轉交方式 — 可以). The rotation suggests the one with
 * the fewest leads this week; Customer Service may pick anybody on the list. The WhatsApp message is filled in
 * and may be changed; Hand over records it (lead_handoff) and opens WhatsApp with it.
 */
export default function HandoffWindow({ contact, brand, csName, onClose, onDone }: {
  contact: LeadContact
  csName: string
  brand: LeadBrand
  onClose: () => void
  onDone: () => void
}) {
  const next = suggestedSales(brand)
  const [pick, setPick] = useState<string | null>(brand.handoffMode === 'rotate' ? next?.id ?? null : null)
  const chosen = brand.sales.find(x => x.id === pick) ?? null
  const [text, setText] = useState('')
  const [edited, setEdited] = useState(false)
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // The text follows the salesperson picked until Customer Service changes it by hand.
  useEffect(() => {
    if (!edited) setText(chosen ? handoffText(contact, brand.name, chosen, csName) : '')
  }, [chosen, contact, brand.name, csName, edited])

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [busy, onClose])

  const go = () => {
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
    <div className={s.scrim} onClick={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div className={s.window} role="dialog" aria-modal="true" aria-label="Hand over to sales">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 className={s.windowTitle} style={{ flex: 1 }}>轉交給 {brand.name} 銷售</h2>
          <button type="button" className={btn('outline')} onClick={onClose} disabled={busy} aria-label="Close">✕</button>
        </div>
        {brand.sales.length === 0 ? (
          <div className={s.error}>{brand.name} 還沒有銷售名單 — 先到 Settings 加銷售。</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} role="group" aria-label="Salesperson">
            {brand.sales.map(x => (
              <button key={x.id} type="button" className={s.salesRow} aria-pressed={x.id === pick} onClick={() => setPick(x.id)}>
                <span className={s.avatar} aria-hidden="true">{initials(x.name)}</span>
                <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span className={s.salesName}>{x.name}</span>
                  <span className={s.salesMeta}>{formatPhone(x.phone)}{x.showroom ? ` · ${x.showroom}` : ''} · 本週 {x.week}</span>
                </span>
                {next?.id === x.id ? <span className={s.brand} data-tone="clay">輪到他 Next</span> : null}
              </button>
            ))}
          </div>
        )}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className={s.hint}>WhatsApp 內容（可以改）</span>
          <textarea className={s.preview} value={text} onChange={e => { setEdited(true); setText(e.target.value) }} disabled={!chosen} />
        </label>
        {error ? <div className={s.error} role="alert">{error}</div> : null}
        <div className={s.actions} style={{ justifyContent: 'flex-end' }}>
          <button type="button" className={btn('outline')} onClick={onClose} disabled={busy}>取消 Cancel</button>
          <button type="button" className={btn('primary')} onClick={go} disabled={!chosen || busy || !text.trim()}>
            {busy ? '轉交中…' : '打開 WhatsApp 並標記已轉交'}
          </button>
        </div>
      </div>
    </div>
  )
}
