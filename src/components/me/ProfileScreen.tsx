'use client'

import type { CSSProperties } from 'react'
import { Button } from '@/components/ds/Button'
import { DescriptionList } from '@/components/ds/Data'
import { DsSelect, Field, TextField } from '@/components/ds/Field'
import MeAddressFields from './MeAddressFields'
import { isEmptyAddress } from '@/lib/address/address'
import { bankOptions, pendingBanner, recordCards, type ProfileForm } from '@/lib/me/profile'
import type { AttRequest } from '@/lib/attendance/types'
import type { MeRecord } from '@/lib/me/types'
import { BADGE } from './HubScreen'
import { Avatar, Banner, CameraGlyph, Label, Title } from './kit'

/**
 * Me › Profile (2026-10-17, the handoff's `pfViewing` / `pfEditing`): the record in four cards, and Edit profile —
 * every change goes to HR; the record updates once HR approves. While a change waits, the pencil opens it.
 */

const CARD: CSSProperties = { border: '1px solid var(--ds-border)', borderRadius: 12, padding: 14 }

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Label>{label}</Label>
      <div style={CARD}>{children}</div>
    </div>
  )
}

export function ProfileView({ record, name, roleLine, photo, pending, onPhoto, onEdit, onOpenPending, extra }: {
  record: MeRecord | null
  name: string
  roleLine: string
  photo: string | null
  pending: AttRequest | null
  onPhoto: () => void
  onEdit: () => void
  onOpenPending: () => void
  /** The HR app's account rows (password, email, notifications…), under the record. */
  extra?: React.ReactNode
}) {
  const c = recordCards(record)
  const banner = pending ? pendingBanner(pending) : null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button type="button" onClick={onPhoto} aria-label="Change profile photo" style={{ position: 'relative', width: 72, height: 72, padding: 0, border: 0, background: 'none', cursor: 'pointer', flex: 'none' }}>
          <Avatar name={name} size={72} tone="dark" photo={photo} />
          <span style={BADGE}><CameraGlyph /></span>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontFamily: 'var(--ds-font-display)', fontSize: 28, fontWeight: 'var(--ds-title-weight)' as CSSProperties['fontWeight'], letterSpacing: 'var(--ds-title-tracking)', lineHeight: 1.1 }}>{name}</h1>
          <p style={{ margin: '5px 0 0', fontSize: 13, color: 'var(--ds-ink-2)' }}>{roleLine}</p>
        </div>
        <button type="button" onClick={onEdit} aria-label="Edit profile" className="me-hover" style={{
          width: 44, height: 44, flex: 'none', borderRadius: 10, border: '1px solid var(--ds-border)', background: 'var(--ds-surface)', color: 'var(--ds-ink)',
          display: 'grid', placeItems: 'center', cursor: 'pointer', boxSizing: 'content-box', padding: 0,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" />
          </svg>
        </button>
      </div>
      {banner ? <Banner tone="warning" title={banner.title} action={<Button variant="secondary" size="sm" onClick={onOpenPending}>View</Button>}>{banner.body}</Banner> : null}
      <Section label="Contact"><DescriptionList items={c.contact} labelWidth={96} /></Section>
      <Section label="Emergency contact"><DescriptionList items={c.emergency} labelWidth={96} /></Section>
      <Section label="Salary account"><DescriptionList items={c.bank} labelWidth={96} /></Section>
      <Section label="Kept by HR"><DescriptionList items={c.hr} labelWidth={96} /></Section>
      {extra}
    </div>
  )
}

export function ProfileEdit({ form, set, record, clean, busy, onCancel, onSend, onNotice }: {
  form: ProfileForm
  set: (patch: Partial<ProfileForm>) => void
  record: MeRecord | null
  clean: boolean
  busy: boolean
  onCancel: () => void
  onSend: () => void
  /** "Before your first punch" again — its dialog says it is here. */
  onNotice: () => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Title title="Edit profile" sub="Every change goes to HR. Your record updates only after HR approves." />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Label>Contact</Label>
        <Field label="Mobile"><TextField value={form.phone} onChange={v => set({ phone: v })} /></Field>
        <Field label="Personal email"><TextField value={form.email} onChange={v => set({ email: v })} /></Field>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Label>Home address</Label>
        <MeAddressFields
          value={form.address}
          onChange={address => set({ address })}
          onFile={record?.address && isEmptyAddress(record.addressParts) ? record.address : null}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Label>Emergency contact</Label>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 10 }}>
          <Field label="Name"><TextField value={form.ecName} onChange={v => set({ ecName: v })} /></Field>
          <Field label="Relationship"><TextField value={form.ecRel} onChange={v => set({ ecRel: v })} /></Field>
        </div>
        <Field label="Their mobile"><TextField value={form.ecPhone} onChange={v => set({ ecPhone: v })} /></Field>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Label>Salary account</Label>
        <Field label="Bank"><DsSelect value={form.bank} onChange={v => set({ bank: v })} options={bankOptions(record?.bank ?? '').map(b => ({ value: b, label: b }))} /></Field>
        <Field label="Account number" hint="Salary keeps going to the current account until HR approves.">
          <TextField value={form.acct} onChange={v => set({ acct: v })} placeholder={record?.accountLast4 ? `•••• •••• ${record.accountLast4}` : ''} />
        </Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.6fr)', gap: 10 }}>
        <Button size="lg" variant="secondary" block onClick={onCancel}>Cancel</Button>
        <Button size="lg" block disabled={clean || busy} onClick={onSend}>Send to HR for approval</Button>
      </div>
      <Button variant="link" onClick={onNotice} style={{ alignSelf: 'flex-start', fontSize: 12.5 }}>Read the punch notice again</Button>
    </div>
  )
}
