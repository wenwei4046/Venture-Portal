'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Field, Hidden, RowForm, SaveButton } from '@/components/RowForm'
import { formatMoney } from '@/lib/utils'
import type { VenueSales } from '@/lib/venues'
import { setVenueOrganizer } from '../../../venue-actions'

/**
 * Where the month was sold, and who ran each event.
 *
 * The ERP names the venue on every sales order — it is the fair itself, not
 * the warehouse the goods ship from — and says nothing about the ORGANISER.
 * That is the one fact here nobody can derive, so it is typed in place,
 * against the sales it explains, and remembered for every month that names the
 * same venue.
 */
export default function VenueSection({ rows, ordersPath }: { rows: VenueSales[]; ordersPath: string }) {
  // A string, not a callback: a Server Component may hand a Client Component
  // data, never a function.
  const hrefFor = (key: string) => `${ordersPath}?venue=${encodeURIComponent(key)}`
  const [editing, setEditing] = useState<string | null>(null)
  const named = rows.filter(r => r.organizer)

  return (
    <section className="mb-10">
      <div className="sect-head">
        <h2>Sales by venue</h2>
        <span className="rule" aria-hidden />
        <span className="count">{rows.length} VENUES</span>
      </div>
      <p className="font-serif italic text-muted text-sm mb-4 max-w-3xl">
        The venue travels on every order from the ERP. The organiser does not — nothing in the feed
        carries it — so it is typed here once per venue and every month that names that venue shows it.
        {rows.length > 0 ? ` ${named.length} of ${rows.length} named so far.` : ''}
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
              editing === v.venueKey ? (
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
                  </td>
                  <td>
                    {v.venueKey ? (
                      <button
                        type="button"
                        onClick={() => setEditing(v.venueKey)}
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
