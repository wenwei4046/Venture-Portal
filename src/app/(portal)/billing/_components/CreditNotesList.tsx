'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { officeTime } from '@/lib/office-time'
import { formatMoney } from '@/lib/utils'
import { approveCreditNote, deleteCreditNote, voidCreditNote } from '../actions'

// CN v2 (2026-08-19): the credit notes raised against the current period's
// invoices. Rows arrive display-ready from BillingView (party / invoice no /
// category resolved server-side). Draft → Principal approves (posts the GL
// credit + nets the invoice balance) or Finance deletes; approved → permanent,
// PDF only.

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
        `撤销 ${cn.credit_note_no ?? 'credit note'} (RM ${formatMoney(cn.amount)})?\n\n会开一张反向分录对冲原来的 GL,${cn.party} 在 ${cn.invoice_no ?? 'invoice'} 上的欠款会加回 RM ${formatMoney(cn.amount)};如果那张单是被这张 CN 抵到 paid 的,会自动变回 issued。`,
      )
    )
      return
    run(voidCreditNote, cn.id)
  }

  return (
    <section className="fin-queue mt-10">
      <div className="sect-head">
        <h2>Credit notes</h2>
        <span className="rule" aria-hidden />
        <span className="count">{rows.length} CN{rows.length === 1 ? '' : 'S'}</span>
      </div>
      <p className="font-serif italic text-muted text-xs -mt-2 mb-3">
        Draft CNs wait for Principal approval; approving posts the credit and reduces the invoice balance.
      </p>

      {error ? (
        <div className="mb-3 bg-danger/10 border border-danger/30 text-danger rounded-md px-3 py-2 text-sm font-sans">
          {error}
        </div>
      ) : null}

      <div className="border border-hairline rounded-md overflow-x-auto bg-paper">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans bg-surface">
              <th className="text-left py-2 px-3 font-medium">CN #</th>
              <th className="text-left py-2 px-3 font-medium">Invoice</th>
              <th className="text-left py-2 px-3 font-medium">Credit to</th>
              <th className="text-left py-2 px-3 font-medium">Category</th>
              <th className="text-left py-2 px-3 font-medium">Reason</th>
              <th className="text-right py-2 px-3 font-medium">Amount</th>
              <th className="text-left py-2 px-3 font-medium">Status</th>
              <th className="text-right py-2 px-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((cn) => {
              const busy = isPending && busyId === cn.id
              return (
                <tr key={cn.id} className="border-b border-hairline last:border-0">
                  <td className="py-2 px-3 font-mono text-xs text-ink whitespace-nowrap">
                    <div>{cn.credit_note_no ?? cn.id.slice(0, 8)}</div>
                    <div className="text-muted">
                      {cn.created_at ? officeTime(cn.created_at).format('DD MMM YYYY') : ''}
                    </div>
                  </td>
                  <td className="py-2 px-3 font-mono text-xs text-graphite whitespace-nowrap">
                    {cn.invoice_no ?? '—'}
                  </td>
                  <td className="py-2 px-3 font-serif text-ink">{cn.party}</td>
                  <td className="py-2 px-3 font-serif italic text-graphite text-xs">
                    {cn.category_label ?? '—'}
                  </td>
                  <td className="py-2 px-3 font-serif italic text-graphite text-xs max-w-[220px]">
                    <span title={cn.reason}>
                      {cn.reason.length > 60 ? `${cn.reason.slice(0, 60)}…` : cn.reason}
                    </span>
                  </td>
                  <td className="py-2 px-3 font-mono tabular text-right text-ink">
                    {formatMoney(cn.amount)}
                  </td>
                  <td className="py-2 px-3">
                    <span
                      className={`font-serif italic text-xs ${cn.status === 'draft' ? 'text-alert' : 'text-graphite'}`}
                    >
                      {cn.status}
                    </span>
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex items-center justify-end gap-3">
                      <Link
                        href={`/billing/credit-note-doc?id=${cn.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-graphite hover:text-accent font-serif italic"
                        title="Download credit note PDF"
                      >
                        PDF
                      </Link>
                      {cn.status === 'draft' ? (
                        <>
                          <button
                            onClick={() => handleApprove(cn)}
                            disabled={busy}
                            className="text-xs text-accent hover:text-accent-hover font-serif italic disabled:opacity-50"
                          >
                            {busy ? 'Working…' : 'Approve'}
                          </button>
                          <button
                            onClick={() => handleDelete(cn)}
                            disabled={busy}
                            className="text-xs text-graphite hover:text-danger font-serif italic disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </>
                      ) : cn.status === 'approved' ? (
                        <button
                          onClick={() => handleVoid(cn)}
                          disabled={busy}
                          className="text-xs text-graphite hover:text-danger font-serif italic disabled:opacity-50"
                          title="撤销 — 反向分录对冲,欠款加回"
                        >
                          {busy ? 'Working…' : 'Void'}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
