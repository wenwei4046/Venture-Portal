'use client'

import { useEffect, useState } from 'react'
import { DateField } from '@/components/finv/DateField'
import { DialogButton, DialogForm, Field, FinDialog, Hint, Input } from '@/components/finv/Dialog'
import { num } from '@/components/finv/form-words'
import fm from '@/components/finv/form.module.css'
import { Select } from '@/components/hrv/select'
import { hubSettleInvoices } from '../invoice-actions'
import type { HubInvoice } from '../_lib/invoice-model'

// Settle (2026-10-14, the Finance revamp v2 — D10, the prototype's `settle`
// sheet): *Settle 2 invoices* · *HOUZS Century (HC) · one receipt*, a card of
// what each still owes and their total, Into bank and Received date, then
// *Cancel* and *Settle & create receipt*. One receipt for one payer's invoices
// (settleInvoicesConsolidated, its every rule). Ours, kept from Service
// Billing's settle: one invoice may be settled for PART of what it owes — the
// amount received starts at the whole balance; less leaves it open.

const f2 = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const rm = (n: number) => `RM ${f2(n)}`
const r2 = (n: number) => Math.round(n * 100) / 100

export default function SettleDialog({
  invoices: asked,
  banks,
  today,
  onClose,
  onSettled,
}: {
  /** What is being settled — open while there is any. One payer's settleable invoices. */
  invoices: HubInvoice[]
  banks: Array<{ id: string; label: string }>
  /** The office's today. */
  today: string
  onClose: () => void
  /** Done: what to tell the reader. */
  onSettled: (message: string) => void
}) {
  const open = asked.length > 0
  // While it plays out it keeps saying what it settled.
  const [invoices, setInvoices] = useState(asked)
  if (open && asked !== invoices) setInvoices(asked)
  const single = invoices.length === 1
  const total = r2(invoices.reduce((s, i) => s + i.remaining, 0))
  const [bankId, setBankId] = useState(banks[0]?.id ?? '')
  const [date, setDate] = useState(today)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Each time it opens: the primary bank, today, the whole balance.
  const ids = asked.map((i) => i.id).join(',')
  useEffect(() => {
    if (!ids) return
    const balance = r2(asked.reduce((s, i) => s + i.remaining, 0))
    setBankId(banks[0]?.id ?? '')
    setDate(today)
    setAmount(asked.length === 1 ? balance.toFixed(2) : '')
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids])

  const close = () => {
    if (!busy) onClose()
  }

  let problem: string | null = null
  if (!bankId) problem = 'Pick the bank it came into.'
  else if (!date) problem = 'Pick the day it was received.'
  else if (single) {
    const got = num(amount)
    if (!(got > 0)) problem = 'The amount received must be more than 0.'
    else if (got > total + 0.005) problem = `That is more than the ${rm(total)} it still owes.`
  }

  const settle = async () => {
    if (problem || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await hubSettleInvoices({
        invoiceIds: invoices.map((i) => i.id),
        bankAccountId: bankId,
        paymentDate: date,
        partialAmount: single ? r2(num(amount)) : undefined,
      })
      if (!res.ok) {
        setError(res.reason)
        return
      }
      const v = res.value
      onSettled(
        v.isPartial
          ? `Receipt ${v.voucherNo} — part payment ${rm(v.total)}; ${rm(r2(total - v.total))} still to collect`
          : `${v.settledCount} ${v.settledCount === 1 ? 'invoice' : 'invoices'} settled · receipt created`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The receipt could not be written.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <FinDialog
      open={open}
      onClose={close}
      title={`Settle ${invoices.length} ${invoices.length === 1 ? 'invoice' : 'invoices'}`}
      sub={invoices[0] ? `${invoices[0].party.name} · one receipt` : undefined}
      locked={busy}
    >
      <DialogForm
        onSubmit={settle}
        buttons={
          <>
            <DialogButton disabled={busy} onClick={close}>
              Cancel
            </DialogButton>
            <DialogButton kind="primary" type="submit" off={!!problem} disabled={busy}>
              {busy ? 'Settling…' : 'Settle & create receipt'}
            </DialogButton>
          </>
        }
      >
        <div className={fm.summary}>
          {invoices.map((i) => (
            <div key={i.id} className={fm.summaryRow}>
              <span className={fm.summaryLabel}>{i.no ?? 'Draft'}</span>
              <span className={fm.summaryValue}>{f2(i.remaining)}</span>
            </div>
          ))}
          <div className={fm.summaryTotal}>
            <span className={fm.summaryTotalLabel}>Total</span>
            <span className={fm.summaryTotalValue}>{rm(total)}</span>
          </div>
        </div>
        <Field label="Into bank" htmlFor="settle-bank">
          <Select id="settle-bank" round={12} className={fm.select} value={bankId} onChange={(e) => setBankId(e.target.value)}>
            {banks.length === 0 ? <option value="">No active bank account</option> : null}
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Received date">
          <DateField value={date} onChange={setDate} today={today} label="Received date" />
        </Field>
        {single ? (
          <Field label="Amount received RM" htmlFor="settle-amount">
            <Input id="settle-amount" mono align="right" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </Field>
        ) : null}
        {error ? (
          <Hint danger>{error}</Hint>
        ) : problem ? (
          <Hint>{problem}</Hint>
        ) : single && num(amount) < total - 0.005 ? (
          <Hint>Less than {rm(total)} is a part payment — the invoice stays open for the rest.</Hint>
        ) : null}
      </DialogForm>
    </FinDialog>
  )
}
