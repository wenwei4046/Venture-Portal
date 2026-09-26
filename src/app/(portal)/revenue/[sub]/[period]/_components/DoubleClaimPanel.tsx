'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { formatMoney } from '@/lib/utils'
import type { CarriedMonth, DoubleClaimGroup } from '@/lib/commission/double-claims'
import { dismissDoubleClaim, restoreDoubleClaim } from '../../../double-claim-actions'

interface Props {
  period: string
  subDepartmentId: string
  /** `/revenue/fair` — a bill's own page is `${base}/${month}/orders/${id}`. */
  basePath: string
  groups: DoubleClaimGroup[]
  carried: CarriedMonth[]
  /** Why the check could not run, when it could not. */
  unavailable: string | null
}

function monthName(period: string, style: 'long' | 'short' = 'long'): string {
  return new Date(`${period}T00:00:00Z`).toLocaleString('en-US', { month: style, year: 'numeric', timeZone: 'UTC' })
}

function list(words: string[]): string {
  return words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`
}

/**
 * "Is anything here claimed twice?" (user 2026-09-26) — asked at the top of
 * the month, where the run is computed, rather than discovered in payroll.
 *
 * Two questions, because a bill is paid twice in two different ways: the same
 * paper number on two bills (a month worked out by hand, and the ERP keying
 * it again), and bills carried in from a month no run of the portal ever paid
 * (`lib/commission/double-claims.ts`). Only the first can be answered here —
 * the second is a decision about months, not bills.
 */
export default function DoubleClaimPanel({ period, subDepartmentId, basePath, groups, carried, unavailable }: Props) {
  const [showChecked, setShowChecked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const openGroups = groups.filter(g => !g.dismissed)
  const checked = groups.filter(g => g.dismissed)
  const carriedBills = carried.reduce((a, c) => a + c.bills, 0)
  const carriedValue = carried.reduce((a, c) => a + c.value, 0)

  if (!unavailable && openGroups.length === 0 && checked.length === 0 && carried.length === 0) return null

  function answer(action: () => Promise<unknown>) {
    setError(null)
    startTransition(async () => {
      try {
        await action()
      } catch (err) {
        const text = err instanceof Error ? err.message : 'That did not save'
        if (!text.includes('NEXT_REDIRECT')) setError(text)
      }
    })
  }

  function group(g: DoubleClaimGroup) {
    const across = g.months.length > 1
    return (
      <div key={g.billRef} className="mb-4 last:mb-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-1.5">
          <span className="font-mono text-[12px] text-ink font-semibold">{g.billRef}</span>
          <span className="font-serif italic text-sm text-graphite">
            {across
              ? `on ${g.bills.length} bills in ${list(g.months.map(m => monthName(m)))}`
              : `on ${g.bills.length} bills in ${monthName(g.months[0])}`}
          </span>
        </div>
        <div className="border border-hairline rounded-card bg-surface overflow-x-auto">
          <table className="ledger-table tight">
            <thead>
              <tr>
                <th>Month</th>
                <th>Bill</th>
                <th className="m-hide">Salesperson</th>
                <th className="right">Sales value</th>
                <th className="m-hide">Came from</th>
              </tr>
            </thead>
            <tbody>
              {g.bills.map(b => (
                <tr key={b.orderId} className={b.periodMonth === period ? 'font-semibold' : undefined}>
                  <td>{monthName(b.periodMonth, 'short')}</td>
                  <td className="font-mono text-xs">
                    <Link href={`${basePath}/${b.periodMonth}/orders/${b.orderId}`} className="text-ink hover:text-accent">
                      {b.orderNo}
                    </Link>
                  </td>
                  <td className="m-hide" data-label="Salesperson">{b.employeeName ?? b.agentName}</td>
                  <td className="num">{formatMoney(b.orderTotal)}</td>
                  <td className="m-hide font-serif italic text-sm text-graphite" data-label="Came from">
                    {b.source === 'erp_sync' ? 'ERP' : 'Imported'}
                    {b.paidByRun ? <span className="text-alert"> · already paid by a run</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-1.5">
          {g.dismissed ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => answer(() => restoreDoubleClaim(subDepartmentId, g.billRef))}
              className="font-mono text-[10.5px] uppercase tracking-wide text-muted hover:text-accent disabled:opacity-40"
            >
              Ask again
            </button>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (window.confirm(`${g.billRef}: these ${g.bills.length} bills are separate sales, not one bill claimed twice?`)) {
                  answer(() => dismissDoubleClaim(subDepartmentId, g.billRef))
                }
              }}
              className="font-mono text-[10.5px] uppercase tracking-wide text-muted hover:text-accent disabled:opacity-40"
              title="Say so once; a new bill under this number asks again"
            >
              Checked — separate sales
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <section aria-label="Possible double claims" className="mb-6 border border-alert rounded-card bg-alert-bg px-4 py-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-3">
        <h2 className="font-serif text-[17px] text-ink">Possible double claims</h2>
        <span className="font-mono text-[11px] uppercase tracking-[0.02em] text-alert">
          {openGroups.length} to check{carriedBills > 0 ? ` · ${carriedBills} carried in` : ''}
        </span>
      </div>

      {unavailable ? (
        <p className="font-serif italic text-sm text-danger mb-3">
          The check for bills claimed twice could not run: {unavailable}
        </p>
      ) : null}

      {openGroups.length > 0 ? (
        <>
          <p className="font-serif italic text-sm text-graphite mb-3 max-w-3xl">
            The same paper number is on more than one bill a run could pay. Open each bill: if it is
            one sale, correct the copy where it came from; if they are separate sales, mark them checked.
          </p>
          {openGroups.map(group)}
        </>
      ) : null}

      {carried.length > 0 ? (
        <div className={openGroups.length > 0 ? 'mt-5 pt-4 border-t border-hairline' : undefined}>
          <h3 className="font-serif text-[15px] text-ink mb-1">
            {carriedBills} {carriedBills === 1 ? 'bill' : 'bills'} carried in from {list(carried.map(c => monthName(c.periodMonth)))} · {formatMoney(carriedValue)}
          </h3>
          <p className="font-serif italic text-sm text-graphite max-w-3xl">
            The run pays every earlier bill that no run in the portal has paid, and no run has paid{' '}
            {list(carried.map(c => monthName(c.periodMonth)))}. If {carried.length === 1 ? 'that month was' : 'those months were'}{' '}
            paid by hand, computing {monthName(period)} would pay these bills again. They are counted in each
            salesperson&apos;s orders below, marked &ldquo;Carried from&rdquo; on their bills.
          </p>
          <ul className="mt-2 font-mono text-[11px] text-graphite">
            {carried.map(c => (
              <li key={c.periodMonth}>
                {monthName(c.periodMonth, 'short')} · {c.bills} {c.bills === 1 ? 'bill' : 'bills'} · {formatMoney(c.value)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {checked.length > 0 ? (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowChecked(v => !v)}
            aria-expanded={showChecked}
            className="font-mono text-[10.5px] uppercase tracking-wide text-graphite hover:text-accent"
          >
            {showChecked ? 'Hide' : 'Show'} {checked.length} checked — separate sales
          </button>
          {showChecked ? <div className="mt-3">{checked.map(group)}</div> : null}
        </div>
      ) : null}

      {error ? <p role="alert" className="font-serif italic text-sm text-danger mt-3">{error}</p> : null}
    </section>
  )
}
