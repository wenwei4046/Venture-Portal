'use client'

import Link from 'next/link'
import { FinDrawer, drawerStyles as d } from '@/components/finv/Drawer'
import { DrawerGroup as Group, DrawerLine as Line, fd } from '@/components/finv/DrawerParts'
import { batchLabel, methodLabel, shareLine } from '@/lib/allocator-sheet'
import { officeTime } from '@/lib/office-time'
import type { AllocInvoiceRow, CategoryRow, TxnRow } from './types'

// An allocation in the hub's drawer (2026-10-14, the Finance revamp v2 — D11,
// the prototype's `detailAl`): the dark hero — *Allocation · {batch}*, the
// number, the amount, what it was and when, billed or to bill and what that
// means — then I Expense, II Split, III Split by company (the billable total
// on peach), and at its foot what this reader may do: billed, its invoices;
// not billed, Generate invoices (the system bills the month's unbilled
// allocations together), Correct and ⋯ Delete allocation.

const f2 = (n: number) => (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const rm = (n: number) => `RM ${f2(n)}`
const r2 = (n: number) => Math.round(n * 100) / 100
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export interface AllocationCan {
  /** Billing · Create — + New allocation, Generate invoices. */
  create: boolean
  /** Billing · Edit — correct or delete a record, the staff list, the setup. */
  edit: boolean
}

/** When a record was made, as the office's day (`YYYY-MM-DD`). */
export const recordedOn = (t: Pick<TxnRow, 'createdAt'>) => (t.createdAt ? officeTime(t.createdAt).format('YYYY-MM-DD') : null)

/** A category as the design writes it: *6200 · Rental*. */
export const categoryLabel = (c: Pick<CategoryRow, 'name' | 'coaCode'> | undefined | null) => (c ? (c.coaCode ? `${c.coaCode} · ${c.name}` : c.name) : '—')

export function AllocationDrawer({
  txn,
  open,
  onClose,
  invoices,
  categories,
  can,
  busy,
  error,
  onGenerate,
  onCorrect,
  onMore,
  onInvoices,
}: {
  txn: TxnRow | null
  open: boolean
  onClose: () => void
  /** Its batch's live invoices — one a company. */
  invoices: AllocInvoiceRow[]
  categories: CategoryRow[]
  can: AllocationCan
  busy: boolean
  error: string | null
  onGenerate: () => void
  onCorrect: (t: TxnRow) => void
  /** The ⋯ — its menu is the hub's. */
  onMore: (t: TxnRow) => void
  /** Several invoices: the hub lists them. */
  onInvoices: (t: TxnRow) => void
}) {
  const t = txn
  const billed = !!t?.locked
  const shares = t ? t.details.filter((x) => !x.isOwnShare && x.companyId !== null) : []
  const billable = r2(shares.reduce((s, x) => s + x.amount, 0))
  const date = t ? recordedOn(t) : null
  const invoiceOf = (companyId: string | null) => invoices.find((i) => i.companyId === companyId)
  // Largest share first, HV's own share at the end (the record page's order).
  const lines = t ? [...t.details].sort((x, y) => Number(x.isOwnShare) - Number(y.isOwnShare) || y.amount - x.amount || x.companyLabel.localeCompare(y.companyLabel)) : []

  const buttons = !t
    ? []
    : billed
      ? invoices.length === 1
        ? [
            <Link key="inv" href={`/invoices/${invoices[0].id}`} className={d.barBtn}>
              View invoice {invoices[0].invoiceNo}
            </Link>,
          ]
        : invoices.length > 1
          ? [
              <button key="inv" type="button" className={d.barBtn} onClick={() => onInvoices(t)}>
                View invoices · {invoices.length}
              </button>,
            ]
          : []
      : [
          ...(can.create
            ? [
                <button key="gen" type="button" className={d.barBtn} data-kind="primary" disabled={busy} onClick={onGenerate}>
                  Generate invoices
                </button>,
              ]
            : []),
          ...(can.edit
            ? [
                <button key="fix" type="button" className={d.barBtn} disabled={busy} onClick={() => onCorrect(t)}>
                  Correct
                </button>,
                <button key="more" type="button" className={d.barBtn} data-kind="more" aria-label="More" disabled={busy} onClick={() => onMore(t)}>
                  ⋯
                </button>,
              ]
            : []),
        ]

  const hcMonth = t?.hcPeriod ? `${MON[Number(t.hcPeriod.slice(5, 7)) - 1]} ${t.hcPeriod.slice(0, 4)} snapshot` : 'Current list'

  return (
    <FinDrawer
      open={open}
      onClose={onClose}
      label={t?.txnNo ?? 'Allocation'}
      title={t?.txnNo ?? ''}
      headActions={
        t ? (
          <Link href={`/billing-allocator/${t.id}`} className={d.headBtn}>
            View full page ↗
          </Link>
        ) : null
      }
      bar={buttons.length > 0 ? buttons : null}
    >
      {!t ? (
        <div className={d.loading}>This allocation is not on this month’s list any more.</div>
      ) : (
        <>
          <div className={d.hero} data-light={billed ? 'ledger' : 'alert'}>
            <div className={d.heroTop}>
              <span className={d.kicker}>Allocation · {batchLabel(t)}</span>
              <span className={d.heroChip}>
                <span className={d.heroDot} />
                {billed ? 'billed' : 'to bill'}
              </span>
            </div>
            <div className={d.heroNo}>{t.txnNo}</div>
            <div className={d.heroAmount}>{rm(t.amount)}</div>
            <div className={d.heroTo}>
              {t.description}
              {date ? ` · ${fd(date)}` : ''}
            </div>
            <div className={d.heroNote}>
              <span className={d.heroNoteDot} />
              <span>
                {billed
                  ? 'Billed — each company’s invoice carries its share. Delete or void those invoices on Invoice to undo.'
                  : 'Not billed yet. Correcting reloads it in Calculate; deleting removes it before any invoice is made.'}
              </span>
            </div>
          </div>

          {error ? (
            <div className={d.error} role="alert">
              {error}
            </div>
          ) : null}

          <Group n="I." title="Expense">
            <Line label="Description" value={t.description} />
            <Line label="Category" value={categoryLabel(categories.find((c) => c.id === t.categoryId))} />
            <Line label="Date" value={fd(date)} mono />
          </Group>
          <Group n="II." title="Split">
            <Line label="Method" value={methodLabel(t.method)} />
            {t.method === 'headcount' ? <Line label="Headcount from" value={hcMonth} /> : null}
            <Line label="Companies" value={String(shares.length)} />
            <Line
              label={invoices.length > 1 ? 'Invoices' : 'Invoice'}
              value={billed ? (invoices.length === 1 ? invoices[0].invoiceNo : `${invoices.length} invoices`) : '—'}
              sub={billed && invoices.length > 1 ? batchLabel(t) : undefined}
              mono
            />
          </Group>
          <Group n="III." title="Split by company" foot={{ l: 'Billable total', v: rm(billable) }}>
            {lines.map((x, i) => {
              const own = x.isOwnShare || x.companyId === null
              const inv = !own && billed ? invoiceOf(x.companyId) : undefined
              const state = own ? 'kept' : billed ? 'billed' : 'to bill'
              return (
                <Line
                  key={i}
                  label={own ? 'HV own (not billed)' : x.companyLabel.replace(/ \(dept\)$/, '')}
                  value={rm(x.amount)}
                  sub={[shareLine(x.detail, x.amount, t.amount), state, inv?.invoiceNo].filter(Boolean).join(' · ')}
                  mono
                  tone={own ? 'muted' : undefined}
                />
              )
            })}
          </Group>
        </>
      )}
    </FinDrawer>
  )
}
