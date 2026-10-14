'use client'

import Link from 'next/link'
import { FinDrawer, drawerStyles as d } from '@/components/finv/Drawer'
import { DrawerGroup as Group, DrawerLine as Line, fd } from '@/components/finv/DrawerParts'
import type { HubInvoice } from '../_lib/invoice-model'

// An invoice in the hub's drawer (2026-10-14, the Finance revamp v2 — D10, the
// prototype's `detailInv`): the dark hero, then Balance · Billing · Line items
// · Receipts (and its credit notes, when it has any), and at its foot what
// this reader may do to it in the state it is in. The steps are the system's:
// a department pool's invoice settles by netting on the voucher page, a paid
// one is refunded through a voucher, only an untouched issued invoice is
// voided, a copy lands as a draft in this month.

export interface InvoiceCan {
  /** Billing · Create — create, settle, credit note, copy. */
  create: boolean
  /** Billing · Edit — approve & issue, edit, delete a draft, change account. */
  edit: boolean
  /** Billing · Void — void an invoice or a credit note. */
  void: boolean
  /** Treasury · Approve — approve a credit note. */
  approveCn: boolean
  /** Treasury · Create — a refund, a department pool's settle, a non-billable expense: vouchers. */
  voucher: boolean
  /** Treasury · Export — the list as Excel / PDF. */
  listExport: boolean
  /** Billing · Export — an invoice's own PDF. */
  docExport: boolean
}

export type InvoiceStepKey = 'approve' | 'edit' | 'delete' | 'settle' | 'settle_netting' | 'credit_note' | 'reassign' | 'void' | 'refund' | 'copy'

export interface InvoiceStep {
  key: InvoiceStepKey
  label: string
  kind: 'primary' | 'secondary' | 'danger'
  /** A line under it in a menu ("Salary Income · 5020"). */
  sub?: string
  /** Why it cannot be done to this invoice — drawn shut, saying so (the design's button, the system's rule). */
  off?: string
}

/** The status in the design's words — as the list's chip and the hero say it. */
export function statusText(status: string): string {
  return status === 'paid_via_netting' ? 'paid via netting' : status
}

/** A status's tone: issued waits, paid is green, voided red, a draft quiet. */
export function statusTone(status: string): 'alert' | 'ledger' | 'danger' | 'def' {
  return status === 'issued' ? 'alert' : status === 'paid' || status === 'paid_via_netting' ? 'ledger' : status === 'voided' ? 'danger' : 'def'
}

const f2 = (n: number) => (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const rm = (n: number) => `RM ${f2(n)}`

/**
 * What this reader may do to the invoice now: the bar's steps and the ⋯'s, in
 * the design's order (D10) — draft: Approve & issue · Edit · ⋯ (Delete draft);
 * issued: Settle · Edit · ⋯ (+ Credit note, Change account, Void invoice);
 * paid: Refund · + Credit note · ⋯ (Change account). The system's own, kept in
 * the ⋯: Copy, and Edit on a paid invoice. A step the system refuses for this
 * invoice (a credit note on a paid one) is drawn shut, saying why.
 */
export function invoiceSteps(inv: HubInvoice, can: InvoiceCan): { bar: InvoiceStep[]; more: InvoiceStep[] } {
  const bar: InvoiceStep[] = []
  const more: InvoiceStep[] = []
  const account: InvoiceStep = { key: 'reassign', label: 'Change account', kind: 'secondary', sub: inv.gl ? `${inv.gl.name} · ${inv.gl.code}` : undefined }
  const copy: InvoiceStep = { key: 'copy', label: 'Copy as new draft', kind: 'secondary' }
  // A credit note nets what an issued invoice still owes (CN v2, 2026-08-19): a paid one is refunded, a
  // consolidated payroll invoice settles in full — the system refuses both, so the button says why.
  const creditNote: InvoiceStep = {
    key: 'credit_note',
    label: '+ Credit note',
    kind: 'secondary',
    off:
      inv.status !== 'issued'
        ? 'A credit note nets what is still owed — a paid invoice is refunded instead'
        : inv.modeKey === 'payroll_consolidated'
          ? 'A consolidated payroll invoice settles in full — no credit note'
          : undefined,
  }
  if (inv.status === 'draft') {
    if (can.edit) bar.push({ key: 'approve', label: 'Approve & issue', kind: 'primary' }, { key: 'edit', label: 'Edit', kind: 'secondary' })
    if (can.create) more.push(copy)
    if (can.edit) more.push({ key: 'delete', label: 'Delete draft', kind: 'danger' })
  } else if (inv.status === 'issued') {
    if (inv.settleable ? can.create : can.voucher) bar.push({ key: inv.settleable ? 'settle' : 'settle_netting', label: 'Settle', kind: 'primary' })
    if (can.edit) bar.push({ key: 'edit', label: 'Edit', kind: 'secondary' })
    if (can.create) more.push(creditNote)
    if (can.edit) more.push(account)
    if (can.create) more.push(copy)
    if (can.void && inv.voidable) more.push({ key: 'void', label: 'Void invoice', kind: 'danger' })
  } else if (inv.status === 'paid' || inv.status === 'paid_via_netting') {
    if (can.voucher && inv.status === 'paid') bar.push({ key: 'refund', label: 'Refund', kind: 'secondary' })
    if (can.create) bar.push(creditNote)
    if (can.edit) more.push(account, { key: 'edit', label: 'Edit', kind: 'secondary' })
    if (can.create) more.push(copy)
  }
  return { bar, more }
}

/** The hero's line under the party: what happens next, in the design's words. */
function noteOf(inv: HubInvoice): string {
  switch (inv.status) {
    case 'issued':
      return inv.settleable
        ? `Settle collects the remaining ${rm(inv.remaining)}. Same-company invoices can be settled together on one receipt.`
        : `Settle collects the remaining ${rm(inv.remaining)} by netting, on the voucher page.`
    case 'draft':
      return 'Approving issues the invoice and posts it to the GL.'
    case 'paid':
      return 'Paid. Refund it if something was billed wrong.'
    case 'paid_via_netting':
      return 'Paid via netting.'
    case 'voided':
      return 'Voided.'
    default:
      return ''
  }
}

/** "29 days left" / "Due today" / "3 days past due" — counted from the office's today. */
function dueNote(inv: HubInvoice, today: string): string | undefined {
  if (inv.status === 'paid' || inv.status === 'paid_via_netting') return 'Paid'
  if (inv.status === 'voided') return 'Voided'
  if (inv.status === 'draft') return 'Draft'
  if (!inv.due) return 'No due date'
  const days = Math.round((Date.parse(inv.due.slice(0, 10)) - Date.parse(today)) / 864e5)
  if (days > 1) return `${days} days left`
  if (days === 1) return '1 day left'
  if (days === 0) return 'Due today'
  return `${-days} ${days === -1 ? 'day' : 'days'} past due`
}

export function InvoiceDrawer({
  invoice,
  open,
  onClose,
  can,
  today,
  busy,
  error,
  onStep,
  onMore,
}: {
  invoice: HubInvoice | null
  open: boolean
  onClose: () => void
  can: InvoiceCan
  /** The office's today, `YYYY-MM-DD`. */
  today: string
  busy: boolean
  error: string | null
  onStep: (key: InvoiceStepKey, inv: HubInvoice) => void
  /** The ⋯ — its menu is the hub's. */
  onMore: (inv: HubInvoice) => void
}) {
  const inv = invoice
  const { bar, more } = inv ? invoiceSteps(inv, can) : { bar: [], more: [] }
  const no = inv ? (inv.no ?? 'Draft') : ''

  const buttons = [
    ...bar.map((s) => (
      <button
        key={s.key}
        type="button"
        className={d.barBtn}
        data-kind={s.kind === 'secondary' ? undefined : s.kind}
        disabled={busy || !!s.off}
        title={s.off}
        onClick={() => inv && onStep(s.key, inv)}
      >
        {s.label}
      </button>
    )),
    ...(more.length > 0
      ? [
          <button key="more" type="button" className={d.barBtn} data-kind="more" aria-label="More" onClick={() => inv && onMore(inv)}>
            ⋯
          </button>,
        ]
      : []),
  ]

  return (
    <FinDrawer
      open={open}
      onClose={onClose}
      label={no || 'Invoice'}
      title={no}
      headActions={
        inv ? (
          <>
            <Link href={`/invoices/${inv.id}`} className={d.headBtn}>
              View full page ↗
            </Link>
            {can.docExport ? (
              <a href={`/billing/invoice-doc?id=${inv.id}`} target="_blank" rel="noopener noreferrer" className={d.headBtn}>
                PDF
              </a>
            ) : null}
          </>
        ) : null
      }
      bar={buttons.length > 0 ? buttons : null}
    >
      {!inv ? (
        <div className={d.loading}>This invoice is not on this month’s list any more.</div>
      ) : (
        <>
          <div className={d.hero} data-light={statusTone(inv.status)}>
            <div className={d.heroTop}>
              <span className={d.kicker}>Invoice · {inv.mode}</span>
              <span className={d.heroChip}>
                <span className={d.heroDot} />
                {statusText(inv.status)}
              </span>
            </div>
            <div className={d.heroNo}>{no}</div>
            <div className={d.heroAmount}>{rm(inv.total)}</div>
            <div className={d.heroTo}>
              {inv.party.name} · {inv.party.kind}
            </div>
            <div className={d.heroNote}>
              <span className={d.heroNoteDot} />
              <span>{noteOf(inv)}</span>
            </div>
          </div>

          {error ? (
            <div className={d.error} role="alert">
              {error}
            </div>
          ) : null}

          <Group n="I." title="Balance">
            <Line label="Received" value={rm(inv.received)} mono tone={inv.received > 0 ? 'ledger' : undefined} />
            <Line label="Remaining" value={rm(inv.remaining)} mono tone={inv.remaining > 0 && inv.status === 'issued' ? 'wait' : undefined} />
            <Line label="Due" value={fd(inv.due)} sub={dueNote(inv, today)} mono />
          </Group>
          <Group n="II." title="Billing">
            <Line label="Billed to" value={inv.party.name} sub={inv.party.kind} />
            <Line label="Billing mode" value={inv.mode} />
            <Line label="GL category" value={inv.gl?.name ?? '—'} sub={inv.gl?.code} />
            <Line label="Reference no" value={inv.reference || '—'} mono />
            <Line label="Invoice date" value={fd(inv.date)} mono />
          </Group>
          <Group n="III." title="Line items" foot={{ l: 'Total', v: rm(inv.total) }}>
            {inv.lines.map((l, i) => (
              <Line key={i} label={l.description || `Line ${i + 1}`} value={rm(l.amount)} sub={l.code ?? undefined} mono />
            ))}
          </Group>
          <Group n="IV." title="Receipts" empty={inv.receipts.length === 0 ? 'No money received against this invoice yet.' : undefined}>
            {inv.receipts.map((r, i) => (
              <Line
                key={i}
                label={r.no ?? '—'}
                value={`+${rm(r.amount)}`}
                sub={r.batchTotal !== null ? `${fd(r.date)} · one receipt for ${rm(r.batchTotal)} in all` : fd(r.date)}
                mono
                tone="ledger"
              />
            ))}
          </Group>
          {inv.creditNotes.length > 0 ? (
            <Group n="V." title="Credit notes">
              {inv.creditNotes.map((c) => (
                <Line key={c.id} label={c.no ?? 'Draft'} value={`−${rm(c.amount)}`} sub={[c.status, c.reason].filter(Boolean).join(' · ')} mono />
              ))}
            </Group>
          ) : null}
        </>
      )}
    </FinDrawer>
  )
}
