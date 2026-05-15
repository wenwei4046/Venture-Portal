import { buildXlsxBuffer } from '@/lib/export/excel'
import type { TrialBalance } from '@/lib/cfo-reports'
import { typeLabel, type AccountType } from '@/lib/coa'

export function buildTrialBalanceXlsx(tb: TrialBalance): Buffer {
  // Group rows by type so each type gets a section header.
  const byType = new Map<AccountType, typeof tb.rows>()
  for (const row of tb.rows) {
    const list = byType.get(row.type) ?? []
    list.push(row)
    byType.set(row.type, list)
  }

  const dataRows: (string | number | null)[][] = []
  const sectionBreaks: { afterRow: number; title: string }[] = []
  for (const [type, rows] of byType.entries()) {
    sectionBreaks.push({ afterRow: dataRows.length, title: typeLabel(type).toUpperCase() })
    for (const r of rows) {
      dataRows.push([`${r.code} ${r.name}`, r.debit > 0 ? r.debit : null, r.credit > 0 ? r.credit : null])
    }
    // Subtotal row per type
    const subDr = rows.reduce((s, r) => s + r.debit, 0)
    const subCr = rows.reduce((s, r) => s + r.credit, 0)
    dataRows.push([`Total ${typeLabel(type)}`, subDr > 0 ? subDr : null, subCr > 0 ? subCr : null])
  }
  // Grand total at the very end
  dataRows.push(['TOTAL', tb.totals.debit, tb.totals.credit])

  return buildXlsxBuffer({
    sheetName: 'Trial Balance',
    headerRow: ['Account', 'Debit', 'Credit'],
    rows: dataRows,
    columnWidths: [42, 16, 16],
    sectionBreaks,
  })
}
