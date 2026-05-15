import { buildXlsxBuffer } from '@/lib/export/excel'
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

export function buildFundSummaryXlsx(data: FundSummaryData): Buffer {
  const rows: (string | number | null)[][] = []

  // Paid Capital Section
  rows.push(['PAID CAPITAL', ''])
  rows.push(['Source', 'Amount', 'Rate', 'Maturity'])

  for (const source of data.fundSources) {
    const sourceLabel =
      source.source_type === 'director_loan'
        ? 'Director Loan'
        : source.source_type === 'outsource'
          ? 'Outsource'
          : source.source_type === 'department_pool'
            ? 'Dept Pool'
            : 'Subsidiary Savings'

    rows.push([
      sourceLabel,
      source.amount,
      Number(source.cost_rate) * 100,
      source.maturity_date ? new Date(source.maturity_date).toLocaleDateString() : '',
    ])
  }

  rows.push(['Total Paid', data.totalPaid])
  rows.push(['Weighted Cost', Number(data.weightedCost) * 100])
  rows.push([''])

  // Free Capital Section
  rows.push(['FREE CAPITAL', ''])
  rows.push(['Line', 'Amount'])
  rows.push(['Venture Pool', data.hvFundBalance])
  rows.push(['Dept Pool (Marketing)', data.deptPoolBalance])
  rows.push(['Total Free', data.hvFundBalance + data.deptPoolBalance])
  rows.push([''])

  // Allocated Section
  rows.push(['ALLOCATED', ''])
  rows.push(['Line', 'Amount'])
  rows.push(['Loans Outstanding', data.loansOutstanding])
  rows.push(['Invoice Payout Pool', data.invoicePoolBalance])

  return buildXlsxBuffer({
    sheetName: 'Fund Summary',
    headerRow: ['Line', 'Amount'],
    rows,
    columnWidths: [40, 18, 15, 18],
  })
}
