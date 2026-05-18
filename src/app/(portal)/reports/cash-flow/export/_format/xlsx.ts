import { buildXlsxBuffer } from '@/lib/export/excel'
import type { CashflowStatement, CashflowByPoolBlock } from '@/lib/cfo-reports'

const CAT_LABEL: Record<string, string> = {
  operating: 'OPERATING',
  investing: 'INVESTING',
  financing: 'FINANCING',
}

export function buildCashflowXlsx(stmt: CashflowStatement, opts: { block: CashflowByPoolBlock | null }): Buffer {
  const rows: (string | number | null)[][] = []
  const breaks: { afterRow: number; title: string }[] = []
  if (opts.block) {
    for (const sec of opts.block.sections) {
      breaks.push({ afterRow: rows.length, title: CAT_LABEL[sec.category] ?? sec.category.toUpperCase() })
      rows.push(['Inflows', null, null, null])
      for (const l of sec.inflowLines)  rows.push([`  ${l.label}`, l.amount, null, null])
      rows.push(['Outflows', null, null, null])
      for (const l of sec.outflowLines) rows.push([`  ${l.label}`, null, l.amount, null])
      rows.push([`${CAT_LABEL[sec.category] ?? sec.category} net`, null, null, sec.net])
    }
    rows.push([`${opts.block.poolLabel} net`, null, null, opts.block.net])
  } else {
    breaks.push({ afterRow: rows.length, title: 'NET CASH CHANGE' })
    for (const section of stmt.sections) {
      rows.push([`Section net (${section.category})`, null, null, section.net])
    }
    rows.push(['Total net change', null, null, stmt.netChange])
  }

  return buildXlsxBuffer({
    sheetName: 'Cash Flow',
    headerRow: ['Line', 'Inflow', 'Outflow', 'Net'],
    rows,
    columnWidths: [42, 14, 14, 14],
    sectionBreaks: breaks,
  })
}
