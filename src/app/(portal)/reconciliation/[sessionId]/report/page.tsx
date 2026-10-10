// Bank Reconciliation Report — the classic statement for one bank + month:
// bank closing balance walked to the GL balance via reconciling items, plus
// the item lists. English UI (matches Reports/Treasury); data comes from the
// SAME builder as both exports (lib/recon-report-data) so screen and file
// always agree. Works for open sessions too — the identity holds mid-recon.

import Link from 'next/link'
import dayjs from 'dayjs'
import { notFound } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePermission, requirePage } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { fetchReconReport } from '@/lib/recon-report-data'
import { formatMoney } from '@/lib/utils'
import type { ReconReportItem } from '@/lib/recon-report'

export const dynamic = 'force-dynamic'

function ItemsTable({ title, items }: { title: string; items: ReconReportItem[] }) {
  if (items.length === 0) return null
  return (
    <section className="mb-10">
      <h2 className="font-serif text-xl text-ink mb-3">
        {title} <span className="text-muted">({items.length})</span>
      </h2>
      <div className="overflow-x-auto">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Entry</th>
              <th>Description</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i, idx) => (
              <tr key={idx}>
                <td className="font-mono text-[12px] text-graphite">{dayjs(i.date).format('DD MMM YYYY')}</td>
                <td className="font-mono text-[12px] text-graphite">{i.ref || '—'}</td>
                <td className="font-serif text-[14px] text-ink">
                  {i.description || '—'}
                  {i.ignored ? (
                    <em className="font-serif italic text-muted text-xs ml-2">(ignored)</em>
                  ) : null}
                </td>
                <td className={`num ${i.amount < 0 ? 'text-danger' : 'text-ledger'}`}>
                  {formatMoney(i.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default async function ReconReportPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  await requirePage('/reconciliation/[sessionId]/report')
  await requirePermission('reconciliation')
  const { sessionId } = await params
  const supabase = (await createClient()) as unknown as SupabaseClient

  const report = await fetchReconReport(supabase, sessionId)
  if (!report) notFound()
  const m = report.model
  const monthLabel = dayjs(report.periodMonth).format('MMMM YYYY')
  const monthEndLabel = dayjs(m.monthEnd).format('DD MMM YYYY')

  // Walk rows: amounts are the EFFECT applied to the bank closing balance, so
  // the column sums visually into the adjusted figure.
  const walk: Array<{ label: string; amount: number | null; strong?: boolean }> = [
    { label: `Balance per bank statement (${monthEndLabel})`, amount: m.statementClosing },
    { label: `Add · outstanding receipts not yet banked (${m.outstandingReceipts.length})`, amount: m.sums.bookReceipts },
    { label: `Less · outstanding payments not yet presented (${m.outstandingPayments.length})`, amount: m.sums.bookPayments },
    { label: `Less · receipts in bank not in books (${m.stmtReceiptsNotInBooks.length})`, amount: -m.sums.stmtReceipts },
    { label: `Add · payments in bank not in books (${m.stmtPaymentsNotInBooks.length})`, amount: -m.sums.stmtPayments },
    { label: 'Adjusted balance', amount: m.adjustedBank, strong: true },
    { label: `Balance per GL ${report.glCode} (${monthEndLabel})`, amount: m.glClosing, strong: true },
  ]

  return (
    <div>
      <Link
        href={`/reconciliation/${sessionId}`}
        className="text-sm text-muted hover:text-accent font-sans transition-colors"
      >
        ← Back to review
      </Link>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> TREASURY · RECONCILIATION REPORT · {monthLabel.toUpperCase()}
          </div>
          <h1 className="page-title">{report.bankName}</h1>
          <p className="font-serif italic text-graphite text-base mt-2">
            {report.accountNumber ? `${report.accountNumber} · ` : ''}GL {report.glCode}
            {report.sourceFilename ? ` · ${report.sourceFilename}` : ''} · status {report.status}
          </p>
        </div>
        <div className="flex gap-4 items-start">
          <a
            href={`/reconciliation/${sessionId}/report/export?format=xlsx`}
            className="text-sm text-accent hover:text-accent-hover font-serif italic"
          >
            Export Excel
          </a>
          <a
            href={`/reconciliation/${sessionId}/report/export?format=pdf`}
            className="text-sm text-accent hover:text-accent-hover font-serif italic"
          >
            Export PDF
          </a>
        </div>
      </div>

      {/* ── Reconciliation statement ── */}
      <section className="mb-10">
        <div className="overflow-x-auto">
          <table className="ledger-table max-w-2xl">
            <thead>
              <tr>
                <th>Reconciliation statement</th>
                <th className="num">Amount (RM)</th>
              </tr>
            </thead>
            <tbody>
              {walk.map((r, idx) => (
                <tr key={idx}>
                  <td className={r.strong ? 'font-serif text-[15px] text-ink font-semibold' : 'font-serif text-[15px] text-ink'}>
                    {r.label}
                  </td>
                  <td className={`num ${r.strong ? 'font-semibold' : ''}`}>
                    {r.amount == null ? '—' : formatMoney(r.amount)}
                  </td>
                </tr>
              ))}
              <tr>
                <td className="font-serif text-[15px] font-semibold">
                  {m.tie ? (
                    <span className="text-ledger">✓ Reconciled — statement ties to GL</span>
                  ) : m.diff == null ? (
                    <span className="text-muted">No statement closing balance on this session</span>
                  ) : (
                    <span className="text-danger">✗ Off by {formatMoney(m.diff)}</span>
                  )}
                </td>
                <td className={`num font-semibold ${m.tie ? 'text-ledger' : 'text-danger'}`}>
                  {m.diff == null ? '—' : m.tie ? '0.00' : formatMoney(m.diff)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {m.statementOpening != null ? (
          <p className="font-serif italic text-muted text-sm mt-2">
            Statement opening {formatMoney(m.statementOpening)} · closing{' '}
            {m.statementClosing != null ? formatMoney(m.statementClosing) : '—'}
          </p>
        ) : null}
      </section>

      <ItemsTable title="Outstanding payments — in books, not yet presented" items={m.outstandingPayments} />
      <ItemsTable title="Outstanding receipts — in books, not yet banked" items={m.outstandingReceipts} />
      <ItemsTable title="Bank payments not in books" items={m.stmtPaymentsNotInBooks} />
      <ItemsTable title="Bank receipts not in books" items={m.stmtReceiptsNotInBooks} />

      {m.outstandingPayments.length === 0 &&
      m.outstandingReceipts.length === 0 &&
      m.stmtPaymentsNotInBooks.length === 0 &&
      m.stmtReceiptsNotInBooks.length === 0 ? (
        <p className="font-serif italic text-muted text-base">
          No reconciling items — every statement line is matched and every book entry is presented.
        </p>
      ) : null}
    </div>
  )
}
