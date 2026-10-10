'use client'

import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { officeToday } from '@/lib/office-time'
import { formatMoney, formatMoneyBare, lentToFromNotes } from '@/lib/utils'
import SortableTable from '@/components/SortableTable'
import { useRowLinks } from '@/components/row-links'
import type { RowMenuItem } from '@/components/RowMenu'
import AlignedFoot from '@/components/treasury/AlignedFoot'
import PhoneCards from '@/components/treasury/PhoneCards'

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

const day = (d: string) => dayjs(d).format('D MMM YYYY')
const rateText = (s: FundSourceRow) => `${(s.costRate * 100).toFixed(3)}%`
const lockInText = (s: FundSourceRow) => (s.lockInMonths ? `${s.lockInMonths} mo` : '')

// The columns in the order the code declares them — what the Total row lays
// out before it has read the header as arranged.
const FOOT_COLUMNS = [
  { key: 'typeLabel' },
  { key: 'fromLabel' },
  { key: 'effectiveDate' },
  { key: 'amount', right: true },
  { key: 'outstanding', right: true },
  { key: 'rate', right: true },
  { key: 'lockIn', right: true },
  { key: 'maturity' },
  { key: 'status' },
]

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

  // The phone's cards (2026-10-10, the handoff's phone list): newest first,
  // like the table, narrowed by their own search box.
  const [q, setQ] = useState('')
  const phoneRows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return [...rows]
      .filter((s) => !needle || [s.fromLabel, s.typeLabel, s.notes ?? ''].some((t) => t.toLowerCase().includes(needle)))
      .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))
  }, [rows, q])
  const total = (list: FundSourceRow[]) => ({
    amount: list.reduce((t, s) => t + s.amount, 0),
    outstanding: list.reduce((t, s) => t + (s.outstanding ?? 0), 0),
  })
  const phoneTotal = total(phoneRows)

  return (
    <>
      <div className="md:hidden">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search source, type…"
          aria-label="Search fund sources"
          className="fund-psearch"
        />
        <PhoneCards
          label="Fund sources"
          empty={`Nothing matches “${q}”.`}
          cards={phoneRows.map((s) => {
            const lentTo = lentToFromNotes(s.notes)
            return {
              key: s.id,
              href: `/fund-in/${s.id}`,
              title: s.typeLabel,
              figure: formatMoneyBare(s.amount),
              figureLabel: 'Amount',
              chips: <SourceStatusChip status={s.status} maturityDate={s.maturityDate} />,
              details: [
                { label: 'From', value: lentTo ? `${s.fromLabel} · lent to ${lentTo}` : s.fromLabel },
                { label: 'Date', value: day(s.effectiveDate) },
                { label: 'Outstanding', value: s.outstanding != null ? formatMoneyBare(s.outstanding) : null },
                { label: 'Rate', value: rateText(s) },
                { label: 'Lock-in', value: lockInText(s) },
                { label: 'Maturity', value: s.maturityDate ? day(s.maturityDate) : null },
              ],
            }
          })}
          foot={{ label: 'Total', value: formatMoneyBare(phoneTotal.amount), note: `Outstanding ${formatMoneyBare(phoneTotal.outstanding)}` }}
        />
      </div>
      <div className="hidden md:block">
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
          // The handoff's peach Total row: the sums under Amount and Outstanding (2026-10-10).
          footer={(visible) => {
            const t = total(visible)
            return <AlignedFoot columns={FOOT_COLUMNS} values={{ amount: formatMoney(t.amount), outstanding: formatMoney(t.outstanding) }} />
          }}
          // ▽ on every column; the amounts and the dates by Range too (2026-10-10, the handoff).
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
                  </div>
                )
              },
              sortValue: (s) => s.fromLabel,
              filterable: true,
            },
            {
              key: 'effectiveDate',
              mobile: 'detail',
              group: '日期',
              label: 'Date',
              render: (s) => day(s.effectiveDate),
              sortValue: (s) => new Date(s.effectiveDate),
              filterable: true,
              filterValue: (s) => day(s.effectiveDate),
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
              filterValue: (s) => formatMoneyBare(s.amount),
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
              // Nothing outstanding sorts below every figure (as −1 did) and
              // falls outside any range.
              sortValue: (s) => s.outstanding,
              filterable: true,
              filterValue: (s) => (s.outstanding != null ? formatMoneyBare(s.outstanding) : ''),
              range: 'number',
              cellClassName: 'whitespace-nowrap',
            },
            {
              key: 'rate',
              mobile: 'detail',
              group: '金额',
              label: 'Rate',
              align: 'right',
              render: rateText,
              sortValue: (s) => s.costRate,
              filterable: true,
              filterValue: rateText,
            },
            {
              key: 'lockIn',
              mobile: 'detail',
              group: '日期',
              label: 'Lock-in',
              align: 'right',
              render: (s) => (s.lockInMonths ? lockInText(s) : <span className="text-muted">—</span>),
              sortValue: (s) => s.lockInMonths ?? -1,
              filterable: true,
              filterValue: lockInText,
            },
            {
              key: 'maturity',
              mobile: 'detail',
              group: '日期',
              label: 'Maturity',
              render: (s) => (s.maturityDate ? day(s.maturityDate) : <span className="text-muted">—</span>),
              sortValue: (s) => (s.maturityDate ? new Date(s.maturityDate) : null),
              filterable: true,
              filterValue: (s) => (s.maturityDate ? day(s.maturityDate) : ''),
              range: 'date',
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
      </div>
      {links.menu}
    </>
  )
}
