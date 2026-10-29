'use client'

import { useEffect, useState, useTransition } from 'react'
import { FinDrawer, drawerStyles as d } from '@/components/finv/Drawer'
import { DrawerGroup as Group, DrawerLine as Line, fd } from '@/components/finv/DrawerParts'
import { RequestGroups, RequestHero } from '@/components/payment-requests/RequestParts'
import { officeDay } from '@/lib/office-time'
import { openRequestFile } from '@/lib/payment-requests/actions'
import { canCancel, canEdit, whereItIs, type PaymentRequest } from '@/lib/payment-requests/model'

// One of one's own requests in the Claim page's drawer (2026-10-29, PR ②): where it is, what it holds, why Finance sent
// it back — and, while it is still the requester's, Edit (or Fix and send again), Submit and Cancel request.

const KICKER = { claim: 'Claim · I paid', direct_pay: 'Direct payment' } as const

function noteOf(r: PaymentRequest): string {
  switch (r.status) {
    case 'draft':
      return 'Not sent yet — Submit it when it is complete.'
    case 'pending_approval':
      return 'Waiting for your department’s approval, then Finance.'
    case 'with_finance':
      return 'With Finance — they make its payment voucher.'
    case 'rejected':
      return 'Finance sent it back — fix it and send it again.'
    case 'in_pv':
      return `In ${r.pvNo ?? 'a payment voucher'} — paid once it is approved.`
    case 'paid':
      return `Paid with ${r.pvNo ?? 'its payment voucher'}.`
    case 'cancelled':
      return 'Cancelled — Finance will not pay it.'
  }
}

export function ClaimDrawer({
  request,
  onClose,
  readOnly,
  onEdit,
  onSubmit,
  onCancel,
  submitting,
  error,
}: {
  request: PaymentRequest | null
  onClose: () => void
  /** Viewing as somebody: nothing is written. */
  readOnly: boolean
  onEdit: (r: PaymentRequest) => void
  onSubmit: (r: PaymentRequest) => void
  onCancel: (r: PaymentRequest) => void
  submitting: boolean
  error: string | null
}) {
  // The request stays drawn while the drawer plays out.
  const [shown, setShown] = useState<PaymentRequest | null>(request)
  const [opening, setOpening] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [, start] = useTransition()
  useEffect(() => {
    if (request) setShown(request)
    setFileError(null)
  }, [request])
  const r = request ?? shown

  const openFile = (fileId: string) => {
    setFileError(null)
    setOpening(fileId)
    start(async () => {
      try {
        const res = await openRequestFile(fileId)
        if (!res.ok) setFileError(res.reason)
        else window.open(res.data.url, '_blank', 'noopener,noreferrer')
      } catch {
        setFileError('The file could not be opened. Try again.')
      } finally {
        setOpening(null)
      }
    })
  }

  const bar = []
  if (r && !readOnly) {
    if (canCancel(r)) {
      bar.push(
        <button key="cancel" type="button" className={d.barBtn} data-kind="danger" onClick={() => onCancel(r)} disabled={submitting}>
          Cancel request…
        </button>,
      )
    }
    if (canEdit(r)) {
      bar.push(
        <button key="edit" type="button" className={d.barBtn} onClick={() => onEdit(r)} disabled={submitting}>
          {r.status === 'rejected' ? 'Fix and send again' : 'Edit'}
        </button>,
      )
    }
    if (r.mine && r.status === 'draft') {
      bar.push(
        <button key="submit" type="button" className={d.barBtn} data-kind="primary" onClick={() => onSubmit(r)} disabled={submitting}>
          {submitting ? 'Sending…' : 'Submit'}
        </button>,
      )
    }
  }

  return (
    <FinDrawer open={!!request} onClose={onClose} label={r ? `${r.requestNo ?? 'Draft'} · ${r.description || 'Request'}` : 'Request'} title={r?.requestNo ?? 'Draft'} bar={bar.length ? bar : null}>
      {r ? (
        <>
          <RequestHero
            kicker={KICKER[r.kind]}
            chip={whereItIs(r)}
            no={r.requestNo ?? 'Draft'}
            amount={r.total}
            to={`Pay to ${r.kind === 'claim' ? r.requesterName : r.payeeName ?? 'the supplier'}`}
            note={noteOf(r)}
          />
          {r.status === 'rejected' && r.rejectReason ? (
            <Group n="—" title="Why it was sent back">
              <Line label={r.rejectedByName ?? 'Finance'} value={r.rejectReason} sub={r.rejectedAt ? fd(officeDay(r.rejectedAt).format('YYYY-MM-DD')) : undefined} />
            </Group>
          ) : null}
          {error ? (
            <div className={d.error} role="alert">
              {error}
            </div>
          ) : null}
          <RequestGroups r={r} opening={opening} fileError={fileError} onOpenFile={openFile} />
        </>
      ) : null}
    </FinDrawer>
  )
}
