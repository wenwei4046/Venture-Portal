'use client'

import Link from 'next/link'
import dayjs from 'dayjs'
import SortableTable from '@/components/SortableTable'
import { useRowLinks } from '@/components/row-links'
import { useSessionRowActions } from './SessionRowActions'

export interface SessionRow {
  id: string
  bank: string
  /** The statement's month, as its first day (YYYY-MM-01). */
  periodMonth: string
  file: string | null
  /** Statement lines matched, contra'd or ignored — of `total`. */
  cleared: number
  total: number
  status: string
}

const monthText = (iso: string) => dayjs(iso).format('MMM YYYY')

function StatusChip({ status }: { status: string }) {
  return (
    <span className={`chip ${status === 'done' ? 'ledger' : 'alert'}`}>
      <span className="dot" />
      {status}
    </span>
  )
}

// The monthly reconciliations as the handoff's sheet table (2026-10-10): sort
// arrows, ▽ filters with a range on the month and the counts, a scroll box,
// widths moved between neighbours. A double-click opens the session; the row
// keeps one button (Continue while it is open, Open once done) and the rest —
// its report, Mark done / Reopen, Delete — are on its right-click menu.
export default function ReconSessionsTable({ rows, canSetDefault = false }: { rows: SessionRow[]; canSetDefault?: boolean }) {
  const actions = useSessionRowActions()
  const links = useRowLinks<SessionRow>({
    href: (s) => `/reconciliation/${s.id}`,
    title: (s) => `${s.bank} · ${monthText(s.periodMonth)}`,
    more: (s) => actions.items(s),
  })

  return (
    <>
      {actions.error ? <div className="sheet-danger mb-4">{actions.error}</div> : null}
      <div className="fin-queue">
        <SortableTable<SessionRow>
          layoutId="reconciliation.sessions"
          layoutTitle="Monthly reconciliations"
          canSetDefault={canSetDefault}
          scrollBox
          resizeMode="neighbour"
          onRowOpen={links.onRowOpen}
          onRowContextMenu={links.onRowContextMenu}
          rows={rows}
          getRowKey={(s) => s.id}
          defaultSort={{ key: 'month', dir: 'desc' }}
          columns={[
            {
              key: 'bank',
              label: 'Bank',
              mobile: 'keep',
              render: (s) => (
                <>
                  <span className="font-medium">{s.bank}</span>
                  {/* The phone's small print: the month and where it stands. */}
                  <span className="q-sub md:hidden">
                    <span className="q-sub-by">
                      <span className="by">{monthText(s.periodMonth)}</span>
                      <span className="on">
                        <StatusChip status={s.status} />
                      </span>
                    </span>
                  </span>
                </>
              ),
              sortValue: (s) => s.bank,
              filterable: true,
            },
            {
              key: 'month',
              label: 'Month',
              mobile: 'detail',
              render: (s) => monthText(s.periodMonth),
              sortValue: (s) => s.periodMonth,
              filterable: true,
              filterValue: (s) => monthText(s.periodMonth),
              range: 'date',
              cellClassName: 'whitespace-nowrap',
            },
            {
              key: 'file',
              label: 'File',
              mobile: 'detail',
              render: (s) => (
                <span className="font-mono text-[11.5px]" title={s.file ?? undefined}>
                  {s.file ?? '—'}
                </span>
              ),
              sortValue: (s) => s.file ?? '',
              filterable: true,
              cellClassName: 'max-w-[220px] truncate',
            },
            {
              key: 'cleared',
              label: 'Cleared',
              mobile: 'detail',
              align: 'right',
              render: (s) => `${s.cleared} / ${s.total}`,
              sortValue: (s) => s.cleared,
              filterable: true,
              filterValue: (s) => `${s.cleared} / ${s.total}`,
              range: 'number',
              cellClassName: 'whitespace-nowrap',
            },
            {
              key: 'open',
              label: 'Open items',
              mobile: 'keep',
              align: 'right',
              render: (s) => {
                const open = s.total - s.cleared
                return <span className={open === 0 ? 'text-ledger' : 'text-alert'}>{open === 0 ? '✓ 0' : open}</span>
              },
              sortValue: (s) => s.total - s.cleared,
              filterable: true,
              filterValue: (s) => String(s.total - s.cleared),
              range: 'number',
              cellClassName: 'whitespace-nowrap',
            },
            {
              key: 'status',
              label: 'Status',
              mobile: 'detail',
              render: (s) => <StatusChip status={s.status} />,
              sortValue: (s) => s.status,
              filterable: true,
              cellClassName: 'whitespace-nowrap',
            },
            {
              key: 'action',
              label: 'Actions',
              sortable: false,
              // The phone opens the row with its own Open →.
              mobile: 'drop',
              render: (s) => (
                // bg-white keeps it off the sheet's underline for links in cells.
                <Link href={`/reconciliation/${s.id}`} className="adm-row-btn bg-white">
                  {s.status === 'open' ? 'Continue' : 'Open'}
                </Link>
              ),
              cellClassName: 'whitespace-nowrap',
            },
          ]}
        />
        {links.menu}
      </div>
    </>
  )
}
