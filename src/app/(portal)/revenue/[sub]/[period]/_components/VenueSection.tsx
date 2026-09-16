'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Choice, Field, Hidden, RowForm, SaveButton } from '@/components/RowForm'
import { formatMoney } from '@/lib/utils'
import { venueKey, type VenueSales } from '@/lib/venues'
import { setVenueCanonical, setVenueOrganizer } from '../../../venue-actions'

/**
 * Where the month was sold, and who ran each event.
 *
 * The ERP names the venue on every sales order — it is the fair itself, not
 * the warehouse the goods ship from — and says nothing about the ORGANISER.
 * That is the one fact here nobody can derive, so it is typed in place,
 * against the sales it explains, and remembered for every month that names the
 * same venue.
 *
 * IT ALSO SPELLS THE SAME PLACE SEVERAL WAYS (2026-09-18), because the venue
 * is free text typed at the fair: `PISA SPICE ARENA`, `PISA SPICE ARENA
 * CONVENTION CENTRE` and `SPICE ARENA` are three rows of what may be one or
 * two events. No rule can tell — `SPICE ARENA` and `SETIA SPICE CONVENTION
 * CENTRE` are two halls of one complex, `MID VALLEY` and `MIDVALLEY SOUTHKEY
 * JB` are 300km apart — so *same place as…* is where somebody who was there
 * says so once, and every month that names either spelling reads as one fair
 * from then on. The spellings stay visible under the name, each with the ✕
 * that takes it back.
 *
 * Its heading is the rail above it (`MonthBreakdownTabs`, 2026-09-17), so the
 * section opens on its own explanation rather than titling itself twice.
 */
export default function VenueSection({ rows, ordersPath }: { rows: VenueSales[]; ordersPath: string }) {
  // A string, not a callback: a Server Component may hand a Client Component
  // data, never a function.
  const hrefFor = (key: string) => `${ordersPath}?venue=${encodeURIComponent(key)}`
  const [editing, setEditing] = useState<{ key: string; mode: 'organizer' | 'merge' } | null>(null)
  const named = rows.filter(r => r.organizer)
  const merged = rows.filter(r => r.spellings.length > 1)

  return (
    <section>
      <p className="font-serif italic text-muted text-sm mb-4 max-w-3xl">
        The venue travels on every order from the ERP. The organiser does not — nothing in the feed
        carries it — so it is typed here once per venue and every month that names that venue shows it.
        {rows.length > 0 ? ` ${named.length} of ${rows.length} named so far.` : ''}
        {' '}It is typed at the fair, so one place can arrive under several spellings;{' '}
        <em>same place as…</em> folds them into one event.
        {merged.length > 0 ? ` ${merged.length} folded so far.` : ''}
      </p>
      <div className="overflow-x-auto">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Venue</th>
              <th>Organiser</th>
              <th className="right m-hide">People</th>
              <th className="right m-hide">Bills</th>
              <th className="right">Sales value</th>
              <th className="lt-toggle" aria-hidden />
            </tr>
          </thead>
          <tbody>
            {rows.map(v =>
              editing?.key === v.venueKey && editing.mode === 'organizer' ? (
                <RowForm key={v.venueKey} action={setVenueOrganizer} onDone={() => setEditing(null)}>
                  {({ pending }) => (
                    <tr>
                      <td>
                        <Hidden name="venue" value={v.displayName} />
                        <span className="font-serif text-[14px] text-ink">{v.displayName}</span>
                      </td>
                      <td colSpan={3}>
                        <div className="flex flex-wrap items-center gap-2">
                          <Field
                            name="organizer"
                            defaultValue={v.organizer ?? ''}
                            placeholder="Who ran this event"
                            width="w-56"
                            ariaLabel={`Organiser for ${v.displayName}`}
                          />
                          <Field name="notes" placeholder="Note (optional)" width="w-48" ariaLabel="Note" />
                          <SaveButton pending={pending} />
                          <button
                            type="button"
                            onClick={() => setEditing(null)}
                            className="text-xs font-sans text-graphite hover:underline"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                      <td className="num">{formatMoney(v.total)}</td>
                    </tr>
                  )}
                </RowForm>
              ) : editing?.key === v.venueKey && editing.mode === 'merge' ? (
                <RowForm key={v.venueKey} action={setVenueCanonical} onDone={() => setEditing(null)}>
                  {({ pending }) => (
                    <tr>
                      <td>
                        <Hidden name="venue" value={v.venueKey} />
                        <span className="font-serif text-[14px] text-ink">{v.displayName}</span>
                        <div className="font-serif italic text-muted text-xs mt-0.5">is the same place as</div>
                      </td>
                      <td colSpan={3}>
                        <div className="flex flex-wrap items-center gap-2">
                          {/* Choice, not a bare <select>: RowForm's form is
                              portalled out of the table, and only its own
                              controls claim it by id. A raw one submits
                              nothing at all. */}
                          <Choice
                            name="canonical"
                            ariaLabel={`Merge ${v.displayName} into`}
                            width="w-72"
                          >
                            <option value="">— nothing, keep it on its own —</option>
                            {rows
                              .filter(o => o.venueKey && o.venueKey !== v.venueKey)
                              .map(o => (
                                <option key={o.venueKey} value={o.venueKey}>
                                  {o.displayName}
                                </option>
                              ))}
                          </Choice>
                          <SaveButton pending={pending} label="Merge" />
                          <button
                            type="button"
                            onClick={() => setEditing(null)}
                            className="text-xs font-sans text-graphite hover:underline"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                      <td className="num">{formatMoney(v.total)}</td>
                    </tr>
                  )}
                </RowForm>
              ) : (
                <tr key={v.venueKey}>
                  <td>
                    {v.venueKey ? (
                      <Link href={hrefFor(v.venueKey)} className="text-ink hover:text-accent">
                        {v.displayName}
                      </Link>
                    ) : (
                      <Link href={hrefFor('')} className="text-muted hover:text-accent">
                        {v.displayName}
                      </Link>
                    )}
                    {v.venueKey ? (
                      <MergeLine
                        venueKey={v.venueKey}
                        spellings={v.spellings}
                        onMerge={() => setEditing({ key: v.venueKey, mode: 'merge' })}
                      />
                    ) : null}
                  </td>
                  <td>
                    {v.venueKey ? (
                      <button
                        type="button"
                        onClick={() => setEditing({ key: v.venueKey, mode: 'organizer' })}
                        className={
                          v.organizer
                            ? 'font-serif text-[14px] text-ink hover:text-accent'
                            : 'font-serif italic text-[14px] text-muted hover:text-accent'
                        }
                      >
                        {v.organizer ?? 'name the organiser'}
                      </button>
                    ) : (
                      <span className="font-serif italic text-[14px] text-muted">
                        the ERP sent no venue for these
                      </span>
                    )}
                  </td>
                  <td className="num m-hide" data-label="People">{v.people}</td>
                  <td className="num m-hide" data-label="Bills">{v.orders}</td>
                  <td className="num">{formatMoney(v.total)}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/**
 * The spellings folded into this place, and the way back out.
 *
 * Only the spellings that are NOT the place's own key are listed: the row
 * already carries that one as its name, and repeating it would read as a merge
 * that never happened.
 */
function MergeLine({
  venueKey: key,
  spellings,
  onMerge,
}: {
  venueKey: string
  spellings: string[]
  onMerge: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const aliases = spellings.filter(s => venueKey(s) !== key)

  function unmerge(spelling: string) {
    setError(null)
    startTransition(async () => {
      try {
        const fd = new FormData()
        fd.set('venue', spelling)
        fd.set('canonical', '')
        await setVenueCanonical(fd)
        router.refresh()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'That did not save'
        if (!message.includes('NEXT_REDIRECT')) setError(message)
      }
    })
  }

  return (
    <div className="mt-0.5">
      {aliases.map(s => (
        <span key={s} className="font-mono text-[10.5px] text-muted mr-2 whitespace-nowrap">
          + {s}
          <button
            type="button"
            onClick={() => unmerge(s)}
            disabled={pending}
            title={`Stop treating ${s} as the same place`}
            className="ml-1 text-graphite hover:text-danger disabled:opacity-40"
          >
            ✕
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={onMerge}
        className="font-serif italic text-[11px] text-graphite hover:text-accent"
      >
        same place as…
      </button>
      {error ? <div className="font-serif italic text-danger text-[11px]">{error}</div> : null}
    </div>
  )
}
