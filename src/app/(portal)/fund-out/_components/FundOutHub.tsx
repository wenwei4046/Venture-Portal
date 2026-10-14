'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { flash } from '@/components/hrv/toast'
import { HeadButton } from '@/components/finv/Hub'
import FundHub, { type FundCan } from '@/components/treasury/FundHub'
import type { FundCardKey, FundRecord } from '@/lib/fund-hub'
import { cancelPendingLoan } from '../actions'
import CreateFundOutDialog from './CreateFundOutDialog'
import ExportCSVButton from './ExportCSVButton'

// Fund OUT's hub with its own head (2026-10-15, the Finance revamp v2 — D12):
// *Create fund out* opens the design's dialog on the page, *Loan aging* the
// report, *Export CSV* ours; a pending loan is cancelled from the drawer by
// this page's own action.

export default function FundOutHub({
  records,
  month,
  today,
  initialCard,
  can,
  canSetDefault,
  canCreate,
  canLoanAging,
  canExport,
}: {
  records: FundRecord[]
  month: string
  today: string
  initialCard: FundCardKey
  can: FundCan
  canSetDefault: boolean
  /** Treasury · Create — Create fund out. */
  canCreate: boolean
  /** Reports, and the report's page open to this reader. */
  canLoanAging: boolean
  /** Treasury · Export. */
  canExport: boolean
}) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  return (
    <>
      <FundHub
        side="out"
        records={records}
        month={month}
        today={today}
        initialCard={initialCard}
        can={can}
        canSetDefault={canSetDefault}
        onWithdraw={cancelPendingLoan}
        head={
          <>
            {canCreate ? (
              <HeadButton primary onClick={() => setCreating(true)}>
                Create fund out
              </HeadButton>
            ) : null}
            {canLoanAging ? <HeadButton href="/reports/loan-aging">Loan aging</HeadButton> : null}
            {canExport ? <ExportCSVButton /> : null}
          </>
        }
      />
      {canCreate ? (
        <CreateFundOutDialog
          open={creating}
          onClose={() => setCreating(false)}
          onSaved={(message) => {
            flash(message)
            router.refresh()
          }}
          today={today}
        />
      ) : null}
    </>
  )
}
