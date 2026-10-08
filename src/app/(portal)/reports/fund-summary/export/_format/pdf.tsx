import React from 'react'
import { officeTime } from '@/lib/office-time'
import { PdfDocument, PdfTable } from '@/lib/export/pdf'
import type { Database } from '@/lib/supabase/database.types'

type FundSource = Database['public']['Tables']['fund_sources']['Row']

interface FundSummaryData {
  fundSources: FundSource[]
  totalPaid: number
  weightedCost: number
  hvFundBalance: number
  deptPoolBalance: number
  loansOutstanding: number
  invoicePoolBalance: number
}

export function FundSummaryPdf({ data }: { data: FundSummaryData }) {
  const paidCapitalRows = [
    ...data.fundSources.map(source => {
      const sourceLabel =
        source.source_type === 'director_loan'
          ? 'Director Loan'
          : source.source_type === 'outsource'
            ? 'Outsource'
            : source.source_type === 'department_pool'
              ? 'Dept Pool'
              : 'Subsidiary Savings'

      return [sourceLabel, source.amount]
    }),
    ['Total Paid', data.totalPaid],
    ['Weighted Cost (%/mo)', Number(data.weightedCost) * 100],
  ]

  const freeCapitalRows = [
    ['Venture Pool', data.hvFundBalance],
    ['Dept Pool (Marketing)', data.deptPoolBalance],
    ['Total Free', data.hvFundBalance + data.deptPoolBalance],
  ]

  const allocatedRows = [
    ['Loans Outstanding', data.loansOutstanding],
    ['Invoice Payout Pool', data.invoicePoolBalance],
  ]

  return (
    <PdfDocument title="Fund Summary" periodLabel={officeTime().format('D MMMM YYYY')}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 12, textTransform: 'uppercase' }}>
          Paid Capital
        </h2>
        <PdfTable
          columns={[
            { label: 'Source', width: 320 },
            { label: 'Amount', width: 120, align: 'right' },
          ]}
          numberFormat="money"
          rows={paidCapitalRows}
        />
      </div>

      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 12, textTransform: 'uppercase' }}>
          Free Capital
        </h2>
        <PdfTable
          columns={[
            { label: 'Line', width: 320 },
            { label: 'Amount', width: 120, align: 'right' },
          ]}
          numberFormat="money"
          rows={freeCapitalRows}
        />
      </div>

      <div>
        <h2 style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 12, textTransform: 'uppercase' }}>
          Allocated
        </h2>
        <PdfTable
          columns={[
            { label: 'Line', width: 320 },
            { label: 'Amount', width: 120, align: 'right' },
          ]}
          numberFormat="money"
          rows={allocatedRows}
        />
      </div>
    </PdfDocument>
  )
}
