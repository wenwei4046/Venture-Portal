'use client'

import { useState, useTransition, type ChangeEvent } from 'react'
import { useMalaysia } from '@/components/address/use-malaysia'
import { addressRefusal } from '@/lib/address/address'
import { editMktClient } from '@/lib/marketing/actions'
import { billEditOf, billPatch, billProblems, type BillEdit, type ClientBill } from '@/lib/marketing/billing'
import type { MktSub } from '@/lib/marketing/board'
import { clientEditOf, clientPatch, clientProblems, type ClientEdit as Edit } from '@/lib/marketing/clients'
import p from '../project/project.module.css'
import t from '../task/task.module.css'
import BillFields from './BillFields'
import s from './subsidiary.module.css'

// A client's details, the manager's (②b-2d-2a — the user's answer 29): its name when it is Marketing's own client (a
// group company keeps its own), its PIC and their WhatsApp, its second PIC and theirs — and, Marketing's own client's,
// its billing details (②b-2b — the user's answer 50: the name its invoices are made out to, address, phone, email; a
// group company is billed as Finance keeps it). Save sends only what changed.

export default function ClientEdit({ sub, bill, onSaved, onClose }: {
  sub: MktSub
  /** Its billing details on file — Marketing's own client's (null for a group company). */
  bill: ClientBill | null
  onSaved: (sub: MktSub, bill: ClientBill | null) => void
  onClose: () => void
}) {
  const [saved] = useState<Edit>(() => clientEditOf(sub))
  const [now, setNow] = useState<Edit>(saved)
  const [billSaved] = useState<BillEdit>(() => billEditOf(bill))
  const [billNow, setBillNow] = useState<BillEdit>(billSaved)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const { data } = useMalaysia()
  const changes = { ...(clientPatch(saved, now, sub.client) ?? {}), ...(sub.client ? billPatch(billSaved, billNow) : {}) }
  const patch = Object.keys(changes).length ? changes : null
  const addressWrong = sub.client && data ? addressRefusal(billNow.billAddress, data) : null
  const problems = [...clientProblems(now, sub.client), ...(sub.client ? billProblems(billNow) : []), ...(addressWrong ? [addressWrong] : [])]
  const set = (k: keyof Edit) => (e: ChangeEvent<HTMLInputElement>) => {
    setError(null)
    setNow(v => ({ ...v, [k]: e.target.value }))
  }
  const save = () =>
    start(async () => {
      if (!patch) return onClose()
      const r = await editMktClient(sub.id, patch)
      if (!r.ok) return setError(r.reason)
      onSaved(r.sub, r.bill)
    })

  return (
    <div className={t.scrim} onClick={() => !pending && onClose()}>
      <div className={`${t.dialog}${sub.client ? ` ${s.editWide}` : ''}`} role="dialog" aria-modal="true" aria-label={`Edit ${sub.name}`} onClick={e => e.stopPropagation()}>
        <div className={t.dialogTitle}>Edit {sub.name}</div>
        <div className={s.editBody}>
          {sub.client ? (
            <label className={p.dialogField}>
              <span className={p.dialogLabel}>Name</span>
              <input className={p.input} value={now.name} maxLength={80} onChange={set('name')} autoFocus />
            </label>
          ) : null}
          <div className={s.editGrid}>
            <label className={p.dialogField}>
              <span className={p.dialogLabel}>PIC</span>
              <input className={p.input} value={now.pic} maxLength={80} onChange={set('pic')} autoFocus={!sub.client} />
            </label>
            <label className={p.dialogField}>
              <span className={p.dialogLabel}>PIC WhatsApp</span>
              <input className={`${p.input} ${p.mono}`} value={now.whatsapp} maxLength={40} inputMode="tel" placeholder="+60 1X-XXX XXXX" onChange={set('whatsapp')} />
            </label>
            <label className={p.dialogField}>
              <span className={p.dialogLabel}>Second PIC</span>
              <input className={p.input} value={now.pic2} maxLength={80} onChange={set('pic2')} />
            </label>
            <label className={p.dialogField}>
              <span className={p.dialogLabel}>Second PIC WhatsApp</span>
              <input className={`${p.input} ${p.mono}`} value={now.whatsapp2} maxLength={40} inputMode="tel" placeholder="+60 1X-XXX XXXX" onChange={set('whatsapp2')} />
            </label>
          </div>
          {sub.client ? (
            <>
              <div className={s.billHead}>Billing</div>
              <BillFields value={billNow} was={billSaved} idPrefix={`client-${sub.code}`} onChange={v => { setError(null); setBillNow(v) }} />
            </>
          ) : null}
        </div>
        {error || problems.length ? <div className={s.editError} role="alert">{error ?? problems[0]}</div> : null}
        <div className={t.dialogBtns}>
          <button type="button" className={t.dialogBtn} onClick={onClose} disabled={pending}>Cancel</button>
          <button type="button" className={`${t.dialogBtn} ${t.dialogOk}`} disabled={pending || !patch || problems.length > 0} onClick={save}>
            {pending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
