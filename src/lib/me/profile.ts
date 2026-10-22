import { dayMonYear } from '@/lib/attendance/engine'
import type { AttRequest } from '@/lib/attendance/types'
import { EMPTY_ADDRESS, addressText, sameAddress, type Address } from '@/lib/address/address'
import { addressFormEntries } from '@/lib/address/address-form'
import { changesOf } from './requests'
import type { MeData, MeRecord } from './types'

/**
 * Me › Profile (2026-10-17, the handoff's `pfViewing` / `pfEditing`): the record as its person sees it, and Edit
 * profile — every change goes to HR as a profile request (`att_create_request('profile')`, approved before the record
 * changes). Only the fields that changed are sent (the shared-office rule: never write back what nobody touched). The
 * account number never reaches the phone whole: its field starts empty, its last four as the hint. Pure.
 */

export interface ProfileForm {
  phone: string
  email: string
  /** The home address in its six parts (2026-10-20): State → City → Postcode picked from Malaysia's list. */
  address: Address
  ecName: string
  ecRel: string
  ecPhone: string
  bank: string
  /** A NEW account number only; empty = unchanged. */
  acct: string
}

/** Each typed field's place on the People record (att_profile_changes' keys); the address goes as its six parts. */
export const FIELD_KEYS: Readonly<Record<Exclude<keyof ProfileForm, 'address'>, string>> = {
  phone: 'contact_number',
  email: 'email',
  ecName: 'emergency_contact_name',
  ecRel: 'emergency_contact_relationship',
  ecPhone: 'emergency_contact_phone',
  bank: 'bank_name',
  acct: 'bank_account_no',
}

export function formOf(r: MeRecord | null): ProfileForm {
  return {
    phone: r?.phone ?? '', email: r?.email ?? '', address: r?.addressParts ?? EMPTY_ADDRESS,
    ecName: r?.ecName ?? '', ecRel: r?.ecRel ?? '', ecPhone: r?.ecPhone ?? '',
    bank: r?.bank ?? '', acct: '',
  }
}

/**
 * What changed, as att_create_request takes it: `{ key, to }` for each field that differs — and a changed address as
 * all six of its parts (`address_line1` …), so HR approves one whole address (the database keeps only the parts that
 * differ from the record).
 */
export function changedFields(form: ProfileForm, saved: ProfileForm): Array<{ key: string; to: string }> {
  const out: Array<{ key: string; to: string }> = []
  for (const k of Object.keys(FIELD_KEYS) as Array<keyof typeof FIELD_KEYS>) {
    if (k === 'acct' ? form.acct.trim() !== '' : form[k].trim() !== saved[k].trim()) out.push({ key: FIELD_KEYS[k], to: form[k].trim() })
    // The address follows the contact fields, as the form draws it.
    if (k === 'email' && !sameAddress(form.address, saved.address)) {
      for (const [key, to] of addressFormEntries(form.address)) out.push({ key, to: to.trim() })
    }
  }
  return out
}

/** The banks Edit profile offers (the handoff's five), with the one on record first when it is another. */
export function bankOptions(current: string): string[] {
  const five = ['Maybank', 'CIMB Bank', 'Public Bank', 'RHB Bank', 'Hong Leong Bank']
  return current && !five.includes(current) ? [current, ...five] : five
}

/** The latest profile change still waiting, if any. */
export const pendingProfile = (d: Pick<MeData, 'requests'>): AttRequest | null =>
  d.requests.find(r => r.kind === 'profile' && r.status === 'pending') ?? null

/** The warning banner over the record while a change waits: "2 fields waiting for HR · PF-2610-009". */
export function pendingBanner(r: AttRequest): { title: string; body: string } {
  const changes = changesOf(r)
  const n = changes.length
  return {
    title: `${n} field${n === 1 ? '' : 's'} waiting for HR · ${r.ref}`,
    body: `${changes.map(c => `${c.label}: ${c.key === 'bank_account_no' ? `···${c.to.replace(/\D/g, '').slice(-4)}` : c.to}`).join(' · ')}. Shown below is your current record.`,
  }
}

const or = (v: string | null | undefined) => (v && v.trim() ? v : '—')

/** The four cards: Contact, Emergency contact, Salary account, Kept by HR. */
export function recordCards(r: MeRecord | null) {
  return {
    contact: [
      { label: 'Mobile', value: or(r?.phone), mono: true },
      { label: 'Email', value: or(r?.email) },
      { label: 'Address', value: or((r?.addressParts && addressText(r.addressParts)) || r?.address) },
    ],
    emergency: [
      { label: 'Name', value: r?.ecName ? `${r.ecName}${r.ecRel ? ` · ${r.ecRel}` : ''}` : '—' },
      { label: 'Mobile', value: or(r?.ecPhone), mono: true },
    ],
    bank: [
      { label: 'Bank', value: or(r?.bank) },
      { label: 'Account', value: r?.accountLast4 ? `•••• •••• ${r.accountLast4}` : '—', mono: true },
    ],
    hr: [
      { label: 'NRIC', value: or(r?.nric), mono: true },
      { label: 'Staff ID', value: or(r?.code), mono: true },
      { label: 'Joined', value: r?.hireDate ? dayMonYear(r.hireDate) : '—' },
      { label: 'Upline', value: or(r?.upline) },
    ],
  }
}
