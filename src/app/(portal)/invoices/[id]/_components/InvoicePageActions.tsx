'use client'

import { useState, useTransition, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatMoney } from '@/lib/utils'
import type { AccountType } from '@/lib/coa'
import { approveInvoice, deleteDraftInvoice, settleInvoicesConsolidated, voidIssuedInvoices } from '@/app/(portal)/billing/actions'
import InvoiceLinesDialog from '@/app/(portal)/statements/_components/InvoiceLinesDialog'
import CreditNoteDialog from '@/app/(portal)/statements/_components/CreditNoteDialog'
import ChangeAccountDialog from '@/app/(portal)/statements/_components/ChangeAccountDialog'
import type { InvoiceEditInitial } from '@/app/(portal)/statements/_lib/invoice-model'

// What Finance can do to an invoice from its own page (2026-10-09, the
// handoff's Actions panel) — the same actions Service Billing's row menu
// offers, by the invoice's status:
//   draft  → Approve & issue · Edit · Delete
//   issued → Settle · Edit · + Credit note · Change account · Void (untouched only)
//   paid   → Edit · Refund · + Credit note · Change account
// Settle takes the receipt here, for what remains or part of it, through the
// same server action as the list's settle dialog; a department pool's invoice
// settles by netting on the voucher page, which brings the reader back. The
// dialogs are Invoice's hub's own (2026-10-14: Edit, credit note, change
// account in the Finance kit's sheet); a credit note the system refuses — on a
// paid invoice, a consolidated payroll one — is shut, saying why.

const r2 = (n: number) => Math.round(n * 100) / 100

interface Props {
  invoice: { id: string; invoiceNo: string | null; status: string; billableToType: string | null; totalAmount: number }
  editInitial: InvoiceEditInitial
  lines: Array<{ description: string | null; amount: number; category_code: string | null }>
  /** What an issued invoice still has to collect. */
  remaining: number
  /** Money received against it, and its credit notes not voided — what a credit note may still take. */
  received: number
  creditNotesHeld: number
  /** Money has come in against it — its amount, payer and period are fixed. */
  settled: boolean
  /** Issued and untouched — no receipt, no credit note. */
  voidable: boolean
  payeeLabel: string
  /** Service Billing's month the invoice belongs to. */
  listHref: string
  /** This page, for the voucher page to come back to. */
  here: string
  today: string
  categories: Array<{ code: string; label: string; type: AccountType; parent_code: string | null }>
  companies: Array<{ id: string; name: string; short_code: string }>
  departments: Array<{ id: string; name: string }>
  extraModes: Array<{ value: string; label: string }>
  banks: Array<{ id: string; label: string }>
  can: { edit: boolean; create: boolean; void: boolean; voucher: boolean }
}

type Dialog = { kind: 'edit' | 'credit_note' | 'reassign'; nonce: number; open: boolean } | null

export default function InvoicePageActions({
  invoice, editInitial, lines, remaining, received, creditNotesHeld, settled, voidable, payeeLabel, listHref, here, today, categories, companies, departments, extraModes, banks, can,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [panel, setPanel] = useState<'settle' | 'void' | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [bank, setBank] = useState(banks[0]?.id ?? '')
  const [payDate, setPayDate] = useState(today)
  const [amount, setAmount] = useState(remaining.toFixed(2))
  const [reason, setReason] = useState('')

  const { id, invoiceNo, status } = invoice
  const isDraft = status === 'draft'
  const isIssued = status === 'issued'
  const isPaid = status === 'paid' || status === 'paid_via_netting'
  const deptPool = invoice.billableToType === 'dept_pool'
  const open = (kind: NonNullable<Dialog>['kind']) => setDialog({ kind, nonce: Date.now(), open: true })
  const closeDialog = () => setDialog((d) => (d ? { ...d, open: false } : d))
  const dialogDone = (message: string) => {
    setError(null)
    setDone(message)
    router.refresh()
  }
  // A credit note nets what an issued invoice still owes (CN v2, 2026-08-19) — the system refuses the rest.
  const cnOff = !isIssued
    ? 'A credit note nets what is still owed — a paid invoice is refunded instead'
    : editInitial.billing_mode === 'payroll_consolidated'
      ? 'A consolidated payroll invoice settles in full — no credit note'
      : undefined
  const toggle = (which: 'settle' | 'void') => {
    setError(null)
    setPanel((p) => (p === which ? null : which))
  }

  const run = (fn: () => Promise<void>) => {
    setError(null)
    setDone(null)
    startTransition(async () => {
      try {
        await fn()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Action failed')
      }
    })
  }
  const withId = () => {
    const fd = new FormData()
    fd.set('id', id)
    return fd
  }

  function settle(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!bank) return setError('Pick a bank account.')
    if (!payDate) return setError('Pick a payment date.')
    const amt = Number(amount)
    if (!Number.isFinite(amt) || amt <= 0) return setError('The amount must be more than 0.')
    if (amt > remaining + 0.005) return setError(`More than the ${formatMoney(remaining)} still to collect.`)
    run(async () => {
      const res = await settleInvoicesConsolidated({ invoiceIds: [id], bankAccountId: bank, paymentDate: payDate, partialAmount: amt })
      setDone(
        res.isPartial
          ? `Receipt ${res.voucherNo} — part payment ${formatMoney(res.total)}; ${formatMoney(r2(remaining - res.total))} still to collect.`
          : `Receipt ${res.voucherNo} — settled.`,
      )
      setPanel(null)
      router.refresh()
    })
  }

  function confirmVoid(e: FormEvent) {
    e.preventDefault()
    if (!reason.trim()) return setError('Say why it is voided.')
    run(async () => {
      const res = await voidIssuedInvoices({ ids: [id], reason: reason.trim() })
      setDone(`Voided ${res.voided.join(', ') || invoiceNo || 'the invoice'}.`)
      setPanel(null)
      router.refresh()
    })
  }

  // The accounts its lines posted to, with their totals — Change account
  // moves them in one go.
  const posted = new Map<string, number>()
  for (const l of lines) {
    if (l.category_code) posted.set(l.category_code, r2((posted.get(l.category_code) ?? 0) + l.amount))
  }
  const postedAccounts = [...posted.entries()].map(([code, amt]) => ({ code, amount: amt })).sort((a, b) => a.code.localeCompare(b.code))

  return (
    <>
      <div className="fin-actions">
        {isDraft && can.edit ? (
          <>
            <button type="button" className="btn-pri" disabled={isPending} onClick={() => run(async () => { await approveInvoice(withId()); router.refresh() })}>
              {isPending ? 'Working…' : 'Approve & issue'}
            </button>
            <button type="button" className="btn-sec" onClick={() => open('edit')}>Edit</button>
            <button
              type="button"
              className="btn-danger"
              disabled={isPending}
              onClick={() => {
                if (!confirm(`Delete this draft invoice${invoiceNo ? ` ${invoiceNo}` : ''}? This cannot be undone.`)) return
                run(async () => { await deleteDraftInvoice(withId()); router.push(listHref) })
              }}
            >
              Delete
            </button>
          </>
        ) : null}

        {isIssued ? (
          <>
            {deptPool ? (
              can.voucher ? (
                <Link href={`/payments/new?invoice_id=${id}&return_to=${here}`} className="btn-pri" title="A department pool's invoice settles by netting on the voucher page">
                  Settle
                </Link>
              ) : null
            ) : can.create ? (
              <button type="button" className="btn-pri" aria-expanded={panel === 'settle'} onClick={() => toggle('settle')}>
                Settle
              </button>
            ) : null}
            {can.edit ? <button type="button" className="btn-sec" onClick={() => open('edit')}>Edit</button> : null}
            {can.create ? <button type="button" className="btn-sec" disabled={!!cnOff} title={cnOff} onClick={() => open('credit_note')}>+ Credit note</button> : null}
            {can.edit ? <button type="button" className="btn-sec" onClick={() => open('reassign')}>Change account</button> : null}
            {can.void && voidable ? (
              <button type="button" className="btn-danger" aria-expanded={panel === 'void'} onClick={() => toggle('void')}>
                Void
              </button>
            ) : null}
          </>
        ) : null}

        {isPaid ? (
          <>
            {can.edit ? <button type="button" className="btn-sec" onClick={() => open('edit')}>Edit</button> : null}
            {can.voucher && status === 'paid' ? (
              <Link href={`/payments/new?mode=refund&invoice_id=${id}&return_to=${here}`} className="btn-sec">
                Refund
              </Link>
            ) : null}
            {can.create ? <button type="button" className="btn-sec" disabled={!!cnOff} title={cnOff} onClick={() => open('credit_note')}>+ Credit note</button> : null}
            {can.edit ? <button type="button" className="btn-sec" onClick={() => open('reassign')}>Change account</button> : null}
          </>
        ) : null}

        {panel === 'settle' ? (
          <form className="fin-inline-form" onSubmit={settle} aria-label="Settle">
            <div className="fin-field">
              <label htmlFor="settle-bank">Bank account</label>
              <select id="settle-bank" value={bank} onChange={(e) => setBank(e.target.value)} disabled={isPending}>
                {banks.length === 0 ? <option value="">No bank account</option> : null}
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>{b.label}</option>
                ))}
              </select>
            </div>
            <div className="fin-field">
              <label htmlFor="settle-date">Payment date</label>
              <input id="settle-date" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} disabled={isPending} />
            </div>
            <div className="fin-field">
              <label htmlFor="settle-amount">Amount received</label>
              <input id="settle-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={isPending} className="num" />
            </div>
            <div className="fin-inline-buttons">
              <button type="submit" className="btn-pri" disabled={isPending}>{isPending ? 'Recording…' : 'Record receipt'}</button>
              <button type="button" className="btn-sec" onClick={() => setPanel(null)} disabled={isPending}>Cancel</button>
            </div>
          </form>
        ) : null}

        {panel === 'void' ? (
          <form className="fin-inline-form one" onSubmit={confirmVoid} aria-label="Void">
            <div className="fin-field">
              <label htmlFor="void-reason">Reason</label>
              <textarea id="void-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} disabled={isPending} />
            </div>
            <div className="fin-inline-buttons">
              <button type="submit" className="btn-danger" disabled={isPending}>{isPending ? 'Voiding…' : 'Confirm void'}</button>
              <button type="button" className="btn-sec" onClick={() => setPanel(null)} disabled={isPending}>Cancel</button>
            </div>
          </form>
        ) : null}
      </div>

      {done ? <div className="mt-3 border border-hairline rounded-md bg-surface p-3 text-sm font-sans text-ledger">✓ {done}</div> : null}
      {error ? <div className="mt-3 bg-danger-bg border border-danger text-danger rounded-md p-3 text-sm font-sans">{error}</div> : null}

      {dialog?.kind === 'edit' ? (
        <InvoiceLinesDialog
          key={`edit:${dialog.nonce}`}
          open={dialog.open}
          onClose={closeDialog}
          onDone={dialogDone}
          period={editInitial.period_month ?? `${today.slice(0, 7)}-01`}
          today={today}
          companies={companies}
          departments={departments}
          categories={categories}
          extraModes={extraModes}
          editing={{ id, no: invoiceNo, status, settled, initial: editInitial, lines }}
        />
      ) : null}
      {dialog?.kind === 'credit_note' ? (
        <CreditNoteDialog
          key={`cn:${dialog.nonce}`}
          open={dialog.open}
          onClose={closeDialog}
          onDone={dialogDone}
          invoice={{
            id,
            no: invoiceNo,
            party: payeeLabel,
            total: invoice.totalAmount,
            received,
            credited: creditNotesHeld,
            mode: editInitial.billing_mode,
            category: editInitial.category_code ?? (new Set(lines.map((l) => l.category_code)).size === 1 ? (lines[0]?.category_code ?? null) : null),
          }}
          categories={categories}
          extraModes={extraModes}
        />
      ) : null}
      {dialog?.kind === 'reassign' ? (
        <ChangeAccountDialog
          key={`gl:${dialog.nonce}`}
          open={dialog.open}
          onClose={closeDialog}
          onDone={dialogDone}
          invoice={{ id, no: invoiceNo, category: editInitial.category_code ?? null, posted: postedAccounts }}
          categories={categories}
        />
      ) : null}
    </>
  )
}
