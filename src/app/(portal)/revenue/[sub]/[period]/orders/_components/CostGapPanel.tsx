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
 * The reason a month has bills with no margin, and the button that re-prices
 * the month from the Product List.
 *
 * A bill's margin is refused the moment ONE of its commissionable lines has no
 * cost, so the useful unit here is not the bill but the PRODUCT — three
 * unpriced mattresses can blind eighty bills, and the eighty are one problem.
 *
 * Since 2026-09-24 every cost is the Product List's own price (user: margin
 * 统一由产品这边的价格来计算), so each row is fixed on the Product List:
 *
 *   * priced since — the line landed before its price was keyed; Recost reaches it.
 *   * no price     — the SKU is mirrored, nobody has priced it yet.
 *   * not in the SKU master — the ERP sold a code its own catalogue does not carry.
 *   * no seat height — a sofa module priced per height, on a line that names none.
 *
 * Recost is a button and not something that happens on page load: it moves
 * margins, and margins move what the month pays.
 */
const WHY: Record<string, string> = {
  not_in_sku_master: 'not in the SKU master',
  unpriced: 'no price yet',
  no_height: 'no seat height its grid knows',
  error: 'could not be priced',
}

export default function CostGapPanel({ subDepartmentId, period, rows, runLocked }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  if (rows.length === 0) return null

  const blinding = rows.filter(r => r.commissionable)
  const blindingValue = blinding.reduce((a, r) => a + r.amount, 0)
  const pricedSince = blinding.filter(r => r.hasPrice && r.reason !== 'no_height')
  const unpriced = blinding.filter(r => r.inSkuMaster && !r.hasPrice)
  const unknown = blinding.filter(r => !r.inSkuMaster)
  const shown = showAll ? rows : rows.slice(0, 12)

  function recost() {
    setError(null)
    setDone(null)
    startTransition(async () => {
      try {
        const r = await recostMonth(subDepartmentId, period)
        setDone(
          `${r.linesCosted} line${r.linesCosted === 1 ? '' : 's'} re-priced. ` +
            `${r.ordersFullyCosted} bill${r.ordersFullyCosted === 1 ? '' : 's'} now have every line priced; ` +
            `${r.linesStillBlind} line${r.linesStillBlind === 1 ? '' : 's'} still have no price. ` +
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
        A bill&apos;s margin is refused the moment one of its commissionable lines has no price, so
        one unpriced product can blind dozens of bills. These are the codes this month has no price
        for — {blinding.length} of them touch the margin, worth {formatMoney(blindingValue)}.
        {pricedSince.length > 0 ? (
          <>
            {' '}
            <span className="text-ink">{pricedSince.length} have been priced since</span> and reach the
            month on Recost.
          </>
        ) : null}
        {unpriced.length > 0 ? ` ${unpriced.length} still need a price on the Product List.` : ''}
        {unknown.length > 0 ? ` ${unknown.length} are not in the ERP's SKU master at all.` : ''}
      </p>

      <div className="flex flex-wrap items-center gap-4 mb-5">
        <button
          type="button"
          onClick={recost}
          disabled={pending || runLocked}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-5 py-2 rounded-control transition-colors disabled:opacity-40"
        >
          {pending ? 'Re-pricing…' : 'Recost the month from the Product List'}
        </button>
        <Link href={PRODUCT_LIST_PATH} className="font-serif italic text-sm text-accent hover:underline">
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
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(r => (
              <tr key={r.productCode} className={r.commissionable ? undefined : 'opacity-55'}>
                <td className="font-mono text-xs text-ink">{r.productCode}</td>
                <td className="m-hide font-serif text-[13px] text-graphite">{r.productName ?? '—'}</td>
                <td className="m-hide font-mono text-[11px] text-graphite">
                  {r.itemGroup ?? '—'}
                  {!r.commissionable ? <div className="text-muted text-[10px]">earns nothing</div> : null}
                </td>
                <td className="num m-hide">{r.lines}</td>
                <td className="num m-hide">{r.orders}</td>
                <td className="num">{formatMoney(r.amount)}</td>
                <td>
                  {r.hasPrice && r.reason !== 'no_height' ? (
                    <span className="font-serif italic text-ledger text-xs">priced since — Recost reaches it</span>
                  ) : (
                    <span
                      className={`font-serif italic text-xs ${r.inSkuMaster ? 'text-alert' : 'text-danger'}`}
                    >
                      {WHY[r.reason] ?? r.reason}
                    </span>
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
        code the portal cannot price is worth knowing about either way.
      </p>
    </section>
  )
}
