import { buildXlsxBuffer } from '@/lib/export/excel'
import type { Ledger } from '@/lib/cfo-reports'
import dayjs from 'dayjs'

function fmtBalance(signed: number): string {
  if (Math.abs(signed) < 0.005) return '—'
  const abs = Math.abs(signed).toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${abs} ${signed >= 0 ? 'Dr' : 'Cr'}`
}

const SEGMENT_SHORT: Record<string, string> = {
  marketing: 'Mkt', finance: 'Fin', hr: 'HR', director_office: 'DO',
  director: 'Dir', corporate: 'Vent', treasury: 'Trs', unallocated: '',
}
const segShort = (s: string) => (s ? SEGMENT_SHORT[s] ?? s : '')

export function buildLedgerXlsx(led: Ledger): Buffer {
  const rows: (string | number | null)[][] = []
  rows.push([
    `Acc. No.: ${led.code} · ${led.accountName}`, null, null, null, null, null,
    led.periodTotals.debit > 0 ? led.periodTotals.debit : null,
    led.periodTotals.credit > 0 ? led.periodTotals.credit : null,
    fmtBalance(led.closingBalance),
  ])
  for (const l of led.lines) {
    rows.push([
      l.entryDate ? dayjs(l.entryDate).format('D MMM YYYY') : '—',
      l.accountDesc,
      l.journalType,
      l.ref,
      segShort(l.segment),
      l.description,
      l.debit > 0 ? l.debit : null,
      l.credit > 0 ? l.credit : null,
      fmtBalance(l.runningBalance),
    ])
  }
  rows.push([
    `${led.code} ${led.accountName} — total`, null, null, null, null, null,
    led.periodTotals.debit > 0 ? led.periodTotals.debit : null,
    led.periodTotals.credit > 0 ? led.periodTotals.credit : null,
    fmtBalance(led.closingBalance),
  ])

  return buildXlsxBuffer({
    sheetName: 'Ledger',
    headerRow: ['Date', 'Acc. Desc.', 'Journal Type', 'Ref. 1', 'Dept', 'Desc.', 'Home DR', 'Home CR', 'Home Balance'],
    rows,
    columnWidths: [14, 26, 14, 18, 8, 40, 14, 14, 18],
  })
}
