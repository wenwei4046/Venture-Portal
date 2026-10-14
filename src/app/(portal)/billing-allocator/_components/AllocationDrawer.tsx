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
  const steps = t ? allocationSteps(t, invoices, can) : []
  const buttons = steps.map((st) =>
    st.key === 'invoice' ? (
      <Link key="inv" href={`/invoices/${invoices[0].id}`} className={d.barBtn}>
        {st.label}
      </Link>
    ) : (
      <button
        key={st.key}
        type="button"
        className={d.barBtn}
        data-kind={st.kind === 'secondary' ? undefined : st.kind}
        aria-label={st.kind === 'more' ? 'More' : undefined}
        disabled={busy && st.key !== 'invoices'}
        onClick={() => {
          if (!t) return
          if (st.key === 'invoices') onInvoices(t)
          else if (st.key === 'generate') onGenerate()
          else if (st.key === 'correct') onCorrect(t)
          else if (st.key === 'more') onMore(t)
        }}
      >
        {st.label}
      </button>
    ),
  )

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
      {!t ? <div className={d.loading}>This allocation is not on this month’s list any more.</div> : <AllocationDetailBody t={t} invoices={invoices} categories={categories} error={error} />}
    </FinDrawer>
  )
}

export type AllocationStepKey = 'invoice' | 'invoices' | 'generate' | 'correct' | 'more'

/**
 * What this reader may do to the allocation now (the prototype's `detailAl`
 * bar): billed — its invoice (or its invoices, listed); not billed — Generate
 * invoices (Billing · Create), Correct and ⋯ Delete allocation (Billing · Edit).
 */
export function allocationSteps(t: TxnRow, invoices: AllocInvoiceRow[], can: AllocationCan): Array<{ key: AllocationStepKey; label: string; kind: 'primary' | 'secondary' | 'more' }> {
  if (t.locked) {
    if (invoices.length === 1) return [{ key: 'invoice', label: `View invoice ${invoices[0].invoiceNo}`, kind: 'secondary' }]
    if (invoices.length > 1) return [{ key: 'invoices', label: `View invoices · ${invoices.length}`, kind: 'secondary' }]
    return []
  }
  return [
    ...(can.create ? [{ key: 'generate' as const, label: 'Generate invoices', kind: 'primary' as const }] : []),
    ...(can.edit ? [{ key: 'correct' as const, label: 'Correct', kind: 'secondary' as const }, { key: 'more' as const, label: '⋯', kind: 'more' as const }] : []),
  ]
}

/** What the full page adds, on a screen that is the allocation's page (the phone app). */
export interface AllocationBodyExtras {
  createdBy: string | null
  createdAt: string | null
  audit: Array<{ at: string; who: string; what: string }>
}

/**
 * The drawer's body: the dark hero, then I Expense, II Split, III Split by
 * company (the billable total on peach) — and, where the screen is the
 * allocation's page, who made it and its Audit log.
 */
export function AllocationDetailBody({
  t,
  invoices,
  categories,
  error,
  extras = null,
}: {
  t: TxnRow
  /** Its batch's live invoices — one a company. */
  invoices: AllocInvoiceRow[]
  categories: CategoryRow[]
  error: string | null
  extras?: AllocationBodyExtras | null
}) {
  const billed = !!t.locked
  const shares = t.details.filter((x) => !x.isOwnShare && x.companyId !== null)
  const billable = r2(shares.reduce((s, x) => s + x.amount, 0))
  const date = recordedOn(t)
  const invoiceOf = (companyId: string | null) => invoices.find((i) => i.companyId === companyId)
  // Largest share first, HV's own share at the end (the record page's order).
  const lines = [...t.details].sort((x, y) => Number(x.isOwnShare) - Number(y.isOwnShare) || y.amount - x.amount || x.companyLabel.localeCompare(y.companyLabel))
  const hcMonth = t.hcPeriod ? `${MON[Number(t.hcPeriod.slice(5, 7)) - 1]} ${t.hcPeriod.slice(0, 4)} snapshot` : 'Current list'

  return (
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
        {extras ? <Line label="Created by" value={extras.createdBy ?? 'Unknown'} sub={extras.createdAt ? officeTime(extras.createdAt).format('DD MMM YYYY · HH:mm') : undefined} /> : null}
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

      {extras ? (
        <>
          <div className={d.label}>
            Audit log · {extras.audit.length} {extras.audit.length === 1 ? 'event' : 'events'}
          </div>
          <div className={d.audit}>
            {extras.audit.length === 0 ? (
              <div className={d.groupEmpty}>No change on record.</div>
            ) : (
              extras.audit.map((a, i) => (
                <div key={i} className={d.auditRow}>
                  <span className={d.auditWhat}>{a.what}</span>
                  <span className={d.auditMeta}>
                    {a.who} · {a.at}
                  </span>
                </div>
              ))
            )}
          </div>
        </>
      ) : null}
    </>
  )
}
