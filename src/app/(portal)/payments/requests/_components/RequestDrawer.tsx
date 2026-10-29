'use client'

import { useEffect, useState, useTransition, type ReactNode } from 'react'
import { FinDrawer, drawerStyles as d } from '@/components/finv/Drawer'
import { DrawerGroup as Group, DrawerLine as Line, fd } from '@/components/finv/DrawerParts'
import { OpenRow, RequestGroups, RequestHero } from '@/components/payment-requests/RequestParts'
import { f2, rm } from '@/lib/fin-app/page-model'
import { openRequestFile } from '@/lib/payment-requests/actions'
import { openMemberClaimInvoice } from '../actions'
import { stageChip, type PaymentRequestRow } from '../_lib/requests-model'

// A request in the hub's drawer (2026-10-29, Payments › Payment request): the dark hero as a voucher's, the request's
// numbered groups, and at its foot what this reader may do while it is Finance's — a payroll's funding round and its
// send back to HR, a claim's voucher and a member's claim returned to HR. Since PR ②, a staff request's too: its
// items, receipts, who is paid and which pool pays, Reject… and Create PV (each split's Bill back? is answered in the
// Create PV window — the user: "我开pv 时就要确定是不是要开单了").

export interface RequestDrawerCan {
  pay: boolean
  sendBack: boolean
}

export interface RequestDrawerSteps {
  fund: (r: PaymentRequestRow) => void
  sendBack: (r: PaymentRequestRow) => void
  createPv: (r: PaymentRequestRow) => void
  returnToHr: (r: PaymentRequestRow) => void
  openVoucher: (id: string) => void
  /** A staff request: rejected back to its requester, and its PV (the same person's open requests with it). */
  rejectRequest: (r: PaymentRequestRow) => void
  createRequestPv: (r: PaymentRequestRow) => void
}

export function RequestDrawer({
  row,
  onClose,
  can,
  steps,
  stepError = null,
}: {
  row: PaymentRequestRow | null
  onClose: () => void
  can: RequestDrawerCan
  steps: RequestDrawerSteps
  /** Why a step begun from the page (Create PV) did not go — said in the drawer. */
  stepError?: string | null
}) {
  // The row stays drawn while the drawer plays out.
  const [shown, setShown] = useState<PaymentRequestRow | null>(row)
  const [fileError, setFileError] = useState<string | null>(null)
  const [openingFile, setOpeningFile] = useState<string | null>(null)
  const [opening, start] = useTransition()
  useEffect(() => {
    if (row) setShown(row)
    setFileError(null)
  }, [row])
  const r = row ?? shown

  const openInvoice = (claimId: string) => {
    setFileError(null)
    start(async () => {
      try {
        const res = await openMemberClaimInvoice(claimId)
        if (!res.ok) return setFileError(res.reason)
        window.open(res.url, '_blank', 'noopener,noreferrer')
      } catch {
        setFileError('The invoice could not be opened. Try again.')
      }
    })
  }

  const openFile = (fileId: string) => {
    setFileError(null)
    setOpeningFile(fileId)
    start(async () => {
      try {
        const res = await openRequestFile(fileId)
        if (!res.ok) setFileError(res.reason)
        else window.open(res.data.url, '_blank', 'noopener,noreferrer')
      } catch {
        setFileError('The file could not be opened. Try again.')
      } finally {
        setOpeningFile(null)
      }
    })
  }

  let body: ReactNode = null
  const bar: ReactNode[] = []
  if (r?.payroll) {
    const p = r.payroll
    const toFund = r.stage === 'finance'
    body = (
      <>
        <RequestHero
          kicker={p.isDirector ? 'Director salary · funding request' : 'Payroll · funding request'}
          chip={stageChip(r)}
          no={p.label}
          amount={toFund ? p.remaining : p.amount}
          to={`Requested by ${p.requested}`}
          note={toFund ? 'Generate a funding PV for some or all of it — the rest can follow in later rounds.' : 'Fully funded — its vouchers are with the Principal.'}
        />
        <Group n="I." title="Request">
          <Line label="Request" value={rm(p.amount)} mono />
          {p.committed > 0.005 ? <Line label="Funded so far" value={rm(p.committed)} mono /> : null}
          {toFund ? <Line label="Still to fund" value={rm(p.remaining)} mono tone="wait" /> : null}
          {p.sub ? <Line label="Batch" value={p.sub} /> : null}
        </Group>
        <Group n="II." title="Departments" empty={p.pools.length === 0 ? 'No department breakdown on record.' : undefined}>
          {p.pools.map((pool) => (
            <Line
              key={pool.pool_key}
              label={pool.label}
              value={f2(pool.remaining)}
              sub={`Balance ${f2(pool.pool_balance)} · owes ${f2(pool.required)}${pool.committed > 0.005 ? ` · funded ${f2(pool.committed)}` : ''}`}
              mono
            />
          ))}
        </Group>
        {p.pendingPvs.length > 0 ? (
          <>
            <div className={d.label}>
              <span className={d.labelRoman}>III.</span> With the Principal
            </div>
            <div className={d.files}>
              {p.pendingPvs.map((pv) => (
                <OpenRow key={pv.id} icon="out" name={pv.voucherNo} meta={rm(pv.amount)} onOpen={() => steps.openVoucher(pv.id)} />
              ))}
            </div>
          </>
        ) : null}
      </>
    )
    if (toFund && can.sendBack && p.canSendBack) {
      bar.push(
        <button key="back" type="button" className={d.barBtn} data-kind="danger" onClick={() => steps.sendBack(r)}>
          Send back to HR…
        </button>,
      )
    }
    if (toFund && can.pay) {
      bar.push(
        <button key="fund" type="button" className={d.barBtn} data-kind="primary" onClick={() => steps.fund(r)}>
          Generate PV
        </button>,
      )
    }
  } else if (r?.claim) {
    const c = r.claim
    const member = c.claimType === 'benefit'
    const waiting = r.stage === 'finance'
    body = (
      <>
        <RequestHero
          kicker={member ? 'Member claim · approved by HR' : 'Claim'}
          chip={stageChip(r)}
          no={r.ref}
          amount={c.amount}
          to={`Pay to ${c.claimantName}`}
          note={waiting ? 'Create its payment voucher, or return it to HR with a reason.' : `${c.voucherNo ?? 'Its voucher'} is with the Principal.`}
        />
        <Group n="I." title="Claim">
          <Line label="Claimant" value={c.claimantName} sub={c.department ?? undefined} />
          <Line label="Description" value={c.description ?? '—'} />
          <Line label="Reference" value={r.ref} mono />
          <Line label="Approved" value={c.approvedByName ? `HR · ${c.approvedByName}` : 'HR'} sub={r.sent ? fd(r.sent) : undefined} />
          <Line label="Pool" value={r.whoPays} />
        </Group>
        {member ? (
          <>
            <div className={d.label}>
              <span className={d.labelRoman}>II.</span> Invoice
            </div>
            <div className={d.files}>
              <OpenRow icon="doc" name="The member’s invoice" meta={opening ? 'Opening…' : 'Opens in a new tab'} onOpen={() => openInvoice(c.claimId)} disabled={opening} />
            </div>
            {fileError ? (
              <div className={d.error} role="alert">
                {fileError}
              </div>
            ) : null}
          </>
        ) : null}
        {c.voucherId ? (
          <>
            <div className={d.label}>
              <span className={d.labelRoman}>{member ? 'III.' : 'II.'}</span> Voucher
            </div>
            <div className={d.files}>
              <OpenRow icon="out" name={c.voucherNo ?? 'Voucher'} meta={c.voucherStatus === 'pending_approval' ? 'Pending approval' : (c.voucherStatus ?? '—')} onOpen={() => steps.openVoucher(c.voucherId!)} />
            </div>
          </>
        ) : null}
      </>
    )
    if (waiting && member && can.sendBack) {
      bar.push(
        <button key="return" type="button" className={d.barBtn} data-kind="danger" onClick={() => steps.returnToHr(r)}>
          Return to HR…
        </button>,
      )
    }
    if (waiting && can.pay) {
      bar.push(
        <button key="pv" type="button" className={d.barBtn} data-kind="primary" onClick={() => steps.createPv(r)}>
          Create PV
        </button>,
      )
    }
  } else if (r?.request) {
    const q = r.request
    const waiting = q.status === 'with_finance' && !q.pvId
    body = (
      <>
        <RequestHero
          kicker={q.kind === 'claim' ? 'Claim · I paid' : 'Direct payment'}
          chip={stageChip(r)}
          no={q.requestNo ?? r.ref}
          amount={q.total}
          to={`Pay to ${q.kind === 'claim' ? q.requesterName : q.payeeName ?? 'the supplier'}`}
          note={
            !waiting
              ? `In ${q.pvNo ?? 'its payment voucher'}.`
              : q.shares.length > 0
                ? 'Create its payment voucher — each split’s Bill back is decided there — or reject it back with a reason.'
                : 'Create its payment voucher, or reject it back with a reason.'
          }
        />
        {stepError ? (
          <div className={d.error} role="alert">
            {stepError}
          </div>
        ) : null}
        <RequestGroups r={q} opening={openingFile} fileError={fileError} onOpenFile={openFile} billBack />
        {q.pvId ? (
          <>
            <div className={d.label}>
              <span className={d.labelRoman}>V.</span> Voucher
            </div>
            <div className={d.files}>
              <OpenRow icon="out" name={q.pvNo ?? 'Voucher'} meta={q.pvStatus === 'pending_approval' ? 'Pending approval' : (q.pvStatus ?? '—')} onOpen={() => steps.openVoucher(q.pvId!)} />
            </div>
          </>
        ) : null}
      </>
    )
    if (waiting && can.sendBack) {
      bar.push(
        <button key="reject" type="button" className={d.barBtn} data-kind="danger" onClick={() => steps.rejectRequest(r)}>
          Reject…
        </button>,
      )
    }
    if (waiting && can.pay) {
      bar.push(
        <button key="pv" type="button" className={d.barBtn} data-kind="primary" onClick={() => steps.createRequestPv(r)}>
          Create PV
        </button>,
      )
    }
  }

  return (
    <FinDrawer
      open={!!row}
      onClose={onClose}
      label={r ? `${r.from} · ${r.what}` : 'Request'}
      title={r ? (r.source === 'payroll' ? r.what : r.ref || r.what) : ''}
      bar={bar.length > 0 ? bar : null}
    >
      {body}
    </FinDrawer>
  )
}
