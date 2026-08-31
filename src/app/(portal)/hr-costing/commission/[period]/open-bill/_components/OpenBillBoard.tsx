'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatMoney } from '@/lib/utils'
import { setOpenBillRank } from '../../../run-actions'

export interface BoardOrder {
  id: string
  orderNo: string
  staffId: string
  staffName: string
  eventDate: string
  orderTotal: number
  sequenceInDay: number | null
  rank: 1 | 2 | 3 | null
  autoSuggested: boolean
}

interface Props {
  orders: BoardOrder[]
  rates: Record<number, number>
  readOnly: boolean
}

interface Group {
  key: string
  staffId: string
  staffName: string
  eventDate: string
  orders: BoardOrder[]
  unreviewed: boolean
}

/**
 * The Open Bill review board.
 *
 * The bonus goes to the 1st / 2nd / 3rd bill a salesperson writes on an event
 * day, and the ERP's Date cells carry no time of day — so the importer seeds
 * the picks from the running document number and marks them SUGGESTED. This
 * board is where a human turns a suggestion into a decision.
 *
 * The default view hides everything already reviewed, because in a real month
 * most days have one obvious answer and the ones worth a person's attention are
 * the days where the suggestion might be wrong.
 */
export default function OpenBillBoard({ orders, rates, readOnly }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [busyOrder, setBusyOrder] = useState<string | null>(null)
  const [onlyUnreviewed, setOnlyUnreviewed] = useState(true)
  const [person, setPerson] = useState<string>('')

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>()
    for (const o of orders) {
      const key = `${o.staffId}|${o.eventDate}`
      const g = map.get(key)
      if (g) g.orders.push(o)
      else
        map.set(key, {
          key,
          staffId: o.staffId,
          staffName: o.staffName,
          eventDate: o.eventDate,
          orders: [o],
          unreviewed: false,
        })
    }
    const list = [...map.values()]
    for (const g of list) {
      g.orders.sort((a, b) => (a.sequenceInDay ?? 0) - (b.sequenceInDay ?? 0) || a.orderNo.localeCompare(b.orderNo))
      // Worth a look when a rank is still the importer's guess, or when nobody
      // holds the 1st bill on a day that clearly had one.
      g.unreviewed =
        g.orders.some(o => o.rank !== null && o.autoSuggested) ||
        g.orders.every(o => o.rank === null)
    }
    return list.sort(
      (a, b) => b.eventDate.localeCompare(a.eventDate) || a.staffName.localeCompare(b.staffName),
    )
  }, [orders])

  const people = useMemo(
    () => [...new Set(orders.map(o => o.staffName))].sort(),
    [orders],
  )

  const shown = groups.filter(
    g => (!onlyUnreviewed || g.unreviewed) && (person === '' || g.staffName === person),
  )

  const tagged = orders.filter(o => o.rank !== null)
  const suggested = tagged.filter(o => o.autoSuggested)

  function pick(order: BoardOrder, rank: 1 | 2 | 3 | null) {
    if (readOnly) return
    setError(null)
    setBusyOrder(order.id)
    startTransition(async () => {
      try {
        await setOpenBillRank(order.id, rank)
        router.refresh()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'That did not save'
        if (!msg.includes('NEXT_REDIRECT')) setError(msg)
      } finally {
        setBusyOrder(null)
      }
    })
  }

  return (
    <div>
      <section className="mb-8">
        <div className="grid gap-4 sm:grid-cols-4">
          <Tile label="Salesperson-days" value={String(groups.length)} />
          <Tile label="Bills tagged" value={String(tagged.length)} />
          <Tile
            label="Still a suggestion"
            value={String(suggested.length)}
            warn={suggested.length > 0}
          />
          <Tile
            label="Needing a look"
            value={String(groups.filter(g => g.unreviewed).length)}
            warn={groups.some(g => g.unreviewed)}
          />
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-4 mb-6">
        <label className="flex items-center gap-2 font-serif text-sm text-graphite">
          <input
            type="checkbox"
            checked={onlyUnreviewed}
            onChange={e => setOnlyUnreviewed(e.target.checked)}
            className="accent-current"
          />
          Only days still on a suggestion
        </label>
        <select
          value={person}
          onChange={e => setPerson(e.target.value)}
          className="px-3 py-1.5 bg-paper border border-hairline rounded-md text-sm font-sans text-ink focus:outline-none focus:border-accent-border"
        >
          <option value="">Everyone</option>
          {people.map(p => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <span className="font-mono text-[10.5px] uppercase tracking-wide text-muted">
          {shown.length} of {groups.length} shown
        </span>
      </div>

      {error ? (
        <p className="font-serif italic text-danger text-sm mb-4">{error}</p>
      ) : null}

      {readOnly ? (
        <p className="font-serif italic text-muted text-sm mb-6 max-w-3xl">
          The run for this month has already paid. Reopen it before changing the picks — otherwise
          the statements would describe bills that no longer earned what they say they did.
        </p>
      ) : null}

      {shown.length === 0 ? (
        <div className="py-14 text-center border border-hairline rounded-md bg-surface">
          <p className="font-serif text-xl text-ink mb-2">Nothing left to review.</p>
          <p className="font-serif italic text-muted text-sm">
            Every salesperson-day has a pick a human has confirmed.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {shown.map(g => (
            <div key={g.key} className="border border-hairline rounded-md bg-surface overflow-hidden">
              <div className="flex items-baseline justify-between px-4 py-3 border-b border-hairline bg-surface-2">
                <div>
                  <span className="font-serif text-[15px] text-ink">{g.staffName}</span>
                  <span className="font-mono text-[11px] text-graphite ml-3">{g.eventDate}</span>
                </div>
                <span className="font-mono text-[10.5px] uppercase tracking-wide text-muted">
                  {g.orders.length} bill{g.orders.length === 1 ? '' : 's'}
                  {g.unreviewed ? ' · unreviewed' : ''}
                </span>
              </div>
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th className="right">Value</th>
                    <th>Open Bill</th>
                    <th className="right">Bonus rate</th>
                  </tr>
                </thead>
                <tbody>
                  {g.orders.map(o => (
                    <tr key={o.id}>
                      <td>
                        <div className="font-mono text-xs text-ink">{o.orderNo}</div>
                        {o.sequenceInDay !== null ? (
                          <div className="font-mono text-[10.5px] text-muted mt-0.5">
                            DOC #{o.sequenceInDay} THAT DAY
                          </div>
                        ) : null}
                      </td>
                      <td className="num">{formatMoney(o.orderTotal)}</td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          {([1, 2, 3] as const).map(r => (
                            <button
                              key={r}
                              onClick={() => pick(o, o.rank === r ? null : r)}
                              disabled={readOnly || isPending}
                              className={[
                                'font-mono text-[11px] px-2.5 py-1 rounded-md border transition-colors disabled:opacity-40',
                                o.rank === r
                                  ? 'bg-accent border-accent text-white'
                                  : 'bg-paper border-hairline text-graphite hover:border-accent-border',
                              ].join(' ')}
                            >
                              {r === 1 ? '1st' : r === 2 ? '2nd' : '3rd'}
                            </button>
                          ))}
                          {o.rank !== null && o.autoSuggested ? (
                            <span className="font-mono text-[10px] uppercase tracking-wide text-alert ml-1">
                              suggested
                            </span>
                          ) : null}
                          {busyOrder === o.id ? (
                            <span className="font-serif italic text-muted text-xs ml-1">saving…</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="num">
                        {o.rank === null ? '—' : `+${Math.round((rates[o.rank] ?? 0) * 100)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Tile({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="border border-hairline rounded-md bg-surface px-4 py-3">
      <div className="font-mono text-[0.6rem] tracking-wide text-muted uppercase mb-1">{label}</div>
      <div
        className={[
          'num tabular tracking-[-0.01em] text-xl',
          warn ? 'text-danger' : 'text-num-ink',
        ].join(' ')}
      >
        {value}
      </div>
    </div>
  )
}
