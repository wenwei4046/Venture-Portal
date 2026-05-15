import { buildXlsxBuffer } from '@/lib/export/excel'
import type { Ledger } from '@/lib/cfo-reports'
import dayjs from 'dayjs'

function fmtBalance(signed: number): string {
  if (Math.abs(signed) < 0.005) return '—'
  const abs = Math.abs(signed).toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${abs} ${signed >= 0 ? 'Dr' : 'Cr'}`
}

export function buildLedgerXlsx(led: Ledger): Buffer {
  const rows: (string | number | null)[][] = []
  rows.push([`Account: ${led.code} ${led.accountName}`, null, null, null, null, null])
  rows.push([`Period: ${dayjs(led.from).format('D MMM YYYY')} – ${dayjs(led.to).format('D MMM YYYY')}`, null, null, null, null, null])
  rows.push([])
  rows.push([`Opening balance (${dayjs(led.from).subtract(1, 'day').format('D MMM YYYY')})`, null, null, null, null, fmtBalance(led.openingBalance)])
  for (const l of led.lines) {
    rows.push([
      dayjs(l.entryDate).format('D MMM YYYY'),
      l.entryNo,
      l.description,
      l.debit > 0 ? l.debit : null,
      l.credit > 0 ? l.credit : null,
      fmtBalance(l.runningBalance),
    ])
  }
  rows.push([`Period totals`, null, null, led.periodTotals.debit, led.periodTotals.credit, null])
  rows.push([`Closing balance (${dayjs(led.to).format('D MMM YYYY')})`, null, null, null, null, fmtBalance(led.closingBalance)])

  return buildXlsxBuffer({
    sheetName: 'Ledger',
    headerRow: ['Date', 'Entry', 'Description', 'Debit', 'Credit', 'Balance'],
    rows,
    columnWidths: [14, 16, 50, 14, 14, 18],
  })
}
