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
  const subtitle = `${led.code} ${led.accountName}`

  return (
    <PdfDocument title="General Ledger" periodLabel={periodLabel} subtitle={subtitle} orientation="landscape">
      <PdfTable
        columns={[
          { label: 'Date',         width: 60 },
          { label: 'Acc. Desc.',   width: 110 },
          { label: 'Journal Type', width: 70 },
          { label: 'Ref. 1',       width: 90 },
          { label: 'Desc.',        width: 200 },
          { label: 'Home DR',      width: 70, align: 'right' },
          { label: 'Home CR',      width: 70, align: 'right' },
          { label: 'Home Balance', width: 90, align: 'right' },
        ]}
        numberFormat="money"
        rows={[
          [`Acc. No.: ${led.code} · ${led.accountName}`, '', '', '', '',
            led.periodTotals.debit > 0 ? led.periodTotals.debit : null,
            led.periodTotals.credit > 0 ? led.periodTotals.credit : null,
            fmtBalance(led.closingBalance)],
          ...led.lines.map((l) => [
            l.entryDate ? dayjs(l.entryDate).format('D MMM YYYY') : '—',
            l.accountDesc,
            l.journalType,
            l.ref,
            l.description,
            l.debit > 0 ? l.debit : null,
            l.credit > 0 ? l.credit : null,
            fmtBalance(l.runningBalance),
          ] as (string | number | null)[]),
          [`${led.code} ${led.accountName} — total`, '', '', '', '',
            led.periodTotals.debit > 0 ? led.periodTotals.debit : null,
            led.periodTotals.credit > 0 ? led.periodTotals.credit : null,
            fmtBalance(led.closingBalance)],
        ]}
      />
    </PdfDocument>
  )
}
