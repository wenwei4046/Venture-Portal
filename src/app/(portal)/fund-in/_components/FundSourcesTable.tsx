'use client'

import dayjs from 'dayjs'
import { officeToday } from '@/lib/office-time'
import { formatMoney, lentToFromNotes } from '@/lib/utils'
import SortableTable from '@/components/SortableTable'
import { useRowLinks } from '@/components/row-links'
import type { RowMenuItem } from '@/components/RowMenu'

export type FundSourceStatus = 'pending_approval' | 'active' | 'matured' | 'repaid' | 'cancelled'

export interface FundSourceRow {
  id: string
  typeLabel: string
  fromLabel: string
  effectiveDate: string
  amount: number
  /** null → not applicable for this status, renders —. */
  outstanding: number | null
  costRate: number
  lockInMonths: number | null
  maturityDate: string | null
  status: FundSourceStatus
  /** Free-text notes — a 「借给: X」 remark renders as a badge under From
   *  (user 2026-08-06), other notes show truncated. */
  notes: string | null
}

/** The status as the sheet's chip (2026-10-09, the Finance revamp): active
 *  green, pending blue, matured orange, repaid grey; an active source maturing
 *  within 30 days says so in blue, one past maturity in amber. */
export function SourceStatusChip({ status, maturityDate }: { status: FundSourceStatus; maturityDate: string | null }) {
  let tone = ''
  let label: string = status.replace('_', ' ')
  if (status === 'pending_approval') tone = 'wait'
  else if (status === 'active') {
    tone = 'ledger'
    if (maturityDate) {
      const days = dayjs(maturityDate).diff(officeToday(), 'day')
      if (days >= 0 && days <= 30) {
        tone = 'wait'
        label = `matures in ${days}d`
      } else if (days < 0) {
        tone = 'alert'
        label = 'past maturity'
      }
    }
  } else if (status === 'matured') tone = 'accent'
  else if (status === 'repaid') tone = 'info'
  return (
    <span className={`chip${tone ? ` ${tone}` : ''}`}>
      <i className="dot" />
      {label}
    </span>
  )
}

export default function FundSourcesTable({
  rows,
  canSetDefault = false,
  canAmend = false,
}: {
  rows: FundSourceRow[]
  /** The viewer may keep the arrangement on show as everyone's default. */
  canSetDefault?: boolean
  /** Amend terms (Treasury · Approve) is offered on an active source's menu. */
  canAmend?: boolean
}) {
  // 2026-10-02: no View column. A double-click opens the source; a
  // right-click offers the same, a new tab, its schedule to print and, while
  // it is active, its terms to amend (2026-10-09, the handoff).
  const links = useRowLinks<FundSourceRow>({
    href: (s) => `/fund-in/${s.id}`,
    title: (s) => `${s.fromLabel} · ${s.typeLabel}`,
    more: (s) => {
      const items: RowMenuItem[] = []
      if (s.status !== 'cancelled') {
        items.push({ key: 'print', label: 'Print schedule', onSelect: () => window.open(`/fund-in/${s.id}?print=1`, '_blank', 'noopener,noreferrer') })
      }
      if (canAmend && s.status === 'active') {
        items.push({ key: 'amend', label: 'Amend terms', onSelect: () => window.location.assign(`/fund-in/${s.id}/edit`) })
      }
      return items
    },
  })
  return (
    <>
      <SortableTable<FundSourceRow>
        layoutId="fund-in.sources"
        layoutTitle="Fund in"
        canSetDefault={canSetDefault}
        scrollBox
        resizeMode="neighbour"
        onRowOpen={links.onRowOpen}
        onRowContextMenu={links.onRowContextMenu}
        rows={rows}
        getRowKey={(s) => s.id}
        defaultSort={{ key: 'effectiveDate', dir: 'desc' }}
        searchKeys={['fromLabel', 'typeLabel', 'notes']}
        searchPlaceholder="Search source, type…"
        footer={(visible) => {
          const amount = visible.reduce((t, s) => t + s.amount, 0)
          const outstanding = visible.reduce((t, s) => t + (s.outstanding ?? 0), 0)
          return (
            <tr>
              <td colSpan={1000} className="q-foot">
                <span>
                  {visible.length} {visible.length === 1 ? 'source' : 'sources'} · amount {formatMoney(amount)}
                </span>
                <span className="num">Outstanding {formatMoney(outstanding)}</span>
              </td>
            </tr>
          )
        }}
        columns={[
          {
            key: 'typeLabel',
            mobile: 'detail',
            group: '基本',
            label: 'Type',
            render: (s) => s.typeLabel,
            sortValue: (s) => s.typeLabel,
            filterable: true,
            cellClassName: 'text-graphite whitespace-nowrap',
          },
          {
            key: 'fromLabel',
            mobile: 'keep',
            group: '基本',
            label: 'From',
            render: (s) => {
              const lentTo = lentToFromNotes(s.notes)
              return (
                <div>
                  <div className="text-ink">{s.fromLabel}</div>
                  {lentTo ? (
                    <span
                      className="inline-block mt-0.5 font-mono text-[10px] uppercase tracking-wider text-info border border-hairline rounded px-1.5 py-0.5"
                      title={s.notes ?? undefined}
                    >
                      LENT TO {lentTo}
                    </span>
                  ) : s.notes ? (
                    <div className="text-muted text-xs mt-0.5 max-w-[220px] truncate" title={s.notes}>
                      {s.notes}
                    </div>
                  ) : null}
                  {/* The phone's small print: the type, the date, the status. */}
                  <span className="q-sub md:hidden">
                    <span className="q-sub-no">
                      {s.typeLabel} · {dayjs(s.effectiveDate).format('D MMM YYYY')}
                    </span>
                    <span className="q-sub-by">
                      <span className="by">
                        <SourceStatusChip status={s.status} maturityDate={s.maturityDate} />
                      </span>
                    </span>
                  </span>
                </div>
              )
            },
            sortValue: (s) => s.fromLabel,
          },
          {
            key: 'effectiveDate',
            mobile: 'detail',
            group: '日期',
            label: 'Date',
            render: (s) => dayjs(s.effectiveDate).format('D MMM YYYY'),
            sortValue: (s) => new Date(s.effectiveDate),
            filterable: true,
            range: 'date',
            cellClassName: 'whitespace-nowrap',
          },
          {
            key: 'amount',
            mobile: 'detail',
            group: '金额',
            label: 'Amount',
            align: 'right',
            render: (s) => formatMoney(s.amount),
            sortValue: (s) => s.amount,
            filterable: true,
            range: 'number',
            cellClassName: 'whitespace-nowrap',
          },
          {
            key: 'outstanding',
            mobile: 'keep',
            group: '金额',
            label: 'Outstanding',
            align: 'right',
            render: (s) =>
              s.outstanding != null ? <span className="font-semibold">{formatMoney(s.outstanding)}</span> : <span className="text-muted">—</span>,
            sortValue: (s) => s.outstanding ?? -1,
            cellClassName: 'whitespace-nowrap',
          },
          {
            key: 'rate',
            mobile: 'detail',
            group: '金额',
            label: 'Rate',
            align: 'right',
            render: (s) => `${(s.costRate * 100).toFixed(3)}%`,
            sortValue: (s) => s.costRate,
          },
          {
            key: 'lockIn',
            mobile: 'detail',
            group: '日期',
            label: 'Lock-in',
            align: 'right',
            render: (s) => (s.lockInMonths ? `${s.lockInMonths} mo` : <span className="text-muted">—</span>),
            sortValue: (s) => s.lockInMonths ?? -1,
          },
          {
            key: 'maturity',
            mobile: 'detail',
            group: '日期',
            label: 'Maturity',
            render: (s) => (s.maturityDate ? dayjs(s.maturityDate).format('D MMM YYYY') : <span className="text-muted">—</span>),
            sortValue: (s) => (s.maturityDate ? new Date(s.maturityDate) : null),
            cellClassName: 'whitespace-nowrap',
          },
          {
            key: 'status',
            mobile: 'detail',
            group: '基本',
            label: 'Status',
            render: (s) => <SourceStatusChip status={s.status} maturityDate={s.maturityDate} />,
            sortValue: (s) => s.status,
            filterable: true,
            filterValue: (s) => s.status.replace('_', ' '),
            cellClassName: 'whitespace-nowrap',
          },
        ]}
      />
      {links.menu}
    </>
  )
}
