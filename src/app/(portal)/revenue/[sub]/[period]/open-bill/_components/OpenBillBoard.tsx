'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatMoney } from '@/lib/utils'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import { setOpenBillRank } from '../../../../run-actions'

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
      {/* The picks that pay are the board's headline — the sheet's one walnut
          card; the two review counts turn red only while work is left. */}
      <StatCards label="Open Bill review">
        <StatCard label="Salesperson-days" value={String(groups.length)} icon="calendar" />
        <StatCard label="Bills tagged" value={String(tagged.length)} icon="tag" tone="primary" />
        <StatCard
          label="Still a suggestion"
          value={String(suggested.length)}
          icon="clock"
          tone={suggested.length > 0 ? 'danger' : undefined}
        />
        <StatCard
          label="Needing a look"
          value={String(groups.filter(g => g.unreviewed).length)}
          icon="inbox"
          tone={groups.some(g => g.unreviewed) ? 'danger' : undefined}
        />
      </StatCards>

      <div className="sheet-toolbar">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyUnreviewed}
            onChange={e => setOnlyUnreviewed(e.target.checked)}
          />
          Only days still on a suggestion
        </label>
        <select value={person} onChange={e => setPerson(e.target.value)}>
          <option value="">Everyone</option>
          {people.map(p => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <span className="ml-auto font-mono text-[10.5px] uppercase tracking-wide">
          {shown.length} of {groups.length} shown
        </span>
      </div>

      {error ? (
        <p className="text-danger text-sm mb-4">{error}</p>
      ) : null}

      {readOnly ? (
        <p className="sheet-notice max-w-3xl">
          This month is in payroll. Take it back — the payroll bar on the month — before changing the
          picks; otherwise the statements would describe bills that no longer earned what they say they did.
        </p>
      ) : null}

      {shown.length === 0 ? (
        <div className="border border-hairline rounded-card bg-surface-2 p-6 text-center">
          <p className="text-md font-bold mb-1">Nothing left to review.</p>
          <p className="text-sm">
            Every salesperson-day has a pick a human has confirmed.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {shown.map(g => (
            <div key={g.key}>
              {/* .ledger-table draws its own frame, so the group heading sits
                  above it rather than inside a second card. */}
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div>
                  <span className="text-sm font-bold">{g.staffName}</span>
                  <span className="font-mono text-[11px] ml-3">{g.eventDate}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10.5px] uppercase tracking-wide">
                    {g.orders.length} bill{g.orders.length === 1 ? '' : 's'}
                  </span>
                  {g.unreviewed ? (
                    <span className="chip alert">
                      <span className="dot" />
                      unreviewed
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="overflow-x-auto">
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
                          <div className="font-mono text-xs font-medium">{o.orderNo}</div>
                          {o.sequenceInDay !== null ? (
                            <div className="font-mono text-[10.5px] mt-0.5">
                              DOC #{o.sequenceInDay} THAT DAY
                            </div>
                          ) : null}
                        </td>
                        <td className="num">{formatMoney(o.orderTotal)}</td>
                        <td>
                          <div className="flex items-center gap-1.5">
                            {/* The held rank is the sheet's orange action (black
                                lettering); an open rank is a plain white key. */}
                            {([1, 2, 3] as const).map(r => (
                              <button
                                key={r}
                                onClick={() => pick(o, o.rank === r ? null : r)}
                                disabled={readOnly || isPending}
                                className={[
                                  'font-mono text-[11px] px-2.5 py-1 rounded-control border transition-colors disabled:opacity-40',
                                  o.rank === r
                                    ? 'bg-accent border-accent hover:bg-accent-hover'
                                    : 'bg-surface border-hairline hover:border-accent',
                                ].join(' ')}
                              >
                                {r === 1 ? '1st' : r === 2 ? '2nd' : '3rd'}
                              </button>
                            ))}
                            {o.rank !== null && o.autoSuggested ? (
                              <span className="chip alert ml-1">
                                <span className="dot" />
                                suggested
                              </span>
                            ) : null}
                            {busyOrder === o.id ? (
                              <span className="text-xs ml-1">saving…</span>
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
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
