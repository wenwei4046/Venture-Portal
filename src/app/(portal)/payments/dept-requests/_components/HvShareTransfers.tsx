'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import { formatMoney } from '@/lib/utils'
import { officeTime } from '@/lib/office-time'
import type { HvShare } from '@/lib/director-hv-share'
import { transferHvShare, undoHvShareTransfer } from '../actions'

/**
 * HOUZS Venture's share of the directors' CTC, as HR sent it from Director
 * Salary (2026-10-13 — the user: "then confirm so that finance will get the
 * submittion to make the inter transfer fund"). Transfer moves each
 * department's amount out of its pool into the Director pool — an invoice to
 * the department's pool and its receipt by netting, as an inter-billing done
 * by hand — and Undo takes it all back.
 */
export default function HvShareTransfers({
  pending,
  transferred,
  canTransfer,
  canUndo,
  today,
}: {
  pending: HvShare[]
  transferred: HvShare[]
  canTransfer: boolean
  canUndo: boolean
  /** The office's today, the transfer date's default. */
  today: string
}) {
  return (
    <section className="mb-12">
      <div className="sect-head">
        <h2>HOUZS Venture&rsquo;s Director Share</h2>
        <span className="rule" aria-hidden />
        <span className="count">{pending.length} WAITING</span>
      </div>

      {pending.length === 0 ? (
        <div className="border border-hairline rounded-card bg-surface-2 p-6 text-center">
          <p className="text-sm">Nothing waiting.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {pending.map(share => (
            <PendingShare key={share.id} share={share} canTransfer={canTransfer} today={today} />
          ))}
        </div>
      )}

      {transferred.length > 0 ? (
        <div className="mt-8">
          <div className="table-frame">
            <div className="table-frame-scroll">
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>Transferred</th>
                    <th className="right">Amount</th>
                    <th className="m-hide">Documents</th>
                    <th className="right" aria-label="Undo" />
                  </tr>
                </thead>
                <tbody>
                  {transferred.map(share => (
                    <TransferredRow key={share.id} share={share} canUndo={canUndo} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

const monthOf = (share: HvShare) => dayjs(share.periodMonth).format('MMMM YYYY')

function PendingShare({ share, canTransfer, today }: { share: HvShare; canTransfer: boolean; today: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [date, setDate] = useState(today)
  const [error, setError] = useState<string | null>(null)
  const byPct = share.splitMode === 'percent'

  function transfer() {
    setError(null)
    startTransition(async () => {
      const res = await transferHvShare(share.id, date)
      if (!res.ok) {
        setError(res.reason)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="border border-hairline rounded-card bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-1">
        <div className="font-medium text-ink">{monthOf(share)}</div>
        <div className="font-mono tabular font-semibold text-ink text-lg">{formatMoney(share.totalCtc)}</div>
      </div>
      <div className="font-mono text-[11px] mb-4">
        {share.submittedAt ? officeTime(share.submittedAt).format('D MMM YYYY HH:mm') : ''}
        {share.submittedBy ? ` · ${share.submittedBy}` : ''}
      </div>

      <table className="ledger-table">
        <thead>
          <tr>
            <th>Department</th>
            {byPct ? <th className="right">Share</th> : null}
            <th className="right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {share.lines.map(l => (
            <tr key={l.departmentId}>
              <td>
                <span className="font-medium">{l.department}</span>
                {l.stays ? (
                  <span className="chip ml-2" title="The Director pool bears this part — nothing moves">
                    <span className="dot" />
                    Stays in pool
                  </span>
                ) : null}
              </td>
              {byPct ? <td className="num">{l.pct == null ? '—' : `${Number(l.pct.toFixed(4))}%`}</td> : null}
              <td className="num">{formatMoney(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {canTransfer ? (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="block text-xs mb-1">Transfer date</span>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="px-3 py-2 bg-paper border border-hairline rounded-control text-sm text-ink focus:outline-none focus:border-accent-border"
            />
          </label>
          <button
            type="button"
            onClick={transfer}
            disabled={isPending || !date}
            className="bg-accent hover:bg-accent-hover text-white text-sm px-5 py-2 rounded-control transition-colors disabled:opacity-50"
          >
            {isPending ? 'Transferring…' : 'Transfer'}
          </button>
          {error ? <span className="text-sm text-danger basis-full">{error}</span> : null}
        </div>
      ) : null}
    </div>
  )
}

function TransferredRow({ share, canUndo }: { share: HvShare; canUndo: boolean }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [armed, setArmed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const moved = share.lines.filter(l => l.invoiceId || l.voucherId)

  function undo() {
    if (!armed) {
      setArmed(true)
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await undoHvShareTransfer(share.id)
      if (!res.ok) {
        setError(res.reason)
        setArmed(false)
        return
      }
      router.refresh()
    })
  }

  return (
    <tr>
      <td>
        <div className="font-medium">{monthOf(share)}</div>
        <div className="font-mono text-[11px] mt-0.5">
          {share.transferDate ? dayjs(share.transferDate).format('D MMM YYYY') : ''}
          {share.transferredBy ? ` · ${share.transferredBy}` : ''}
        </div>
        {error ? <div className="text-xs text-danger mt-1">{error}</div> : null}
      </td>
      <td className="num">{formatMoney(share.totalCtc)}</td>
      <td className="m-hide">
        <div className="flex flex-col gap-0.5 font-mono text-[12px]">
          {moved.map(l => (
            <span key={l.departmentId}>
              {l.department}:{' '}
              {l.invoiceId ? (
                <Link href={`/invoices/${l.invoiceId}`} className="text-accent hover:text-accent-hover">
                  {l.invoiceNo}
                </Link>
              ) : null}
              {l.voucherId ? (
                <>
                  {' · '}
                  <Link href={`/payments/${l.voucherId}`} className="text-accent hover:text-accent-hover">
                    {l.voucherNo}
                  </Link>
                </>
              ) : null}
            </span>
          ))}
        </div>
      </td>
      <td className="right">
        {canUndo ? (
          <button
            type="button"
            onClick={undo}
            onBlur={() => setArmed(false)}
            disabled={isPending}
            className={`text-xs px-3 py-1.5 rounded-control border transition-colors disabled:opacity-50 ${
              armed ? 'border-danger text-danger bg-surface' : 'border-hairline text-ink bg-surface hover:bg-surface-2'
            }`}
            title="Voids its invoices and receipts, and puts the money back in each pool"
          >
            {isPending ? 'Undoing…' : armed ? 'Undo — sure?' : 'Undo'}
          </button>
        ) : null}
      </td>
    </tr>
  )
}
