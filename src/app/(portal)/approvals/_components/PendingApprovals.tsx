'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import { formatMoney } from '@/lib/utils'
import { useStickySelection } from '@/lib/useStickySelection'
import CombinedApprovalCard from './CombinedApprovalCard'
import { approveRequestsBulk, type BulkApproveResult } from '../actions'

export interface SingleItem {
  kind: 'single'
  id: string
  requestType: string
  typeLabel: string
  description: string | null
  amount: number | null
  createdAt: string
  submitterName: string
  href: string
}

export interface GroupItem {
  kind: 'group'
  groupId: string
  items: Array<{
    request_type: string
    description: string | null
    amount: number | null
    reference_id: string | null
    reference_table: string | null
  }>
  submitterName: string
  createdAt: string
}

type PendingItem = SingleItem | GroupItem

// Combined cards join the selection set under a g: key (user 2026-08-06:
// "明明有5张我要approve, 按select all只选三张" — select-all must cover
// groups too). Self-approval allowed, so every card is selectable.
const groupKey = (g: GroupItem) => `g:${g.groupId}`

export default function PendingApprovals({ items }: { items: PendingItem[] }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [notes, setNotes] = useState('')
  const [allowOverdraw, setAllowOverdraw] = useState(false)
  const [result, setResult] = useState<BulkApproveResult | null>(null)
  const [isPending, startTransition] = useTransition()

  const singles = useMemo(
    () => items.filter((i): i is SingleItem => i.kind === 'single'),
    [items]
  )
  const groups = useMemo(
    () => items.filter((i): i is GroupItem => i.kind === 'group'),
    [items]
  )
  // Same dedupe rule as the card's Total disbursement: cash out = the
  // payment_voucher amounts (a Loan OUT combo's new_loan duplicates its PV).
  const groupTotal = (g: GroupItem) => {
    const vouchers = g.items.filter((it) => it.request_type === 'payment_voucher')
    return (vouchers.length > 0 ? vouchers : g.items).reduce(
      (s, it) => s + (it.amount ?? 0),
      0
    )
  }
  const selectableIds = useMemo(
    () => [...singles.map((s) => s.id), ...groups.map(groupKey)],
    [singles, groups]
  )
  // Ticks survive the trip into a row's detail page and back — user
  // 2026-09-01: "勾选了 5-6 个东西，其中一个看不太懂就点进去看详情，看完出来
  // 之前勾选过的全都要重新勾一遍". Leaving for another tab still clears them,
  // and an item approved while we were away is pruned by the hook — see
  // lib/selection-store.ts.
  const { selected, toggle, replace, clear } = useStickySelection(
    '/approvals',
    selectableIds
  )
  const hasSelectable = selectableIds.length > 0
  const allSelected =
    hasSelectable && selectableIds.every((id) => selected.has(id))

  const selectedSingles = singles.filter((s) => selected.has(s.id))
  const selectedGroups = groups.filter((g) => selected.has(groupKey(g)))
  const selectedTotal =
    selectedSingles.reduce((sum, s) => sum + (s.amount ?? 0), 0) +
    selectedGroups.reduce((sum, g) => sum + groupTotal(g), 0)
  const selectedHasVoucher =
    selectedSingles.some((s) => s.requestType === 'payment_voucher') ||
    selectedGroups.some((g) =>
      g.items.some((it) => it.request_type === 'payment_voucher')
    )

  function toggleAll() {
    if (allSelected) clear()
    else replace(selectableIds)
  }

  function clearSelection() {
    clear()
    setConfirming(false)
    setNotes('')
    setAllowOverdraw(false)
  }

  function handleApprove() {
    const keys = [...selected]
    const ids = keys.filter((k) => !k.startsWith('g:'))
    const groupIds = keys.filter((k) => k.startsWith('g:')).map((k) => k.slice(2))
    if (ids.length + groupIds.length === 0) return
    startTransition(async () => {
      try {
        const res = await approveRequestsBulk({
          ids,
          groupIds,
          notes: notes.trim() || undefined,
          allowOverdraw,
        })
        setResult(res)
        clearSelection()
        router.refresh()
      } catch (e) {
        setResult({
          approved: 0,
          failed: [
            {
              id: '',
              description: 'Bulk approval',
              error: e instanceof Error ? e.message : 'Unknown error',
            },
          ],
        })
      }
    })
  }

  return (
    <section className="mb-12">
      <div className="sect-head">
        <h2>Pending</h2>
        <span className="rule" aria-hidden />
        <span className="count">
          {items.length} {items.length === 1 ? 'ITEM' : 'ITEMS'}
        </span>
      </div>

      {/* Select-all helper — only when at least one row is selectable */}
      {hasSelectable ? (
        <div className="flex items-center gap-3 mb-3">
          <label className="flex items-center gap-2 cursor-pointer text-xs font-sans text-graphite hover:text-ink transition-colors">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            <span>
              {allSelected
                ? 'Deselect all'
                : `Select all ${selectableIds.length}`}
            </span>
          </label>
          {selected.size > 0 ? (
            <span className="text-xs font-sans text-muted">
              · {selected.size} selected
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Result summary from the last bulk run */}
      {result ? (
        <div
          className={`mb-4 rounded-md border p-4 ${
            result.failed.length === 0
              ? 'border-hairline bg-surface'
              : 'border-alert bg-alert-bg'
          }`}
        >
          <div className="font-serif text-md text-ink">
            {result.approved > 0 ? (
              <span className="text-ledger">
                Approved {result.approved}{' '}
                {result.approved === 1 ? 'request' : 'requests'}.
              </span>
            ) : null}
            {result.failed.length > 0 ? (
              <span className="text-alert">
                {result.approved > 0 ? ' ' : ''}
                {result.failed.length}{' '}
                {result.failed.length === 1 ? 'request' : 'requests'} could not
                be approved:
              </span>
            ) : null}
          </div>
          {result.failed.length > 0 ? (
            <ul className="mt-2 space-y-1 font-serif text-sm">
              {result.failed.map((f, i) => (
                <li key={i} className="text-danger">
                  <span className="text-ink">{f.description}</span> — {f.error}
                </li>
              ))}
            </ul>
          ) : null}
          <button
            type="button"
            onClick={() => setResult(null)}
            className="mt-2 text-xs text-muted hover:text-ink font-sans transition-colors"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="border border-hairline rounded-md bg-surface p-10 text-center">
          <p className="font-serif italic text-ledger text-lg">All caught up.</p>
          <p className="font-serif italic text-muted text-sm mt-1">
            No approvals waiting.
          </p>
        </div>
      ) : (
        <div className="space-y-3 row-stagger">
          {items.map((item, i) =>
            item.kind === 'group' ? (
              <div
                key={item.groupId}
                style={{ '--i': i } as React.CSSProperties}
              >
                <CombinedApprovalCard
                  groupId={item.groupId}
                  items={item.items}
                  submitterName={item.submitterName}
                  createdAt={item.createdAt}
                  selected={selected.has(groupKey(item))}
                  onToggleSelect={() => toggle(groupKey(item))}
                />
              </div>
            ) : (
              <div
                key={item.id}
                style={{ '--i': i } as React.CSSProperties}
                className={`flex items-stretch rounded-md border transition-colors ${
                  selected.has(item.id)
                    ? 'border-accent/60 bg-accent/[0.04]'
                    : 'border-hairline bg-surface'
                }`}
              >
                <label
                  className="flex items-center pl-4 pr-1 cursor-pointer"
                  title="Select for bulk approval"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => toggle(item.id)}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                </label>

                <Link
                  href={item.href}
                  className="flex-1 p-5 pl-3 hover:bg-surface-2/40 transition-colors rounded-r-md"
                >
                  <div className="flex items-baseline justify-between mb-2">
                    <div className="text-xs font-sans font-semibold uppercase tracking-wider text-graphite">
                      {item.typeLabel}
                    </div>
                    <div className="font-mono text-xs text-muted">
                      {dayjs(item.createdAt).format('D MMM HH:mm')}
                    </div>
                  </div>
                  <div className="font-serif text-lg text-ink mb-1">
                    {item.description ?? 'No description'}
                  </div>
                  <div className="flex items-baseline gap-4 mt-2">
                    {item.amount ? (
                      <div className="font-mono tabular text-md font-semibold text-num-ink">
                        {formatMoney(item.amount)}
                      </div>
                    ) : null}
                    <div className="text-xs text-muted font-sans">
                      Submitted by{' '}
                      <span className="font-serif italic text-graphite">
                        {item.submitterName}
                      </span>
                    </div>
                  </div>
                </Link>
              </div>
            )
          )}
        </div>
      )}

      {/* Sticky bulk action bar */}
      {selected.size > 0 ? (
        <div className="sticky bottom-4 z-30 mt-4">
          <div className="mx-auto max-w-3xl rounded-lg border border-accent/40 bg-surface shadow-lg p-4">
            {confirming ? (
              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <h3 className="font-serif text-lg text-ink">
                    Approve {selected.size}{' '}
                    {selected.size === 1 ? 'request' : 'requests'}?
                  </h3>
                  <span className="font-mono tabular text-md font-semibold text-num-ink">
                    {formatMoney(selectedTotal)}
                  </span>
                </div>
                <p className="font-serif italic text-graphite text-sm mb-3">
                  This authorises every selected request for execution and
                  records your decision in the audit trail.{' '}
                  <em>This cannot be undone.</em>
                </p>

                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notes for the audit trail (optional — applies to all)"
                  className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent-border mb-3"
                />

                {selectedHasVoucher ? (
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
                        勾选后,即使某个部门池余额不够,也照样放行(池子会变负数 = 该部门暂由 Venture
                        垫)。用于不能拖的薪资等。
                      </span>
                    </span>
                  </label>
                ) : null}

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleApprove}
                    disabled={isPending}
                    className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-5 py-2.5 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isPending
                      ? `Approving ${selected.size}…`
                      : `Yes, approve ${selected.size}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    disabled={isPending}
                    className="text-sm text-graphite hover:text-ink font-sans transition-colors disabled:opacity-50"
                  >
                    Back
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="font-serif text-md text-ink">
                    {selected.size}{' '}
                    {selected.size === 1 ? 'request' : 'requests'} selected
                  </div>
                  <div className="font-mono tabular text-sm font-semibold text-num-ink">
                    {formatMoney(selectedTotal)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="text-sm text-graphite hover:text-ink font-sans px-3 py-2 transition-colors"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-5 py-2.5 rounded-md transition-colors"
                  >
                    Approve {selected.size} selected
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  )
}
