'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setMonthOpenBill, setSchemeSwitch, type SchemeSwitch } from '../../../config-actions'
import type { OpenBillMonth } from '../../../_lib/open-bill-month'

interface Props {
  schemeId: string
  subDepartmentId: string
  /** YYYY-MM-01 — the month Open Bill is set for. */
  period: string
  /** "August 2026". */
  monthLabel: string
  /** This month's Open Bill: its own setting over Rules. */
  openBill: OpenBillMonth
  /** On when EITHER the penalty or the incentive is on — the switch sets both. */
  margin: boolean
  kpi: boolean
}

const ITEMS: { key: SchemeSwitch; label: string; hint: string }[] = [
  { key: 'open_bill', label: 'Open Bill', hint: 'the 1st / 2nd / 3rd bill bonus of an event day' },
  { key: 'margin', label: 'Margin incentive & penalty', hint: 'the monthly margin incentive and the below-margin cut' },
  { key: 'kpi', label: 'KPI item', hint: 'the flat allowance per KPI unit' },
]

/**
 * What the run pays, beside the button that runs it (2026-09-24).
 *
 * Open Bill is THIS month's (2026-09-26 — user: "open for august, not
 * september"): switching it here sets the month alone, over Rules, and Follow
 * Rules hands it back. Margin and KPI are still Rules › Scheme rules, reached
 * from the month so trying a month with and without one is two clicks. Off =
 * that component pays nothing on the next compute.
 */
export default function SchemeSwitches({ schemeId, subDepartmentId, period, monthLabel, openBill, margin, kpi }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // Local state, flipped the moment it is clicked: the server's answer arrives
  // with the refresh, and until then a second click must send the OTHER value,
  // not the stale one again. Keyed by the props so a refresh re-seeds it.
  const [state, setState] = useState<Record<SchemeSwitch, boolean>>({ open_bill: openBill.on, margin, kpi })
  const seedOf = `${openBill.on}${openBill.month}${margin}${kpi}`
  const [seed, setSeed] = useState(seedOf)
  if (seed !== seedOf) {
    setSeed(seedOf)
    setState({ open_bill: openBill.on, margin, kpi })
  }

  function save(key: SchemeSwitch, next: boolean, action: () => Promise<void>) {
    setError(null)
    setState(s => ({ ...s, [key]: next }))
    startTransition(async () => {
      try {
        await action()
        router.refresh()
      } catch (err) {
        setState(s => ({ ...s, [key]: !next }))
        setError(err instanceof Error ? err.message : 'That did not save')
      }
    })
  }

  function flip(key: SchemeSwitch) {
    const next = !state[key]
    save(key, next, () =>
      key === 'open_bill' ? setMonthOpenBill(subDepartmentId, period, next) : setSchemeSwitch(schemeId, key, next),
    )
  }

  return (
    <div className="w-full border border-hairline rounded-card bg-surface p-3">
      <div className="font-mono text-[10.5px] uppercase tracking-wide text-graphite mb-2">
        This run pays
      </div>
      <ul className="space-y-1.5">
        {ITEMS.map(item => {
          const on = state[item.key]
          return (
            <li key={item.key}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-ink" title={item.hint}>
                  {item.label}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={item.label}
                  disabled={isPending}
                  onClick={() => flip(item.key)}
                  className={[
                    'font-mono text-[10px] uppercase tracking-wide px-2.5 py-1 rounded-control border transition-colors disabled:opacity-40 min-w-[3.25rem]',
                    on ? 'bg-accent border-accent text-white' : 'bg-paper border-hairline text-muted hover:text-graphite',
                  ].join(' ')}
                >
                  {on ? 'On' : 'Off'}
                </button>
              </div>
              {item.key === 'open_bill' && openBill.month !== null ? (
                <div className="flex items-center justify-between gap-3 mt-0.5">
                  <span className="font-mono text-[10px] text-graphite">
                    {monthLabel} only · Rules: {openBill.rules ? 'On' : 'Off'}
                  </span>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => save('open_bill', openBill.rules, () => setMonthOpenBill(subDepartmentId, period, null))}
                    className="font-mono text-[10px] uppercase tracking-wide text-accent hover:underline disabled:opacity-40"
                  >
                    Follow Rules
                  </button>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
      <p className="font-serif italic text-muted text-xs mt-2 mb-0">
        Open Bill is set for {monthLabel} alone; margin and KPI are Rules › Scheme rules for every month.
        Compute again after changing one.
      </p>
      {error ? <p className="font-serif italic text-danger text-xs mt-1 mb-0">{error}</p> : null}
    </div>
  )
}
