'use client'

import { useState } from 'react'
import { HeadButton } from '@/components/finv/Hub'
import VoucherHub from '../../payments/_components/VoucherHub'
import type { HubLedger } from '../../payments/_lib/hub-ledger'
import CreateReceiptDialog from './CreateReceiptDialog'
import LoanRepaymentDialog from './LoanRepaymentDialog'

// Receipt's hub (2026-10-14, the Finance revamp v2 — D09): Payments' hub read
// as receipts, with Receipt's own first buttons — *Create receipt* and *Loan
// repayment* — and their dialogs, on Receipt's page only.

export default function ReceiptsHubClient({
  ledger,
  canCreate,
  canSetDefault,
  canExport = false,
  prefix,
  today,
}: {
  ledger: HubLedger
  canCreate: boolean
  canSetDefault: boolean
  /** Treasury · Export: the head's Export ▾. */
  canExport?: boolean
  /** "HV-OR-202610" — Create receipt's line under its title. */
  prefix: string
  /** The office's today. */
  today: string
}) {
  const [open, setOpen] = useState<'receipt' | 'loan' | null>(null)
  return (
    <VoucherHub
      ledger={ledger}
      canSetDefault={canSetDefault}
      canExport={canExport}
      actions={
        canCreate ? (
          <>
            <HeadButton primary onClick={() => setOpen('receipt')}>
              Create receipt
            </HeadButton>
            <HeadButton onClick={() => setOpen('loan')}>Loan repayment</HeadButton>
          </>
        ) : null
      }
    >
      {canCreate ? (
        <>
          <CreateReceiptDialog open={open === 'receipt'} onClose={() => setOpen(null)} prefix={prefix} today={today} />
          <LoanRepaymentDialog open={open === 'loan'} onClose={() => setOpen(null)} today={today} />
        </>
      ) : null}
    </VoucherHub>
  )
}
