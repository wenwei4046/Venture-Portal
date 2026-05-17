import React from 'react'
import dayjs from 'dayjs'
import { PdfDocument, PdfTable, PdfSectionHead } from '@/lib/export/pdf'
import type { BalanceSheet } from '@/lib/cfo-reports'

const COLUMNS = [
  { label: 'Line',   width: 320 },
  { label: 'Amount', width: 120, align: 'right' as const },
]

export function BalanceSheetPdf({ bs }: { bs: BalanceSheet }) {
  return (
    <PdfDocument
      title="Balance Sheet"
      periodLabel={dayjs(bs.asOf).format('D MMMM YYYY')}
      subtitle={`Snapshot as at ${dayjs(bs.asOf).format('D MMMM YYYY')}.${bs.reconciles ? '' : ' ⚠ Does not reconcile.'}`}
    >
      <PdfSectionHead label="Assets" />
      <PdfTable columns={COLUMNS} numberFormat="money" rows={[
        ['Bank cash', bs.bank],
        ['Invoice receivable', bs.invoiceReceivable],
        ['Loan receivable', bs.loanReceivable],
        ...(Math.abs(bs.fixedAssets) > 0.005 ? [['Fixed assets', bs.fixedAssets] as [string, number]] : []),
        ...(Math.abs(bs.otherAssets) > 0.005 ? [['Other assets', bs.otherAssets] as [string, number]] : []),
        ['Total assets', bs.totalAssets],
      ]} />
      <PdfSectionHead label="Liabilities" />
      <PdfTable columns={COLUMNS} numberFormat="money" rows={[
        ['Fund sources payable', bs.fundSourcesPayable],
        ['Total liabilities', bs.fundSourcesPayable],
      ]} />
      <PdfSectionHead label="Equity" />
      <PdfTable columns={COLUMNS} numberFormat="money" rows={[
        ...(Math.abs(bs.equityBalances) > 0.005 ? [['Share capital / paid-in equity', bs.equityBalances] as [string, number]] : []),
        ['Retained earnings (YTD)', bs.retainedEarnings],
        ['Total equity', bs.equityBalances + bs.retainedEarnings],
      ]} />
      {bs.internalFundLines.length > 0 ? (
        <>
          <PdfSectionHead label="Internal Funds" />
          <PdfTable columns={COLUMNS} numberFormat="money" rows={[
            ...bs.internalFundLines.map((l) => [`${l.code} ${l.name}`, l.balance] as [string, number]),
            ['Total internal funds', bs.internalFundsTotal],
          ]} />
        </>
      ) : null}
      <PdfSectionHead label="Total Liabilities + Equity" />
      <PdfTable columns={COLUMNS} numberFormat="money" rows={[
        ['Total liabilities + equity', bs.totalLiabilitiesEquity],
      ]} />
    </PdfDocument>
  )
}
