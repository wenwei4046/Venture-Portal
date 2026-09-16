'use client'

import Link from 'next/link'
import { Fragment, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Choice, Hidden, Hint, RowForm, SaveButton, SectionHead } from '@/components/RowForm'
import { formatMoney } from '@/lib/utils'
import { revenuePath } from '@/lib/revenue'
import type { Organiser } from '@/lib/organisers'
import { venueKey } from '@/lib/venues'
import {
  monthLabel,
  type RegisterSummary,
  type VenueRegisterRow,
  type VenueRegisterVenue,
} from '@/lib/venue-register'
import { setVenueCanonical } from '../../venue-actions'
import FairOrganiserPicker from '../../_components/FairOrganiserPicker'

/**
 * Every venue, every fair, and a dropdown for who ran it.
 *
 * One row per FAIR — a place and a month — with the venue's name printed once
 * over its group, the way a ledger prints an account once over its entries. A
 * venue the ERP has named but never billed at keeps a row of its own: "every
 * venue" was the ask, and a place with no bills yet is still a place the next
 * delivery may name.
 *
 * The organiser saves on pick. No form, deliberately: a bare `<select>` inside
 * a RowForm is never submitted — the form is portalled out of the table and
 * only its own controls claim it by id — and this cell is one control with one
 * meaning, so it calls the action directly instead of pretending to be a form.
 * The merge below the name IS a form, because choosing a venue to fold into is
 * a decision worth confirming.
 */
export default function VenueTable({
  venues,
  places,
  organisers,
  summary,
  month,
  slugs,
}: {
  venues: VenueRegisterVenue[]
  /** Every place, whatever month is showing — what a merge may choose from. */
  places: VenueRegisterVenue[]
  organisers: Organiser[]
  summary: RegisterSummary
  month: string | null
  slugs: Record<string, string>
}) {
  const [merging, setMerging] = useState<string | null>(null)

  return (
    <section className="mb-10">
      <SectionHead
        title={month ? `Venues in ${monthLabel(month)}` : 'Venues'}
        count={`${summary.venues} VENUE${summary.venues === 1 ? '' : 'S'}`}
      />
      <Hint>
        The venue travels on every order from the ERP; the organiser does not — nothing in the feed
        carries it. So it is picked here, against the month it belongs to, because the same place
        has a different organiser from one month to the next.{' '}
        {summary.fairs > 0 ? (
          <>
            {summary.named} of {summary.fairs} fairs named
            {month ? '' : ' across every month on record'}.
          </>
        ) : null}
        {summary.unmatched > 0 ? (
          <>
            {' '}
            <span className="text-danger not-italic">
              {summary.unmatched} the ERP named somebody the register does not know
            </span>{' '}
            — add the name above and it will match.
          </>
        ) : null}{' '}
        A venue is typed at the fair, so one place can arrive under several spellings;{' '}
        <em>same place as…</em> folds them into one, and the organiser follows.
      </Hint>
      <div className="overflow-x-auto">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Venue</th>
              <th className="w-28">Month</th>
              <th>Organiser</th>
              <th className="right m-hide">People</th>
              <th className="right m-hide">Bills</th>
              <th className="right">Sales value</th>
            </tr>
          </thead>
          <tbody>
            {venues.map(v => (
              <Fragment key={v.venueKey}>
                {merging === v.venueKey ? (
                  <RowForm action={setVenueCanonical} onDone={() => setMerging(null)}>
                    {({ pending }) => (
                      <tr>
                        <td>
                          <Hidden name="venue" value={v.venueKey} />
                          <span className="font-serif text-[14px] text-ink">{v.displayName}</span>
                          <div className="font-serif italic text-muted text-xs mt-0.5">
                            is the same place as
                          </div>
                        </td>
                        <td colSpan={5}>
                          <div className="flex flex-wrap items-center gap-2">
                            {/* Choice, not a bare <select>: RowForm's form is
                                portalled out of the table, and only its own
                                controls claim it by id. */}
                            <Choice
                              name="canonical"
                              ariaLabel={`Merge ${v.displayName} into`}
                              width="w-80"
                            >
                              <option value="">— nothing, keep it on its own —</option>
                              {places
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
                              onClick={() => setMerging(null)}
                              className="text-xs font-sans text-graphite hover:underline"
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </RowForm>
                ) : null}

                {v.months.length === 0 ? (
                  <tr>
                    <td>
                      <VenueCell venue={v} onMerge={() => setMerging(v.venueKey)} />
                    </td>
                    <td className="font-mono text-[11px] text-muted">—</td>
                    <td colSpan={4} className="font-serif italic text-muted text-[13px]">
                      no bills at this venue yet
                    </td>
                  </tr>
                ) : (
                  v.months.map((fair, i) => (
                    <tr key={fair.periodMonth}>
                      <td>
                        {i === 0 ? (
                          <VenueCell venue={v} onMerge={() => setMerging(v.venueKey)} />
                        ) : (
                          // The name is printed once over the group; this is
                          // what keeps the second month reading as the same
                          // venue rather than as a nameless row.
                          <span className="font-mono text-[11px] text-muted pl-1" aria-hidden>
                            &#8627;
                          </span>
                        )}
                      </td>
                      <td className="font-mono text-[11px]">
                        <MonthCell fair={fair} slugs={slugs} venueKey={v.venueKey} />
                      </td>
                      <td>
                        <FairOrganiserPicker
                          venueKey={fair.venueKey}
                          period={fair.periodMonth ?? ''}
                          organiserId={fair.organiserId}
                          organisers={organisers}
                          venueName={v.displayName}
                          erpOrganiserText={fair.erpOrganiserText}
                        />
                      </td>
                      <td className="num m-hide" data-label="People">
                        {fair.people}
                      </td>
                      <td className="num m-hide" data-label="Bills">
                        {fair.bills}
                      </td>
                      <td className="num whitespace-nowrap">{formatMoney(fair.total)}</td>
                    </tr>
                  ))
                )}
              </Fragment>
            ))}

            {venues.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-muted font-serif italic">
                  No venues yet — they register themselves as the ERP delivers orders.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/** The place: its name, the spellings folded into it, and the way to fold one more. */
function VenueCell({
  venue,
  onMerge,
}: {
  venue: VenueRegisterVenue
  onMerge: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const aliases = venue.aliases.filter(s => venueKey(s) !== venue.venueKey)

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
    <div>
      <span className="font-serif text-[14px] text-ink">{venue.displayName}</span>
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
      </div>
      {error ? <div className="font-serif italic text-danger text-[11px]">{error}</div> : null}
    </div>
  )
}

/** The month, linked to its own bills at this venue. */
function MonthCell({
  fair,
  slugs,
  venueKey: key,
}: {
  fair: VenueRegisterRow
  slugs: Record<string, string>
  venueKey: string
}) {
  const slug = fair.subDepartmentId ? slugs[fair.subDepartmentId] : undefined
  const label = fair.periodMonth ? monthLabel(fair.periodMonth) : '—'
  if (!slug || !fair.periodMonth) return <span className="text-muted">{label}</span>
  return (
    <Link
      href={`${revenuePath(slug, fair.periodMonth, 'orders')}?venue=${encodeURIComponent(key)}`}
      className="text-ink hover:text-accent"
      title={`The bills written at this venue in ${label}`}
    >
      {label}
    </Link>
  )
}
