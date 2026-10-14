'use client'

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { flash } from '@/components/hrv/toast'
import { DialogConfirm, DialogMenu, Field, FinDialog, Input, type DialogMenuItem } from '@/components/finv/Dialog'
import { invoiceSteps, type InvoiceCan, type InvoiceStepKey } from './InvoiceDrawer'
import SettleDialog from './SettleDialog'
import CreateInvoiceDialog from './CreateInvoiceDialog'
import InvoiceLinesDialog from './InvoiceLinesDialog'
import CreditNoteDialog from './CreditNoteDialog'
import ChangeAccountDialog from './ChangeAccountDialog'
import { MarketingDialog, OwnShareDialog, PayrollInvoicesDialog, ReconcileDialog } from './GenerateDialogs'
import {
  hubApproveCreditNote,
  hubApproveInvoice,
  hubApproveMonth,
  hubCopyInvoice,
  hubDeleteCreditNote,
  hubDeleteDraft,
  hubVoidCreditNote,
  hubVoidInvoices,
  type HubResult,
} from '../invoice-actions'
import { creditNoteFigures, postedAccounts, settleSelection, type HubCreditNote, type HubInvoice, type InvoiceHubData } from '../_lib/invoice-model'

// What can be done to Invoice's invoices (2026-10-15 — moved out of the hub's
// client word for word, so the Finance phone app's Invoice screens do the same
// things the same way): each step of the drawer (`invoiceSteps`) and what it
// asks first, the head's menus (Create invoice ▾, Payroll ▾, Export ▾), the
// selection's ⋯, a credit note's menu, the confirms, Settle and the dialogs —
// every one the system's own action, answered in words. Where the invoice is
// shown (a drawer, a record screen), what the month is and where the voucher
// page comes back to are the caller's.

const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const f2 = (n: number) => (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const rm = (n: number) => `RM ${f2(n)}`
const r2 = (n: number) => Math.round(n * 100) / 100
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export type InvoiceDialogKind = 'single' | 'multi' | 'marketing' | 'consolidated' | 'reconcile' | 'own-share' | 'edit' | 'credit_note' | 'reassign'
export type InvoiceMenu = 'create' | 'payroll' | 'export' | 'bulk'
type Ask =
  | { kind: 'void'; ids: string[] }
  | { kind: 'delete'; id: string }
  | { kind: 'copy'; id: string }
  | { kind: 'approve-month' }
  | { kind: 'cn-approve' | 'cn-void' | 'cn-delete'; cn: HubCreditNote }

export interface InvoiceWorkSetup {
  hub: InvoiceHubData
  can: InvoiceCan
  /** The office's today, `YYYY-MM-DD`. */
  today: string
  /** The office's month, `YYYY-MM`. */
  thisMonth: string
  /** Every invoice the screen lists, by id — the month's and the other months' still owed. */
  all: ReadonlyMap<string, HubInvoice>
  /** Where the voucher page comes back to (a department pool's settle by netting, a refund). */
  here: string
  /** Show an invoice — the hub's drawer, the app's record screen. */
  onOpen: (id: string) => void
  /** The invoice on show is gone from it (a draft deleted, a copy made into another month). */
  onGone: () => void
  /** Show another month. */
  goMonth: (ym: string) => void
  /** Approve & issue refused from outside the invoice (the table's row menu): show it, with why. */
  onRefused?: (id: string) => void
  /** What is ticked: the selection's ⋯ and Void selected. */
  ticked?: HubInvoice[]
  /** Settled or voided — the ticks of the ones done go. */
  onDoneWith?: (ids: string[], settled: boolean) => void
  /** Payroll ▾ › Payroll basis: where it is shown. */
  onBasis: () => void
}

export function useInvoiceWork(setup: InvoiceWorkSetup) {
  const { hub, can, today, thisMonth, all, here, onOpen, onGone, goMonth, onRefused, ticked = [], onDoneWith, onBasis } = setup
  const router = useRouter()
  const month = hub.period.slice(0, 7)
  const [yy, mm] = month.split('-').map(Number)
  const monthLong = `${MONTH[mm - 1]} ${yy}`

  const [menu, setMenu] = useState<InvoiceMenu | null>(null)
  // The ⋯ menus keep what they were opened for while they play out.
  const [moreFor, setMoreFor] = useState<HubInvoice | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [cnMenu, setCnMenu] = useState<HubCreditNote | null>(null)
  const [cnOpen, setCnOpen] = useState(false)
  // A dialog of the kit's stays mounted while it fades out (open: false); the next one, a new nonce, starts afresh.
  const [dialog, setDialog] = useState<{ kind: InvoiceDialogKind; id?: string; nonce: number; open: boolean } | null>(null)
  const [settleIds, setSettleIds] = useState<string[]>([])
  const [ask, setAsk] = useState<Ask | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const closeAsk = () => {
    if (busy) return
    setAsk(null)
    setError(null)
  }
  async function run<T>(call: () => Promise<HubResult<T>>, done: (value: T) => void): Promise<boolean> {
    setBusy(true)
    setError(null)
    try {
      const res = await call()
      if (!res.ok) {
        setError(res.reason)
        return false
      }
      done(res.value)
      router.refresh()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not go through. Try again.')
      return false
    } finally {
      setBusy(false)
    }
  }
  const numberOf = (id: string) => all.get(id)?.no ?? 'the draft'

  const onStep = (key: InvoiceStepKey, inv: HubInvoice) => {
    setError(null)
    setMoreOpen(false)
    const open = (kind: InvoiceDialogKind) => setDialog({ kind, id: inv.id, nonce: Date.now(), open: true })
    switch (key) {
      case 'approve':
        void run(
          () => hubApproveInvoice(inv.id),
          () => flash('Approved & issued — posted to the GL'),
        ).then((ok) => !ok && onRefused?.(inv.id))
        return
      case 'edit':
        return open('edit')
      case 'credit_note':
        return open('credit_note')
      case 'reassign':
        return open('reassign')
      case 'delete':
        return setAsk({ kind: 'delete', id: inv.id })
      case 'copy':
        return setAsk({ kind: 'copy', id: inv.id })
      case 'void':
        setReason('')
        return setAsk({ kind: 'void', ids: [inv.id] })
      case 'settle':
        return setSettleIds([inv.id])
      case 'settle_netting':
        // A department pool's invoice settles by netting on the voucher page, which brings the reader back.
        return router.push(`/payments/new?invoice_id=${inv.id}&return_to=${here}`)
      case 'refund':
        return router.push(`/payments/new?mode=refund&invoice_id=${inv.id}&return_to=${here}`)
    }
  }

  const confirmAsk = () => {
    if (!ask || busy) return
    switch (ask.kind) {
      case 'void': {
        if (!reason.trim()) return setError('Give a reason for voiding — it goes on the audit trail.')
        void run(
          () => hubVoidInvoices(ask.ids, reason.trim()),
          (voided) => {
            flash(voided.length === 1 ? `${voided[0]} voided` : `${voided.length} invoices voided`)
            setAsk(null)
            onDoneWith?.(ask.ids, false)
          },
        )
        return
      }
      case 'delete':
        void run(
          () => hubDeleteDraft(ask.id),
          () => {
            flash('Draft deleted')
            setAsk(null)
            onGone()
          },
        )
        return
      case 'copy':
        void run(
          () => hubCopyInvoice(ask.id),
          () => {
            flash('Copied as a new draft')
            setAsk(null)
            onGone()
            if (month !== thisMonth) goMonth(thisMonth)
          },
        )
        return
      case 'approve-month':
        void run(
          () => hubApproveMonth(hub.period),
          (n) => {
            flash(`${plural(n, 'draft', 'drafts')} approved & issued`)
            setAsk(null)
          },
        )
        return
      case 'cn-approve':
        void run(
          () => hubApproveCreditNote(ask.cn.id),
          () => {
            flash(`${ask.cn.no ?? 'Credit note'} approved — posted to the GL`)
            setAsk(null)
          },
        )
        return
      case 'cn-void':
        void run(
          () => hubVoidCreditNote(ask.cn.id),
          () => {
            flash(`${ask.cn.no ?? 'Credit note'} voided`)
            setAsk(null)
          },
        )
        return
      case 'cn-delete':
        void run(
          () => hubDeleteCreditNote(ask.cn.id),
          () => {
            flash('Draft credit note deleted')
            setAsk(null)
          },
        )
        return
    }
  }

  // ── The head's menus ──
  const activeContracts = hub.contracts.filter((c) => c.status === 'active').length
  const drafts = hub.invoices.filter((i) => i.status === 'draft').length
  const menuItem = (key: string, label: string, onClick: () => void, sub?: string): DialogMenuItem => ({
    key,
    label,
    sub,
    onClick: () => {
      setMenu(null)
      onClick()
    },
  })
  const openDialog = (kind: InvoiceDialogKind) => () => setDialog({ kind, nonce: Date.now(), open: true })
  const createItems: DialogMenuItem[] = [
    menuItem('single', 'Single invoice', openDialog('single')),
    menuItem('multi', 'Multi-line invoice', openDialog('multi'), 'Several lines on one invoice'),
    menuItem('marketing', 'Generate Marketing invoices', openDialog('marketing'), `From ${plural(activeContracts, 'active marketing project', 'active marketing projects')}`),
  ]
  const payrollItems: DialogMenuItem[] = [
    ...(can.create
      ? [
          menuItem('consolidated', 'Generate payroll invoices', openDialog('consolidated'), `HR and Director salary basis for ${monthLong}`),
          menuItem('reconcile', 'Reconcile payroll', openDialog('reconcile')),
          menuItem('own-share', 'Own-share → Venture (Office)', openDialog('own-share')),
        ]
      : []),
    menuItem('basis', 'Payroll basis', onBasis, `${hub.basis.status} · ${hub.basis.note}`),
  ]
  const exportItems: DialogMenuItem[] = [
    ...(can.listExport
      ? [
          menuItem('xlsx', 'Excel', () => window.location.assign(`/statements/export?format=xlsx&period=${month}`), `invoices-${month.replace('-', '')}.xlsx`),
          menuItem('pdf', 'PDF · list', () => window.open(`/statements/export?format=pdf&period=${month}`, '_blank', 'noopener,noreferrer'), 'One PDF with the list'),
        ]
      : []),
    ...(can.docExport
      ? [menuItem('docs', 'PDF · per invoice', () => window.open(`/billing/invoice-doc?period=${month}`, '_blank', 'noopener,noreferrer'), 'Each invoice on its own page')]
      : []),
  ]
  const sel = settleSelection(ticked)

  // ── What the confirms say ──
  let askTitle = ''
  let askText = ''
  let askLabel = ''
  let askDanger = false
  if (ask) {
    if (ask.kind === 'void') {
      const owed = r2(ask.ids.reduce((s, id) => s + (all.get(id)?.remaining ?? 0), 0))
      const one = ask.ids.length === 1 ? all.get(ask.ids[0]) : null
      askTitle = one ? `Void ${one.no ?? 'this invoice'}?` : `Void ${ask.ids.length} invoices?`
      askText = one
        ? `The invoice and its GL entry are reversed. ${one.party.name} will no longer owe ${rm(owed)}.`
        : `The invoices and their GL entries are reversed — ${rm(owed)} no longer owed.`
      askLabel = one ? 'Void invoice' : `Void ${ask.ids.length} invoices`
      askDanger = true
    } else if (ask.kind === 'delete') {
      askTitle = 'Delete this draft?'
      askText = `${numberOf(ask.id)} has not been issued. Deleting removes it.`
      askLabel = 'Delete'
      askDanger = true
    } else if (ask.kind === 'copy') {
      askTitle = `Copy ${numberOf(ask.id)}?`
      askText = `A new draft in ${MONTH[Number(thisMonth.slice(5, 7)) - 1]} ${thisMonth.slice(0, 4)}, with the same lines — change what you need, then issue it.`
      askLabel = 'Copy as new draft'
    } else if (ask.kind === 'approve-month') {
      askTitle = `Approve all ${plural(drafts, 'draft', 'drafts')}?`
      askText = `Each draft of ${monthLong} is issued and posted to the GL.`
      askLabel = 'Approve all'
    } else if (ask.kind === 'cn-approve') {
      askTitle = `Approve ${ask.cn.no ?? 'this credit note'}?`
      askText = `This posts the credit to the GL (${ask.cn.category ?? 'its account'} / AR) and takes ${rm(ask.cn.amount)} off what ${ask.cn.party} owes on ${ask.cn.invoiceNo ?? 'the invoice'}. It cannot be undone here.`
      askLabel = 'Approve'
    } else if (ask.kind === 'cn-void') {
      askTitle = `Void ${ask.cn.no ?? 'this credit note'}?`
      askText = `A reversing entry cancels its posting, and ${ask.cn.party} owes ${rm(ask.cn.amount)} again on ${ask.cn.invoiceNo ?? 'the invoice'}; an invoice it had brought to paid goes back to issued.`
      askLabel = 'Void credit note'
      askDanger = true
    } else {
      askTitle = 'Delete this draft credit note?'
      askText = `${ask.cn.no ?? 'It'} (${rm(ask.cn.amount)}) has not posted — deleting removes it.`
      askLabel = 'Delete'
      askDanger = true
    }
  }

  const dialogInvoice = dialog?.id ? all.get(dialog.id) : undefined
  const settling = settleIds.map((id) => all.get(id)).filter((i): i is HubInvoice => !!i)
  // An invoice keeps its company in Edit's list though the company has since gone inactive.
  const companiesForEdit =
    dialogInvoice?.edit.company_id && !hub.companies.some((c) => c.id === dialogInvoice.edit.company_id)
      ? [...hub.companies, { id: dialogInvoice.edit.company_id, name: dialogInvoice.party.name, short_code: '' }]
      : hub.companies
  const closeDialog = () => setDialog((d) => (d ? { ...d, open: false } : d))
  const dialogDone = (message: string) => {
    flash(message)
    router.refresh()
  }

  const dialogs: ReactNode = (
    <>
      <SettleDialog
        invoices={settling}
        banks={hub.banks}
        today={today}
        onClose={() => setSettleIds([])}
        onSettled={(message) => {
          flash(message)
          const ids = settleIds
          setSettleIds([])
          onDoneWith?.(ids, true)
          router.refresh()
        }}
      />

      {/* The head's menus, the ⋯ menus, the confirms. */}
      <FinDialog open={menu === 'create'} onClose={() => setMenu(null)} title="Create invoice">
        <DialogMenu items={createItems} />
      </FinDialog>
      <FinDialog open={menu === 'payroll'} onClose={() => setMenu(null)} title="From payroll">
        <DialogMenu items={payrollItems} />
      </FinDialog>
      <FinDialog open={menu === 'export'} onClose={() => setMenu(null)} title="Export" sub={monthLong}>
        <DialogMenu items={exportItems} />
      </FinDialog>
      <FinDialog open={menu === 'bulk'} onClose={() => setMenu(null)} title={`${ticked.length} selected`}>
        <DialogMenu
          items={[
            ...(can.docExport
              ? [menuItem('print', 'Print selected', () => window.open(`/billing/invoice-doc?ids=${ticked.map((i) => i.id).join(',')}`, '_blank', 'noopener,noreferrer'))]
              : []),
            ...(can.void
              ? [
                  {
                    ...menuItem(
                      'void',
                      `Void selected · ${sel.voidable.length}`,
                      () => {
                        setReason('')
                        setAsk({ kind: 'void', ids: sel.voidable.map((i) => i.id) })
                      },
                      'Only an issued invoice with no money in and no credit note',
                    ),
                    danger: true,
                    disabled: sel.voidable.length === 0,
                  },
                ]
              : []),
          ]}
        />
      </FinDialog>
      <FinDialog open={moreOpen} onClose={() => setMoreOpen(false)} title={moreFor?.no ?? 'Draft'}>
        <DialogMenu
          items={(moreFor ? invoiceSteps(moreFor, can).more : []).map((s) => ({
            key: s.key,
            label: s.label,
            sub: s.off ?? s.sub,
            danger: s.kind === 'danger',
            disabled: !!s.off,
            onClick: () => moreFor && onStep(s.key, moreFor),
          }))}
        />
      </FinDialog>
      <FinDialog open={cnOpen} onClose={() => setCnOpen(false)} title={cnMenu?.no ?? 'Draft credit note'} sub={cnMenu ? `${cnMenu.party} · ${cnMenu.status}` : undefined}>
        <DialogMenu
          items={
            cnMenu
              ? [
                  menuItem('open', `Open ${cnMenu.invoiceNo ?? 'its invoice'}`, () => {
                    setCnOpen(false)
                    onOpen(cnMenu.invoiceId)
                  }),
                  ...(can.docExport ? [menuItem('pdf', 'PDF', () => window.open(`/billing/credit-note-doc?id=${cnMenu.id}`, '_blank', 'noopener,noreferrer'))] : []),
                  ...(cnMenu.status === 'draft' && can.approveCn ? [menuItem('approve', 'Approve', () => setAsk({ kind: 'cn-approve', cn: cnMenu }))] : []),
                  ...(cnMenu.status === 'draft' && can.edit ? [{ ...menuItem('delete', 'Delete draft', () => setAsk({ kind: 'cn-delete', cn: cnMenu })), danger: true }] : []),
                  ...(cnMenu.status === 'approved' && can.void ? [{ ...menuItem('void', 'Void credit note', () => setAsk({ kind: 'cn-void', cn: cnMenu })), danger: true }] : []),
                ].map((m) => ({
                  ...m,
                  onClick: () => {
                    setCnOpen(false)
                    m.onClick()
                  },
                }))
              : []
          }
        />
      </FinDialog>
      <FinDialog open={!!ask} onClose={closeAsk} title={askTitle} locked={busy}>
        <DialogConfirm
          text={askText}
          confirmLabel={busy ? 'Working…' : askLabel}
          danger={askDanger}
          busy={busy}
          off={ask?.kind === 'void' && !reason.trim()}
          error={ask ? error : null}
          onCancel={closeAsk}
          onConfirm={confirmAsk}
        >
          {ask?.kind === 'void' ? (
            <Field label="Reason" htmlFor="void-reason">
              <Input id="void-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. wrong amount — reissued" autoFocus />
            </Field>
          ) : null}
        </DialogConfirm>
      </FinDialog>

      {/* The invoice dialogs (the design's inv-form), and the system's own for the rest, mounted open for what asked. */}
      {dialog?.kind === 'single' ? (
        <CreateInvoiceDialog
          key={dialog.nonce}
          open={dialog.open}
          onClose={closeDialog}
          onDone={dialogDone}
          period={hub.period}
          today={today}
          companies={hub.companies}
          departments={hub.departments}
          categories={hub.categories}
          extraModes={hub.extraModes}
        />
      ) : dialog?.kind === 'multi' ? (
        <InvoiceLinesDialog
          key={dialog.nonce}
          open={dialog.open}
          onClose={closeDialog}
          onDone={dialogDone}
          period={hub.period}
          today={today}
          companies={hub.companies}
          departments={hub.departments}
          categories={hub.categories}
          extraModes={hub.extraModes}
        />
      ) : dialog?.kind === 'marketing' ? (
        <MarketingDialog key={dialog.nonce} open={dialog.open} onClose={closeDialog} onDone={dialogDone} period={hub.period} />
      ) : dialog?.kind === 'consolidated' ? (
        <PayrollInvoicesDialog key={dialog.nonce} open={dialog.open} onClose={closeDialog} onDone={dialogDone} period={hub.period} categories={hub.categories} />
      ) : dialog?.kind === 'reconcile' ? (
        <ReconcileDialog key={dialog.nonce} open={dialog.open} onClose={closeDialog} onDone={dialogDone} period={hub.period} />
      ) : dialog?.kind === 'own-share' ? (
        <OwnShareDialog key={dialog.nonce} open={dialog.open} onClose={closeDialog} onDone={dialogDone} period={hub.period} categories={hub.categories} />
      ) : dialog?.kind === 'edit' && dialogInvoice ? (
        <InvoiceLinesDialog
          key={dialog.nonce}
          open={dialog.open}
          onClose={closeDialog}
          onDone={dialogDone}
          period={hub.period}
          today={today}
          companies={companiesForEdit}
          departments={hub.departments}
          categories={hub.categories}
          extraModes={hub.extraModes}
          editing={{
            id: dialogInvoice.id,
            no: dialogInvoice.no,
            status: dialogInvoice.status,
            settled: dialogInvoice.status === 'paid' || dialogInvoice.status === 'paid_via_netting' || dialogInvoice.received > 0,
            initial: dialogInvoice.edit,
            lines: dialogInvoice.editLines,
          }}
        />
      ) : dialog?.kind === 'credit_note' && dialogInvoice ? (
        <CreditNoteDialog
          key={dialog.nonce}
          open={dialog.open}
          onClose={closeDialog}
          onDone={dialogDone}
          invoice={creditNoteFigures(dialogInvoice)}
          categories={hub.categories}
          extraModes={hub.extraModes}
        />
      ) : dialog?.kind === 'reassign' && dialogInvoice ? (
        <ChangeAccountDialog
          key={dialog.nonce}
          open={dialog.open}
          onClose={closeDialog}
          onDone={dialogDone}
          invoice={{ id: dialogInvoice.id, no: dialogInvoice.no, category: dialogInvoice.edit.category_code, posted: postedAccounts(dialogInvoice) }}
          categories={hub.categories}
        />
      ) : null}
    </>
  )

  return {
    busy,
    error,
    setError,
    /** What a drawer or record shows: the error of a step taken on it, not one a window shows itself. */
    shownError: ask || settleIds.length > 0 ? null : error,
    onStep,
    openMenu: setMenu,
    openDialog: (kind: InvoiceDialogKind) => setDialog({ kind, nonce: Date.now(), open: true }),
    openMore: (inv: HubInvoice) => {
      setMoreFor(inv)
      setMoreOpen(true)
    },
    openCreditNote: (cn: HubCreditNote) => {
      setCnMenu(cn)
      setCnOpen(true)
    },
    askApproveMonth: () => setAsk({ kind: 'approve-month' }),
    askCreditNote: (kind: 'cn-approve' | 'cn-void' | 'cn-delete', cn: HubCreditNote) => setAsk({ kind, cn }),
    settle: (ids: string[]) => setSettleIds(ids),
    exportItems,
    drafts,
    activeContracts,
    dialogs,
  }
}
