'use client'

import { useState, type ReactNode } from 'react'
import { bulkGroups, samePayeeOpen, voucherStart, type PaymentRequest, type RequestVoucherStart } from '@/lib/payment-requests/model'
import CreatePaymentDialog from '../../_components/CreatePaymentDialog'
import { createPaymentForRequests } from '../../actions'
import { openRequestsForPv, openRequestsForPvs } from '../actions'
import CreatePaymentsDialog, { type CreatePaymentsStart } from './CreatePaymentsDialog'

// Create PV from staff requests — one payee's in today's Create PV window (PR ②), several payees' in Create payments
// (PR ④) — shared by Payment request on the computer and in the Finance phone app (PR ⑥). What a window starts from is
// asked first (still with Finance, one payee into one account; the same payee's open requests together, until Finance
// makes the PV — the user: "自动合成认的是我有没有开pv"), then the window opens; a refusal is answered in words.

export function useRequestPvs({
  staffRequests,
  today,
  onMadeOne,
  onMadeMany,
}: {
  /** Every staff request the page lists — a payee's others with no PV yet go in with the one picked. */
  staffRequests: readonly PaymentRequest[]
  today: string
  /** Today's Create PV window made its voucher. */
  onMadeOne: (voucher: { id: string; voucherNo: string }) => void
  /** Create payments made what it made (and said so). */
  onMadeMany: () => void
}): {
  /** One request's PV, its payee's open requests with it — refused, the reason. */
  createOne: (r: PaymentRequest) => Promise<string | null>
  /** The ticked: one payee's in Create PV, several payees' in Create payments — refused, the reason. */
  createFor: (requests: readonly PaymentRequest[]) => Promise<string | null>
  /** The requests are being read for a window. */
  opening: boolean
  /** The two windows, for the page to draw. */
  windows: ReactNode
} {
  const [pv, setPv] = useState<{ key: string; start: RequestVoucherStart } | null>(null)
  const [pvOpen, setPvOpen] = useState(false)
  const [bulk, setBulk] = useState<{ key: string; start: CreatePaymentsStart } | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [opening, setOpening] = useState(false)
  const prefix = `HV-PV-${today.slice(0, 7).replace('-', '')}`

  const createOne = async (r: PaymentRequest): Promise<string | null> => {
    try {
      const res = await openRequestsForPv(samePayeeOpen(staffRequests, r).map((x) => x.id))
      if (!res.ok) return res.reason
      setPv({ key: res.requests.map((x) => x.id).join(','), start: voucherStart(res.requests) })
      setPvOpen(true)
      return null
    } catch {
      return 'The requests could not be read. Try again.'
    }
  }

  const createFor = async (requests: readonly PaymentRequest[]): Promise<string | null> => {
    const groups = bulkGroups(requests, staffRequests, true)
    if (groups.length === 0 || opening) return null
    if (groups.length === 1) return createOne(groups[0][0])
    if (groups.length > 20) return 'Up to 20 PVs at once — tick fewer.'
    setOpening(true)
    try {
      const res = await openRequestsForPvs(groups.map((g) => g.map((x) => x.id)))
      if (!res.ok) return res.reason
      setBulk({ key: groups.map((g) => g.map((x) => x.id).join(',')).join('|'), start: { groups: res.groups, ticked: requests.map((x) => x.id), canBillBack: res.canBillBack } })
      setBulkOpen(true)
      return null
    } catch {
      return 'The requests could not be read. Try again.'
    } finally {
      setOpening(false)
    }
  }

  const windows = (
    <>
      {pv ? (
        <CreatePaymentDialog
          key={pv.key}
          open={pvOpen}
          onClose={() => setPvOpen(false)}
          prefix={prefix}
          today={today}
          preset={{ title: 'Create PV', payee: pv.start.payee, description: pv.start.description, requests: pv.start }}
          create={createPaymentForRequests}
          onSaved={(made) => {
            setPvOpen(false)
            onMadeOne(made)
          }}
        />
      ) : null}
      {bulk ? <CreatePaymentsDialog key={bulk.key} open={bulkOpen} start={bulk.start} prefix={prefix} today={today} onClose={() => setBulkOpen(false)} onDone={onMadeMany} /> : null}
    </>
  )

  return { createOne, createFor, opening, windows }
}
