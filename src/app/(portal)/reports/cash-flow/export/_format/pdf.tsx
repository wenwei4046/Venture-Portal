import React from 'react'
import { PdfDocument, PdfTable, PdfSectionHead } from '@/lib/export/pdf'
import type { CashflowStatement, CashflowPoolBlock } from '@/lib/cfo-reports'

const COLUMNS = [
  { label: 'Line',    width: 360 },
  { label: 'Inflow',  width: 100, align: 'right' as const },
  { label: 'Outflow', width: 100, align: 'right' as const },
  { label: 'Net',     width: 100, align: 'right' as const },
]

const CAT_TITLE: Record<string, string> = {
  operating: 'Operating activities',
  investing: 'Investing activities',
  financing: 'Financing activities',
}

export function CashflowPdf({ stmt, periodLabel }: { stmt: CashflowStatement; periodLabel: string }) {
  function poolRows(p: CashflowPoolBlock): (string | number | null)[][] {
    const out: (string | number | null)[][] = []
    out.push([`${p.poolLabel} — Inflows`, null, null, null])
    for (const l of p.inflowLines)  out.push([`  ${l.label}`, l.amount, null, null])
    out.push([`${p.poolLabel} — Outflows`, null, null, null])
    for (const l of p.outflowLines) out.push([`  ${l.label}`, null, l.amount, null])
    out.push([`${p.poolLabel} — Net`, null, null, p.net])
    return out
  }

  return (
    <PdfDocument title="Cash Flow" periodLabel={periodLabel} orientation="landscape">
      {stmt.sections.map((section) => (
        <React.Fragment key={section.category}>
          <PdfSectionHead label={CAT_TITLE[section.category] ?? section.category} />
          <PdfTable
            columns={COLUMNS}
            numberFormat="money"
            rows={[
              ...section.pools.flatMap(poolRows),
              [`Section net (${section.category})`, null, null, section.net],
            ]}
          />
        </React.Fragment>
      ))}
      <PdfSectionHead label="Total" />
      <PdfTable columns={COLUMNS} numberFormat="money" rows={[
        ['Total net change', null, null, stmt.netChange],
      ]} />
    </PdfDocument>
  )
}
