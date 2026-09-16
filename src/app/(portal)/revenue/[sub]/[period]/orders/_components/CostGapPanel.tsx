'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatMoney } from '@/lib/utils'
import { PRODUCT_LIST_PATH } from '@/lib/revenue'
import { recostMonth } from '../../../../run-actions'
import type { UncostedProduct } from '../../../../_lib/month-orders'

interface Props {
  subDepartmentId: string
  period: string
  rows: UncostedProduct[]
  /** True once the run has paid: the costs behind it may not move. */
  runLocked: boolean
}

/**
 * The reason a month has bills with no margin, and the button that fixes the
 * half of it that is fixable.
 *
 * A bill's margin is refused the moment ONE of its commissionable lines has no
 * cost, so the useful unit here is not the bill but the PRODUCT — three
 * uncosted mattresses can blind eighty bills, and the eighty are one problem.
 * The rows are therefore the ERP's product codes, dearest first, each saying
 * which of the two things is wrong:
 *
 *   * the Product List has never heard of this code — someone has to map it or
 *     add it; the ERP and the list often spell the same product differently.
 *   * the list knows it and nobody has keyed what it costs.
 *
 * Refilling is deliberately a button and not something that happens quietly on
 * page load: it moves margins, and margins move what the month pays.
 */
export default function CostGapPanel({ subDepartmentId, period, rows, runLocked }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  if (rows.length === 0) return null

  const blinding = rows.filter(r => r.commissionable)
  const blindingValue = blinding.reduce((a, r) => a + r.amount, 0)
  const fixable = blinding.filter(r => r.listItemCode !== null && r.listHasCost)
  const unknown = blinding.filter(r => r.listItemCode === null)
  const knownNoCost = blinding.filter(r => r.listItemCode !== null && !r.listHasCost)
  const shown = showAll ? rows : rows.slice(0, 12)

  function refill() {
    setError(null)
    setDone(null)
    startTransition(async () => {
      try {
        const r = await recostMonth(subDepartmentId, period)
        setDone(
          `${r.linesCosted} line${r.linesCosted === 1 ? '' : 's'} costed. ` +
            `${r.ordersFullyCosted} bill${r.ordersFullyCosted === 1 ? '' : 's'} now have every line costed; ` +
            `${r.linesStillBlind} line${r.linesStillBlind === 1 ? '' : 's'} still have none. ` +
            `Compute the run again — the margins have moved.`,
        )
        router.refresh()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'That did not run'
        if (!message.includes('NEXT_REDIRECT')) setError(message)
      }
    })
  }

  return (
    <section className="mt-12">
      <div className="sect-head">
        <h2>Why those bills have no margin</h2>
        <span className="rule" aria-hidden />
        <span className="count">{rows.length} CODES</span>
      </div>

      <p className="font-serif italic text-muted text-sm mb-4 max-w-3xl">
        A bill&apos;s margin is refused the moment one of its commissionable lines has no cost, so
        one uncosted product can blind dozens of bills. These are the codes this month has no cost
        for — {blinding.length} of them touch the margin, worth {formatMoney(blindingValue)}.
        {fixable.length > 0 ? (
          <>
            {' '}
            <span className="text-ink">
              {fixable.length} already have a cost in the Product List
            </span>{' '}
            and can be filled now.
          </>
        ) : null}
        {unknown.length > 0 ? ` ${unknown.length} are not in the Product List at all.` : ''}
        {knownNoCost.length > 0 ? ` ${knownNoCost.length} are listed with no cost keyed in.` : ''}
      </p>

      <div className="flex flex-wrap items-center gap-4 mb-5">
        <button
          type="button"
          onClick={refill}
          disabled={pending || runLocked || fixable.length === 0}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-5 py-2 rounded-control transition-colors disabled:opacity-40"
        >
          {pending ? 'Filling…' : 'Fill costs from the Product List'}
        </button>
        <Link
          href={PRODUCT_LIST_PATH}
          className="font-serif italic text-sm text-accent hover:underline"
        >
          Open the Product List →
        </Link>
        {runLocked ? (
          <span className="font-serif italic text-muted text-xs">
            This month has paid — reopen the run before the costs behind it can move.
          </span>
        ) : null}
      </div>

      {error ? <p className="font-serif italic text-danger text-sm mb-4">{error}</p> : null}
      {done ? (
        <p className="font-serif italic text-ink text-sm mb-4 border border-hairline rounded-card bg-surface px-4 py-3">
          {done}
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>ERP code</th>
              <th className="m-hide">Product</th>
              <th className="m-hide">Group</th>
              <th className="right m-hide">Lines</th>
              <th className="right m-hide">Bills</th>
              <th className="right">Value</th>
              <th>Product List</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(r => (
              <tr key={r.productCode} className={r.commissionable ? undefined : 'opacity-55'}>
                <td className="font-mono text-xs text-ink">{r.productCode}</td>
                <td className="m-hide font-serif text-[13px] text-graphite">
                  {r.productName ?? '—'}
                </td>
                <td className="m-hide font-mono text-[11px] text-graphite">
                  {r.itemGroup ?? '—'}
                  {!r.commissionable ? (
                    <div className="text-muted text-[10px]">earns nothing</div>
                  ) : null}
                </td>
                <td className="num m-hide">{r.lines}</td>
                <td className="num m-hide">{r.orders}</td>
                <td className="num">{formatMoney(r.amount)}</td>
                <td>
                  {r.listItemCode === null ? (
                    <span className="font-serif italic text-danger text-sm">not on the list</span>
                  ) : r.listHasCost ? (
                    <span className="font-mono text-[11px] text-ink">{r.listItemCode}</span>
                  ) : (
                    <>
                      <span className="font-mono text-[11px] text-graphite">{r.listItemCode}</span>
                      <div className="font-serif italic text-alert text-xs">no cost keyed in</div>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > shown.length ? (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="font-serif italic text-sm text-accent hover:underline mt-3"
        >
          Show the other {rows.length - shown.length}
        </button>
      ) : null}

      <p className="font-serif italic text-muted text-xs mt-3 max-w-3xl">
        Greyed rows are lines outside a commissionable group — transport, disposal and the like.
        Their cost never reached a margin, so they cost the month nothing; they are listed because a
        code the portal cannot cost is worth knowing about either way.
      </p>
    </section>
  )
}
