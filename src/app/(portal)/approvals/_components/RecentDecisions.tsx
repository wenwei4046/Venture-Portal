'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import { formatMoney } from '@/lib/utils'
import SortableTable, { type SortableColumn } from '@/components/SortableTable'
import type { DecisionRow } from '@/lib/approval-queue'

// Recent decisions as a table under the queue (2026-10-07, the approved
// Approvals sample): number, text, type, the decision as a chip in its
// colour, who sent it, when it was decided, the amount. On a phone the row is
// the description — with the number and the outcome as small print — and the
// amount; the arrow opens the rest.

const cut = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

const chip = (decision: DecisionRow['decision']) => (
  <span className={`chip ${decision === 'approved' ? 'ledger' : 'danger'}`}>
    <i className="dot" />
    {decision}
  </span>
)

export default function RecentDecisions({ rows, canSetDefault = false }: { rows: DecisionRow[]; canSetDefault?: boolean }) {
  const router = useRouter()
  if (rows.length === 0) return null

  const columns: SortableColumn<DecisionRow>[] = [
    {
      key: 'voucher_no',
      group: '基本',
      label: 'Voucher #',
      mobile: 'drop',
      render: (r) =>
        r.voucherNo ? (
          <Link href={r.href} className="font-mono text-[12px] font-medium text-accent whitespace-nowrap">
            {r.voucherNo}
          </Link>
        ) : (
          <span className="text-muted">—</span>
        ),
      sortValue: (r) => r.voucherNo ?? '',
    },
    {
      key: 'description',
      group: '基本',
      label: 'Description',
      mobile: 'keep',
      render: (r) => (
        <>
          <span className="q-desc" title={r.description}>
            {r.description ? cut(r.description) : <span className="text-muted">No description</span>}
          </span>
          <span className="q-sub md:hidden">
            {r.voucherNo ? <span className="q-sub-no">{r.voucherNo}</span> : null}
            <span className="q-sub-by">
              <span className="by">{chip(r.decision)}</span>
              <span className="on">{r.decidedAt ? dayjs(r.decidedAt).format('D MMM') : ''}</span>
            </span>
          </span>
        </>
      ),
      sortValue: (r) => r.description,
    },
    {
      key: 'type',
      group: '基本',
      label: 'Type',
      mobile: 'detail',
      filterable: true,
      render: (r) => <span className="type-tag">{r.typeLabel}</span>,
      sortValue: (r) => r.typeLabel,
    },
    {
      key: 'decision',
      group: '基本',
      label: 'Decision',
      mobile: 'detail',
      filterable: true,
      render: (r) => chip(r.decision),
      sortValue: (r) => r.decision,
      filterValue: (r) => r.decision,
    },
    {
      key: 'by',
      group: '基本',
      label: 'By',
      mobile: 'detail',
      filterable: true,
      render: (r) => r.submitterName,
      sortValue: (r) => r.submitterName,
      cellClassName: 'whitespace-nowrap',
    },
    {
      key: 'decided',
      group: '日期',
      label: 'Decided',
      mobile: 'detail',
      render: (r) => (r.decidedAt ? dayjs(r.decidedAt).format('D MMM') : '—'),
      sortValue: (r) => (r.decidedAt ? new Date(r.decidedAt) : null),
      cellClassName: 'font-mono text-[12px] text-graphite whitespace-nowrap',
    },
    {
      key: 'amount',
      group: '金额',
      label: 'Amount',
      align: 'right',
      mobile: 'keep',
      render: (r) => (r.amount !== null ? <span className="font-semibold">{formatMoney(r.amount)}</span> : <span className="text-muted">—</span>),
      sortValue: (r) => r.amount ?? 0,
      cellClassName: 'whitespace-nowrap',
    },
  ]

  return (
    <section className="approvals-queue fin-queue">
      <div className="sect-head">
        <h2>Recent decisions</h2>
        <span className="rule" aria-hidden />
        <span className="count">LAST {rows.length} RESOLVED</span>
      </div>
      <div className="overflow-x-auto">
        <SortableTable<DecisionRow>
          layoutId="approvals.decisions"
          layoutTitle="Recent decisions"
          canSetDefault={canSetDefault}
          rows={rows}
          columns={columns}
          getRowKey={(r) => r.id}
          defaultSort={{ key: 'decided', dir: 'desc' }}
          onRowOpen={(r) => router.push(r.href)}
          openLabel="Open the voucher →"
        />
      </div>
    </section>
  )
}
