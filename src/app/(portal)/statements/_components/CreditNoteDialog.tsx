'use client'

import { useRef, useState } from 'react'
import { DialogButton, DialogForm, Field, FinDialog, Hint, Input } from '@/components/finv/Dialog'
import { money, neededSentence, num } from '@/components/finv/form-words'
import fm from '@/components/finv/form.module.css'
import { billingModeLabel } from '@/lib/invoice-labels'
import { partialSentence, type InvoiceCategory } from '../_lib/invoice-form'
import { hubCreateCreditNote } from '../invoice-actions'
import { CategorySelect, ModeSelect } from './InvoiceFormParts'

// + Credit note (2026-10-14, the Finance revamp v2 — D10's drawer; the design
// draws no form for it, so it is the system's credit note in the kit's sheet):
// *Credit note* · *HV-INV-… · {party}*, the invoice's figures on a card with
// what it still owes on peach, the Reason, then a line a billing mode, a
// category and an amount — each line its own credit note, a draft until it is
// approved — and *Cancel* / *Save draft*. A credit note nets what an issued
// invoice still owes (CN v2, 2026-08-19): the lines may not come to more.

export interface CreditNoteInvoice {
  id: string
  no: string | null
  party: string
  total: number
  /** Money received against it. */
  received: number
  /** Its credit notes not voided — drafts hold their amount too. */
  credited: number
  /** Its billing mode and category: the first line starts on them. */
  mode: string | null
  category: string | null
}

interface Line {
  key: number
  mode: string
  category: string
  amount: string
}

const r2 = (n: number) => Math.round(n * 100) / 100

export default function CreditNoteDialog({
  open,
  onClose,
  onDone,
  invoice,
  categories,
  extraModes,
}: {
  open: boolean
  onClose: () => void
  onDone: (message: string) => void
  invoice: CreditNoteInvoice
  categories: InvoiceCategory[]
  extraModes: ReadonlyArray<{ value: string; label: string }>
}) {
  const keySeq = useRef(0)
  const nextKey = () => ++keySeq.current
  const owed = r2(Math.max(0, invoice.total - invoice.received - invoice.credited))
  const [reason, setReason] = useState('')
  const [lines, setLines] = useState<Line[]>(() => [{ key: nextKey(), mode: invoice.mode ?? '', category: invoice.category ?? '', amount: '' }])
  const [busy, setBusy] = useState(false)
  const [tried, setTried] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [partly, setPartly] = useState(false)

  const setLine = (key: number, patch: Partial<Line>) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const sum = r2(lines.reduce((s, l) => s + num(l.amount), 0))

  const need: string[] = []
  if (!reason.trim()) need.push('a reason')
  if (lines.some((l) => !l.mode || !l.category || !(num(l.amount) > 0))) need.push('each line’s billing mode, category and amount')
  const same = lines.some((l, i) => l.mode && l.category && lines.findIndex((o) => o.mode === l.mode && o.category === l.category) !== i)
  const problem =
    neededSentence(need) ??
    (same ? 'Two lines have the same billing mode and category — make them one.' : null) ??
    (sum > owed + 0.005 ? `The lines come to RM ${money(sum)} — the invoice still owes RM ${money(owed)}.` : null)
  const ok = problem === null && !partly

  const save = async () => {
    setTried(true)
    if (!ok || busy) return
    setBusy(true)
    setError(null)
    const made: string[] = []
    const failures: Array<{ label: string; reason: string }> = []
    for (const l of lines) {
      const label = billingModeLabel(l.mode, extraModes)
      try {
        const res = await hubCreateCreditNote({ invoiceId: invoice.id, mode: l.mode, category: l.category, amount: r2(num(l.amount)), reason })
        if (res.ok) made.push(res.value)
        else failures.push({ label, reason: res.reason })
      } catch (err) {
        failures.push({ label, reason: err instanceof Error ? err.message : 'It did not go through.' })
      }
    }
    setBusy(false)
    if (failures.length === 0) {
      onDone(made.length === 1 ? `${made[0]} saved as draft` : `${made.length} credit notes saved as drafts`)
      onClose()
      return
    }
    if (made.length > 0) {
      setPartly(true)
      onDone(`${made.length} of ${lines.length} credit notes saved as drafts`)
      setError(partialSentence(made.length, failures))
    } else setError(failures.length === 1 ? failures[0].reason : partialSentence(0, failures))
  }

  return (
    <FinDialog open={open} onClose={() => !busy && onClose()} title="Credit note" sub={`${invoice.no ?? 'Draft'} · ${invoice.party}`} locked={busy}>
      <DialogForm
        buttons={
          partly ? (
            <DialogButton kind="primary" onClick={onClose}>
              Close
            </DialogButton>
          ) : (
            <>
              <DialogButton disabled={busy} onClick={onClose}>
                Cancel
              </DialogButton>
              <DialogButton kind="primary" off={!ok} disabled={busy} onClick={save}>
                {busy ? 'Saving…' : 'Save draft'}
              </DialogButton>
            </>
          )
        }
      >
        <div className={fm.summary} role="group" aria-label="The invoice">
          <div className={fm.summaryRow}>
            <span className={fm.summaryLabel}>Invoice total</span>
            <span className={fm.summaryValue}>{money(invoice.total)}</span>
          </div>
          {invoice.received > 0 ? (
            <div className={fm.summaryRow}>
              <span className={fm.summaryLabel}>Received</span>
              <span className={fm.summaryValue}>−{money(invoice.received)}</span>
            </div>
          ) : null}
          {invoice.credited > 0 ? (
            <div className={fm.summaryRow}>
              <span className={fm.summaryLabel}>Credit notes</span>
              <span className={fm.summaryValue}>−{money(invoice.credited)}</span>
            </div>
          ) : null}
          <div className={fm.summaryTotal}>
            <span className={fm.summaryTotalLabel}>Still owed</span>
            <span className={fm.summaryTotalValue}>RM {money(owed)}</span>
          </div>
        </div>

        <Field label="Reason" htmlFor="cn-reason">
          <Input id="cn-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this credit being raised?" />
        </Field>

        <Field label="Lines">
          <div className={fm.lines}>
            {lines.map((l, i) => (
              <div key={l.key} className={fm.lineWrap}>
                <div className={fm.lineRow} data-shape="pool">
                  <ModeSelect value={l.mode} onChange={(m) => setLine(l.key, { mode: m })} extraModes={extraModes} keep={invoice.mode} label={`Line ${i + 1} billing mode`} blank="Billing mode" inLine />
                  <CategorySelect value={l.category} onChange={(c) => setLine(l.key, { category: c })} categories={categories} label={`Line ${i + 1} category`} blank="Category" inLine />
                  <input
                    className={fm.lineAmount}
                    inputMode="decimal"
                    value={l.amount}
                    onChange={(e) => setLine(l.key, { amount: e.target.value })}
                    placeholder="0.00"
                    aria-label={`Line ${i + 1} amount`}
                  />
                  <button
                    type="button"
                    className={fm.remove}
                    onClick={() => setLines((prev) => prev.filter((o) => o.key !== l.key))}
                    disabled={lines.length === 1}
                    aria-label={`Remove line ${i + 1}`}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
            <div className={fm.linesFoot}>
              <button type="button" className={fm.addLine} onClick={() => setLines((prev) => [...prev, { key: nextKey(), mode: '', category: '', amount: '' }])}>
                + Add line
              </button>
              <span className={fm.linesTotal} data-off={sum > owed + 0.005 ? 'true' : undefined}>
                RM {money(sum)}
              </span>
            </div>
          </div>
        </Field>

        {error ? (
          <Hint danger>{error}</Hint>
        ) : tried && problem ? (
          <Hint>{problem}</Hint>
        ) : (
          <Hint>Each line is its own credit note — a draft until it is approved.</Hint>
        )}
      </DialogForm>
    </FinDialog>
  )
}
