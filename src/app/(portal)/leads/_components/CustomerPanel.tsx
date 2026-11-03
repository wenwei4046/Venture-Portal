'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveLeadCard } from '@/lib/leads/actions'
import { isVisitDate, phoneLabel, phoneStage, visitShown } from '@/lib/leads/inbox'
import { copyText } from '@/lib/leads/clipboard'
import { handedTo, handoffText } from '@/lib/leads/handoff'
import { formatPhone } from '@/lib/leads/phone'
import { dayLabel, whenFull } from '@/lib/leads/time'
import { flash } from '@/components/hrv/toast'
import { LEAD_LANGUAGES, type LeadBrand, type LeadCardFields, type LeadContact, type LeadLabel } from '@/lib/leads/types'
import { LeadIcon, type LeadIconName } from '@/components/layout/lead-icons'
import HandoffWindow from './HandoffWindow'
import LabelPicker from './LabelPicker'
import s from './inbox.module.css'

type Draft = { name: string; phone: string; interest: string; budget: string; showroom: string; preferredTime: string; language: string; specialRequest: string; note: string }

const FIELDS: Array<{ icon: LeadIconName; k: string; key: keyof Draft }> = [
  { icon: 'sofa', k: 'Interest', key: 'interest' },
  { icon: 'wallet', k: 'Budget', key: 'budget' },
  { icon: 'map-pin', k: 'Showroom', key: 'showroom' },
  { icon: 'calendar', k: 'Visit', key: 'preferredTime' },
  { icon: 'languages', k: 'Language', key: 'language' },
  { icon: 'sparkles', k: 'Special request', key: 'specialRequest' },
]

/**
 * The Inbox's customer (Lead View v2, 2026-11-02 — the reference's lines 126–173): the name with *Open in Leads*, first
 * contact, the phone block (found / confirmed / added by you; ✓ / ✗ for a number found in the chat), *For the
 * salesperson* and the note. One pencil puts the whole panel into edit mode, with one Cancel / Save. A phone typed by
 * hand is kept as typed (mig 20261102100000). At the foot, the dashed *Hand over to {brand} sales*.
 *
 * Kept from before: the name is edited with the rest; Customer Service's labels; *Copy details for sales* while there is
 * no confirmed phone; who it was handed to.
 */
export default function CustomerPanel({ contact, brand, canEdit, canManage = false, labels = [], csName, onSaved }: {
  contact: LeadContact
  csName: string
  brand: LeadBrand | undefined
  canEdit: boolean
  canManage?: boolean
  labels?: LeadLabel[]
  onSaved: () => void
}) {
  const router = useRouter()
  const start: Draft = {
    name: contact.name, phone: contact.phone ? formatPhone(contact.phone) : '', interest: contact.interest, budget: contact.budget,
    showroom: contact.showroom, preferredTime: contact.preferredTime, language: contact.language ?? '', specialRequest: contact.specialRequest ?? '', note: contact.note,
  }
  const [editing, setEditing] = useState(false)
  const [d, setD] = useState<Draft>(start)
  const [saving, startSaving] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [handing, setHanding] = useState(false)
  const stage = phoneStage(contact)
  const has = !!contact.phone && contact.phoneState !== 'none'
  const ok = has && (contact.phoneState === 'confirmed' || !!contact.handedAt)
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setD(x => ({ ...x, [k]: e.target.value }))

  const save = (fields: LeadCardFields, after?: () => void) => {
    setError(null)
    startSaving(async () => {
      const r = await saveLeadCard(contact.id, fields)
      if (!r.ok) { setError(r.reason); return }
      after?.()
      onSaved()
    })
  }
  const begin = () => { setD(start); setError(null); setEditing(true) }
  const saveAll = () => {
    const fields: LeadCardFields = {}
    for (const k of Object.keys(d) as Array<keyof Draft>) {
      if (d[k] === start[k]) continue
      if (k === 'language') fields.language = d.language as LeadCardFields['language']
      else fields[k] = d[k]
    }
    if (!Object.keys(fields).length) { setEditing(false); return }
    save(fields, () => setEditing(false))
  }
  const copyForSales = async () => {
    flash((await copyText(handoffText(contact, brand?.name ?? '', null, csName))) ? 'Copied — paste it to the sales group' : 'Could not copy — try again')
  }
  const shownOf = (k: keyof Draft) => (k === 'preferredTime' ? visitShown(contact.preferredTime) : (contact[k as keyof LeadContact] as string | undefined) ?? '')

  return (
    <>
      <div className={s.custScroll}>
        <div className={s.custHead}>
          <div className={s.custTop}>
            {editing
              ? <input className={s.custNameInput} value={d.name} onChange={set('name')} maxLength={80} aria-label="Name" />
              : <span className={s.custName}>{contact.name || '—'}</span>}
            <button type="button" className={s.openLead} title="Open in Leads" aria-label="Open in Leads" onClick={() => router.push(`/leads/list?lead=${contact.id}`)}>
              <LeadIcon name="arrow-up-right" size={15} />
            </button>
          </div>
          <span className={s.custSince}>first contact {dayLabel(contact.createdAt)}</span>
        </div>

        <div className={s.phone}>
          <div className={s.phoneTop}>
            <span className={s.phoneLabel}>{phoneLabel(contact)}</span>
            {!editing && canEdit ? (
              <button type="button" className={s.pencil} title="Edit" aria-label="Edit" onClick={begin}><LeadIcon name="pencil" size={15} /></button>
            ) : null}
          </div>
          {editing ? (
            <input className={s.phoneInput} type="tel" value={d.phone} onChange={set('phone')} placeholder="Phone number" aria-label="Phone" maxLength={30} />
          ) : (
            <div className={s.phoneRow}>
              <span className={s.phoneValue} data-state={!has ? 'none' : ok ? 'ok' : undefined}>{has ? formatPhone(contact.phone) : 'No phone yet'}</span>
              {stage === 'detected' && canEdit ? (
                <>
                  <button type="button" className={s.ok} title="Confirm number" aria-label="Confirm number" disabled={saving} onClick={() => save({ phone: contact.phone ?? '' })}><LeadIcon name="check" size={16} /></button>
                  <button type="button" className={s.notPhone} title="Not a phone" aria-label="Not a phone" disabled={saving} onClick={() => save({ phone: '' })}><LeadIcon name="x" size={16} /></button>
                </>
              ) : null}
            </div>
          )}
        </div>

        <div className={s.fields}>
          <span className={s.fieldsTitle}>For the salesperson</span>
          {FIELDS.map(f => (
            <div key={f.key} className={s.field}>
              <span className={s.fieldKey}><LeadIcon name={f.icon} size={15} />{f.k}</span>
              {!editing ? (
                <span className={s.fieldValue} data-empty={shownOf(f.key) ? undefined : ''}>{shownOf(f.key) || '—'}</span>
              ) : f.key === 'language' ? (
                <select className={s.fieldInput} value={d.language} onChange={set('language')} aria-label={f.k}>
                  <option value="">—</option>
                  {LEAD_LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              ) : f.key === 'preferredTime' && (!d.preferredTime || isVisitDate(d.preferredTime)) ? (
                <input className={s.fieldInput} type="date" value={d.preferredTime} onChange={set('preferredTime')} aria-label={f.k} />
              ) : (
                <input className={s.fieldInput} type="text" value={d[f.key]} onChange={set(f.key)} placeholder={f.k} aria-label={f.k}
                  maxLength={f.key === 'specialRequest' ? 500 : f.key === 'interest' ? 120 : 60} />
              )}
            </div>
          ))}
          <LabelPicker contact={contact} labels={labels} canEdit={canEdit} canManage={canManage} onSaved={onSaved} />
          <div className={s.noteBlock}>
            <span className={s.noteKey}><LeadIcon name="sticky-note" size={15} />Note<span className={s.noteHint}>· only sales sees this</span></span>
            {editing
              ? <textarea className={s.noteInput} rows={3} value={d.note} onChange={set('note')} maxLength={1000} placeholder="Add a note for the salesperson" />
              : <span className={s.noteText} data-empty={contact.note ? undefined : ''}>{contact.note || 'No note yet'}</span>}
          </div>
          {editing ? (
            <div className={s.editFoot}>
              <button type="button" className={s.cancel} onClick={() => { setEditing(false); setError(null) }}>Cancel</button>
              <button type="button" className={s.save} onClick={saveAll} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          ) : null}
          {error ? <div className={s.error} role="alert" style={{ marginTop: 10 }}>{error}</div> : null}
        </div>

      </div>

      {brand ? (
        <div className={s.handFoot}>
          <button type="button" className={s.hand} onClick={() => (ok ? setHanding(true) : void copyForSales())} disabled={!canEdit}
            title={contact.handedAt ? `Handed to ${handedTo(contact)} · ${whenFull(contact.handedAt)}` : !ok ? 'No confirmed phone yet — copies the details for the sales group' : undefined}>
            <LeadIcon name="send" size={15} />Hand over to {brand.name} sales
          </button>
        </div>
      ) : null}

      {handing && brand ? (
        <HandoffWindow contact={contact} brand={brand} csName={csName}
          onClose={() => setHanding(false)} onDone={() => { setHanding(false); onSaved() }} />
      ) : null}
    </>
  )
}
