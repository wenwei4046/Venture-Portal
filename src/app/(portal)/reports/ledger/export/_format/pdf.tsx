import React from 'react'
import dayjs from 'dayjs'
import { PdfDocument, PdfTable } from '@/lib/export/pdf'
import type { Ledger } from '@/lib/cfo-reports'

function fmtBalance(signed: number): string {
  if (Math.abs(signed) < 0.005) return '—'
  const abs = Math.abs(signed).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${abs} ${signed >= 0 ? 'Dr' : 'Cr'}`
}

const SEGMENT_SHORT: Record<string, string> = {
  marketing: 'Mkt', finance: 'Fin', hr: 'HR', director_office: 'DO',
  director: 'Dir', corporate: 'Vent', treasury: 'Trs', unallocated: '',
}
const segShort = (s: string) => (s ? SEGMENT_SHORT[s] ?? s : '')

/** One account's block: its band row, its lines, its total. */
function ledgerRows(led: Ledger): (string | number | null)[][] {
  return [
    [`Acc. No.: ${led.code} · ${led.accountName}`, '', '', '', '', '',
      led.periodTotals.debit > 0 ? led.periodTotals.debit : null,
      led.periodTotals.credit > 0 ? led.periodTotals.credit : null,
      fmtBalance(led.closingBalance)],
    ...led.lines.map((l) => [
      l.entryDate ? dayjs(l.entryDate).format('D MMM YYYY') : '—',
      l.accountDesc,
      l.journalType,
      l.ref,
      segShort(l.segment),
      l.description,
      l.debit > 0 ? l.debit : null,
      l.credit > 0 ? l.credit : null,
      fmtBalance(l.runningBalance),
    ] as (string | number | null)[]),
    [`${led.code} ${led.accountName} — total`, '', '', '', '', '',
      led.periodTotals.debit > 0 ? led.periodTotals.debit : null,
      led.periodTotals.credit > 0 ? led.periodTotals.credit : null,
      fmtBalance(led.closingBalance)],
  ]
}

const LEDGER_COLUMNS = [
  { label: 'Date',         width: 60 },
  { label: 'Acc. Desc.',   width: 100 },
  { label: 'Journal Type', width: 65 },
  { label: 'Ref. 1',       width: 80 },
  { label: 'Dept',         width: 36 },
  { label: 'Desc.',        width: 180 },
  { label: 'Home DR',      width: 70, align: 'right' as const },
  { label: 'Home CR',      width: 70, align: 'right' as const },
  { label: 'Home Balance', width: 90, align: 'right' as const },
]

/** Several accounts (2026-10-09, the Finance revamp): each block in turn, a blank row between. */
export function LedgersPdf({ ledgers, from, to }: { ledgers: Ledger[]; from: string; to: string }) {
  const periodLabel = `${dayjs(from).format('D MMM YYYY')} – ${dayjs(to).format('D MMM YYYY')}`
  const subtitle = ledgers.length === 1 ? `${ledgers[0].code} ${ledgers[0].accountName}` : `${ledgers.length} accounts`
  const rows: (string | number | null)[][] = []
  ledgers.forEach((led, i) => {
    if (i > 0) rows.push(['', '', '', '', '', '', null, null, ''])
    rows.push(...ledgerRows(led))
  })
  return (
    <PdfDocument title="General Ledger" periodLabel={periodLabel} subtitle={subtitle} orientation="landscape">
      <PdfTable columns={LEDGER_COLUMNS} numberFormat="money" rows={rows} />
    </PdfDocument>
  )
}

export function LedgerPdf({ led }: { led: Ledger }) {
  const periodLabel = `${dayjs(led.from).format('D MMM YYYY')} – ${dayjs(led.to).format('D MMM YYYY')}`
  const subtitle = `${led.code} ${led.accountName}`

  return (
    <PdfDocument title="General Ledger" periodLabel={periodLabel} subtitle={subtitle} orientation="landscape">
      <PdfTable
        columns={[
          { label: 'Date',         width: 60 },
          { label: 'Acc. Desc.',   width: 100 },
          { label: 'Journal Type', width: 65 },
          { label: 'Ref. 1',       width: 80 },
          { label: 'Dept',         width: 36 },
          { label: 'Desc.',        width: 180 },
          { label: 'Home DR',      width: 70, align: 'right' },
          { label: 'Home CR',      width: 70, align: 'right' },
          { label: 'Home Balance', width: 90, align: 'right' },
        ]}
        numberFormat="money"
        rows={[
          [`Acc. No.: ${led.code} · ${led.accountName}`, '', '', '', '', '',
            led.periodTotals.debit > 0 ? led.periodTotals.debit : null,
            led.periodTotals.credit > 0 ? led.periodTotals.credit : null,
            fmtBalance(led.closingBalance)],
          ...led.lines.map((l) => [
            l.entryDate ? dayjs(l.entryDate).format('D MMM YYYY') : '—',
            l.accountDesc,
            l.journalType,
            l.ref,
            segShort(l.segment),
            l.description,
            l.debit > 0 ? l.debit : null,
            l.credit > 0 ? l.credit : null,
            fmtBalance(l.runningBalance),
          ] as (string | number | null)[]),
          [`${led.code} ${led.accountName} — total`, '', '', '', '', '',
            led.periodTotals.debit > 0 ? led.periodTotals.debit : null,
            led.periodTotals.credit > 0 ? led.periodTotals.credit : null,
            fmtBalance(led.closingBalance)],
        ]}
      />
    </PdfDocument>
  )
}
