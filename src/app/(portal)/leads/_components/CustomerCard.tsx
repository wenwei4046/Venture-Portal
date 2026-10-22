'use client'

import { useState, useTransition } from 'react'
import { officeTime } from '@/lib/office-time'
import { saveLeadCard, setLeadOutcome, setOptIn } from '@/lib/leads/actions'
import type { OptIn } from '@/lib/leads/campaign'
import { isVisitDate, phoneStage, phoneSteps } from '@/lib/leads/inbox'
import { formatPhone } from '@/lib/leads/phone'
import { whenFull } from '@/lib/leads/time'
import type { Appt, LeadBrand, LeadCardFields, LeadContact, LeadEvent, Shown } from '@/lib/leads/types'
import { CHANNEL_LABEL } from './bits'
import HandoffWindow from './HandoffWindow'
import s from './inbox.module.css'

/**
 * The customer (Inbox v2's right-hand column, 2026-10-22): who they are; the PHONE card — found in the chat and
 * confirmed, or typed — with its three steps and the hand-over to the brand's sales; FOR THE SALESPERSON, what the
 * salesperson needs (a note the customer never sees); Promotions consent (production's, which the handoff keeps in
 * its logic); and the TIMELINE, newest first.
 */
export default function CustomerCard({ contact, events, brand, canEdit, csName, onSaved }: {
  contact: LeadContact
  csName: string
  events: LeadEvent[]
  brand: LeadBrand | undefined
  canEdit: boolean
  onSaved: () => void
}) {
  const start: Required<Omit<LeadCardFields, 'phone'>> = {
    name: contact.name, interest: contact.interest, budget: contact.budget,
    showroom: contact.showroom, preferredTime: contact.preferredTime, note: contact.note,
  }
  const [form, setForm] = useState(start)
  const [typed, setTyped] = useState('')
  const [saving, startSaving] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [handing, setHanding] = useState(false)

  const stage = phoneStage(contact)
  const set = (k: keyof typeof start) => (e: { target: { value: string } }) => { setSavedAt(null); setForm(f => ({ ...f, [k]: e.target.value })) }
  const changed = (Object.keys(form) as Array<keyof typeof start>).filter(k => form[k] !== start[k])
  const save = (fields: LeadCardFields, after?: () => void) => {
    setError(null)
    startSaving(async () => {
      const r = await saveLeadCard(contact.id, fields)
      if (!r.ok) { setError(r.reason); return }
      after?.()
      onSaved()
    })
  }
  const saveForm = () => save(Object.fromEntries(changed.map(k => [k, form[k]])) as LeadCardFields, () => setSavedAt(officeTime().format('HH:mm')))
  const rooms = [...new Set([...(brand?.sales ?? []).map(x => x.showroom).filter(Boolean), ...(form.showroom ? [form.showroom] : [])])]
  const datebox = !form.preferredTime || isVisitDate(form.preferredTime)
  const hint = stage === 'none' ? 'Get the phone first' : stage === 'detected' ? 'Confirm the number first' : !brand ? '' : brand.sales.length === 0 ? `${brand.name} has no salespeople yet — add them in Settings` : ''

  return (
    <>
      <div className={s.block}>
        <span className={s.caps}>CUSTOMER</span>
        <span className={s.bigName}>{contact.name || '—'}</span>
        <span className={s.sub}>{CHANNEL_LABEL[contact.channel]} · first contact {whenFull(contact.createdAt)}</span>
      </div>

      <div className={s.phoneCard} data-stage={stage}>
        <div className={s.phoneTop}>
          <span className={s.caps}>PHONE</span>
          {phoneSteps(stage).map(st => (
            <span key={st.label} className={s.step} data-reached={st.reached || undefined}><span className={s.stepDot} aria-hidden="true" />{st.label}</span>
          ))}
        </div>

        {stage === 'none' ? (
          <div className={s.phoneBody} style={{ paddingTop: 10, gap: 10 }}>
            <span className={s.noPhone}>No phone yet</span>
            {canEdit ? (
              <form className={s.row6} style={{ flexWrap: 'nowrap' }} onSubmit={e => { e.preventDefault(); if (typed.trim()) save({ phone: typed }, () => setTyped('')) }}>
                <input className={s.input} style={{ flex: 1, height: 34 }} value={typed} onChange={e => setTyped(e.target.value)} inputMode="tel" placeholder="012-345 6789" aria-label="Phone" />
                <button type="submit" className={s.btn} style={{ height: 34, borderRadius: 6 }} disabled={saving || !typed.trim()}>Add</button>
              </form>
            ) : null}
          </div>
        ) : stage === 'detected' ? (
          <div className={s.phoneBody}>
            <span className={s.number}>{formatPhone(contact.phone)}</span>
            <span className={s.sub}>Found in the chat{contact.phoneAt ? ` · ${whenFull(contact.phoneAt)}` : ''}</span>
            {canEdit ? (
              <div className={s.row6}>
                <button type="button" className={s.confirm} disabled={saving} onClick={() => save({ phone: contact.phone ?? '' })}>Confirm number</button>
                <button type="button" className={s.btn} data-quiet="" disabled={saving} onClick={() => save({ phone: '' })}>Not a phone</button>
              </div>
            ) : null}
          </div>
        ) : stage === 'confirmed' ? (
          <div className={s.phoneBody} style={{ gap: 6 }}>
            <span className={s.number} data-ok="">{formatPhone(contact.phone)}</span>
            <span className={`${s.sub} ${s.greenText}`}>Confirmed{contact.phoneAt ? ` · ${whenFull(contact.phoneAt)}` : ''}</span>
          </div>
        ) : (
          <div className={s.phoneBody} style={{ gap: 10 }}>
            <span className={s.number} data-ok="">{formatPhone(contact.phone)}</span>
            <div className={s.handedBox}>
              <span className={s.handedTitle}>Handed to {contact.handedSalesName}</span>
              <span className={s.sub} style={{ color: 'rgb(var(--lv-text-2))' }}>{contact.handedAt ? whenFull(contact.handedAt) : ''} · by {contact.handedByName} · via WhatsApp</span>
            </div>
            <Outcome contact={contact} canEdit={canEdit} onSaved={onSaved} />
            {canEdit && brand ? <button type="button" className={s.textLink} onClick={() => setHanding(true)}>Hand again →</button> : null}
          </div>
        )}

        {stage !== 'handed' && canEdit && brand ? (
          <div className={s.phoneBody} style={{ paddingTop: 0, gap: 6 }}>
            <button type="button" className={s.handBtn} onClick={() => setHanding(true)} disabled={stage !== 'confirmed' || brand.sales.length === 0}>
              Hand over to {brand.name} sales
            </button>
            {hint ? <span className={s.handHint}>{hint}</span> : null}
          </div>
        ) : null}
      </div>

      <div className={s.form}>
        <span className={s.caps}>FOR THE SALESPERSON</span>
        <label className={s.field}>Name
          <input className={s.input} value={form.name} onChange={set('name')} maxLength={80} disabled={!canEdit} />
        </label>
        <div className={s.two}>
          <label className={s.field}>Interest
            <input className={s.input} value={form.interest} onChange={set('interest')} maxLength={120} placeholder="e.g. L-shape sofa" disabled={!canEdit} />
          </label>
          <label className={s.field}>Budget
            <input className={s.input} value={form.budget} onChange={set('budget')} maxLength={60} placeholder="e.g. RM 3,000" disabled={!canEdit} />
          </label>
          <label className={s.field}>Showroom
            <select className={s.input} value={form.showroom} onChange={set('showroom')} disabled={!canEdit}>
              <option value="">—</option>
              {rooms.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label className={s.field}>Date
            {datebox
              ? <input className={s.input} type="date" value={form.preferredTime} onChange={set('preferredTime')} disabled={!canEdit} />
              : <input className={s.input} value={form.preferredTime} onChange={set('preferredTime')} maxLength={60} disabled={!canEdit} title="Typed before the date box — clear it to pick a day" />}
          </label>
        </div>
        <label className={s.field}>Note · the customer never sees it
          <textarea className={s.input} rows={2} value={form.note} onChange={set('note')} maxLength={1000} disabled={!canEdit} />
        </label>
        {canEdit ? (
          <div className={s.row6} style={{ gap: 10 }}>
            <button type="button" className={s.btn} style={{ padding: '6px 14px' }} onClick={saveForm} disabled={saving || changed.length === 0}>{saving ? 'Saving…' : 'Save'}</button>
            {savedAt && changed.length === 0 ? <span className={s.saved}>Saved · {savedAt}</span> : null}
          </div>
        ) : null}
        {error ? <div className={s.error} role="alert">{error}</div> : null}
      </div>

      <Promotions contact={contact} canEdit={canEdit} onSaved={onSaved} />

      <div className={s.timeline}>
        <span className={s.caps}>TIMELINE</span>
        {events.length === 0 ? <span className={s.sub}>—</span> : [...events].reverse().map((e, i) => (
          <div key={i} className={s.event}>
            <span className={s.eventAt}>{whenFull(e.at)}</span>
            <span>{e.what}{e.by ? <span className={s.sub}> · {e.by}</span> : null}</span>
          </div>
        ))}
      </div>

      {handing && brand ? (
        <HandoffWindow contact={{ ...contact, ...form, name: form.name || contact.name }} brand={brand} csName={csName}
          onClose={() => setHanding(false)} onDone={() => { setHanding(false); onSaved() }} />
      ) : null}
    </>
  )
}

const OPT_IN: ReadonlyArray<{ id: OptIn; label: string; tone: string }> = [
  { id: 'none', label: 'Not asked', tone: 'quiet' },
  { id: 'in', label: 'Agreed', tone: 'green' },
  { id: 'out', label: 'Unsubscribed', tone: 'red' },
]

/**
 * Promotions consent (Campaigns, mig 20261016340000): past 24 hours a campaign reaches only who agreed. A real
 * customer agrees through Meta; a test conversation's is set here, to try Campaigns before Meta is connected.
 */
function Promotions({ contact, canEdit, onSaved }: { contact: LeadContact; canEdit: boolean; onSaved: () => void }) {
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const state = contact.optIn ?? 'none'
  const may = canEdit && contact.isTest
  const put = (next: OptIn) => start(async () => {
    setError(null)
    const r = await setOptIn(contact.id, next)
    if (!r.ok) setError(r.reason)
    else onSaved()
  })
  return (
    <div className={s.block} style={{ gap: 6 }}>
      <span className={s.caps}>PROMOTIONS</span>
      <div className={s.pills}>
        {OPT_IN.map(o => (
          <button key={o.id} type="button" className={s.pill} data-tone={o.tone} aria-pressed={state === o.id}
            disabled={!may || busy || state === o.id} onClick={() => put(o.id)}>{o.label}</button>
        ))}
      </div>
      <span className={s.sub} style={{ fontSize: 13 }}>{contact.isTest ? 'Set by hand on test conversations only.' : 'Set by the customer’s reply to a promotion.'}</span>
      {error ? <div className={s.error} role="alert">{error}</div> : null}
    </div>
  )
}

const APPT: Readonly<Record<Appt, string>> = { unknown: 'Not known', booked: 'Booked', not_booked: 'Not booked' }
const SHOWN: Readonly<Record<Shown, string>> = { unknown: 'Not known', came: 'Came', no_show: 'No show' }

function Outcome({ contact, canEdit, onSaved }: { contact: LeadContact; canEdit: boolean; onSaved: () => void }) {
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const put = (appt: Appt, shown: Shown) => start(async () => {
    setError(null)
    const r = await setLeadOutcome(contact.id, appt, shown)
    if (!r.ok) setError(r.reason)
    else onSaved()
  })
  return (
    <>
      <div className={s.two}>
        <label className={s.field}>Appointment
          <select className={s.input} style={{ fontSize: 14 }} value={contact.appt} disabled={busy || !canEdit} onChange={e => put(e.target.value as Appt, contact.shown)}>
            {(Object.keys(APPT) as Appt[]).map(k => <option key={k} value={k}>{APPT[k]}</option>)}
          </select>
        </label>
        <label className={s.field}>Came
          <select className={s.input} style={{ fontSize: 14 }} value={contact.shown} disabled={busy || !canEdit} onChange={e => put(contact.appt, e.target.value as Shown)}>
            {(Object.keys(SHOWN) as Shown[]).map(k => <option key={k} value={k}>{SHOWN[k]}</option>)}
          </select>
        </label>
      </div>
      {error ? <div className={s.error} role="alert">{error}</div> : null}
    </>
  )
}
