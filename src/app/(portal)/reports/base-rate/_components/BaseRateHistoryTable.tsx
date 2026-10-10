'use client'

import SortableTable from '@/components/SortableTable'

export interface BaseRateRow {
  id: string
  quarter: string
  /** Monthly rates as fractions (0.0086 = 0.860%). */
  weightedCost: number
  opMargin: number
  baseRate: number
  /** When the Principal approved it, as the office's day (YYYY-MM-DD), or null. */
  approvedDay: string | null
  /** That day as it reads ("1 Oct 2026"). */
  approvedText: string
}

/** A rate in percent, as the page prints it — and as the range compares it. */
const pctOf = (v: number) => Math.round(v * 100 * 1000) / 1000
const pct = (v: number) => `${(v * 100).toFixed(3)}%`

// The quarters' rates as the handoff's sheet table (2026-10-10): sort arrows,
// ▽ filters with a range on the rates (typed in percent, as they read) and on
// the approval date, widths moved between neighbours. The base rate is set at
// the figures' own weight — the prototype's "accent" tone draws it in black.
export default function BaseRateHistoryTable({ rows, canSetDefault = false }: { rows: BaseRateRow[]; canSetDefault?: boolean }) {
  return (
    <SortableTable<BaseRateRow>
      layoutId="reports.base-rate"
      layoutTitle="Base rate history"
      canSetDefault={canSetDefault}
      scrollBox
      resizeMode="neighbour"
      rows={rows}
      getRowKey={(r) => r.id}
      defaultSort={{ key: 'approved', dir: 'desc' }}
      columns={[
        {
          key: 'quarter',
          label: 'Quarter',
          mobile: 'keep',
          render: (r) => r.quarter,
          sortValue: (r) => r.quarter,
          filterable: true,
          cellClassName: 'whitespace-nowrap',
        },
        {
          key: 'weightedCost',
          label: 'Wtd cost',
          mobile: 'detail',
          align: 'right',
          render: (r) => pct(r.weightedCost),
          sortValue: (r) => pctOf(r.weightedCost),
          filterable: true,
          filterValue: (r) => pct(r.weightedCost),
          range: 'number',
        },
        {
          key: 'opMargin',
          label: 'Margin',
          mobile: 'detail',
          align: 'right',
          render: (r) => pct(r.opMargin),
          sortValue: (r) => pctOf(r.opMargin),
          filterable: true,
          filterValue: (r) => pct(r.opMargin),
          range: 'number',
        },
        {
          key: 'baseRate',
          label: 'Base rate',
          mobile: 'keep',
          align: 'right',
          render: (r) => pct(r.baseRate),
          sortValue: (r) => pctOf(r.baseRate),
          filterable: true,
          filterValue: (r) => pct(r.baseRate),
          range: 'number',
        },
        {
          key: 'approved',
          label: 'Approved',
          mobile: 'detail',
          render: (r) => r.approvedText,
          sortValue: (r) => r.approvedDay,
          filterable: true,
          filterValue: (r) => r.approvedText,
          range: 'date',
          cellClassName: 'whitespace-nowrap',
        },
      ]}
    />
  )
}
