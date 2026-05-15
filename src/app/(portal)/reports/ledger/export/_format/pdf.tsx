import React from 'react'
import dayjs from 'dayjs'
import { PdfDocument, PdfTable } from '@/lib/export/pdf'
import type { Ledger } from '@/lib/cfo-reports'

function fmtBalance(signed: number): string {
  if (Math.abs(signed) < 0.005) return '—'
  const abs = Math.abs(signed).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${abs} ${signed >= 0 ? 'Dr' : 'Cr'}`
}

export function LedgerPdf({ led }: { led: Ledger }) {
  const periodLabel = `${dayjs(led.from).format('D MMM YYYY')} – ${dayjs(led.to).format('D MMM YYYY')}`
  const subtitle = `${led.code} ${led.accountName} · Opening ${fmtBalance(led.openingBalance)} · Closing ${fmtBalance(led.closingBalance)}`

  return (
    <PdfDocument title="General Ledger" periodLabel={periodLabel} subtitle={subtitle} orientation="landscape">
      <PdfTable
        columns={[
          { label: 'Date',        width: 70 },
          { label: 'Entry',       width: 80 },
          { label: 'Description', width: 300 },
          { label: 'Debit',       width: 80, align: 'right' },
          { label: 'Credit',      width: 80, align: 'right' },
          { label: 'Balance',     width: 100, align: 'right' },
        ]}
        numberFormat="money"
        rows={[
          ...led.lines.map((l) => [
            dayjs(l.entryDate).format('D MMM YYYY'),
            l.entryNo,
            l.description,
            l.debit > 0 ? l.debit : null,
            l.credit > 0 ? l.credit : null,
            fmtBalance(l.runningBalance),
          ] as (string | number | null)[]),
          ['Period totals', '', '', led.periodTotals.debit, led.periodTotals.credit, ''],
        ]}
      />
    </PdfDocument>
  )
}
