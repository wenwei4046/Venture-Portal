'use client'

import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { officeTime } from '@/lib/office-time'
import { formatMoney, formatMoneyBare } from '@/lib/utils'
import SortableTable from '@/components/SortableTable'
import { useRowLinks } from '@/components/row-links'
import type { RowMenuItem } from '@/components/RowMenu'
import AlignedFoot from '@/components/treasury/AlignedFoot'
import PhoneCards from '@/components/treasury/PhoneCards'

export interface LoanRow {
  id: string
  companyName: string
  companyCode: string
  createdAt: string
  /** 放款日 — the business date money went out (loans.disbursement_date).
   *  Optional so the stray `page - Copy.tsx` snapshot (user's file, off-limits)
   *  still type-checks; absent → renders — and sorts by createdAt. */
  disbursedAt?: string | null
  principal: number
  outstanding: number
  effectiveRate: number
  status: 'pending_approval' | 'active' | 'fully_repaid' | 'cancelled'
  /** Funding-source remark parsed out of repayment_terms (资金来源: …), null if none. */
  fundingSource: string | null
  /** An active loan with an open overdue record (the Overdue page's). */
  overdue?: boolean
}

/** The status as the sheet's chip (2026-10-09, the Finance revamp): active
 *  green, overdue red, pending blue, fully repaid grey. */
export function LoanStatusChip({ status, overdue = false }: { status: LoanRow['status']; overdue?: boolean }) {
  const [tone, label] =
    status === 'active'
      ? overdue
        ? ['danger', 'overdue']
        : ['ledger', 'active']
      : status === 'pending_approval'
        ? ['wait', 'pending approval']
        : status === 'fully_repaid'
          ? ['info', 'fully repaid']
          : ['', 'cancelled']
  return (
    <span className={`chip${tone ? ` ${tone}` : ''}`}>
      <i className="dot" />
      {label}
    </span>
  )
}

const day = (d: string) => dayjs(d).format('D MMM YYYY')
const rateText = (l: LoanRow) => `${(l.effectiveRate * 100).toFixed(3)}%`
/** What is still out — only an active loan has an outstanding. */
const outstandingOf = (l: LoanRow) => (l.status === 'active' ? l.outstanding : null)

/** The line under the company (2026-10-10, the handoff): its code, the day the
 *  money went out — the day it was recorded until then — and the funding
 *  source the loan was lent from (SC). */
export function companyLine(l: LoanRow): string {
  const when = l.disbursedAt ? day(l.disbursedAt) : officeTime(l.createdAt).format('D MMM YYYY')
  return [l.companyCode, when, l.fundingSource ? `SC ${l.fundingSource}` : null].filter(Boolean).join(' · ')
}

// The columns in the order the code declares them — what the Total row lays
// out before it has read the header as arranged.
const FOOT_COLUMNS = [
  { key: 'companyName' },
  { key: 'principal', right: true },
  { key: 'outstanding', right: true },
  { key: 'rate', right: true },
  { key: 'status' },
  { key: 'disbursedAt' },
]

export default function LoansTable({
  rows,
  canSetDefault = false,
  canAmend = false,
}: {
  rows: LoanRow[]
  /** The viewer may keep the arrangement on show as everyone's default. */
  canSetDefault?: boolean
  /** Amend terms (Treasury · Approve) is offered on an active loan's menu. */
  canAmend?: boolean
}) {
  // 2026-10-02: no View column. A double-click opens the loan; a right-click
  // offers the same, a new tab, its schedule to print and, while it is
  // active, its terms to amend (2026-10-09, the handoff).
  const links = useRowLinks<LoanRow>({
    href: (l) => `/fund-out/${l.id}`,
    title: (l) => `${l.companyName} · ${l.companyCode}`,
    more: (l) => {
      const items: RowMenuItem[] = []
      if (l.status !== 'cancelled') {
        items.push({ key: 'print', label: 'Print schedule', onSelect: () => window.open(`/fund-out/${l.id}?print=1`, '_blank', 'noopener,noreferrer') })
      }
      if (canAmend && l.status === 'active') {
        items.push({ key: 'amend', label: 'Amend terms', onSelect: () => window.location.assign(`/fund-out/${l.id}/edit`) })
      }
      return items
    },
  })

  // The phone's cards (2026-10-10, the handoff's phone list): latest
  // disbursement first, like the table, narrowed by their own search box.
  const [q, setQ] = useState('')
  const phoneRows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const when = (l: LoanRow) => l.disbursedAt ?? l.createdAt
    return [...rows]
      .filter((l) => !needle || [l.companyName, l.companyCode].some((t) => t.toLowerCase().includes(needle)))
      .sort((a, b) => when(b).localeCompare(when(a)))
  }, [rows, q])
  const total = (list: LoanRow[]) => ({
    principal: list.reduce((t, l) => t + l.principal, 0),
    outstanding: list.reduce((t, l) => t + (outstandingOf(l) ?? 0), 0),
  })
  const phoneTotal = total(phoneRows)

  return (
    <>
      <div className="md:hidden">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search company name / code…"
          aria-label="Search loans"
          className="fund-psearch"
        />
        <PhoneCards
          label="Loans"
          empty={`Nothing matches “${q}”.`}
          cards={phoneRows.map((l) => {
            const out = outstandingOf(l)
            return {
              key: l.id,
              href: `/fund-out/${l.id}`,
              title: l.companyName,
              figure: formatMoneyBare(l.principal),
              figureLabel: 'Principal',
              sub: companyLine(l),
              chips: <LoanStatusChip status={l.status} overdue={l.overdue} />,
              details: [
                { label: 'Outstanding', value: out != null ? formatMoneyBare(out) : null },
                { label: 'Rate', value: rateText(l) },
                { label: 'Disbursed', value: l.disbursedAt ? day(l.disbursedAt) : null },
              ],
            }
          })}
          foot={{ label: 'Total', value: formatMoneyBare(phoneTotal.principal), note: `Outstanding ${formatMoneyBare(phoneTotal.outstanding)}` }}
        />
      </div>
      <div className="hidden md:block">
        <SortableTable<LoanRow>
          layoutId="fund-out.loans"
          layoutTitle="Fund out"
          canSetDefault={canSetDefault}
          scrollBox
          resizeMode="neighbour"
          onRowOpen={links.onRowOpen}
          onRowContextMenu={links.onRowContextMenu}
          rows={rows}
          getRowKey={(l) => l.id}
          defaultSort={{ key: 'disbursedAt', dir: 'desc' }}
          searchKeys={['companyName', 'companyCode']}
          searchPlaceholder="Search company name / code…"
          // The handoff's peach Total row: the sums under Principal and Outstanding (2026-10-10).
          footer={(visible) => {
            const t = total(visible)
            return <AlignedFoot columns={FOOT_COLUMNS} values={{ principal: formatMoney(t.principal), outstanding: formatMoney(t.outstanding) }} />
          }}
          // ▽ on every column; the amounts and the date by Range too (2026-10-10, the handoff).
          columns={[
            {
              key: 'companyName',
              mobile: 'keep',
              group: '基本',
              label: 'Company',
              render: (l) => (
                <div>
                  <div className="text-ink">{l.companyName}</div>
                  <div className="text-[11px] text-graphite mt-0.5">{companyLine(l)}</div>
                </div>
              ),
              sortValue: (l) => l.companyName,
              filterable: true,
            },
            {
              key: 'principal',
              mobile: 'detail',
              group: '金额',
              label: 'Principal',
              align: 'right',
              render: (l) => formatMoney(l.principal),
              sortValue: (l) => l.principal,
              filterable: true,
              filterValue: (l) => formatMoneyBare(l.principal),
              range: 'number',
              cellClassName: 'whitespace-nowrap',
            },
            {
              key: 'outstanding',
              mobile: 'keep',
              group: '金额',
              label: 'Outstanding',
              align: 'right',
              render: (l) =>
                l.status === 'active' ? <span className="font-semibold">{formatMoney(l.outstanding)}</span> : <span className="text-muted">—</span>,
              // Nothing outstanding sorts below every figure (as −1 did) and
              // falls outside any range.
              sortValue: outstandingOf,
              filterable: true,
              filterValue: (l) => {
                const out = outstandingOf(l)
                return out != null ? formatMoneyBare(out) : ''
              },
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
              sortValue: (l) => l.effectiveRate,
              filterable: true,
              filterValue: rateText,
            },
            {
              key: 'status',
              mobile: 'detail',
              group: '基本',
              label: 'Status',
              render: (l) => <LoanStatusChip status={l.status} overdue={l.overdue} />,
              sortValue: (l) => (l.overdue ? 'overdue' : l.status),
              filterable: true,
              filterValue: (l) => (l.status === 'active' && l.overdue ? 'overdue' : l.status.replace('_', ' ')),
              cellClassName: 'whitespace-nowrap',
            },
            {
              // 放款日 (business date), not record-creation date.
              key: 'disbursedAt',
              mobile: 'detail',
              group: '日期',
              label: 'Disbursed',
              render: (l) => (l.disbursedAt ? day(l.disbursedAt) : <span className="text-muted">—</span>),
              sortValue: (l) => new Date(l.disbursedAt ?? l.createdAt),
              filterable: true,
              filterValue: (l) => (l.disbursedAt ? day(l.disbursedAt) : ''),
              range: 'date',
              cellClassName: 'text-graphite whitespace-nowrap',
            },
          ]}
        />
      </div>
      {links.menu}
    </>
  )
}
