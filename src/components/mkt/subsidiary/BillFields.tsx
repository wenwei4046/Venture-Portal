'use client'

import { useEffect, type ChangeEvent } from 'react'
import AddressFields from '@/components/address/AddressFields'
import { useMalaysia } from '@/components/address/use-malaysia'
import { addressRefusal } from '@/lib/address/address'
import type { BillEdit } from '@/lib/marketing/billing'
import p from '../project/project.module.css'
import s from './subsidiary.module.css'

// An outside client's billing details (②b-2b — the user's answer 50: Marketing fills them when adding or editing the
// client): the name its invoices are made out to, its address in the portal's six parts (`AddressFields` — State → City
// → Postcode picked from Malaysia's list), its phone and its email. Controlled; the form checks and sends them.

export default function BillFields({ value, onChange, idPrefix, was, onRefusal }: {
  value: BillEdit
  onChange: (next: BillEdit) => void
  idPrefix: string
  /** As it was drawn — a changed address part turns peach. */
  was?: BillEdit
  /** What stops the address from being saved (`addressRefusal`, once Malaysia's list is in) — for a form that does not
   * read the list itself. */
  onRefusal?: (words: string | null) => void
}) {
  const { data } = useMalaysia()
  const refusal = data ? addressRefusal(value.billAddress, data) : null
  useEffect(() => onRefusal?.(refusal), [refusal, onRefusal])
  const set = (k: 'billName' | 'billPhone' | 'billEmail') => (e: ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value })
  return (
    <div className={s.billFields}>
      <label className={p.dialogField}>
        <span className={p.dialogLabel}>Billing name</span>
        <input className={p.input} value={value.billName} maxLength={120} placeholder="e.g. Red Truck Sdn Bhd" onChange={set('billName')} />
      </label>
      <AddressFields value={value.billAddress} onChange={a => onChange({ ...value, billAddress: a })} idPrefix={`${idPrefix}-address`}
        was={was?.billAddress} inputClassName={p.input} labelClassName={p.dialogLabel} selectRound={10} gap={10} />
      <div className={s.editGrid}>
        <label className={p.dialogField}>
          <span className={p.dialogLabel}>Billing phone</span>
          <input className={`${p.input} ${p.mono}`} value={value.billPhone} maxLength={40} inputMode="tel" placeholder="+60 3-XXXX XXXX" onChange={set('billPhone')} />
        </label>
        <label className={p.dialogField}>
          <span className={p.dialogLabel}>Billing email</span>
          <input className={p.input} value={value.billEmail} maxLength={200} inputMode="email" placeholder="accounts@company.com" onChange={set('billEmail')} />
        </label>
      </div>
    </div>
  )
}
