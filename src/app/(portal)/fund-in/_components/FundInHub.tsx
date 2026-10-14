'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { flash } from '@/components/hrv/toast'
import { HeadButton } from '@/components/finv/Hub'
import FundHub, { type FundCan } from '@/components/treasury/FundHub'
import type { FundCardKey, FundRecord } from '@/lib/fund-hub'
import { withdrawFundSource } from '../actions'
import RecordFundInDialog from './RecordFundInDialog'

// Fund IN's hub with its own head (2026-10-15, the Finance revamp v2 — D12):
// *Record fund in* opens the design's dialog on the page; a pending fund
// source is withdrawn from the drawer by this page's own action.

export default function FundInHub({
  records,
  month,
  today,
  initialCard,
  can,
  canSetDefault,
  canCreate,
}: {
  records: FundRecord[]
  month: string
  today: string
  initialCard: FundCardKey
  can: FundCan
  canSetDefault: boolean
  /** Treasury · Create — Record fund in. */
  canCreate: boolean
}) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  return (
    <>
      <FundHub
        side="in"
        records={records}
        month={month}
        today={today}
        initialCard={initialCard}
        can={can}
        canSetDefault={canSetDefault}
        onWithdraw={withdrawFundSource}
        head={
          canCreate ? (
            <HeadButton primary onClick={() => setCreating(true)}>
              Record fund in
            </HeadButton>
          ) : null
        }
      />
      {canCreate ? (
        <RecordFundInDialog
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
