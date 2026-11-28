'use client'

import { useState, type CSSProperties } from 'react'
import { isVisitDate, phoneStage } from '@/lib/leads/inbox'
import { outletsFor, type LeadOutlet } from '@/lib/leads/outlets'
import { formatPhone } from '@/lib/leads/phone'
import { LEAD_LANGUAGES, type LeadCardFields, type LeadContact } from '@/lib/leads/types'
import { Ic } from './icons'
import { Avatar, ONE_LINE, Sheet, lv } from './parts'
import { firstContact, infoRows, initials } from './vm'

type Draft = { name: string; phone: string; interest: string; budget: string; showroom: string; preferredTime: string; language: string; specialRequest: string; note: string }

const draftOf = (c: LeadContact): Draft => ({
  name: c.name, phone: c.phone && c.phoneState !== 'none' ? formatPhone(c.phone) : '', interest: c.interest, budget: c.budget, showroom: c.showroom,
  preferredTime: c.preferredTime ?? '', language: c.language ?? '', specialRequest: c.specialRequest ?? '', note: c.note,
})

/** Only what was changed goes back (shared logins open the same customer on several phones). */
export function changedFields(was: Draft, now: Draft): LeadCardFields {
  const out: LeadCardFields = {}
  for (const k of Object.keys(now) as Array<keyof Draft>) {
    if (now[k] === was[k]) continue
    if (k === 'language') out.language = now.language as LeadCardFields['language']
    else out[k] = now[k]
  }
  return out
}

const EDIT_ROWS: Array<{ k: string; key: Exclude<keyof Draft, 'name' | 'note'>; max: number }> = [
  { k: 'Phone', key: 'phone', max: 30 },
  { k: 'Interest', key: 'interest', max: 120 },
  { k: 'Budget', key: 'budget', max: 60 },
  { k: 'Showroom', key: 'showroom', max: 60 },
  { k: 'Visit', key: 'preferredTime', max: 60 },
  { k: 'Language', key: 'language', max: 20 },
  { k: 'Special request', key: 'specialRequest', max: 500 },
]

/**
 * Customer info (the handoff's sheet — LeadPhone.dc.html lines 356–383): the head (avatar, name, first contact, Edit),
 * "{phone} · theirs?" while a number found in the chat waits, the field card, Copy details and Hand over to {brand} sales.
 *
 * Beyond the prototype (its Edit says "Not in this prototype"): Edit puts the card in edit mode as the desktop's pencil
 * does — the name and every field, Cancel / Save, only the changed fields saved; the Outlet row opens the outlet picker
 * and saves at once (the desktop's rule); Budget and Special request are rows of their own.
 */
export default function CustomerSheet({ open, contact, brandName, outlets, canEdit, busy, now, onConfirm, onNotPhone, onCopy, onHand, onSave, onOutlet }: {
  open: boolean
  contact: LeadContact | null
  brandName: string
  outlets: LeadOutlet[]
  canEdit: boolean
  busy: boolean
  now: Date
  onConfirm: () => void
  onNotPhone: () => void
  onCopy: () => void
  onHand: () => void
  /** Saves the changed fields; answers why not, or null once saved. */
  onSave: (fields: LeadCardFields) => Promise<string | null>
  /** 'none' or an outlet's id. */
  onOutlet: (choice: string) => void
}) {
  const [editing, setEditing] = useState<{ id: string; was: Draft; d: Draft } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const edit = editing && contact && editing.id === contact.id ? editing : null
  const c = contact
  const handed = !!c?.handedAt
  const found = !!c && !handed && phoneStage(c) === 'detected'
  const rows = c ? infoRows(c, outlets) : []
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setEditing(x => (x ? { ...x, d: { ...x.d, [k]: e.target.value } } : x))
  const begin = () => { if (!c) return; const d = draftOf(c); setError(null); setEditing({ id: c.id, was: d, d }) }
  const cancel = () => { setEditing(null); setError(null) }
  const save = async () => {
    if (!edit) return
    const fields = changedFields(edit.was, edit.d)
    if (!Object.keys(fields).length) { setEditing(null); return }
    setSaving(true)
    setError(null)
    const why = await onSave(fields)
    setSaving(false)
    if (why) setError(why)
    else setEditing(null)
  }
  const input: CSSProperties = { flex: 1, minWidth: 0, height: 22, margin: 0, padding: 0, border: 0, outline: 'none', background: 'transparent', font: 'inherit', fontSize: 16, fontWeight: 600, textAlign: 'right', color: lv('fg') }

  return (
    <Sheet open={open} label="Customer info" radius={24} maxHeight="88%">
      <span aria-hidden="true" style={{ alignSelf: 'center', flex: 'none', width: 36, height: 4, borderRadius: 2, background: lv('line') }} />
      {c ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar ini={initials(c.name || '?')} size={52} font={14.6} weight={650} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: edit ? 1 : undefined }}>
              {edit
                ? <input value={edit.d.name} onChange={set('name')} maxLength={80} aria-label="Name" placeholder="Name" style={{ ...input, textAlign: 'left', fontSize: 16.3, fontWeight: 700, height: 24 }} />
                : <strong style={{ ...ONE_LINE, fontSize: 16.3, fontWeight: 700 }}>{c.name || 'Customer'}</strong>}
              <span style={{ fontSize: 11.2, color: lv('fg-3') }}>{firstContact(c.createdAt, now)}</span>
            </div>
            {canEdit && !edit ? (
              <button type="button" onClick={begin}
                style={{ flex: 'none', marginLeft: 'auto', height: 34, padding: '0 14px', borderRadius: 17, border: `1px solid ${lv('line')}`, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.2, fontWeight: 650, color: lv('accent') }}>
                <Ic name="edit" size={14} />Edit
              </button>
            ) : null}
          </div>

          {found && !edit ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '6px 6px 6px 14px', borderRadius: 14, background: lv('accent-tint'), fontSize: 12, whiteSpace: 'nowrap' }}>
              <span style={{ width: 7, height: 7, flex: 'none', borderRadius: '50%', background: lv('accent') }} />
              <span style={{ ...ONE_LINE, flex: 1, minWidth: 0, fontWeight: 500, color: lv('accent') }}>{formatPhone(c.phone)} · theirs?</span>
              {canEdit ? (
                <>
                  <button type="button" onClick={onNotPhone} disabled={busy} style={{ flex: 'none', height: 44, padding: '0 8px', display: 'flex', alignItems: 'center', fontWeight: 500, color: lv('fg-3') }}>Not a phone</button>
                  <button type="button" onClick={onConfirm} disabled={busy} style={{ flex: 'none', height: 36, padding: '0 14px', borderRadius: 18, display: 'flex', alignItems: 'center', fontWeight: 600, background: lv('accent'), color: lv('surface') }}>Confirm</button>
                </>
              ) : null}
            </div>
          ) : null}

          <div style={{ display: 'flex', flexDirection: 'column', borderRadius: 14, border: `1px solid ${lv('line')}` }}>
            {edit ? (
              <>
                {EDIT_ROWS.map((r, n) => (
                  <label key={r.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', borderTop: n ? `1px solid ${lv('line')}` : 0, fontSize: 12 }}>
                    <span style={{ flex: 'none', color: lv('fg-3') }}>{r.k}</span>
                    {r.key === 'language' ? (
                      <select value={edit.d.language} onChange={set('language')} aria-label={r.k} style={{ ...input, appearance: 'none', textAlignLast: 'right' }}>
                        <option value="">—</option>
                        {LEAD_LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    ) : r.key === 'preferredTime' && (!edit.d.preferredTime || isVisitDate(edit.d.preferredTime)) ? (
                      <input type="date" value={edit.d.preferredTime} onChange={set('preferredTime')} aria-label={r.k} style={input} />
                    ) : (
                      <input type={r.key === 'phone' ? 'tel' : 'text'} value={edit.d[r.key]} onChange={set(r.key)} maxLength={r.max} placeholder="—" aria-label={r.k} style={input} />
                    )}
                  </label>
                ))}
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 14px', borderTop: `1px solid ${lv('line')}`, fontSize: 12 }}>
                  <span style={{ color: lv('fg-3') }}>Note</span>
                  <textarea value={edit.d.note} onChange={set('note')} maxLength={1000} rows={3} placeholder="Add a note for the salesperson" aria-label="Note"
                    style={{ ...input, height: 'auto', textAlign: 'left', fontWeight: 500, lineHeight: 1.4, resize: 'none' }} />
                </label>
              </>
            ) : rows.map((r, n) => (
              <div key={r.k} style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', gap: 12, padding: '12px 14px', borderTop: n ? `1px solid ${lv('line')}` : 0, fontSize: 12 }}>
                <span style={{ flex: 'none', color: lv('fg-3') }}>{r.k}</span>
                <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, textAlign: 'right' }}>
                  <strong style={{ fontWeight: 600, color: r.empty ? lv('disabled') : lv('fg'), overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{r.v}</strong>
                  {r.sub ? <span style={{ fontSize: 10.5, color: lv('fg-4') }}>{r.sub}</span> : null}
                </span>
                {r.k === 'Outlet' && canEdit ? (
                  // The outlet saves at once (the desktop's row): the phone's own picker over the row.
                  <select value={c.outletId ?? 'none'} onChange={e => onOutlet(e.target.value)} disabled={busy} aria-label="Outlet"
                    style={{ position: 'absolute', inset: 0, width: '100%', opacity: 0, cursor: 'pointer', fontSize: 16 }}>
                    {outletsFor(outlets, c.brandId).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    <option value="none">No outlet</option>
                  </select>
                ) : null}
              </div>
            ))}
          </div>
          {error ? <span role="alert" style={{ marginTop: -6, fontSize: 12, color: lv('accent') }}>{error}</span> : null}

          <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
            {edit ? (
              <>
                <button type="button" onClick={cancel} style={{ flex: 1, height: 50, borderRadius: 25, border: `1px solid ${lv('line')}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 500 }}>Cancel</button>
                <button type="button" onClick={() => void save()} disabled={saving}
                  style={{ flex: 1.6, height: 50, borderRadius: 25, background: lv('accent'), color: lv('surface'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 500 }}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={onCopy} style={{ flex: 1, height: 50, borderRadius: 25, border: `1px solid ${lv('line')}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 500 }}>Copy details</button>
                <button type="button" onClick={onHand} disabled={busy}
                  style={{ flex: 1.6, minWidth: 0, height: 50, borderRadius: 25, background: handed || !canEdit ? lv('disabled') : lv('accent'), color: lv('surface'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: '0 12px' }}>
                  {handed ? 'Handed over' : `Hand over to ${brandName} sales`}
                </button>
              </>
            )}
          </div>
        </>
      ) : null}
    </Sheet>
  )
}
