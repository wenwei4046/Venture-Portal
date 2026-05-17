import { buildXlsxBuffer } from '@/lib/export/excel'
import type { TrialBalance } from '@/lib/cfo-reports'

export function buildTrialBalanceXlsx(tb: TrialBalance): Buffer {
  // Flat list. tb.rows is already sorted by buildTrialBalance (BS types first,
  // then P&L, code ascending within each type). No per-type sections or
  // subtotals — just every leaf account in one table, with a grand total.
  const dataRows: (string | number | null)[][] = tb.rows.map((r) => [
    `${r.code} ${r.name}`,
    r.debit > 0 ? r.debit : null,
    r.credit > 0 ? r.credit : null,
  ])
  dataRows.push(['TOTAL', tb.totals.debit, tb.totals.credit])

  return buildXlsxBuffer({
    sheetName: 'Trial Balance',
    headerRow: ['Account', 'Debit', 'Credit'],
    rows: dataRows,
    columnWidths: [42, 16, 16],
  })
}
