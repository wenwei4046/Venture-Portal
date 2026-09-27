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
 * What the month pays, under the button that sends it to payroll (2026-09-24;
 * one row of the payroll bar since 2026-09-27).
 *
 * Open Bill is THIS month's (2026-09-26 — user: "open for august, not
 * september"): switching it here sets the month alone, over Rules, and Follow
 * Rules hands it back. Margin and KPI are still Rules › Scheme rules, reached
 * from the month so trying a month with and without one is two clicks. Off =
 * that component pays nothing: the commission above follows at once, payroll
 * when the month is sent again.
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
    <div className="w-full">
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2" aria-label="This month pays">
        <li className="text-[10px] font-medium uppercase tracking-[0.09em]">This month pays</li>
        {ITEMS.map(item => {
          const on = state[item.key]
          return (
            <li key={item.key} className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-ink" title={item.hint}>
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
              {item.key === 'open_bill' && openBill.month !== null ? (
                <>
                  <span className="font-mono text-[10px] text-graphite">
                    {monthLabel} only · Rules: {openBill.rules ? 'On' : 'Off'}
                  </span>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => save('open_bill', openBill.rules, () => setMonthOpenBill(subDepartmentId, period, null))}
                    className="font-mono text-[10px] uppercase tracking-wide text-accent underline-offset-2 hover:underline disabled:opacity-40"
                  >
                    Follow Rules
                  </button>
                </>
              ) : null}
            </li>
          )
        })}
      </ul>
      <p className="text-[11px] leading-relaxed mt-1.5 mb-0">
        Open Bill is set for {monthLabel} alone; margin and KPI are Rules › Scheme rules for every month.
        The commission above follows a switch at once — payroll when the month is sent again.
      </p>
      {error ? <p className="text-danger text-xs mt-1 mb-0" role="alert">{error}</p> : null}
    </div>
  )
}
