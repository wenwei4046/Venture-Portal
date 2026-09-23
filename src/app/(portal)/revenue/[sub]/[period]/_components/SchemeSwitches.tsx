'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setSchemeSwitch, type SchemeSwitch } from '../../../config-actions'

interface Props {
  schemeId: string
  openBill: boolean
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
 * What the run pays, beside the button that runs it (2026-09-24). The same
 * settings as Rules › Scheme rules, reached from the month so trying a month
 * with and without a component is two clicks. Off = that component pays
 * nothing on the next compute.
 */
export default function SchemeSwitches({ schemeId, openBill, margin, kpi }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // Local state, flipped the moment it is clicked: the server's answer arrives
  // with the refresh, and until then a second click must send the OTHER value,
  // not the stale one again. Keyed by the props so a refresh re-seeds it.
  const [state, setState] = useState<Record<SchemeSwitch, boolean>>({ open_bill: openBill, margin, kpi })
  const [seed, setSeed] = useState(`${openBill}${margin}${kpi}`)
  if (seed !== `${openBill}${margin}${kpi}`) {
    setSeed(`${openBill}${margin}${kpi}`)
    setState({ open_bill: openBill, margin, kpi })
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
    <div className="w-full border border-hairline rounded-card bg-surface p-3">
      <div className="font-mono text-[10.5px] uppercase tracking-wide text-graphite mb-2">
        This run pays
      </div>
      <ul className="space-y-1.5">
        {ITEMS.map(item => {
          const on = state[item.key]
          return (
            <li key={item.key} className="flex items-center justify-between gap-3">
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
            </li>
          )
        })}
      </ul>
      <p className="font-serif italic text-muted text-xs mt-2 mb-0">
        Same switches as Rules › Scheme rules. Compute again after changing one.
      </p>
      {error ? <p className="font-serif italic text-danger text-xs mt-1 mb-0">{error}</p> : null}
    </div>
  )
}
