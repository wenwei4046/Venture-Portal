import React from 'react'
import { PdfDocument, PdfTable, PdfSectionHead } from '@/lib/export/pdf'
import type { CashflowStatement, CashflowByPoolBlock } from '@/lib/cfo-reports'

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

export function CashflowPdf({
  stmt,
  periodLabel,
  block,
}: {
  stmt: CashflowStatement
  periodLabel: string
  block: CashflowByPoolBlock | null
}) {
  return (
    <PdfDocument title="Cash Flow" periodLabel={periodLabel} orientation="landscape">
      {block ? (
        <>
          {block.sections.map((sec) => (
            <React.Fragment key={sec.category}>
              <PdfSectionHead label={CAT_TITLE[sec.category] ?? sec.category} />
              <PdfTable
                columns={COLUMNS}
                numberFormat="money"
                rows={[
                  ['Inflows', null, null, null],
                  ...sec.inflowLines.map((l) => [`  ${l.label}`, l.amount, null, null] as (string | number | null)[]),
                  ['Outflows', null, null, null],
                  ...sec.outflowLines.map((l) => [`  ${l.label}`, null, l.amount, null] as (string | number | null)[]),
                  [`${CAT_TITLE[sec.category] ?? sec.category} net`, null, null, sec.net],
                ]}
              />
            </React.Fragment>
          ))}
          <PdfSectionHead label={`${block.poolLabel} total`} />
          <PdfTable columns={COLUMNS} numberFormat="money" rows={[
            [`${block.poolLabel} net`, null, null, block.net],
          ]} />
        </>
      ) : (
        <>
          <PdfSectionHead label="Net cash change" />
          <PdfTable
            columns={COLUMNS}
            numberFormat="money"
            rows={[
              ...stmt.sections.map((s) => [`Section net (${s.category})`, null, null, s.net] as (string | number | null)[]),
              ['Total net change', null, null, stmt.netChange],
            ]}
          />
        </>
      )}
    </PdfDocument>
  )
}
