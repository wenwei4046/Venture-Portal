import dayjs from 'dayjs'
import { PdfDocument, PdfTable } from '@/lib/export/pdf'
import type { TrialBalance } from '@/lib/cfo-reports'

export function TrialBalancePdf({ tb }: { tb: TrialBalance }) {
  // Flat list. tb.rows is already sorted by buildTrialBalance (BS types first,
  // then P&L). No section heads or per-type subtotals — one table, every leaf,
  // grand total at the bottom.
  const tableRows: (string | number | null)[][] = [
    ...tb.rows.map((r) => [
      `${r.code} ${r.name}`,
      r.debit > 0 ? r.debit : null,
      r.credit > 0 ? r.credit : null,
    ]),
    ['TOTAL', tb.totals.debit, tb.totals.credit],
  ]

  return (
    <PdfDocument
      title="Trial Balance"
      periodLabel={dayjs(tb.asOf).format('D MMMM YYYY')}
      subtitle={`Snapshot as at ${dayjs(tb.asOf).format('D MMMM YYYY')}. Σ Dr ${tb.reconciles ? '=' : '≠'} Σ Cr.`}
    >
      <PdfTable
        columns={[
          { label: 'Account', width: 280 },
          { label: 'Debit',   width: 100, align: 'right' },
          { label: 'Credit',  width: 100, align: 'right' },
        ]}
        rows={tableRows}
        numberFormat="money"
      />
    </PdfDocument>
  )
}
