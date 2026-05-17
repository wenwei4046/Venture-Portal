import { buildXlsxBuffer } from '@/lib/export/excel'
import type { BalanceSheet } from '@/lib/cfo-reports'

export function buildBalanceSheetXlsx(bs: BalanceSheet): Buffer {
  const rows: (string | number | null)[][] = []
  const breaks: { afterRow: number; title: string }[] = []

  breaks.push({ afterRow: rows.length, title: 'ASSETS' })
  rows.push(['Bank cash',           bs.bank])
  rows.push(['Invoice receivable',  bs.invoiceReceivable])
  rows.push(['Loan receivable',     bs.loanReceivable])
  if (Math.abs(bs.fixedAssets) > 0.005)  rows.push(['Fixed assets', bs.fixedAssets])
  if (Math.abs(bs.otherAssets) > 0.005)  rows.push(['Other assets', bs.otherAssets])
  rows.push(['Total assets',        bs.totalAssets])

  breaks.push({ afterRow: rows.length, title: 'LIABILITIES' })
  rows.push(['Fund sources payable', bs.fundSourcesPayable])
  rows.push(['Total liabilities',    bs.fundSourcesPayable])

  breaks.push({ afterRow: rows.length, title: 'EQUITY' })
  if (Math.abs(bs.equityBalances) > 0.005) rows.push(['Share capital / paid-in equity', bs.equityBalances])
  rows.push(['Retained earnings (YTD)',   bs.retainedEarnings])
  rows.push(['Total equity',              bs.equityBalances + bs.retainedEarnings])

  if (bs.internalFundLines.length > 0) {
    breaks.push({ afterRow: rows.length, title: 'INTERNAL FUNDS' })
    for (const line of bs.internalFundLines) {
      rows.push([`${line.code} ${line.name}`, line.balance])
    }
    rows.push(['Total internal funds', bs.internalFundsTotal])
  }

  breaks.push({ afterRow: rows.length, title: 'TOTAL LIABILITIES + EQUITY' })
  rows.push(['Total liabilities + equity', bs.totalLiabilitiesEquity])
  rows.push([bs.reconciles ? '✓ Balance sheet reconciles' : '⚠ Does NOT reconcile', null])

  return buildXlsxBuffer({
    sheetName: 'Balance Sheet',
    headerRow: ['Line', 'Amount'],
    rows,
    columnWidths: [42, 18],
    sectionBreaks: breaks,
  })
}
