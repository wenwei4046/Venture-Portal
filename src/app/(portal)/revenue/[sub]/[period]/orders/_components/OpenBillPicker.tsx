'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setOpenBillRank } from '../../../../run-actions'

interface Props {
  orderId: string
  /** Who wrote the bill and when — the pair a rank is held against. */
  staffName: string | null
  eventDate: string
  rank: 1 | 2 | 3 | null
  /** True while the rank is still the importer's guess from the document number. */
  suggested: boolean
  /** Cancelled bills, unmatched agents and a paid run all take the pick away. */
  disabled: boolean
  disabledReason?: string
}

const LABELS = { 1: '1st', 2: '2nd', 3: '3rd' } as const

/**
 * The Open Bill pick, in the row of the bill it is about.
 *
 * The bonus goes to the 1st / 2nd / 3rd bill a salesperson writes on an event
 * day, and the ERP's Date cells carry no time of day — so the importer seeds
 * the picks from the running document number and marks them a SUGGESTION. The
 * dedicated board reviews those suggestions a day at a time; this puts the
 * same decision on the row where the margin, the venue and the customer are
 * already visible, which is what the decision actually turns on.
 *
 * THREE CLICKS, THREE MEANINGS, and the third is the one a plain toggle gets
 * wrong: clicking an unpicked rank claims it, clicking a rank this bill
 * already holds BY A HUMAN'S CHOICE clears it, and clicking a rank it holds
 * only as a SUGGESTION confirms that suggestion. Without the last one,
 * agreeing with the importer would mean clearing the pick and setting it
 * again — and a board where agreeing is harder than disagreeing gets agreed
 * with by default.
 *
 * A dashed outline is a suggestion, a solid fill is a decision.
 */
export default function OpenBillPicker({
  orderId,
  staffName,
  eventDate,
  rank,
  suggested,
  disabled,
  disabledReason,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (disabled) {
    return (
      <span className="font-mono text-[10.5px] uppercase tracking-wide text-muted" title={disabledReason}>
        {rank ? LABELS[rank] : '—'}
      </span>
    )
  }

  function pick(target: 1 | 2 | 3) {
    const next = rank !== target ? target : suggested ? target : null
    setError(null)
    startTransition(async () => {
      try {
        await setOpenBillRank(orderId, next)
        router.refresh()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'That did not save'
        if (!message.includes('NEXT_REDIRECT')) setError(message)
      }
    })
  }

  return (
    <div className="flex items-center gap-1">
      {([1, 2, 3] as const).map(r => {
        const held = rank === r
        return (
          <button
            key={r}
            type="button"
            onClick={() => pick(r)}
            disabled={isPending}
            title={
              held && suggested
                ? `Confirm: the ${LABELS[r]} bill ${staffName ?? 'they'} wrote on ${eventDate}`
                : held
                  ? `Clear the ${LABELS[r]} bill of ${eventDate}`
                  : `Make this the ${LABELS[r]} bill ${staffName ?? 'they'} wrote on ${eventDate}`
            }
            className={[
              'font-mono text-[10px] leading-none px-1.5 py-1 rounded-control border transition-colors disabled:opacity-40',
              held && !suggested
                ? 'bg-accent border-accent text-white'
                : held
                  ? 'border-dashed border-alert text-alert bg-alert-bg font-semibold'
                  : 'bg-paper border-hairline text-muted hover:border-accent-border hover:text-graphite',
            ].join(' ')}
          >
            {LABELS[r]}
          </button>
        )
      })}
      {error ? <span className="font-serif italic text-danger text-[11px] ml-1">{error}</span> : null}
    </div>
  )
}
