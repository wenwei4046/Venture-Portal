'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setSchemeSwitch, type SchemeSwitch } from '../../../config-actions'

interface Props {
  schemeId: string
  /** On when EITHER the penalty or the incentive is on — the switch sets both. */
  margin: boolean
  kpi: boolean
}

const ITEMS: { key: SchemeSwitch; label: string; hint: string }[] = [
  { key: 'margin', label: 'Margin incentive & penalty', hint: 'the monthly margin incentive and the below-margin cut' },
  { key: 'kpi', label: 'KPI item', hint: 'the flat allowance per KPI unit' },
]

/**
 * What the month pays (2026-09-24; the payroll bar's foot row from
 * 2026-09-27, Review settings since 2026-09-28).
 *
 * Margin and KPI are Rules › Scheme rules, reached from the month so trying a
 * month with and without one is two clicks. Off = that component pays
 * nothing: the commission follows at once, payroll as each salesperson is
 * sent. (Open Bill, set here for one month alone, went with Open Bill on
 * 2026-10-31.)
 *
 * The page's ONE set of these (2026-09-28, user: 保留一个就好): Review settings
 * also held KPI / Open Bill / Margin checkboxes that previewed a switch without
 * saving it — the same words twice, one of them doing nothing — so they went
 * and these moved in beside them.
 */
export default function SchemeSwitches({ schemeId, margin, kpi }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // Local state, flipped the moment it is clicked: the server's answer arrives
  // with the refresh, and until then a second click must send the OTHER value,
  // not the stale one again. Keyed by the props so a refresh re-seeds it.
  const [state, setState] = useState<Record<SchemeSwitch, boolean>>({ margin, kpi })
  const seedOf = `${margin}${kpi}`
  const [seed, setSeed] = useState(seedOf)
  if (seed !== seedOf) {
    setSeed(seedOf)
    setState({ margin, kpi })
  }

  function flip(key: SchemeSwitch) {
    const next = !state[key]
    setError(null)
    setState(s => ({ ...s, [key]: next }))
    startTransition(async () => {
      try {
        await setSchemeSwitch(schemeId, key, next)
        router.refresh()
      } catch (err) {
        setState(s => ({ ...s, [key]: !next }))
        setError(err instanceof Error ? err.message : 'That did not save')
      }
    })
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
            </li>
          )
        })}
      </ul>
      <p className="text-[11px] leading-relaxed mt-1.5 mb-0">
        Saved as you switch, for every month: margin and KPI are Rules › Scheme rules.
        The commission follows a switch at once — payroll as each salesperson is sent.
      </p>
      {error ? <p className="text-danger text-xs mt-1 mb-0" role="alert">{error}</p> : null}
    </div>
  )
}
