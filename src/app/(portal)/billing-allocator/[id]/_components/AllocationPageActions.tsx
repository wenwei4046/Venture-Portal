'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { flash } from '@/components/hrv/toast'
import { DialogConfirm, DialogMenu, FinDialog } from '@/components/finv/Dialog'
import s from '@/components/finv/full.module.css'
import { deleteAllocTxn, generateAllocatorInvoices } from '../../actions'

// What Finance may do to an allocation from its full page (2026-10-14, the
// Finance revamp v2 — the panel of D06, the steps of the drawer): billed, its
// invoices; not billed, Generate invoices (the month's unbilled allocations
// together, asked first), Correct (back on the hub, in Calculate) and ⋯ —
// Delete allocation, asked first.

const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export default function AllocationPageActions({
  id,
  no,
  period,
  billed,
  invoices,
  can,
}: {
  id: string
  no: string
  /** `YYYY-MM`. */
  period: string
  billed: boolean
  invoices: Array<{ id: string; no: string; billTo: string; status: string }>
  can: { create: boolean; edit: boolean }
}) {
  const router = useRouter()
  const [ask, setAsk] = useState<'generate' | 'delete' | null>(null)
  const [menu, setMenu] = useState<'more' | 'invoices' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const list = `/billing-allocator?period=${period}`
  const month = `${MONTH[Number(period.slice(5, 7)) - 1]} ${period.slice(0, 4)}`

  const confirm = async () => {
    if (!ask || busy) return
    setBusy(true)
    setError(null)
    try {
      if (ask === 'generate') {
        const res = await generateAllocatorInvoices(period)
        if (res.error) return setError(res.error)
        const first = res.created[0]?.invoiceNo ?? 'a draft'
        flash(res.created.length === 0 ? 'Nothing to bill' : `${res.created.length === 1 ? 'Invoice' : 'Invoices'} generated · ${first}${res.created.length > 1 ? ` + ${res.created.length - 1} more` : ''}`)
        setAsk(null)
        router.refresh()
      } else {
        const res = await deleteAllocTxn(id)
        if (res.error) return setError(res.error)
        flash('Allocation deleted')
        setAsk(null)
        router.push(list)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not go through. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const steps = billed
    ? invoices.length === 1
      ? [
          <Link key="inv" href={`/invoices/${invoices[0].id}`} className={s.pBtn}>
            View invoice {invoices[0].no}
          </Link>,
        ]
      : invoices.length > 1
        ? [
            <button key="inv" type="button" className={s.pBtn} onClick={() => setMenu('invoices')}>
              View invoices · {invoices.length}
            </button>,
          ]
        : []
    : [
        ...(can.create
          ? [
              <button key="gen" type="button" className={s.pBtn} data-kind="primary" disabled={busy} onClick={() => setAsk('generate')}>
                Generate invoices
              </button>,
            ]
          : []),
        ...(can.edit
          ? [
              <Link key="fix" href={`${list}&edit=${id}`} className={s.pBtn}>
                Correct
              </Link>,
              <button key="more" type="button" className={s.pBtn} data-kind="more" aria-label="More" disabled={busy} onClick={() => setMenu('more')}>
                ⋯
              </button>,
            ]
          : []),
      ]
  if (steps.length === 0) return null

  return (
    <>
      <div className={s.pBar}>{steps}</div>
      <FinDialog open={menu === 'more'} onClose={() => setMenu(null)} title={no}>
        <DialogMenu
          items={[
            {
              key: 'delete',
              label: 'Delete allocation',
              danger: true,
              onClick: () => {
                setMenu(null)
                setError(null)
                setAsk('delete')
              },
            },
          ]}
        />
      </FinDialog>
      <FinDialog open={menu === 'invoices'} onClose={() => setMenu(null)} title={`${no} · its invoices`}>
        <DialogMenu
          items={invoices.map((i) => ({
            key: i.id,
            label: i.no,
            sub: `${i.billTo} · ${i.status === 'paid_via_netting' ? 'paid via netting' : i.status}`,
            onClick: () => {
              setMenu(null)
              router.push(`/invoices/${i.id}`)
            },
          }))}
        />
      </FinDialog>
      <FinDialog
        open={!!ask}
        onClose={() => {
          if (busy) return
          setAsk(null)
          setError(null)
        }}
        title={ask === 'generate' ? 'Generate invoices?' : `Delete ${no}?`}
        locked={busy}
      >
        <DialogConfirm
          text={
            ask === 'generate'
              ? `Bills every allocation of ${month} not yet billed — this one with them — as one draft invoice a company.`
              : 'Removes the allocation before any invoice is made.'
          }
          confirmLabel={busy ? 'Working…' : ask === 'generate' ? 'Generate invoices' : 'Delete'}
          danger={ask === 'delete'}
          busy={busy}
          error={error}
          onCancel={() => {
            setAsk(null)
            setError(null)
          }}
          onConfirm={() => void confirm()}
        />
      </FinDialog>
    </>
  )
}
