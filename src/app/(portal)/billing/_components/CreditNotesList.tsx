'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { officeTime } from '@/lib/office-time'
import { formatMoney } from '@/lib/utils'
import SortableTable from '@/components/SortableTable'
import ColumnFoot from './ColumnFoot'
import { approveCreditNote, deleteCreditNote, voidCreditNote } from '../actions'

// CN v2 (2026-08-19): the credit notes raised against the current period's
// invoices. Rows arrive display-ready from BillingView (party / invoice no /
// category resolved server-side). Draft → Principal approves (posts the GL
// credit + nets the invoice balance) or Finance deletes; approved → permanent,
// PDF only.
//
// 2026-10-10 — the handoff's sheet table: sortable with ▽ filters (a Range on
// the amount), "N CREDIT NOTES", the CN # and Invoice # in the body face
// (Inter 500 — the handoff keeps the mono for figures), the status as a chip.

export interface CreditNoteRow {
  id: string
  credit_note_no: string | null
  invoice_no: string | null
  party: string
  amount: number
  reason: string
  status: string
  category_label: string | null
  created_at: string | null
}

/** A draft is quiet, approved the accent, voided red. */
function CnStatus({ status }: { status: string }) {
  const tone = status === 'approved' ? ' accent' : status === 'voided' ? ' danger' : ''
  return (
    <span className={`chip${tone}`}>
      <i className="dot" />
      {status}
    </span>
  )
}

export default function CreditNotesList({ rows }: { rows: CreditNoteRow[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function run(action: (fd: FormData) => Promise<void>, id: string) {
    setError(null)
    setBusyId(id)
    startTransition(async () => {
      try {
        const fd = new FormData()
        fd.set('id', id)
        await action(fd)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Action failed')
      } finally {
        setBusyId(null)
      }
    })
  }

  function handleApprove(cn: CreditNoteRow) {
    if (
      !window.confirm(
        `Approve ${cn.credit_note_no ?? 'credit note'}?\n\nThis posts the credit to the GL (${cn.category_label ?? 'category'} / AR) and reduces what ${cn.party} owes on ${cn.invoice_no ?? 'the invoice'} by RM ${formatMoney(cn.amount)}. This cannot be undone from the UI.`,
      )
    )
      return
    run(approveCreditNote, cn.id)
  }

  function handleDelete(cn: CreditNoteRow) {
    if (
      !window.confirm(
        `Delete draft ${cn.credit_note_no ?? 'credit note'} (RM ${formatMoney(cn.amount)})?\n\nNothing has posted yet — this just removes the draft.`,
      )
    )
      return
    run(deleteCreditNote, cn.id)
  }

  function handleVoid(cn: CreditNoteRow) {
    if (
      !window.confirm(
        `Void ${cn.credit_note_no ?? 'credit note'} (RM ${formatMoney(cn.amount)})?\n\nA reversing entry cancels its GL posting, and what ${cn.party} owes on ${cn.invoice_no ?? 'the invoice'} goes back up by RM ${formatMoney(cn.amount)}; an invoice this credit note had brought to paid goes back to issued.`,
      )
    )
      return
    run(voidCreditNote, cn.id)
  }

  const docNo = 'font-sans text-[12px] font-medium text-ink whitespace-nowrap'

  return (
    <section className="fin-queue mt-10">
      <div className="sect-head">
        <h2>Credit notes</h2>
        <span className="rule" aria-hidden />
        <span className="count">
          {rows.length} {rows.length === 1 ? 'CREDIT NOTE' : 'CREDIT NOTES'}
        </span>
      </div>
      <p className="text-muted text-xs -mt-2 mb-3">
        Draft CNs wait for Principal approval; approving posts the credit and reduces the invoice balance.
      </p>

      {error ? (
        <div className="mb-3 bg-danger/10 border border-danger/30 text-danger rounded-md px-3 py-2 text-sm font-sans">
          {error}
        </div>
      ) : null}

      <SortableTable<CreditNoteRow>
        layoutId="billing.credit-notes"
        layoutTitle="Credit notes"
        resizeMode="neighbour"
        rows={rows}
        getRowKey={(cn) => cn.id}
        defaultSort={{ key: 'cn', dir: 'desc' }}
        footer={(visible) => (
          <ColumnFoot
            label="Total"
            cells={{ amount: formatMoney(visible.filter((cn) => cn.status !== 'voided').reduce((s, cn) => s + cn.amount, 0)) }}
          />
        )}
        columns={[
          {
            key: 'cn',
            label: 'CN #',
            mobile: 'keep',
            filterable: true,
            render: (cn) => (
              <>
                <span className={docNo}>{cn.credit_note_no ?? cn.id.slice(0, 8)}</span>
                {cn.created_at ? <span className="block text-[11px] text-muted">{officeTime(cn.created_at).format('D MMM YYYY')}</span> : null}
              </>
            ),
            sortValue: (cn) => cn.credit_note_no ?? cn.id,
            filterValue: (cn) => cn.credit_note_no ?? '',
          },
          {
            key: 'invoice',
            label: 'Invoice',
            mobile: 'detail',
            filterable: true,
            render: (cn) => (cn.invoice_no ? <span className={docNo}>{cn.invoice_no}</span> : '—'),
            sortValue: (cn) => cn.invoice_no ?? '',
          },
          {
            key: 'party',
            label: 'Credit to',
            mobile: 'detail',
            filterable: true,
            render: (cn) => cn.party,
            sortValue: (cn) => cn.party,
          },
          {
            key: 'category',
            label: 'Category',
            mobile: 'detail',
            filterable: true,
            render: (cn) => cn.category_label ?? '—',
            sortValue: (cn) => cn.category_label ?? '',
          },
          {
            key: 'reason',
            label: 'Reason',
            mobile: 'detail',
            filterable: true,
            render: (cn) => <span title={cn.reason}>{cn.reason.length > 60 ? `${cn.reason.slice(0, 60)}…` : cn.reason}</span>,
            sortValue: (cn) => cn.reason,
          },
          {
            key: 'amount',
            label: 'Amount',
            align: 'right',
            mobile: 'keep',
            filterable: true,
            range: 'number',
            render: (cn) => formatMoney(cn.amount),
            sortValue: (cn) => cn.amount,
            cellClassName: 'whitespace-nowrap',
          },
          {
            key: 'status',
            label: 'Status',
            mobile: 'detail',
            filterable: true,
            render: (cn) => <CnStatus status={cn.status} />,
            sortValue: (cn) => cn.status,
          },
          {
            key: 'action',
            label: 'Action',
            sortable: false,
            pinned: 'end',
            resizable: false,
            mobile: 'detail',
            render: (cn) => {
              const busy = isPending && busyId === cn.id
              return (
                <span className="flex items-center justify-end gap-3 whitespace-nowrap">
                  <Link href={`/billing/credit-note-doc?id=${cn.id}`} target="_blank" rel="noopener noreferrer" className="bil-row-btn" title="The credit note document">
                    PDF
                  </Link>
                  {cn.status === 'draft' ? (
                    <>
                      <button type="button" onClick={() => handleApprove(cn)} disabled={busy} className="bil-row-btn">
                        {busy ? 'Working…' : 'Approve'}
                      </button>
                      <button type="button" onClick={() => handleDelete(cn)} disabled={busy} className="text-xs text-graphite hover:text-danger font-sans disabled:opacity-50">
                        Delete
                      </button>
                    </>
                  ) : cn.status === 'approved' ? (
                    <button
                      type="button"
                      onClick={() => handleVoid(cn)}
                      disabled={busy}
                      className="text-xs text-graphite hover:text-danger font-sans disabled:opacity-50"
                      title="Void — a reversing entry; the invoice owes it again"
                    >
                      {busy ? 'Working…' : 'Void'}
                    </button>
                  ) : null}
                </span>
              )
            },
          },
        ]}
      />
    </section>
  )
}
