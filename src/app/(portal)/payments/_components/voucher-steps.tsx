'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { flash } from '@/components/hrv/toast'
import { DialogButton, DialogConfirm, DialogForm, DialogMenu, Field, FinDialog, Hint, type DialogMenuItem } from '@/components/finv/Dialog'
import {
  approveVoucher,
  getAttachmentSignedUrl,
  returnVoucherToDraft,
  reversePaidPayment,
  submitForApproval,
  uploadVoucherAttachment,
  voidPaidReceipt,
  voidVoucher,
  voidVoucherStepInWords,
} from '../actions'
import type { VoucherDetail } from '../_lib/voucher-detail'
import d from '@/components/finv/drawer.module.css'

// What a voucher's reader may do to it now (2026-10-14, the Finance revamp v2 —
// the drawer's action bar, D05, and the full page's dark panel, D06): the
// system's own steps — an approval pays at once, so there is no "Mark as paid"
// — each confirmed where it cannot be undone, and its files opened and added.
// The drawer lays the steps in a row, the full page stacks them.

export interface VoucherStep {
  key: string
  label: string
  kind: 'primary' | 'secondary' | 'danger' | 'more'
  /** A page to go to (Edit); else `onClick`. */
  href?: string
  onClick?: () => void
}

type Confirm = 'void' | 'reverse' | 'approve' | 'more' | null

const f2 = (n: number) => (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const rm = (n: number) => `RM ${f2(n)}`

export function useVoucherSteps(
  v: VoucherDetail | null,
  {
    onDone,
    onFilesChanged,
    extraMore = [],
    inWords = false,
  }: {
    onDone: () => void
    onFilesChanged: () => void
    /** More rows for the ⋯ menu — the phone app's record screen carries the full page's Copy, Change date, Change GL account there. */
    extraMore?: DialogMenuItem[]
    /**
     * The Finance phone app (2026-10-16): Void, Void receipt and Reverse payment answered in words — their
     * actions end on the portal's Payments, which the app does not open.
     */
    inWords?: boolean
  },
): {
  steps: VoucherStep[]
  busy: boolean
  error: string | null
  dialogs: ReactNode
  openFile: (fileId: string) => void
  addFiles: () => void
} {
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, startBusy] = useTransition()

  const title = v ? (v.no ?? 'Draft') : ''
  const run = (action: (fd: FormData) => Promise<unknown>, done: string, extra?: Record<string, string>) => {
    if (!v) return
    setError(null)
    const form = new FormData()
    form.set('id', v.id)
    for (const [k, val] of Object.entries(extra ?? {})) form.set(k, val)
    startBusy(async () => {
      try {
        await action(form)
        setConfirm(null)
        setNotes('')
        flash(done)
        onDone()
      } catch (e) {
        if (e instanceof Error && e.message.includes('NEXT_REDIRECT')) throw e
        setConfirm(null)
        setError(e instanceof Error ? e.message : 'That did not go through.')
      }
    })
  }

  const runInWords = (kind: 'void' | 'void_receipt' | 'reverse', done: string) => {
    if (!v) return
    setError(null)
    const form = new FormData()
    form.set('id', v.id)
    startBusy(async () => {
      const res = await voidVoucherStepInWords(kind, form).catch((e: unknown) => ({ ok: false as const, reason: e instanceof Error ? e.message : 'That did not go through.' }))
      setConfirm(null)
      if (!res.ok) {
        setError(res.reason)
        return
      }
      flash(done)
      onDone()
    })
  }

  const openFile = (fileId: string) => {
    void getAttachmentSignedUrl(fileId).then(
      ({ url }) => window.open(url, '_blank', 'noopener,noreferrer'),
      () => setError('That file could not be opened just now.'),
    )
  }
  const addFiles = () => {
    if (!v) return
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.accept = '.pdf,.jpg,.jpeg,.png,.xlsx,.xls,.docx,.doc,.csv'
    input.onchange = () => {
      const files = Array.from(input.files ?? [])
      if (files.length === 0) return
      const form = new FormData()
      form.set('voucher_id', v.id)
      for (const f of files) form.append('files', f)
      setError(null)
      startBusy(async () => {
        try {
          const { count } = await uploadVoucherAttachment(form)
          flash(`${count} ${count === 1 ? 'file' : 'files'} added`)
          onFilesChanged()
        } catch (e) {
          setError(e instanceof Error ? e.message : 'The files could not be added.')
        }
      })
    }
    input.click()
  }

  // ── The steps this reader may take now ──
  const steps: VoucherStep[] = []
  const more: DialogMenuItem[] = []
  if (v) {
    const st = v.status
    const edit: VoucherStep = { key: 'edit', label: 'Edit', kind: 'secondary', href: `/payments/${v.id}/edit` }
    if (st === 'draft') {
      if (v.can.create) steps.push({ key: 'submit', label: 'Submit for approval', kind: 'primary', onClick: () => run(submitForApproval, 'Submitted — waiting for Principal') })
      if (v.can.edit) steps.push(edit)
      if (v.can.void) more.push({ key: 'void', label: 'Void voucher', danger: true, onClick: () => setConfirm('void') })
    } else if (st === 'pending_approval') {
      if (v.can.approve) steps.push({ key: 'approve', label: 'Approve', kind: 'primary', onClick: () => setConfirm('approve') })
      if (v.can.edit) {
        steps.push(edit)
        const back = () => run(returnVoucherToDraft, 'Returned to draft')
        if (v.can.approve) more.push({ key: 'back', label: 'Return to draft', onClick: back })
        else steps.push({ key: 'back', label: 'Return to draft', kind: 'secondary', onClick: back })
      }
      if (v.can.void) more.push({ key: 'void', label: 'Void voucher', danger: true, onClick: () => setConfirm('void') })
    } else if (st === 'paid' && v.can.void && (v.credit || v.reversible)) {
      steps.push({ key: 'reverse', label: v.credit ? 'Void receipt' : 'Reverse payment', kind: 'danger', onClick: () => setConfirm('reverse') })
    }
    // Before the danger rows, as a menu reads (Copy · Change date … then Void).
    more.unshift(...extraMore)
    if (more.length > 0) steps.push({ key: 'more', label: '⋯', kind: 'more', onClick: () => setConfirm('more') })
  }

  const short = !v || v.noCash ? false : v.bankBalance != null && v.bankBalance < v.amount

  const dialogs = v ? (
    <>
      <FinDialog open={confirm === 'more'} onClose={() => setConfirm(null)} title={title}>
        <DialogMenu items={more.map((m) => ({ ...m, onClick: () => { setConfirm(null); m.onClick() } }))} />
      </FinDialog>
      <FinDialog open={confirm === 'void'} onClose={() => setConfirm(null)} title={`Void ${title}?`} locked={busy}>
        <DialogConfirm
          text="The voucher stays in the list as voided. This cannot be undone."
          confirmLabel="Void voucher"
          danger
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => (inWords ? runInWords('void', `${title} voided`) : run(voidVoucher, `${title} voided`))}
        />
      </FinDialog>
      <FinDialog open={confirm === 'reverse'} onClose={() => setConfirm(null)} title={v.credit ? 'Void this receipt?' : 'Reverse this payment?'} locked={busy}>
        <DialogConfirm
          text={
            v.credit
              ? 'The bank, pool and GL entries are reversed, and its invoices go back to unpaid.'
              : 'The money goes back to the bank, the GL and pool entries are reversed, and the voucher becomes void.'
          }
          confirmLabel={v.credit ? 'Void receipt' : 'Reverse payment'}
          danger
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() =>
            inWords
              ? runInWords(v.credit ? 'void_receipt' : 'reverse', v.credit ? `${title} voided` : 'Payment reversed')
              : run(v.credit ? voidPaidReceipt : reversePaidPayment, v.credit ? `${title} voided` : 'Payment reversed')
          }
        />
      </FinDialog>
      <FinDialog open={confirm === 'approve'} onClose={() => setConfirm(null)} title={`Approve ${title}?`} locked={busy}>
        <DialogForm
          onSubmit={() => !short && run(approveVoucher, `${title} approved and paid`, { notes })}
          buttons={
            <>
              <DialogButton onClick={() => setConfirm(null)}>Cancel</DialogButton>
              <DialogButton kind="primary" type="submit" disabled={busy || short} off={short}>
                {short ? 'Insufficient balance' : busy ? 'Approving…' : 'Approve & pay'}
              </DialogButton>
            </>
          }
        >
          <Field label="Notes" htmlFor="approve-notes">
            <textarea
              id="approve-notes"
              className={d.notes}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional — for the audit trail"
            />
          </Field>
          {v.noCash ? null : v.bankBalance != null && v.bank ? (
            <Hint danger={short}>
              {v.bank.name} balance {rm(v.bankBalance)}
              {short ? ` — not enough for ${rm(v.amount)}` : ''}
            </Hint>
          ) : null}
          <Hint>Approving pays this voucher at once — the bank, the pool and the ledger move in the same step. This cannot be undone.</Hint>
        </DialogForm>
      </FinDialog>
    </>
  ) : null

  return { steps, busy, error, dialogs, openFile, addFiles }
}
