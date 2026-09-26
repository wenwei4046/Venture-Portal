'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { organiserOptions, type Organiser } from '@/lib/organisers'
import { monthLabel } from '@/lib/venue-register'
import { setFairOrganiser } from '../organiser-actions'

const SELECT =
  'px-2 py-1 bg-paper border border-hairline rounded text-sm text-ink focus:outline-none focus:border-accent-border disabled:opacity-50'

/**
 * Who ran the fair at this venue, in this month — saved the moment it is picked.
 *
 * Its one home is the venue register (all venues, every month). The month
 * page's *Sales by venue* offered it too until 2026-09-26; since then that tab
 * only READS the organiser each bill's fair carries (user: the fair calendar
 * locates it — nothing to pick there). The rule it encodes is not obvious: the
 * organiser belongs to the (venue, month) pair, so the same hall shows a
 * different name in August and September, and picking one never touches the
 * other.
 *
 * NO FORM, deliberately. A bare `<select>` inside a `RowForm` is never
 * submitted — the form is portalled out of the table and only its own controls
 * claim it by id — and this cell is one control with one meaning, so it calls
 * the action directly rather than pretending to be a form. The action still
 * refuses a delivery with no `organiser` field at all, so a future caller that
 * gets this wrong fails loudly instead of silently unnaming the fair.
 *
 * `key` on the select is what makes a saved pick stick: React rewrites an
 * input's `defaultValue` on re-render but never a select's selected option, so
 * without it the cell would show the old organiser until a reload. Same reason
 * `Choice` carries one.
 */
export default function FairOrganiserPicker({
  venueKey,
  period,
  organiserId,
  organisers,
  venueName,
  erpOrganiserText,
  width = 'w-56',
}: {
  /** The PLACE's key — canonical, never one of its other spellings. */
  venueKey: string
  period: string
  organiserId: string | null
  organisers: Organiser[]
  venueName: string
  /** What the ERP delivery called the organiser, when it ever carries one. */
  erpOrganiserText?: string | null
  width?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const options = organiserOptions(organisers, organiserId)

  function pick(value: string) {
    setError(null)
    startTransition(async () => {
      try {
        const fd = new FormData()
        fd.set('venue', venueKey)
        fd.set('period', period)
        fd.set('organiser', value)
        await setFairOrganiser(fd)
        router.refresh()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'That did not save'
        if (!message.includes('NEXT_REDIRECT')) setError(message)
      }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        key={organiserId ?? ''}
        defaultValue={organiserId ?? ''}
        disabled={pending || options.length === 0}
        onChange={e => pick(e.target.value)}
        aria-label={`Organiser for ${venueName} in ${monthLabel(period)}`}
        className={`${SELECT} ${width}`}
      >
        <option value="">
          {options.length === 0 ? '— no organisers registered —' : '— name the organiser —'}
        </option>
        {options.map(o => (
          <option key={o.id} value={o.id}>
            {o.name}
            {o.isActive ? '' : ' (retired)'}
          </option>
        ))}
      </select>
      {pending ? <span className="font-serif italic text-muted text-[11px]">Saving…</span> : null}
      {erpOrganiserText ? (
        <span
          className="font-mono text-[10px] text-muted whitespace-nowrap"
          title="What the ERP delivery called the organiser"
        >
          ERP: {erpOrganiserText}
          {organiserId ? '' : ' — not registered'}
        </span>
      ) : null}
      {error ? <span className="font-serif italic text-danger text-[11px]">{error}</span> : null}
    </div>
  )
}
