'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { flash } from '@/components/hrv/toast'
import { DialogConfirm, DialogMenu, Field, FinDialog, Input } from '@/components/finv/Dialog'
import s from '@/components/finv/full.module.css'
import { invoiceSteps, type InvoiceCan, type InvoiceStepKey } from '@/app/(portal)/statements/_components/InvoiceDrawer'
import SettleDialog from '@/app/(portal)/statements/_components/SettleDialog'
import InvoiceLinesDialog from '@/app/(portal)/statements/_components/InvoiceLinesDialog'
import CreditNoteDialog from '@/app/(portal)/statements/_components/CreditNoteDialog'
import ChangeAccountDialog from '@/app/(portal)/statements/_components/ChangeAccountDialog'
import { hubApproveInvoice, hubDeleteDraft, hubVoidInvoices, type HubResult } from '@/app/(portal)/statements/invoice-actions'
import { creditNoteFigures, postedAccounts, returnedNote, type HubInvoice } from '@/app/(portal)/statements/_lib/invoice-model'
import type { AccountType } from '@/lib/coa'

// An invoice's full page, its dark panel's steps (2026-10-15, the Finance
// revamp v2 — D06 for the Invoice drawer's *View full page ↗*): what this
// reader may do to it now, stacked as the prototype's full page stacks its
// bar — the drawer's steps (`invoiceSteps`), the primary in the accent, the
// rest translucent, the ⋯ a menu of the others. Copy is at the head (the
// design's), so not in the ⋯. Every step is the hub's own — the same dialogs,
// the same actions, answered in words; a department pool's settle and a refund
// go to the voucher page, which comes back here with the voucher's number.

const f2 = (n: number) => (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const rm = (n: number) => `RM ${f2(n)}`

type DialogKind = 'edit' | 'credit_note' | 'reassign'

export default function InvoicePageSteps({
  invoice: inv,
  can,
  today,
  banks,
  companies,
  departments,
  categories,
  extraModes,
  listHref,
  here,
}: {
  invoice: HubInvoice
  can: InvoiceCan
  /** The office's today, `YYYY-MM-DD`. */
  today: string
  banks: Array<{ id: string; label: string }>
  companies: Array<{ id: string; name: string; short_code: string }>
  departments: Array<{ id: string; name: string }>
  categories: Array<{ code: string; label: string; type: AccountType; parent_code: string | null }>
  extraModes: Array<{ value: string; label: string }>
  /** Invoice's hub on the invoice's month — where a deleted draft leaves to. */
  listHref: string
  /** This page — where the voucher page comes back to. */
  here: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [ask, setAsk] = useState<'delete' | 'void' | null>(null)
  const [reason, setReason] = useState('')
  const [settling, setSettling] = useState(false)
  // A dialog of the kit's stays mounted while it fades out (open: false); the next one, a new nonce, starts afresh.
  const [dialog, setDialog] = useState<{ kind: DialogKind; nonce: number; open: boolean } | null>(null)

  // Back from the voucher page (a department pool's settle, a refund) with the voucher it wrote.
  useEffect(() => {
    const url = new URL(window.location.href)
    const no = url.searchParams.get('receipt')
    if (!no) return
    flash(returnedNote(no))
    url.searchParams.delete('receipt')
    window.history.replaceState(window.history.state, '', url.toString())
  }, [])

  const { bar, more: menu } = invoiceSteps(inv, can)
  const more = menu.filter((m) => m.key !== 'copy')
  const no = inv.no ?? 'Draft'

  async function run<T>(call: () => Promise<HubResult<T>>, done: (value: T) => void): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const res = await call()
      if (!res.ok) {
        setError(res.reason)
        return
      }
      done(res.value)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not go through. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const onStep = (key: InvoiceStepKey) => {
    setError(null)
    setMoreOpen(false)
    switch (key) {
      case 'approve':
        void run(
          () => hubApproveInvoice(inv.id),
          () => {
            flash('Approved & issued — posted to the GL')
            router.refresh()
          },
        )
        return
      case 'edit':
      case 'credit_note':
      case 'reassign':
        return setDialog({ kind: key, nonce: Date.now(), open: true })
      case 'delete':
        return setAsk('delete')
      case 'void':
        setReason('')
        return setAsk('void')
      case 'settle':
        return setSettling(true)
      case 'settle_netting':
        // A department pool's invoice settles by netting on the voucher page, which brings the reader back.
        return router.push(`/payments/new?invoice_id=${inv.id}&return_to=${here}`)
      case 'refund':
        return router.push(`/payments/new?mode=refund&invoice_id=${inv.id}&return_to=${here}`)
      case 'copy':
        return
    }
  }

  const closeAsk = () => {
    if (busy) return
    setAsk(null)
    setError(null)
  }
  const confirmAsk = () => {
    if (busy) return
    if (ask === 'delete') {
      void run(
        () => hubDeleteDraft(inv.id),
        () => {
          flash('Draft deleted')
          setAsk(null)
          router.push(listHref)
        },
      )
    } else if (ask === 'void') {
      if (!reason.trim()) return setError('Give a reason for voiding — it goes on the audit trail.')
      void run(
        () => hubVoidInvoices([inv.id], reason.trim()),
        (voided) => {
          flash(`${voided[0] ?? no} voided`)
          setAsk(null)
          router.refresh()
        },
      )
    }
  }
  const closeDialog = () => setDialog((d) => (d ? { ...d, open: false } : d))
  const dialogDone = (message: string) => {
    flash(message)
    router.refresh()
  }

  return (
    <>
      {bar.length > 0 || more.length > 0 ? (
        <div className={s.pBar}>
          {bar.map((step) => (
            <button
              key={step.key}
              type="button"
              className={s.pBtn}
              data-kind={step.kind === 'secondary' ? undefined : step.kind}
              disabled={busy || !!step.off}
              title={step.off}
              onClick={() => onStep(step.key)}
            >
              {step.label}
            </button>
          ))}
          {more.length > 0 ? (
            <button type="button" className={s.pBtn} data-kind="more" aria-label="More" onClick={() => setMoreOpen(true)}>
              ⋯
            </button>
          ) : null}
        </div>
      ) : null}
      {error && !ask ? (
        <p className={s.pError} role="alert">
          {error}
        </p>
      ) : null}

      <FinDialog open={moreOpen} onClose={() => setMoreOpen(false)} title={no}>
        <DialogMenu
          items={more.map((m) => ({
            key: m.key,
            label: m.label,
            sub: m.off ?? m.sub,
            danger: m.kind === 'danger',
            disabled: !!m.off,
            onClick: () => onStep(m.key),
          }))}
        />
      </FinDialog>

      <FinDialog open={!!ask} onClose={closeAsk} title={ask === 'void' ? `Void ${no}?` : 'Delete this draft?'} locked={busy}>
        <DialogConfirm
          text={
            ask === 'void'
              ? `The invoice and its GL entry are reversed. ${inv.party.name} will no longer owe ${rm(inv.remaining)}.`
              : `${no} has not been issued. Deleting removes it.`
          }
          confirmLabel={busy ? 'Working…' : ask === 'void' ? 'Void invoice' : 'Delete'}
          danger
          busy={busy}
          off={ask === 'void' && !reason.trim()}
          error={ask ? error : null}
          onCancel={closeAsk}
          onConfirm={confirmAsk}
        >
          {ask === 'void' ? (
            <Field label="Reason" htmlFor="void-reason">
              <Input id="void-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. wrong amount — reissued" autoFocus />
            </Field>
          ) : null}
        </DialogConfirm>
      </FinDialog>

      <SettleDialog
        invoices={settling ? [inv] : []}
        banks={banks}
        today={today}
        onClose={() => setSettling(false)}
        onSettled={(message) => {
          flash(message)
          setSettling(false)
          router.refresh()
        }}
      />

      {dialog?.kind === 'edit' ? (
        <InvoiceLinesDialog
          key={dialog.nonce}
          open={dialog.open}
          onClose={closeDialog}
          onDone={dialogDone}
          period={inv.periodMonth}
          today={today}
          companies={companies}
          departments={departments}
          categories={categories}
          extraModes={extraModes}
          editing={{
            id: inv.id,
            no: inv.no,
            status: inv.status,
            settled: inv.status === 'paid' || inv.status === 'paid_via_netting' || inv.received > 0,
            initial: inv.edit,
            lines: inv.editLines,
          }}
        />
      ) : dialog?.kind === 'credit_note' ? (
        <CreditNoteDialog
          key={dialog.nonce}
          open={dialog.open}
          onClose={closeDialog}
          onDone={dialogDone}
          invoice={creditNoteFigures(inv)}
          categories={categories}
          extraModes={extraModes}
        />
      ) : dialog?.kind === 'reassign' ? (
        <ChangeAccountDialog
          key={dialog.nonce}
          open={dialog.open}
          onClose={closeDialog}
          onDone={dialogDone}
          invoice={{ id: inv.id, no: inv.no, category: inv.edit.category_code, posted: postedAccounts(inv) }}
          categories={categories}
        />
      ) : null}
    </>
  )
}
