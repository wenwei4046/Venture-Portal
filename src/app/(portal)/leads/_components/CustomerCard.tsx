'use client'

import { useState, useTransition } from 'react'
import { btn } from '@/components/hrv/kit'
import { saveLeadCard, setLeadOutcome, setOptIn } from '@/lib/leads/actions'
import type { OptIn } from '@/lib/leads/campaign'
import { formatPhone } from '@/lib/leads/phone'
import { whenFull } from '@/lib/leads/time'
import type { Appt, LeadBrand, LeadCardFields, LeadContact, LeadEvent, Shown } from '@/lib/leads/types'
import { Bi, CHANNEL_LABEL } from './bits'
import AdInfo from './AdInfo'
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
        <span className={s.hint}>{CHANNEL_LABEL[contact.channel]} · first contact {whenFull(contact.createdAt)}</span>
      </div>

      <AdInfo contact={contact} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className={s.label}><Bi en="Phone" zh="电话" /></span>
        {contact.phoneState === 'none' ? (
          <div className={s.phoneNone}><Bi block en="Not yet. When the customer types a number in the chat, it fills in here." zh="还没拿到。客户在对话里打出电话号码，系统会自动填入。" /></div>
        ) : (
          <div className={s.phoneBox} data-state={contact.phoneState}>
            <span style={{ flex: 1 }}>{formatPhone(contact.phone)}</span>
            {contact.phoneState === 'detected' && canEdit ? (
              <button type="button" className={btn('primary')} disabled={saving} onClick={() => save({ phone: contact.phone ?? '' })}><Bi en="Confirm" zh="确认" /></button>
            ) : null}
            {contact.phoneState === 'confirmed' ? <span className={s.hint}><Bi en="Confirmed" zh="已确认" /></span> : null}
          </div>
        )}
        {contact.phoneState === 'detected' ? <span className={s.hint}><Bi en="Found in the customer's message — please confirm." zh="从客户的消息自动侦测，请确认。" /></span> : null}
      </div>

      {canEdit ? (
        <div className={s.fieldGrid}>
          <label className={`${s.field} ${s.wide}`}><Bi en="Name" zh="名字" /><input value={form.name} onChange={set('name')} maxLength={80} /></label>
          <label className={`${s.field} ${s.wide}`}><Bi en="Phone (typed)" zh="电话（手动输入）" /><input value={form.phone} onChange={set('phone')} inputMode="tel" placeholder="012-345 6789" /></label>
          <label className={s.field}><Bi en="Interest" zh="意向" /><input value={form.interest} onChange={set('interest')} maxLength={120} /></label>
          <label className={s.field}><Bi en="Budget" zh="预算" /><input value={form.budget} onChange={set('budget')} maxLength={60} /></label>
          <label className={s.field}>
            <Bi en="Showroom" zh="分店" />
            <input value={form.showroom} onChange={set('showroom')} maxLength={60} list={`rooms-${contact.id}`} />
            <datalist id={`rooms-${contact.id}`}>
              {[...new Set((brand?.sales ?? []).map(x => x.showroom).filter(Boolean))].map(r => <option key={r} value={r} />)}
            </datalist>
          </label>
          <label className={s.field}><Bi en="When" zh="方便的时间" /><input value={form.preferredTime} onChange={set('preferredTime')} maxLength={60} /></label>
          <label className={`${s.field} ${s.wide}`}><Bi en="Note (customer never sees it)" zh="内部备注" /><textarea value={form.note} onChange={set('note')} maxLength={1000} /></label>
          <div className={`${s.actions} ${s.wide}`}>
            <button type="button" className={btn('outline')} onClick={saveChanged} disabled={saving || changed.length === 0}>{saving ? 'Saving…' : <Bi en="Save" zh="保存" />}</button>
            {saved && changed.length === 0 ? <span className={s.hint}><Bi en="Saved" zh="已保存" /></span> : null}
          </div>
        </div>
      ) : null}
      {error ? <div className={s.error} role="alert">{error}</div> : null}

      {contact.handedAt ? (
        <div className={s.handed}>
          <span className={s.handedTitle}>Handed to {contact.handedSalesName}</span>
          <span className={s.hint}>{whenFull(contact.handedAt)} · {contact.handedByName}</span>
          {canEdit ? <Outcome contact={contact} onSaved={onSaved} /> : (
            <span className={s.hint}>Booked: {APPT[contact.appt]} · Came: {SHOWN[contact.shown]}</span>
          )}
          {canEdit && brand ? <button type="button" className={btn('outline')} onClick={() => setHanding(true)}><Bi en="Hand again" zh="再转交" /></button> : null}
        </div>
      ) : canEdit && brand ? (
        <button type="button" className={btn('primary')} style={{ minHeight: 44 }} onClick={() => setHanding(true)} disabled={!contact.phone}
          title={contact.phone ? undefined : 'Get the phone first'}>
          Hand over to {brand.name} sales
        </button>
      ) : null}

      <Promotions contact={contact} canEdit={canEdit} onSaved={onSaved} />

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

const OPT_IN: Readonly<Record<OptIn, { en: string; zh: string; tone: string }>> = {
  none: { en: 'Not asked', zh: '未同意', tone: 'plum' },
  in: { en: 'Agreed', zh: '已同意', tone: 'olive' },
  out: { en: 'Unsubscribed', zh: '已退订', tone: 'clay' },
}

/**
 * Promotions consent (Campaigns, mig 20261016340000): past 24 hours a campaign reaches only who agreed. A real
 * customer agrees through Meta; a test conversation's is set here, to try Campaigns before Meta is connected.
 */
function Promotions({ contact, canEdit, onSaved }: { contact: LeadContact; canEdit: boolean; onSaved: () => void }) {
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const state = contact.optIn ?? 'none'
  const put = (next: OptIn) => start(async () => {
    setError(null)
    const r = await setOptIn(contact.id, next)
    if (!r.ok) setError(r.reason)
    else onSaved()
  })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className={s.label}><Bi en="Promotions" zh="推广消息" /></span>
      <div className={s.inline} style={{ alignItems: 'center' }}>
        <span className={s.brand} data-tone={OPT_IN[state].tone}>{OPT_IN[state].en}</span>
        {canEdit && contact.isTest ? (Object.keys(OPT_IN) as OptIn[]).filter(k => k !== state).map(k => (
          <button key={k} type="button" className={s.linkBtn} disabled={busy} onClick={() => put(k)}>Set {OPT_IN[k].en.toLowerCase()} (test)</button>
        )) : null}
      </div>
      {!contact.isTest ? <span className={s.hint}><Bi en="Comes from Meta once connected." zh="串接 Meta 后由客户在 Meta 同意。" /></span> : null}
      {error ? <div className={s.error} role="alert">{error}</div> : null}
    </div>
  )
}

const APPT: Readonly<Record<Appt, string>> ={ unknown: 'Not known', booked: 'Booked', not_booked: 'Not booked' }
const SHOWN: Readonly<Record<Shown, string>> = { unknown: 'Not known', came: 'Came', no_show: 'No show' }

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
      <label className={s.field}><Bi en="Appointment" zh="预约" />
        <select value={contact.appt} disabled={busy} onChange={e => put(e.target.value as Appt, contact.shown)}>
          {(Object.keys(APPT) as Appt[]).map(k => <option key={k} value={k}>{APPT[k]}</option>)}
        </select>
      </label>
      <label className={s.field}><Bi en="Came" zh="到店" />
        <select value={contact.shown} disabled={busy} onChange={e => put(contact.appt, e.target.value as Shown)}>
          {(Object.keys(SHOWN) as Shown[]).map(k => <option key={k} value={k}>{SHOWN[k]}</option>)}
        </select>
      </label>
      {error ? <div className={`${s.error} ${s.wide}`} role="alert">{error}</div> : null}
    </div>
  )
}

