import React from 'react'
import dayjs from 'dayjs'
import { PdfDocument, PdfTable, PdfSectionHead } from '@/lib/export/pdf'
import type { TrialBalance } from '@/lib/cfo-reports'
import { typeLabel, type AccountType } from '@/lib/coa'

export function TrialBalancePdf({ tb }: { tb: TrialBalance }) {
  const byType = new Map<AccountType, typeof tb.rows>()
  for (const row of tb.rows) {
    const list = byType.get(row.type) ?? []
    list.push(row)
    byType.set(row.type, list)
  }

  return (
    <PdfDocument
      title="Trial Balance"
      periodLabel={dayjs(tb.asOf).format('D MMMM YYYY')}
      subtitle={`Snapshot as at ${dayjs(tb.asOf).format('D MMMM YYYY')}. Σ Dr ${tb.reconciles ? '=' : '≠'} Σ Cr.`}
    >
      {Array.from(byType.entries()).map(([type, rows]) => {
        const subDr = rows.reduce((s, r) => s + r.debit, 0)
        const subCr = rows.reduce((s, r) => s + r.credit, 0)
        const tableRows: (string | number | null)[][] = [
          ...rows.map((r) => [
            `${r.code} ${r.name}`,
            r.debit > 0 ? r.debit : null,
            r.credit > 0 ? r.credit : null,
          ]),
          [`Total ${typeLabel(type)}`, subDr > 0 ? subDr : null, subCr > 0 ? subCr : null],
        ]
        return (
          <React.Fragment key={type}>
            <PdfSectionHead label={typeLabel(type)} />
            <PdfTable
              columns={[
                { label: 'Account', width: 280 },
                { label: 'Debit',   width: 100, align: 'right' },
                { label: 'Credit',  width: 100, align: 'right' },
              ]}
              rows={tableRows}
              numberFormat="money"
            />
          </React.Fragment>
        )
      })}
      <PdfSectionHead label="Total" />
      <PdfTable
        columns={[
          { label: '',       width: 280 },
          { label: 'Debit',  width: 100, align: 'right' },
          { label: 'Credit', width: 100, align: 'right' },
        ]}
        rows={[['TOTAL', tb.totals.debit, tb.totals.credit]]}
        numberFormat="money"
      />
    </PdfDocument>
  )
}
