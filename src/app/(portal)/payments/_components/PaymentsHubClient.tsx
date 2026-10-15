'use client'

import { useState } from 'react'
import { HeadButton } from '@/components/finv/Hub'
import VoucherHub, { type RequestItem } from './VoucherHub'
import CreatePaymentDialog from './CreatePaymentDialog'
import type { HubLedger } from '../_lib/hub-ledger'
import type { CreatePaymentOptions } from '../_lib/create-payment-options'

// Payments' hub (2026-10-14, the Finance revamp v2 — D02–D05, D07): the shared
// hub (VoucherHub) with Payments' own first button, *Create payment*, and its
// dialog — on Payments only, so Receipt's page never carries its write.

export type { RequestItem }

export default function PaymentsHubClient({
  ledger,
  canCreate,
  create = null,
  canSetDefault,
  canExport = false,
  dept,
  payroll,
  claims,
}: {
  ledger: HubLedger
  canCreate: boolean
  /** Create payment's dialog (whoever may make a voucher): its line, today, and — arriving with ?new=1 — open with its lists. */
  create?: { prefix: string; today: string; open: boolean; initial: CreatePaymentOptions | null } | null
  canSetDefault: boolean
  /** Treasury · Export: the head's Export ▾. */
  canExport?: boolean
  dept: RequestItem[]
  /** null without Payroll payouts: Payroll Requests is not theirs to open. */
  payroll: RequestItem[] | null
  claims: RequestItem[]
}) {
  const [creating, setCreating] = useState(!!create?.open)

  // Closed, the dialog leaves the URL (?new=1 opened it) so a refresh does not open it again.
  const closeCreate = () => {
    setCreating(false)
    const url = new URL(window.location.href)
    if (url.searchParams.has('new')) {
      url.searchParams.delete('new')
      window.history.replaceState(window.history.state, '', url.toString())
    }
  }

  return (
    <VoucherHub
      ledger={ledger}
      canSetDefault={canSetDefault}
      canExport={canExport}
      dept={dept}
      payroll={payroll}
      claims={claims}
      actions={
        canCreate && create ? (
          <HeadButton primary onClick={() => setCreating(true)}>
            Create payment
          </HeadButton>
        ) : null
      }
    >
      {create ? <CreatePaymentDialog open={creating} onClose={closeCreate} prefix={create.prefix} today={create.today} initial={create.initial} /> : null}
    </VoucherHub>
  )
}
