'use client'

import { useState, useTransition } from 'react'
import { officeTime } from '@/lib/office-time'
import { saveLeadCard, setLeadOutcome } from '@/lib/leads/actions'
import { isVisitDate, phoneStage, phoneSteps } from '@/lib/leads/inbox'
import { copyText } from '@/lib/leads/clipboard'
import { handedTo, handoffText } from '@/lib/leads/handoff'
import { formatPhone } from '@/lib/leads/phone'
import { whenFull } from '@/lib/leads/time'
import type { Appt, LeadBrand, LeadCardFields, LeadContact, LeadLabel, Shown } from '@/lib/leads/types'
import { CHANNEL_LABEL } from './bits'
import HandoffWindow from './HandoffWindow'
import LabelPicker from './LabelPicker'
import s from './inbox.module.css'

/**
 * The customer (Inbox v2's right-hand column, 2026-10-22): who they are; the PHONE card — found in the chat and
 * confirmed, or typed — with its three steps and the hand-over to the brand's sales; FOR THE SALESPERSON, what the
 * salesperson needs (a note the customer never sees). Since 2026-10-23 (the user) the TIMELINE is its own panel on the
 * Inbox's right, folded until opened, and Promotions consent is off the card (a test's consent is no longer set by hand).
 */
export default function CustomerCard({ contact, brand, canEdit, canManage = false, labels = [], csName, onSaved }: {
  contact: LeadContact
  csName: string
  brand: LeadBrand | undefined
  canEdit: boolean
  canManage?: boolean
  /** Customer Service's labels (mig 20261027190000). */
  labels?: LeadLabel[]
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
  // Copy for sales before there is a confirmed phone (2026-10-27 — the user: "没有…电话号码也可以复制"): the hand-over's
  // message, to paste into the sales group; nothing is recorded — the hand-over itself still waits for the phone.
  const [copied, setCopied] = useState<'done' | 'failed' | null>(null)
  const copyForSales = async () => {
    setCopied((await copyText(handoffText(contact, brand?.name ?? '', null, csName))) ? 'done' : 'failed')
    window.setTimeout(() => setCopied(null), 2500)
  }

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
  const hint = stage === 'none' ? 'Get the phone first' : stage === 'detected' ? 'Confirm the number first' : !brand ? '' : brand.sales.length === 0 ? 'No salespeople yet — the message is copied for the sales group' : ''

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
              <span className={s.handedTitle}>Handed to {handedTo(contact)}</span>
              <span className={s.sub} style={{ color: 'rgb(var(--lv-text-2))' }}>{contact.handedAt ? whenFull(contact.handedAt) : ''} · by {contact.handedByName} · via WhatsApp</span>
            </div>
            <Outcome contact={contact} canEdit={canEdit} onSaved={onSaved} />
            {canEdit && brand ? <button type="button" className={s.textLink} onClick={() => setHanding(true)}>Hand again →</button> : null}
          </div>
        )}

        {stage !== 'handed' && canEdit && brand ? (
          <div className={s.phoneBody} style={{ paddingTop: 0, gap: 6 }}>
            <button type="button" className={s.handBtn} onClick={() => setHanding(true)} disabled={stage !== 'confirmed'}>
              Hand over to {brand.name} sales
            </button>
            {hint ? <span className={s.handHint}>{hint}</span> : null}
            {stage !== 'confirmed' ? (
              <button type="button" className={s.textLink} style={{ alignSelf: 'center' }} onClick={copyForSales}>
                {copied === 'done' ? 'Copied — paste it to the sales group' : copied === 'failed' ? 'Could not copy — try again' : 'Copy details for sales'}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <LabelPicker contact={contact} labels={labels} canEdit={canEdit} canManage={canManage} onSaved={onSaved} />

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

      {handing && brand ? (
        <HandoffWindow contact={{ ...contact, ...form, name: form.name || contact.name }} brand={brand} csName={csName}
          onClose={() => setHanding(false)} onDone={() => { setHanding(false); onSaved() }} />
      ) : null}
    </>
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
