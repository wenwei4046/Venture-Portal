'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import { formatMoney } from '@/lib/utils'
import { useStickySelection } from '@/lib/useStickySelection'
import SortableTable, { type SortableColumn } from '@/components/SortableTable'
import type { QueueRow } from '@/lib/approval-queue'
import AttachmentThumbs, { type AttachmentThumb } from '@/components/voucher/AttachmentThumbs'
import BatchDetailsModal from './BatchDetailsModal'
import { approveRequestsBulk, rejectRequestsBulk, type BulkApproveResult, type BulkRejectResult } from '../actions'

// The pending queue as a table (2026-10-07; the user approved the Approvals
// sample — "排队用表格不错，但把 description 和 pv no 分开"). One row per request,
// a combined approval (a loan and its disbursement, a payroll batch) as ONE
// row tagged Combined that opens its details. What is ticked is decided from
// the bar under the table: Approve n → or Reject…. On a phone the row is the
// description, with the number and who / when as small print under it, and
// the amount; the arrow opens Type / Pool / Category / Submitted and the
// voucher itself (the Principal approves from the phone).

export interface PendingRow extends QueueRow {
  /** The pool(s) the row's vouchers draw on, and their category — the phone's panel. */
  pool: string
  category: string
  /** Who is paid, how ("Bank transfer · Maybank"), and the files attached —
   *  the phone's panel too (user picked B, 2026-10-07: see the bill without
   *  leaving the list). */
  payee: string
  payBy: string
  attachments: AttachmentThumb[]
}

type Outcome =
  | { kind: 'approve'; done: number; failed: BulkApproveResult['failed'] }
  | { kind: 'reject'; done: number; failed: BulkRejectResult['failed'] }

const round2 = (n: number) => Math.round(n * 100) / 100
const cut = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

export default function PendingApprovals({ rows, canSetDefault = false }: { rows: PendingRow[]; canSetDefault?: boolean }) {
  const router = useRouter()
  const [step, setStep] = useState<'idle' | 'approve' | 'reject'>('idle')
  const [notes, setNotes] = useState('')
  const [reason, setReason] = useState('')
  const [reasonMissing, setReasonMissing] = useState(false)
  const [allowOverdraw, setAllowOverdraw] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [opened, setOpened] = useState<PendingRow | null>(null)
  const [isPending, startTransition] = useTransition()

  // Ticks survive the trip into a row's page and back (user 2026-09-01); a
  // combined row joins the set under its g: key (user 2026-08-06: select-all
  // must cover the combined ones too) — lib/selection-store.ts.
  const keys = useMemo(() => rows.map((r) => r.key), [rows])
  const { selected, toggle, replace, clear } = useStickySelection('/approvals', keys)
  const allSelected = keys.length > 0 && keys.every((k) => selected.has(k))
  const chosen = rows.filter((r) => selected.has(r.key))
  const chosenTotal = round2(chosen.reduce((s, r) => s + r.amount, 0))
  const chosenHasVoucher = chosen.some((r) => r.requestTypes.includes('payment_voucher'))
  const n = chosen.length

  function reset() {
    clear()
    setStep('idle')
    setNotes('')
    setReason('')
    setReasonMissing(false)
    setAllowOverdraw(false)
  }

  function split() {
    return {
      ids: chosen.filter((r) => r.kind === 'single' && r.id).map((r) => r.id as string),
      groupIds: chosen.filter((r) => r.kind === 'group' && r.groupId).map((r) => r.groupId as string),
    }
  }

  function approve() {
    const { ids, groupIds } = split()
    if (ids.length + groupIds.length === 0) return
    startTransition(async () => {
      try {
        const res = await approveRequestsBulk({ ids, groupIds, notes: notes.trim() || undefined, allowOverdraw })
        setOutcome({ kind: 'approve', done: res.approved, failed: res.failed })
        reset()
        router.refresh()
      } catch (e) {
        setOutcome({
          kind: 'approve',
          done: 0,
          failed: [{ id: '', description: 'Bulk approval', error: e instanceof Error ? e.message : 'Unknown error' }],
        })
      }
    })
  }

  function reject() {
    const text = reason.trim()
    if (!text) {
      setReasonMissing(true)
      return
    }
    const { ids, groupIds } = split()
    if (ids.length + groupIds.length === 0) return
    startTransition(async () => {
      try {
        const res = await rejectRequestsBulk({ ids, groupIds, notes: text })
        setOutcome({ kind: 'reject', done: res.rejected, failed: res.failed })
        reset()
        router.refresh()
      } catch (e) {
        setOutcome({
          kind: 'reject',
          done: 0,
          failed: [{ id: '', description: 'Bulk rejection', error: e instanceof Error ? e.message : 'Unknown error' }],
        })
      }
    })
  }

  // A single request opens its page; a combined approval opens its details
  // (per-row review for a batch of vouchers, read-only when a loan rides along).
  const opens = (r: PendingRow) => (r.kind === 'single' ? !!r.href : r.voucherIds.length > 0)
  function openRow(r: PendingRow) {
    if (r.kind === 'single' && r.href) router.push(r.href)
    else if (r.kind === 'group' && r.voucherIds.length > 0) setOpened(r)
  }

  const columns: SortableColumn<PendingRow>[] = [
    {
      key: '_select',
      label: 'Select',
      sortable: false,
      pinned: 'start',
      resizable: false,
      hideable: false,
      mobile: 'keep',
      header: (
        <input
          type="checkbox"
          checked={allSelected}
          onChange={() => (allSelected ? clear() : replace(keys))}
          aria-label={allSelected ? `Deselect all ${keys.length}` : `Select all ${keys.length}`}
          className="accent-accent cursor-pointer"
        />
      ),
      cellClassName: 'st-tick-cell',
      render: (r) => (
        // The whole cell is the tap target, not the 18px box.
        <label className="st-tick" title="Select for the decision below">
          <input
            type="checkbox"
            checked={selected.has(r.key)}
            onChange={() => toggle(r.key)}
            aria-label={`Select ${r.voucherNo ?? r.description}`}
            className="accent-accent cursor-pointer"
          />
        </label>
      ),
    },
    {
      key: 'voucher_no',
      group: '基本',
      label: 'Voucher #',
      mobile: 'drop',
      render: (r) => (
        <span className="whitespace-nowrap">
          {r.kind === 'single' && r.href ? (
            <Link href={r.href} className="font-mono text-[12px] font-medium text-accent">
              {r.voucherNo ?? '—'}
            </Link>
          ) : r.voucherNo ? (
            <button type="button" onClick={() => openRow(r)} className="font-mono text-[12px] font-medium text-accent">
              {r.voucherNo}
            </button>
          ) : (
            '—'
          )}
          {r.kind === 'group' ? <span className="combo-tag">Combined · {r.members.length}</span> : null}
        </span>
      ),
      sortValue: (r) => r.voucherNo ?? '',
    },
    {
      key: 'description',
      group: '基本',
      label: 'Description',
      mobile: 'keep',
      render: (r) => (
        <>
          <span className="q-desc" title={r.description}>
            {r.description ? cut(r.description) : <span className="text-muted">No description</span>}
            {r.companions.length > 0 ? (
              <>
                {' — approved together with '}
                <em>{r.companions.join(', ')}</em>
              </>
            ) : null}
          </span>
          {/* The phone's small print: the number, then who and when. */}
          <span className="q-sub md:hidden">
            {r.voucherLine ? <span className="q-sub-no">{r.voucherLine}</span> : null}
            <span className="q-sub-by">
              <span className="by">{r.submitterName}</span>
              <span className="on">{dayjs(r.submittedAt).format('D MMM')}</span>
            </span>
          </span>
        </>
      ),
      sortValue: (r) => r.description,
    },
    {
      key: 'type',
      group: '基本',
      label: 'Type',
      mobile: 'detail',
      filterable: true,
      render: (r) => <span className="type-tag">{r.typeLabel}</span>,
      sortValue: (r) => r.typeLabel,
    },
    { key: 'pool', group: '入账', label: 'Pool', mobile: 'detail-only', render: (r) => r.pool || '—' },
    { key: 'category', group: '入账', label: 'Category', mobile: 'detail-only', render: (r) => r.category || '—' },
    { key: 'payee', group: '基本', label: 'Payee', mobile: 'detail-only', render: (r) => r.payee || '—' },
    { key: 'payBy', group: '基本', label: 'Pay by', mobile: 'detail-only', render: (r) => r.payBy || '—' },
    {
      key: 'attachments',
      group: '基本',
      label: 'Attachments',
      mobile: 'detail-only',
      render: (r) => (r.voucherIds.length > 0 ? <AttachmentThumbs attachments={r.attachments} /> : '—'),
    },
    {
      key: 'by',
      group: '基本',
      label: 'By',
      mobile: 'drop',
      filterable: true,
      render: (r) => r.submitterName,
      sortValue: (r) => r.submitterName,
      cellClassName: 'whitespace-nowrap',
    },
    {
      key: 'submitted',
      group: '日期',
      label: 'Submitted',
      mobile: 'detail',
      render: (r) => dayjs(r.submittedAt).format('D MMM HH:mm'),
      sortValue: (r) => new Date(r.submittedAt),
      cellClassName: 'font-mono text-[12px] text-graphite whitespace-nowrap',
    },
    {
      key: 'amount',
      group: '金额',
      label: 'Amount',
      align: 'right',
      mobile: 'keep',
      render: (r) => (r.hasAmount ? <span className="font-semibold">{formatMoney(r.amount)}</span> : <span className="text-muted">—</span>),
      sortValue: (r) => r.amount,
      cellClassName: 'whitespace-nowrap',
    },
    {
      key: 'open',
      label: '',
      sortable: false,
      pinned: 'end',
      resizable: false,
      mobile: 'drop',
      render: (r) =>
        r.kind === 'single' && r.href ? (
          <Link href={r.href} className="font-mono text-[11px] text-accent whitespace-nowrap">
            Open →
          </Link>
        ) : opens(r) ? (
          <button type="button" onClick={() => openRow(r)} className="font-mono text-[11px] text-accent whitespace-nowrap">
            Open →
          </button>
        ) : null,
    },
  ]

  return (
    <section className="approvals-queue fin-queue mb-12">
      <div className="sect-head">
        <h2>Pending</h2>
        <span className="rule" aria-hidden />
        <span className="count">
          {rows.length} {rows.length === 1 ? 'ITEM' : 'ITEMS'}
          {n > 0 ? ` · ${n} SELECTED` : ''}
        </span>
      </div>

      {outcome ? (
        <div className={`mb-4 rounded-md border p-4 ${outcome.failed.length === 0 ? 'border-hairline bg-surface' : 'border-alert bg-alert-bg'}`}>
          <div className="font-serif text-md text-ink">
            {outcome.done > 0 ? (
              <span className="text-ledger">
                {outcome.kind === 'approve' ? 'Approved' : 'Rejected'} {outcome.done} {outcome.done === 1 ? 'request' : 'requests'}.
              </span>
            ) : null}
            {outcome.failed.length > 0 ? (
              <span className="text-alert">
                {outcome.done > 0 ? ' ' : ''}
                {outcome.failed.length} {outcome.failed.length === 1 ? 'request' : 'requests'} could not be{' '}
                {outcome.kind === 'approve' ? 'approved' : 'rejected'}:
              </span>
            ) : null}
          </div>
          {outcome.failed.length > 0 ? (
            <ul className="mt-2 space-y-1 font-serif text-sm">
              {outcome.failed.map((f, i) => (
                <li key={i} className="text-danger">
                  <span className="text-ink">{f.description}</span> — {f.error}
                </li>
              ))}
            </ul>
          ) : null}
          <button type="button" onClick={() => setOutcome(null)} className="mt-2 text-xs text-muted hover:text-ink font-sans transition-colors">
            Dismiss
          </button>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="border border-hairline rounded-md bg-surface p-10 text-center">
          <p className="font-serif italic text-ledger text-lg">All caught up.</p>
          <p className="font-serif italic text-muted text-sm mt-1">No approvals waiting.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <SortableTable<PendingRow>
            layoutId="approvals.queue"
            layoutTitle="Approvals"
            canSetDefault={canSetDefault}
            rows={rows}
            columns={columns}
            getRowKey={(r) => r.key}
            defaultSort={{ key: 'submitted', dir: 'asc' }}
            onRowOpen={openRow}
            rowOpens={opens}
            openLabel="Open the voucher →"
            rowClassName={(r) => (selected.has(r.key) ? 'st-selected' : undefined)}
            footer={(visible) => (
              <tr>
                <td colSpan={1000} className="q-foot">
                  <span>
                    {visible.length} {visible.length === 1 ? 'item' : 'items'} waiting
                  </span>
                  <span className="num">{formatMoney(round2(visible.reduce((s, r) => s + r.amount, 0)))}</span>
                </td>
              </tr>
            )}
          />
        </div>
      )}

      {n > 0 ? (
        <div className="bulk-bar" role="region" aria-label="Decision on what is ticked">
          {step === 'approve' ? (
            <div className="bulk-bar-step">
              <div className="flex items-baseline justify-between gap-4 mb-1">
                <h3 className="font-serif text-lg text-ink">
                  Approve {n} {n === 1 ? 'request' : 'requests'}?
                </h3>
                <span className="font-mono tabular text-md font-semibold text-num-ink">{formatMoney(chosenTotal)}</span>
              </div>
              <p className="font-serif italic text-graphite text-sm mb-3">
                This authorises every selected request for execution and records your decision in the audit trail.{' '}
                <em>This cannot be undone.</em>
              </p>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes for the audit trail (optional — applies to all)"
                className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent-border mb-3"
              />
              {chosenHasVoucher ? (
                <label className="flex items-start gap-2 mb-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowOverdraw}
                    onChange={(e) => setAllowOverdraw(e.target.checked)}
                    className="h-4 w-4 mt-0.5 accent-[var(--accent)]"
                  />
                  <span className="text-sm font-sans text-graphite">
                    允许部门池透支 · Allow dept-pool overdraw
                    <span className="block text-xs text-muted font-serif italic mt-0.5">
                      勾选后,即使某个部门池余额不够,也照样放行(池子会变负数 = 该部门暂由 Venture 垫)。用于不能拖的薪资等。
                    </span>
                  </span>
                </label>
              ) : null}
              <div className="flex items-center gap-3">
                <button type="button" onClick={approve} disabled={isPending} className="bulk-pri font-serif italic text-sm">
                  {isPending ? `Approving ${n}…` : `Yes, approve ${n}`}
                </button>
                <button type="button" onClick={() => setStep('idle')} disabled={isPending} className="bulk-quiet font-sans text-sm">
                  Back
                </button>
              </div>
            </div>
          ) : step === 'reject' ? (
            <div className="bulk-bar-step">
              <div className="flex items-baseline justify-between gap-4 mb-1">
                <h3 className="font-serif text-lg text-ink">
                  Reject {n} {n === 1 ? 'request' : 'requests'}?
                </h3>
                <span className="font-mono tabular text-md font-semibold text-num-ink">{formatMoney(chosenTotal)}</span>
              </div>
              <p className="font-serif italic text-graphite text-sm mb-3">
                Every selected request is turned down with this reason: a voucher is voided, a loan or fund source cancelled. A combined
                approval is rejected whole.
              </p>
              <textarea
                rows={2}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value)
                  if (e.target.value.trim()) setReasonMissing(false)
                }}
                placeholder="Rejection reason (required — applies to all)"
                aria-invalid={reasonMissing || undefined}
                className={`w-full px-3 py-2 bg-paper border rounded-md text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent-border mb-2 ${
                  reasonMissing ? 'border-danger' : 'border-hairline'
                }`}
              />
              {reasonMissing ? <p className="text-sm text-danger font-serif italic mb-3">Please give a reason — it goes on the audit trail.</p> : null}
              <div className="flex items-center gap-3">
                <button type="button" onClick={reject} disabled={isPending} className="bulk-danger font-serif italic text-sm">
                  {isPending ? `Rejecting ${n}…` : `Yes, reject ${n}`}
                </button>
                <button type="button" onClick={() => setStep('idle')} disabled={isPending} className="bulk-quiet font-sans text-sm">
                  Back
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="bulk-bar-l">
                <b>{n}</b> selected · <b>{formatMoney(chosenTotal)}</b>
                <small> · Approving authorises execution — a PV leaves its pool / bank at once.</small>
              </div>
              <div className="bulk-bar-r">
                <button type="button" onClick={reset} className="bulk-quiet font-sans text-sm">
                  Clear
                </button>
                <button type="button" onClick={() => setStep('reject')} className="bulk-sec font-serif italic text-sm">
                  Reject…
                </button>
                <button type="button" onClick={() => setStep('approve')} className="bulk-pri font-serif italic text-sm">
                  Approve {n} →
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}

      {opened?.groupId ? (
        <BatchDetailsModal
          key={opened.groupId}
          groupId={opened.groupId}
          open
          onClose={() => setOpened(null)}
          // A loan riding along means the group cannot be split per row —
          // approve_voucher_batch_partial refuses it — so the details are read-only.
          actionable={opened.members.every((m) => m.request_type === 'payment_voucher')}
          contextItems={opened.members
            .filter((m) => m.request_type !== 'payment_voucher')
            .map((m) => ({ request_type: m.request_type, description: m.description, amount: m.amount }))}
        />
      ) : null}
    </section>
  )
}
