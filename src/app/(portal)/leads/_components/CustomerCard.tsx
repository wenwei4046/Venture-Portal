'use client'

import { useState, useTransition } from 'react'
import { btn } from '@/components/hrv/kit'
import { saveLeadCard, setLeadOutcome } from '@/lib/leads/actions'
import { formatPhone } from '@/lib/leads/phone'
import { whenFull } from '@/lib/leads/time'
import type { Appt, LeadBrand, LeadCardFields, LeadContact, LeadEvent, Shown } from '@/lib/leads/types'
import { CHANNEL_LABEL } from './bits'
import HandoffWindow from './HandoffWindow'
import s from './lead.module.css'

/**
 * The customer card (the canvas's right-hand column): the phone — found in a message and confirmed, or typed —
 * what they want, where and when, a note only Customer Service sees, the hand-over and what came of it, and
 * the conversation's timeline.
 */
export default function CustomerCard({ contact, events, brand, canEdit, csName, onSaved }: {
  contact: LeadContact
  csName: string
  events: LeadEvent[]
  brand: LeadBrand | undefined
  canEdit: boolean
  onSaved: () => void
}) {
  const start: Required<LeadCardFields> = {
    name: contact.name, phone: contact.phone ? formatPhone(contact.phone) : '', interest: contact.interest, budget: contact.budget,
    showroom: contact.showroom, preferredTime: contact.preferredTime, note: contact.note,
  }
  const [form, setForm] = useState(start)
  const [saving, startSaving] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [handing, setHanding] = useState(false)

  const set = (k: keyof LeadCardFields) => (e: { target: { value: string } }) => { setSaved(false); setForm(f => ({ ...f, [k]: e.target.value })) }
  const changed = (Object.keys(form) as Array<keyof LeadCardFields>).filter(k => form[k] !== start[k])
  const save = (fields: LeadCardFields) => {
    setError(null)
    startSaving(async () => {
      const r = await saveLeadCard(contact.id, fields)
      if (!r.ok) { setError(r.reason); return }
      setSaved(true)
      onSaved()
    })
  }
  const saveChanged = () => save(Object.fromEntries(changed.map(k => [k, form[k]])) as LeadCardFields)

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className={s.label}>Customer</span>
        <span className={s.cardName}>{contact.name || '—'}</span>
        <span className={s.hint}>{CHANNEL_LABEL[contact.channel]} · 首次聯絡 first contact {whenFull(contact.createdAt)}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className={s.label}>電話 Phone</span>
        {contact.phoneState === 'none' ? (
          <div className={s.phoneNone}>還沒拿到。客戶在對話裡打出電話號碼，系統會自動填入。</div>
        ) : (
          <div className={s.phoneBox} data-state={contact.phoneState}>
            <span style={{ flex: 1 }}>{formatPhone(contact.phone)}</span>
            {contact.phoneState === 'detected' && canEdit ? (
              <button type="button" className={btn('primary')} disabled={saving} onClick={() => save({ phone: contact.phone ?? '' })}>確認 Confirm</button>
            ) : null}
            {contact.phoneState === 'confirmed' ? <span className={s.hint}>已確認</span> : null}
          </div>
        )}
        {contact.phoneState === 'detected' ? <span className={s.hint}>從客戶的訊息自動偵測，請確認。</span> : null}
      </div>

      {canEdit ? (
        <div className={s.fieldGrid}>
          <label className={`${s.field} ${s.wide}`}>名字 Name<input value={form.name} onChange={set('name')} maxLength={80} /></label>
          <label className={`${s.field} ${s.wide}`}>電話 Phone（手動輸入）<input value={form.phone} onChange={set('phone')} inputMode="tel" placeholder="012-345 6789" /></label>
          <label className={s.field}>意向 Interest<input value={form.interest} onChange={set('interest')} maxLength={120} /></label>
          <label className={s.field}>預算 Budget<input value={form.budget} onChange={set('budget')} maxLength={60} /></label>
          <label className={s.field}>
            分店 Showroom
            <input value={form.showroom} onChange={set('showroom')} maxLength={60} list={`rooms-${contact.id}`} />
            <datalist id={`rooms-${contact.id}`}>
              {[...new Set((brand?.sales ?? []).map(x => x.showroom).filter(Boolean))].map(r => <option key={r} value={r} />)}
            </datalist>
          </label>
          <label className={s.field}>方便的時間 When<input value={form.preferredTime} onChange={set('preferredTime')} maxLength={60} /></label>
          <label className={`${s.field} ${s.wide}`}>內部備註 Note（客戶看不到）<textarea value={form.note} onChange={set('note')} maxLength={1000} /></label>
          <div className={`${s.actions} ${s.wide}`}>
            <button type="button" className={btn('outline')} onClick={saveChanged} disabled={saving || changed.length === 0}>{saving ? '儲存中…' : '儲存 Save'}</button>
            {saved && changed.length === 0 ? <span className={s.hint}>已儲存</span> : null}
          </div>
        </div>
      ) : null}
      {error ? <div className={s.error} role="alert">{error}</div> : null}

      {contact.handedAt ? (
        <div className={s.handed}>
          <span className={s.handedTitle}>已轉交 Handed to {contact.handedSalesName}</span>
          <span className={s.hint}>{whenFull(contact.handedAt)} · {contact.handedByName}</span>
          {canEdit ? <Outcome contact={contact} onSaved={onSaved} /> : (
            <span className={s.hint}>預約 {APPT[contact.appt]} · 到店 {SHOWN[contact.shown]}</span>
          )}
          {canEdit && brand ? <button type="button" className={btn('outline')} onClick={() => setHanding(true)}>再轉交 Hand again</button> : null}
        </div>
      ) : canEdit && brand ? (
        <button type="button" className={btn('primary')} style={{ minHeight: 44 }} onClick={() => setHanding(true)} disabled={!contact.phone}
          title={contact.phone ? undefined : '先拿到客戶電話 Get the phone first'}>
          轉交給 {brand.name} 銷售 Hand over
        </button>
      ) : null}

      <div className={s.timeline}>
        <span className={s.label}>Timeline</span>
        {events.length === 0 ? <span className={s.hint}>—</span> : events.map((e, i) => (
          <div key={i} className={s.event}>
            <span className={s.eventAt}>{whenFull(e.at)}</span>
            <span>{e.what}<span className={s.hint}> · {e.by}</span></span>
          </div>
        ))}
      </div>

      {handing && brand ? (
        <HandoffWindow contact={{ ...contact, ...pickCard(form, contact) }} brand={brand} csName={csName} onClose={() => setHanding(false)} onDone={() => { setHanding(false); onSaved() }} />
      ) : null}
    </>
  )
}

/** What the card holds now (typed, not saved yet) — the hand-over's text reads it. */
function pickCard(form: Required<LeadCardFields>, contact: LeadContact): Partial<LeadContact> {
  return { name: form.name || contact.name, interest: form.interest, budget: form.budget, showroom: form.showroom, preferredTime: form.preferredTime, note: form.note }
}

const APPT: Readonly<Record<Appt, string>> = { unknown: '未知', booked: '已預約', not_booked: '沒約到' }
const SHOWN: Readonly<Record<Shown, string>> = { unknown: '未知', came: '到了', no_show: '沒來' }

function Outcome({ contact, onSaved }: { contact: LeadContact; onSaved: () => void }) {
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const put = (appt: Appt, shown: Shown) => start(async () => {
    setError(null)
    const r = await setLeadOutcome(contact.id, appt, shown)
    if (!r.ok) setError(r.reason)
    else onSaved()
  })
  return (
    <div className={s.fieldGrid}>
      <label className={s.field}>預約 Appointment
        <select value={contact.appt} disabled={busy} onChange={e => put(e.target.value as Appt, contact.shown)}>
          {(Object.keys(APPT) as Appt[]).map(k => <option key={k} value={k}>{APPT[k]}</option>)}
        </select>
      </label>
      <label className={s.field}>到店 Came
        <select value={contact.shown} disabled={busy} onChange={e => put(contact.appt, e.target.value as Shown)}>
          {(Object.keys(SHOWN) as Shown[]).map(k => <option key={k} value={k}>{SHOWN[k]}</option>)}
        </select>
      </label>
      {error ? <div className={`${s.error} ${s.wide}`} role="alert">{error}</div> : null}
    </div>
  )
}

