'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import { formatMoney } from '@/lib/utils'
import { officeTime } from '@/lib/office-time'
import { allocatorSummary, batchLabel, byCompanyRows, splitSummary, type ByCompanyRow } from '@/lib/allocator-sheet'
import SortableTable, { type SortableColumn } from '@/components/SortableTable'
import { useRowLinks } from '@/components/row-links'
import { deleteAllocTxn, generateAllocatorInvoices, type GenerateResult } from '../actions'
import type { AllocatorData, TxnRow } from './types'
import { unwrap } from './unwrap'

// The month's records on the sheet (2026-10-07, the allocator sample; 2026-10-09,
// the user's Claude Design handoff — 照设计档): a strip above the table for
// what still has to be billed, the records with the split as ONE column of
// text ("2990 3.9% · CAR 19.4%", HV's own share left out), the batch and the
// status as chips, a record opening its own page on a double-click, then a By
// company table — each target's share, what is billed, what is to bill, and
// its invoices. On a phone a record is Description + Amount with the number
// and method as small print; the arrow opens the split, the category and the
// batch, and Edit / Delete.

const METHOD: Record<string, string> = { headcount: 'Headcount', percentage: 'Percentage', equal: 'Equal', custom: 'Custom' }
const methodLabel = (m: string) => METHOD[m] ?? m

function BatchChip({ t }: { t: TxnRow }) {
  const label = batchLabel(t)
  return (
    <span className={`chip ${label === 'not billed' ? 'alert' : 'ledger'}`}>
      <i className="dot" />
      {label}
    </span>
  )
}

/** Billed, or still to bill — the handoff's Status column. */
function StatusChip({ t }: { t: TxnRow }) {
  return (
    <span className={`chip ${t.locked ? 'ledger' : 'alert'}`}>
      <i className="dot" />
      {t.locked ? 'billed' : 'to bill'}
    </span>
  )
}

function InvoiceChip({ inv }: { inv: ByCompanyRow['invoices'][number] }) {
  const tone = inv.status === 'issued' ? ' alert' : inv.status === 'paid' || inv.status === 'paid_via_netting' ? ' ledger' : ''
  return (
    // invoice-doc is the per-invoice document view (a /statements/[id] link
    // 404s — that route is monthly statements, user 2026-08-01).
    <a href={`/billing/invoice-doc?id=${inv.id}`} target="_blank" rel="noreferrer" className={`chip${tone}`} title={inv.invoiceNo}>
      <i className="dot" />
      {inv.invoiceNo.slice(-4)} {inv.status === 'paid_via_netting' ? 'paid via netting' : inv.status}
    </a>
  )
}

export default function RecordsTab({
  data,
  onEdit,
}: {
  data: AllocatorData
  /** Loads the record into the Calculate tab; saving there overwrites it. */
  onEdit: (t: TxnRow) => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [genResult, setGenResult] = useState<GenerateResult | null>(null)

  const monthLabel = dayjs(`${data.period}-01`).format('MMMM YYYY')
  const summary = allocatorSummary(data.txns, data.invoices)
  const byCompany = byCompanyRows(data.txns, data.invoices)

  const run = (fn: () => Promise<void>) => {
    setError(null)
    startTransition(async () => {
      try {
        await fn()
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Action failed')
      }
    })
  }
  const remove = (t: TxnRow) => run(async () => { unwrap(await deleteAllocTxn(t.id)) })

  // A record's own page (2026-10-09): a double-click opens it, a right-click
  // offers that, a new tab, and what the row's buttons do.
  const links = useRowLinks<TxnRow>({
    href: (t) => `/billing-allocator/${t.id}`,
    title: (t) => t.txnNo,
    more: (t) => [
      { key: 'edit', label: 'Edit in Calculate', disabled: isPending || t.locked, onSelect: () => onEdit(t) },
      { key: 'delete', label: 'Delete', danger: true, disabled: isPending || t.locked, onSelect: () => remove(t) },
    ],
  })

  if (data.txns.length === 0) {
    return (
      <div className="alloc-sheet fin-queue">
        <div className="border border-hairline rounded-md bg-surface p-8 text-center">
          <p className="font-serif italic text-muted">No allocations for {monthLabel} yet — start on Calculate.</p>
        </div>
      </div>
    )
  }

  const lockedTitle = (t: TxnRow) => `Billed under ${t.billedRef} — delete that batch's drafts first`

  const columns: SortableColumn<TxnRow>[] = [
    {
      key: 'txn_no',
      group: '基本',
      label: 'Txn',
      mobile: 'drop',
      render: (t) => t.txnNo,
      cellClassName: 'font-sans text-[12px] text-ink font-medium whitespace-nowrap',
    },
    {
      key: 'description',
      group: '基本',
      label: 'Description',
      mobile: 'keep',
      render: (t) => (
        <>
          <span className="q-desc" title={t.description}>{t.description}</span>
          {/* The desktop's second line: when it was recorded and how it was split. */}
          <span className="q-meta">
            {t.createdAt ? `${officeTime(t.createdAt).format('D MMM YYYY')} · ` : ''}
            {methodLabel(t.method)}
            {t.hcPeriod ? ` · HC ${dayjs(`${t.hcPeriod}-01`).format('MMM YYYY')}` : ''}
          </span>
          {/* The phone's small print: the number and the method, then the batch and how many shares. */}
          <span className="q-sub md:hidden">
            <span className="q-sub-no">{t.txnNo} · {methodLabel(t.method)}</span>
            <span className="q-sub-by">
              <span className="by"><BatchChip t={t} /></span>
              <span className="on">{t.details.length} {t.details.length === 1 ? 'share' : 'shares'}</span>
            </span>
          </span>
        </>
      ),
      sortValue: (t) => t.description,
    },
    {
      key: 'amount',
      group: '金额',
      label: 'Amount',
      align: 'right',
      mobile: 'keep',
      filterable: true,
      range: 'number',
      render: (t) => <span className="font-semibold">{formatMoney(t.amount)}</span>,
      sortValue: (t) => t.amount,
      cellClassName: 'whitespace-nowrap',
    },
    {
      key: 'split',
      group: '分摊',
      label: 'Split',
      mobile: 'detail',
      render: (t) => <span className="font-sans text-[12px] text-graphite">{splitSummary(t)}</span>,
      sortValue: (t) => splitSummary(t),
    },
    {
      key: 'category',
      group: '基本',
      label: 'Category',
      mobile: 'detail',
      filterable: true,
      render: (t) => t.categoryName || <span className="text-muted">—</span>,
      sortValue: (t) => t.categoryName,
    },
    {
      key: 'batch',
      group: '基本',
      label: 'Batch',
      mobile: 'detail',
      filterable: true,
      render: (t) => <BatchChip t={t} />,
      sortValue: (t) => batchLabel(t),
      cellClassName: 'whitespace-nowrap',
    },
    {
      key: 'status',
      group: '基本',
      label: 'Status',
      mobile: 'detail',
      filterable: true,
      render: (t) => <StatusChip t={t} />,
      sortValue: (t) => (t.locked ? 'billed' : 'to bill'),
      cellClassName: 'whitespace-nowrap',
    },
    {
      key: 'actions',
      label: '',
      sortable: false,
      pinned: 'end',
      resizable: false,
      mobile: 'detail',
      render: (t) => (
        <span className="flex items-center gap-3 whitespace-nowrap">
          <button
            type="button"
            onClick={() => onEdit(t)}
            disabled={isPending || t.locked}
            title={t.locked ? lockedTitle(t) : 'Load it into Calculate; saving there overwrites this record'}
            className="font-mono text-[11px] text-accent disabled:opacity-40"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => remove(t)}
            disabled={isPending || t.locked}
            aria-label="Delete"
            title={t.locked ? lockedTitle(t) : 'Delete this allocation'}
            className="font-mono text-sm text-muted hover:text-danger disabled:opacity-40"
          >
            ×
          </button>
        </span>
      ),
    },
  ]

  const companyRows: SortableColumn<ByCompanyRow>[] = [
    {
      key: 'target',
      label: 'Bill to',
      mobile: 'keep',
      render: (r) => (
        <>
          <span className="q-desc">{r.label}</span>
          <span className="q-meta">{r.own ? 'not billed' : r.dept ? 'dept pool' : 'subsidiary'}</span>
          <span className="q-sub md:hidden">
            <span className="q-sub-no">
              {r.own ? 'kept by HV · not billed' : r.toBill > 0 ? `to bill ${formatMoney(r.toBill)}` : 'all billed'}
            </span>
          </span>
        </>
      ),
      sortValue: (r) => r.label,
      cellClassName: 'whitespace-nowrap',
    },
    {
      key: 'share',
      label: 'Share',
      align: 'right',
      mobile: 'keep',
      render: (r) => <span className={r.own ? undefined : 'font-semibold'}>{formatMoney(r.share)}</span>,
      sortValue: (r) => r.share,
      cellClassName: 'whitespace-nowrap',
    },
    {
      key: 'billed',
      label: 'Billed',
      align: 'right',
      mobile: 'detail',
      // What is billed reads green — the handoff's By company table.
      render: (r) => (r.own || r.billed <= 0 ? <span className="text-muted">—</span> : <span className="text-ledger">{formatMoney(r.billed)}</span>),
      sortValue: (r) => r.billed,
      cellClassName: 'whitespace-nowrap',
    },
    {
      key: 'toBill',
      label: 'To bill',
      align: 'right',
      mobile: 'detail',
      render: (r) => (r.own || r.toBill <= 0 ? <span className="text-muted">—</span> : <span className="text-alert">{formatMoney(r.toBill)}</span>),
      sortValue: (r) => r.toBill,
      cellClassName: 'whitespace-nowrap',
    },
    {
      key: 'invoices',
      label: 'Invoices',
      sortable: false,
      mobile: 'detail',
      render: (r) =>
        r.invoices.length === 0 ? (
          r.own ? '' : <span className="text-muted">none yet</span>
        ) : (
          <span className="flex flex-wrap gap-1.5">
            {r.invoices.map((inv) => <InvoiceChip key={inv.id} inv={inv} />)}
          </span>
        ),
    },
  ]

  const companies = byCompany.filter((r) => !r.own && !r.dept).length
  const depts = byCompany.filter((r) => r.dept).length
  const hasOwn = byCompany.some((r) => r.own)
  const billable = byCompany.filter((r) => !r.own).reduce((s, r) => s + r.share, 0)
  const paidCount = data.invoices.filter((i) => i.status === 'paid' || i.status === 'paid_via_netting').length
  const issuedCount = data.invoices.filter((i) => i.status === 'issued').length
  const draftCount = data.invoices.filter((i) => i.status === 'draft').length

  return (
    <div className="alloc-sheet fin-queue">
      {/* What still has to be billed — the strip and its button; the month's
          billed batches are never touched (only unbilled allocations go out). */}
      {summary.toBillCount > 0 ? (
        <div className="gen-strip" role="region" aria-label="To bill">
          <div>
            <b>{summary.toBillCount}</b> {summary.toBillCount === 1 ? 'expense' : 'expenses'} not yet billed ·{' '}
            <b>{formatMoney(summary.toBill)}</b> to {summary.toBillTargets} {summary.toBillTargets === 1 ? 'company' : 'companies'}{' '}
            <small>· one draft invoice per company; review and issue on the Invoice page.</small>
          </div>
          <button
            type="button"
            onClick={() => run(async () => { setGenResult(unwrap(await generateAllocatorInvoices(data.period))) })}
            disabled={isPending}
            className="bulk-pri font-serif italic text-sm"
          >
            {isPending ? 'Generating…' : 'Generate draft invoices →'}
          </button>
        </div>
      ) : null}

      {genResult ? (
        <div className="mb-4 border border-hairline rounded-md bg-surface p-4 text-sm font-sans space-y-1">
          {genResult.created.map((c) => (
            <div key={c.company} className="text-ledger">✓ {c.company} → {c.invoiceNo}</div>
          ))}
          {genResult.skipped.map((s) => (
            <div key={s.company} className="text-muted">– {s.company} skipped: already has {s.reason}</div>
          ))}
          <button type="button" onClick={() => setGenResult(null)} className="text-xs text-muted hover:text-ink font-sans transition-colors">
            Dismiss
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="mb-4 bg-danger-bg border border-danger text-danger rounded-md p-3 text-sm font-sans">{error}</div>
      ) : null}

      <section className="mb-12">
        <div className="sect-head">
          <h2>Allocations</h2>
          <span className="rule" aria-hidden />
          <span className="count">
            {summary.txnCount} {summary.txnCount === 1 ? 'RECORD' : 'RECORDS'} · {monthLabel.toUpperCase()} ·{' '}
            {summary.toBillCount === 0 ? 'ALL BILLED' : `${summary.billedCount} BILLED`}
          </span>
        </div>
        <div className="overflow-x-auto">
          <SortableTable<TxnRow>
            layoutId="billing-allocator.records"
            layoutTitle="Allocations"
            canSetDefault
            scrollBox
            resizeMode="neighbour"
            rows={data.txns}
            columns={columns}
            getRowKey={(t) => t.id}
            defaultSort={{ key: 'txn_no', dir: 'asc' }}
            searchKeys={['txn_no', 'description', 'split', 'category']}
            searchPlaceholder="Search txn / description…"
            onRowOpen={links.onRowOpen}
            onRowContextMenu={links.onRowContextMenu}
            openLabel="Open →"
            footer={(visible) => (
              <tr>
                <td colSpan={1000} className="q-foot">
                  <span>
                    {visible.length} {visible.length === 1 ? 'record' : 'records'}
                    {summary.ownShare > 0 ? ` · HV own ${formatMoney(summary.ownShare)} kept, not billed` : ''}
                  </span>
                  <span className="num">{formatMoney(visible.reduce((s, t) => s + t.amount, 0))}</span>
                </td>
              </tr>
            )}
          />
          {links.menu}
        </div>
      </section>

      <section className="mb-6">
        <div className="sect-head">
          <h2>By company</h2>
          <span className="rule" aria-hidden />
          <span className="count">
            {companies} {companies === 1 ? 'COMPANY' : 'COMPANIES'}
            {depts > 0 ? ` · ${depts} ${depts === 1 ? 'DEPARTMENT' : 'DEPARTMENTS'}` : ''}
            {hasOwn ? ' · HV OWN' : ''}
          </span>
        </div>
        <div className="overflow-x-auto">
          <SortableTable<ByCompanyRow>
            layoutId="billing-allocator.by-company"
            layoutTitle="By company"
            canSetDefault
            resizeMode="neighbour"
            rows={byCompany}
            columns={companyRows}
            getRowKey={(r) => r.id ?? 'own'}
            defaultSort={{ key: 'share', dir: 'desc' }}
            rowOpens={() => false}
            rowClassName={(r) => (r.own ? 'own' : undefined)}
            footer={() => (
              <tr>
                <td colSpan={1000} className="q-foot">
                  <span>
                    Billable {formatMoney(billable)} · billed {formatMoney(summary.billed)} · to bill {formatMoney(summary.toBill)}
                  </span>
                  <span className="num">
                    {data.invoices.length} {data.invoices.length === 1 ? 'invoice' : 'invoices'}
                    {paidCount > 0 ? ` · ${paidCount} paid` : ''}
                    {issuedCount > 0 ? ` · ${issuedCount} issued` : ''}
                    {draftCount > 0 ? ` · ${draftCount} draft` : ''}
                  </span>
                </td>
              </tr>
            )}
          />
        </div>
      </section>
    </div>
  )
}
