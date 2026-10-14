'use client'

import { useState } from 'react'
import { DialogButton, DialogForm, Field, FinDialog, Hint, Input } from '@/components/finv/Dialog'
import { money, neededSentence } from '@/components/finv/form-words'
import fm from '@/components/finv/form.module.css'
import { Select } from '@/components/hrv/select'
import type { InvoiceCategory } from '../_lib/invoice-form'
import { hubChangeAccount } from '../invoice-actions'
import { CategorySelect } from './InvoiceFormParts'

// Change account (2026-10-14, the Finance revamp v2 — D10's drawer; the design
// draws no form for it, so it is the system's in the kit's sheet; user
// 2026-08-24: "invoice 那边选的account 也是同理，我要能更改"): an issued or paid
// invoice's posted lines move to another account — the same entry, amounts
// and day; the invoice's category follows, the GL keeps a note with the
// reason. An invoice that posted to several accounts moves the ones ticked in
// one go (2026-09-28: "我一次只能改一个?"); one that posted to one names it,
// or leaves the entry to say which.

export interface ChangeAccountInvoice {
  id: string
  no: string | null
  /** Its category as stored — what it posts to now, when one. */
  category: string | null
  /** The accounts it posted to, with their amounts. */
  posted: Array<{ code: string; amount: number }>
}

export default function ChangeAccountDialog({
  open,
  onClose,
  onDone,
  invoice,
  categories,
}: {
  open: boolean
  onClose: () => void
  onDone: (message: string) => void
  invoice: ChangeAccountInvoice
  categories: InvoiceCategory[]
}) {
  const several = invoice.posted.length > 1
  const nameOf = (code: string) => categories.find((c) => c.code === code)?.label ?? code
  const [from, setFrom] = useState(invoice.category ?? '')
  const [picked, setPicked] = useState<string[]>(() => invoice.posted.map((a) => a.code))
  const [to, setTo] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [tried, setTried] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const moving = several ? picked.filter((c) => c !== to) : from ? [from] : []
  const need: string[] = []
  if (several && moving.length === 0) need.push('an account to move')
  if (!to) need.push('the account it moves to')
  if (!reason.trim()) need.push('a reason')
  const problem = neededSentence(need) ?? (!several && from && to === from ? 'It already posts to that account.' : null)
  const ok = problem === null

  const save = async () => {
    setTried(true)
    if (!ok || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await hubChangeAccount({ invoiceId: invoice.id, from: moving, to, reason })
      if (!res.ok) return setError(res.reason)
      const n = res.value.changed
      onDone(`${n} GL ${n === 1 ? 'line' : 'lines'} moved${res.value.from ? ` from ${res.value.from}` : ''} to ${to}`)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'It did not go through. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <FinDialog open={open} onClose={() => !busy && onClose()} title="Change account" sub={`${invoice.no ?? 'Draft'} · its posted lines move`} locked={busy}>
      <DialogForm
        buttons={
          <>
            <DialogButton disabled={busy} onClick={onClose}>
              Cancel
            </DialogButton>
            <DialogButton kind="primary" off={!ok} disabled={busy} onClick={save}>
              {busy ? 'Moving…' : 'Change account'}
            </DialogButton>
          </>
        }
      >
        {several ? (
          <Field label="Move from">
            <div className={fm.checks} role="group" aria-label="Move from">
              {invoice.posted.map((a) => (
                <label key={a.code} className={fm.check}>
                  <input
                    type="checkbox"
                    checked={picked.includes(a.code)}
                    onChange={(e) => setPicked((prev) => (e.target.checked ? [...prev, a.code] : prev.filter((c) => c !== a.code)))}
                  />
                  <span className={fm.checkCode}>{a.code}</span>
                  <span className={fm.checkName}>{nameOf(a.code)}</span>
                  <span className={fm.checkValue}>{money(a.amount)}</span>
                </label>
              ))}
              <div className={fm.linesFoot}>
                <button
                  type="button"
                  className={fm.addLine}
                  onClick={() => setPicked(picked.length === invoice.posted.length ? [] : invoice.posted.map((a) => a.code))}
                >
                  {picked.length === invoice.posted.length ? 'Tick none' : 'Tick all'}
                </button>
                <span className={fm.linesTotal}>RM {money(invoice.posted.filter((a) => picked.includes(a.code)).reduce((s, a) => s + a.amount, 0))}</span>
              </div>
            </div>
          </Field>
        ) : (
          <Field label="Now" htmlFor="ca-from">
            <Select id="ca-from" round={12} className={fm.select} value={from} onChange={(e) => setFrom(e.target.value)}>
              <option value="">The one its entry posts to</option>
              {categories.map((c) => (
                <option key={c.code} value={c.code} data-search={c.code}>
                  {`${c.code} · ${c.label}`}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Move to" htmlFor="ca-to">
          <CategorySelect id="ca-to" value={to} onChange={setTo} categories={categories} blank="Choose the account" />
        </Field>
        <Field label="Reason" htmlFor="ca-reason">
          <Input id="ca-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. the wrong account was picked" />
        </Field>

        {error ? (
          <Hint danger>{error}</Hint>
        ) : tried && problem ? (
          <Hint>{problem}</Hint>
        ) : (
          <Hint>The same entry, amounts and day — only the account changes. The invoice’s category follows; the GL keeps a note with the reason.</Hint>
        )}
      </DialogForm>
    </FinDialog>
  )
}
