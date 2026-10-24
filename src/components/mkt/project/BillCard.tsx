'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { setMktProjectAmount, stopMktProduct } from '@/lib/marketing/actions'
import { amountLocked, canStop, monthKey, monthLabel, projectBillWords, type ProjectBill } from '@/lib/marketing/billing'
import type { ProductProjectPage } from '@/lib/marketing/project'
import { formatMoney } from '@/lib/utils'
import MoneyInput from '../products/MoneyInput'
import p from './project.module.css'
import t from '../task/task.module.css'

// A product project's billing (②b-2b — the user's answers 43, 44, 51), the manager's: its amount — the quote typed when it
// was made, changed here (a one-time project's until its billing is confirmed) — when it is billed, and, for a recurring
// one, *Stop*: this month its last billed.

export default function BillCard({ page, bill, onPage, say }: {
  page: ProductProjectPage
  bill: ProjectBill
  onPage: (page: ProductProjectPage) => void
  say: (words: string) => void
}) {
  const pr = page.project
  const kind = pr.product?.kind ?? 'one'
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState<number | null>(bill.amount)
  const [stopping, setStopping] = useState(false)
  const [pending, start] = useTransition()
  const locked = amountLocked(kind, bill)

  const save = () =>
    start(async () => {
      if (amount == null || amount <= 0) return say('An amount in ringgit above zero')
      const r = await setMktProjectAmount(pr.id, amount)
      if (!r.ok) return say(r.reason)
      if (r.page) onPage(r.page)
      setEditing(false)
      say('Amount saved')
    })
  const stop = () =>
    start(async () => {
      const r = await stopMktProduct(pr.id)
      if (!r.ok) return say(r.reason)
      if (r.page) onPage(r.page)
      setStopping(false)
      say('Stopped · no month after this one is billed')
    })

  return (
    <div className={p.sideCard} aria-label="Billing">
      <div className={p.sideHead}>
        <span className={p.cardTitle}>Billing</span>
        <span className={p.billKind}>{kind === 'recurring' ? 'Monthly' : 'One-time'}</span>
      </div>
      <div className={p.reqRow}>
        <span className={p.reqLabel}>Amount{kind === 'recurring' ? ' / month' : ''}</span>
        {editing ? null : <span className={p.billAmount}>{bill.amount != null ? formatMoney(bill.amount) : '—'}</span>}
      </div>
      {editing ? (
        <div className={p.billEdit}>
          <MoneyInput className={`${p.input} ${p.mono}`} value={amount} label="Amount" placeholder="0.00" onChange={setAmount} />
          <button type="button" className={p.ghost} disabled={pending} onClick={() => { setEditing(false); setAmount(bill.amount) }}>Cancel</button>
          <button type="button" className={p.primary} disabled={pending || amount == null || amount === bill.amount} onClick={save}>
            {pending ? 'Saving…' : 'Save'}
          </button>
        </div>
      ) : null}
      <div className={`${p.wait} ${p.billWords}`}>{projectBillWords(kind, bill, pr.status)}</div>
      <div className={p.billLinks}>
        {!editing && !locked && pr.status !== 'cancelled' ? (
          <button type="button" className={p.textBtn} disabled={pending} onClick={() => { setAmount(bill.amount); setEditing(true) }}>Change amount</button>
        ) : null}
        {bill.last || pr.status === 'done' || bill.from ? (
          <Link className={p.textBtn} href={bill.last ? `/marketing/billing?m=${monthKey(bill.last)}` : '/marketing/billing'}>Billing →</Link>
        ) : null}
        {canStop(kind, bill, pr.status) ? (
          <button type="button" className={`${p.textBtn} ${p.billStop}`} disabled={pending} onClick={() => setStopping(true)}>Stop…</button>
        ) : null}
      </div>

      {stopping ? (
        <div className={t.scrim} onClick={() => !pending && setStopping(false)}>
          <div className={t.dialog} role="dialog" aria-modal="true" aria-label={`Stop ${pr.title}`} onClick={e => e.stopPropagation()}>
            <div>
              <div className={t.dialogTitle}>Stop {pr.title}?</div>
              <div className={t.dialogSub}>
                {monthLabel(page.today ? `${page.today.slice(0, 7)}-01` : bill.from ?? '')} is its last month billed · work under way carries on
              </div>
            </div>
            <div className={t.dialogBtns}>
              <button type="button" className={t.dialogBtn} onClick={() => setStopping(false)} disabled={pending}>Cancel</button>
              <button type="button" className={`${t.dialogBtn} ${t.dialogOk}`} disabled={pending} onClick={stop}>{pending ? 'Stopping…' : 'Stop'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
