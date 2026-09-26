'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatMoney } from '@/lib/utils'
import type { FairMove } from '../../../_lib/fair-calendar'
import { moveConfirmedFairBills } from '../../../fair-actions'

interface Props {
  /** YYYY-MM-01 — the month on screen. */
  period: string
  subDepartmentId: string
  /** Every bill of the sub-department whose fair counts in another month. */
  moves: FairMove[]
}

function monthName(period: string): string {
  return new Date(`${period}T00:00:00Z`).toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "28–30 Sep", "30 Sep–2 Oct" — the fair's days the way the rest of the month page prints them. */
function days(start: string | null, end: string | null): string {
  if (!start) return ''
  const [, sm, sd] = start.split('-').map(Number)
  if (!end || end === start) return `${sd} ${MONTHS[sm - 1]}`
  const [, em, ed] = end.split('-').map(Number)
  return sm === em ? `${sd}–${ed} ${MONTHS[sm - 1]}` : `${sd} ${MONTHS[sm - 1]}–${ed} ${MONTHS[em - 1]}`
}

/**
 * Bills sitting in another month than their fair's (2026-09-27).
 *
 * The ERP names the fair each bill was written at, and the fair decides which
 * payroll the bill is paid in — a bill keyed on 2 October for a fair of 28–30
 * September is September's. The feed still lands a new document in the month
 * it was keyed, so this is where somebody moves it: one click, the bills the
 * ERP (or a person) placed, never the calendar's guesses. It used to sit on
 * Revenue › Venues beside the fair calendar nobody types into any more.
 *
 * Shown on the month the bills leave AND the month they belong to; the button
 * moves every confirmed bill of the sub-department, whichever months.
 */
export default function FairMovesPanel({ period, subDepartmentId, moves }: Props) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const touching = moves.filter(m => m.fromPeriod === period || m.toPeriod === period)
  // A bill whose fair's month is settled (paid, closed, before the portal
  // pays) stays where it is whatever anybody clicks, so it is counted, not
  // listed — a panel of rows nobody can act on would never go away.
  const here = touching.filter(m => !m.locked)
  if (here.length === 0) return null
  const settled = touching.length - here.length

  const movable = moves.filter(m => m.confirmed && !m.locked)
  const leaving = here.filter(m => m.fromPeriod === period)
  const arriving = here.filter(m => m.toPeriod === period)
  const months = [...new Set(movable.flatMap(m => [m.fromPeriod, m.toPeriod]))].sort()

  function move() {
    setError(null)
    setDone(null)
    startTransition(async () => {
      try {
        const r = await moveConfirmedFairBills(subDepartmentId)
        setDone(r.moved > 0
          ? `Moved ${r.moved} bill${r.moved === 1 ? '' : 's'}. Compute the run again for ${r.months.map(monthName).join(', ')}.`
          : 'Nothing to move.')
        router.refresh()
      } catch (err) {
        const text = err instanceof Error ? err.message : 'That did not move'
        if (!text.includes('NEXT_REDIRECT')) setError(text)
      }
    })
  }

  return (
    <section aria-label="Bills of another month's fair" className="mb-6 border border-hairline rounded-card bg-surface px-4 py-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
        <h2 className="text-[17px] font-bold tracking-[-0.015em]">Bills of another month&apos;s fair</h2>
        <span className="chip alert">
          <span className="dot" />
          {leaving.length > 0 ? `${leaving.length} belong elsewhere` : null}
          {leaving.length > 0 && arriving.length > 0 ? ' · ' : null}
          {arriving.length > 0 ? `${arriving.length} belong here` : null}
        </span>
      </div>
      <p className="text-sm mb-3 max-w-3xl">
        The ERP names the fair each bill was written at, and the fair decides the payroll. These sit in a
        different month from their fair — keyed after it closed, or before it was placed. Moving puts each
        bill in its fair&apos;s month; the runs of both months must then be computed again. A month whose run
        has paid, or that is closed to the feed, keeps its bills.
        {settled > 0 ? ` ${settled} more belong to a settled month's fair and stay where they are.` : ''}
      </p>
      <div className="overflow-x-auto">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Bill</th>
              <th className="m-hide">Salesperson</th>
              <th className="m-hide">Fair</th>
              <th>Move</th>
              <th className="right">Sales value</th>
            </tr>
          </thead>
          <tbody>
            {here.map(m => (
              <tr key={m.orderId}>
                <td>
                  <span className="font-mono text-xs text-ink">{m.orderNo}</span>
                  <small className="block font-mono text-[10px] mt-0.5">keyed {m.orderDate}</small>
                </td>
                <td className="m-hide" data-label="Salesperson">{m.salesperson}</td>
                <td className="m-hide" data-label="Fair">
                  {m.venue ?? '—'}
                  <small className="block text-[11px] mt-0.5">
                    {[days(m.fairStart, m.fairEnd), m.organiser].filter(Boolean).join(' · ')}
                  </small>
                </td>
                <td className="whitespace-nowrap">
                  {monthName(m.fromPeriod)} → {monthName(m.toPeriod)}
                  <small className="block mt-1">
                    <span className={`chip ${m.confirmed ? 'ledger' : 'alert'}`}>
                      <span className="dot" />
                      {m.confirmed ? 'Confirmed' : 'Guessed — stays'}
                    </span>
                  </small>
                </td>
                <td className="num">{formatMoney(m.orderTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3 mt-3">
        <button
          type="button"
          disabled={isPending || movable.length === 0}
          onClick={() => {
            if (window.confirm(`Move ${movable.length} confirmed bill${movable.length === 1 ? '' : 's'} into their fair's month (${months.map(monthName).join(', ')})? Compute those runs again afterwards.`)) move()
          }}
          className="bg-accent hover:bg-accent-hover text-sm px-4 py-2 rounded-control transition-colors disabled:opacity-40"
        >
          {isPending ? 'Moving…' : `Move the ${movable.length} confirmed`}
        </button>
        {movable.length !== here.filter(m => m.confirmed).length ? (
          <span className="text-xs">Includes bills of other months shown on their own pages.</span>
        ) : null}
        {done ? <span role="status" className="text-sm text-ledger">{done}</span> : null}
      </div>
      {error ? <p role="alert" className="sheet-danger">{error}</p> : null}
    </section>
  )
}
