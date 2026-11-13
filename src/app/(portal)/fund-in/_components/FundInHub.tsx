'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { flash } from '@/components/hrv/toast'
import { HeadButton } from '@/components/finv/Hub'
import FundHub, { type FundCan } from '@/components/treasury/FundHub'
import FundContraDialog from '@/components/treasury/FundContraDialog'
import IisMonthDialog from '@/components/treasury/IisMonthDialog'
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
  const [contra, setContra] = useState(false)
  // Month-end interest (IIS, 2026-11-13): Treasury · Approve.
  const [iis, setIis] = useState(false)
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
          canCreate || can.amend ? (
            <>
              {canCreate ? (
                <HeadButton primary onClick={() => setCreating(true)}>
                  Record fund in
                </HeadButton>
              ) : null}
              {canCreate ? <HeadButton onClick={() => setContra(true)}>Contra</HeadButton> : null}
              {can.amend ? <HeadButton onClick={() => setIis(true)}>Month-end interest</HeadButton> : null}
            </>
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
      {canCreate ? (
        <FundContraDialog
          open={contra}
          onClose={() => setContra(false)}
          onSaved={(message) => {
            flash(message)
            router.refresh()
          }}
          today={today}
        />
      ) : null}
      {can.amend ? (
        <IisMonthDialog
          open={iis}
          onClose={() => setIis(false)}
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
