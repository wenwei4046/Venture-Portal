import { buildXlsxBuffer } from '@/lib/export/excel'
import type { CashflowStatement } from '@/lib/cfo-reports'

const CAT_LABEL: Record<string, string> = {
  operating: 'OPERATING',
  investing: 'INVESTING',
  financing: 'FINANCING',
}

export function buildCashflowXlsx(stmt: CashflowStatement): Buffer {
  const rows: (string | number | null)[][] = []
  const breaks: { afterRow: number; title: string }[] = []
  for (const section of stmt.sections) {
    breaks.push({ afterRow: rows.length, title: CAT_LABEL[section.category] ?? section.category.toUpperCase() })
    for (const pool of section.pools) {
      rows.push([`${pool.poolLabel} — Inflows`, null, null, null])
      for (const l of pool.inflowLines)  rows.push([`  ${l.label}`, l.amount, null, null])
      rows.push([`${pool.poolLabel} — Outflows`, null, null, null])
      for (const l of pool.outflowLines) rows.push([`  ${l.label}`, null, l.amount, null])
      rows.push([`${pool.poolLabel} — Net`, null, null, pool.net])
    }
    rows.push([`Section net (${section.category})`, null, null, section.net])
  }
  rows.push(['Total net change', null, null, stmt.netChange])

  return buildXlsxBuffer({
    sheetName: 'Cash Flow',
    headerRow: ['Line', 'Inflow', 'Outflow', 'Net'],
    rows,
    columnWidths: [42, 14, 14, 14],
    sectionBreaks: breaks,
  })
}
