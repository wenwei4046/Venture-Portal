'use client'

import {
  ActionButton,
  Choice,
  Field,
  Hidden,
  Hint,
  RowForm,
  SaveButton,
  SectionHead,
} from '@/components/RowForm'
import { formatMoney } from '@/lib/utils'
import type { Organiser } from '@/lib/organisers'
import type { VenueRegisterVenue } from '@/lib/venue-register'
import {
  candidateMonths,
  fairCalendarSummary,
  fairMonthLabel,
  fairWindowLabel,
  gapLooksLikeSeveralFairs,
  type Fair,
  type FairGap,
} from '@/lib/fair-calendar'
import { applyFairCalendar, deleteFair, upsertFair } from '../../fair-actions'

/**
 * The fair calendar: when each fair actually ran.
 *
 * WHY IT IS ON THIS PAGE AND NOT INSIDE A MONTH. Half the point is that a
 * bill is in the WRONG month — a Kuching bill keyed on 2 September belongs to
 * August's fair — so a screen scoped to one month could never show both ends
 * of the problem. The calendar sits beside the venue register for the same
 * reason the register does: a hall is a hall whoever sells in it.
 *
 * TWO TABLES, AND THE SECOND ONE IS THE WORK.
 *
 *   *Fairs* is what has been typed.
 *   *Still to place* is every (place, month) with bills and no fair covering
 *   them, biggest first. That list is the job, and it empties as the calendar
 *   fills.
 *
 * A gap whose bills spread over more than a week held MORE THAN ONE fair that
 * month, and the row says so. Covering it with one wide window would place
 * the bills in the right month by luck and hang the wrong organiser on half
 * of them — SPICE ARENA's 61 August bills run 9 Aug to 29 Aug, and that is
 * two fairs, not a three-week one.
 *
 * SAVING A FAIR MOVES NOTHING. It re-stamps which fair each bill belongs to.
 * *Move the bills* is the separate, deliberate step, because it moves money
 * between payrolls — and it refuses a month whose run has already paid.
 */
export default function FairCalendarSection({
  fairs,
  gaps,
  places,
  organisers,
}: {
  fairs: Fair[]
  gaps: FairGap[]
  places: VenueRegisterVenue[]
  organisers: Organiser[]
}) {
  const summary = fairCalendarSummary(fairs, gaps)
  const pickable = organisers.filter(o => o.isActive)

  return (
    <section className="mb-12">
      <SectionHead
        title="Fair calendar"
        count={`${summary.dated} FAIR${summary.dated === 1 ? '' : 'S'} DATED`}
      />
      <Hint>
        Which days each fair was open — and therefore which month its bills are paid in. The ERP
        dates a bill the day the document was opened in the back office, not the day it was
        written at the fair, so a fair that runs at month end lands its whole weekend in the next
        month&rsquo;s payroll. The feed carries no event date of its own, so this is where the real
        one lives. <em>Saving a fair moves nothing</em> — it only records which fair each bill
        belongs to.
      </Hint>

      {summary.billsToMove > 0 ? (
        <div className="border border-hairline bg-alert-bg/40 border-l-[3px] border-l-alert px-4 py-3 mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-sm text-ink m-0">
            <strong className="font-semibold">
              {summary.billsToMove} bill{summary.billsToMove === 1 ? '' : 's'}
            </strong>{' '}
            worth <span className="num">{formatMoney(summary.valueToMove)}</span> are sitting in a
            month their fair disagrees with.{' '}
            <span className="text-graphite">
              Moving them changes what each run pays, so every run over a month this touches has to
              be computed again.
            </span>
          </p>
          <ActionButton
            run={applyFairCalendar}
            label="Move the bills"
            confirm={`Move ${summary.billsToMove} bills into the month of the fair they were written at? Runs over the months this touches must be computed again. A month whose run has already paid will be refused.`}
          />
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Venue</th>
              <th className="w-32">Opens</th>
              <th className="w-32">Closes</th>
              <th>Organiser</th>
              <th className="w-28 m-hide">Counts in</th>
              <th className="right m-hide">Bills</th>
              <th className="right">Sales value</th>
              <th className="right m-hide">To move</th>
              <th className="w-28" />
            </tr>
          </thead>
          <tbody>
            <RowForm action={upsertFair}>
              {({ pending }) => (
                <tr className="bg-surface-2/40">
                  <td>
                    <Choice name="venue" required width="w-56" ariaLabel="Venue of the new fair">
                      <option value="">Pick a venue…</option>
                      {places.map(p => (
                        <option key={p.venueKey} value={p.venueKey}>
                          {p.displayName}
                        </option>
                      ))}
                    </Choice>
                  </td>
                  <td>
                    <Field name="start_date" type="date" width="w-36" required ariaLabel="First day of the new fair" />
                  </td>
                  <td>
                    <Field name="end_date" type="date" width="w-36" required ariaLabel="Last day of the new fair" />
                  </td>
                  <td>
                    <Choice name="organiser_id" width="w-44" ariaLabel="Organiser of the new fair">
                      <option value="">— no organiser —</option>
                      {pickable.map(o => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </Choice>
                  </td>
                  <td className="m-hide text-muted font-serif italic text-xs">
                    the month it opens
                  </td>
                  <td className="num m-hide" />
                  <td className="num" />
                  <td className="num m-hide" />
                  <td>
                    <SaveButton pending={pending} label="Add" />
                  </td>
                </tr>
              )}
            </RowForm>

            {fairs.map(f => {
              const months =
                f.startDate && f.endDate ? candidateMonths(f.startDate, f.endDate) : [f.periodMonth]
              return (
                <RowForm key={f.fairId} action={upsertFair}>
                  {({ pending }) => (
                    <tr>
                      <td>
                        <Hidden name="id" value={f.fairId} />
                        <Hidden name="venue" value={f.venueKey} />
                        <span className="font-medium">{f.displayName}</span>
                        {f.startDate === null ? (
                          <span className="block text-muted font-serif italic text-xs mt-0.5">
                            no days yet — names {fairMonthLabel(f.periodMonth)}&rsquo;s organiser only
                          </span>
                        ) : (
                          <span className="block text-graphite font-mono text-[11px] mt-0.5">
                            {fairWindowLabel(f.startDate, f.endDate)}
                          </span>
                        )}
                      </td>
                      <td>
                        <Field
                          name="start_date"
                          type="date"
                          width="w-36"
                          required
                          defaultValue={f.startDate ?? ''}
                          ariaLabel={`First day of the fair at ${f.displayName}`}
                        />
                      </td>
                      <td>
                        <Field
                          name="end_date"
                          type="date"
                          width="w-36"
                          required
                          defaultValue={f.endDate ?? ''}
                          ariaLabel={`Last day of the fair at ${f.displayName}`}
                        />
                      </td>
                      <td>
                        <Choice
                          name="organiser_id"
                          width="w-44"
                          defaultValue={f.organiserId ?? ''}
                          ariaLabel={`Organiser of the fair at ${f.displayName}`}
                        >
                          <option value="">— no organiser —</option>
                          {pickable.map(o => (
                            <option key={o.id} value={o.id}>
                              {o.name}
                            </option>
                          ))}
                        </Choice>
                        {f.erpOrganiserText && !f.organiserId ? (
                          <span className="block text-alert font-mono text-[11px] mt-0.5">
                            ERP said “{f.erpOrganiserText}”
                          </span>
                        ) : null}
                      </td>
                      <td className="m-hide" data-label="Counts in">
                        {months.length > 1 ? (
                          <Choice
                            name="period_month"
                            width="w-28"
                            defaultValue={f.periodMonth}
                            ariaLabel={`Month the fair at ${f.displayName} counts in`}
                          >
                            {months.map(m => (
                              <option key={m} value={m}>
                                {fairMonthLabel(m)}
                              </option>
                            ))}
                          </Choice>
                        ) : (
                          <>
                            <Hidden name="period_month" value={f.periodMonth} />
                            <span className="text-graphite">{fairMonthLabel(f.periodMonth)}</span>
                          </>
                        )}
                      </td>
                      <td className="num m-hide" data-label="Bills">
                        {f.bills || <span className="text-muted">—</span>}
                      </td>
                      <td className="num">
                        {f.total > 0 ? formatMoney(f.total) : <span className="text-muted">—</span>}
                      </td>
                      <td className="num m-hide" data-label="To move">
                        {f.billsToMove > 0 ? (
                          <span className="text-alert">
                            {f.billsToMove} · {formatMoney(f.valueToMove)}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="flex items-center gap-3">
                        <SaveButton pending={pending} label="✓" />
                        <ActionButton
                          run={() => deleteFair(f.fairId)}
                          label="Remove"
                          danger
                          confirm={`Remove the fair at ${f.displayName}? Its ${f.bills} bill${f.bills === 1 ? '' : 's'} fall back to the month of their order date.`}
                        />
                      </td>
                    </tr>
                  )}
                </RowForm>
              )
            })}

            {fairs.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-muted font-serif italic">
                  No fairs on record — every bill is still filed by the day the ERP opened its
                  document. The list below is where to start.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {gaps.length > 0 ? (
        <div className="mt-10">
          <SectionHead
            title="Still to place"
            count={`${summary.unplacedBills} BILL${summary.unplacedBills === 1 ? '' : 'S'}`}
          />
          <Hint>
            Bills that belong to no fair yet, grouped by place and by the month their ERP date puts
            them in — which is exactly the month that may be wrong. Biggest first.{' '}
            {summary.gapsNeedingSplit > 0 ? (
              <>
                <strong className="font-semibold">
                  {summary.gapsNeedingSplit} of these held more than one fair
                </strong>{' '}
                — their bills spread over more than a week, and a fair does not run that long. Add
                a row per fair rather than one wide window, or half of them get the wrong organiser.
              </>
            ) : null}
          </Hint>
          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Venue</th>
                  <th className="w-28">ERP month</th>
                  <th className="right">Bills</th>
                  <th className="right">Sales value</th>
                  <th className="m-hide">Bills dated</th>
                  <th className="right m-hide">Spread</th>
                </tr>
              </thead>
              <tbody>
                {gaps.map(g => (
                  <tr key={`${g.venueKey}|${g.periodMonth}`}>
                    <td>
                      <span className="font-medium">{g.displayName}</span>
                      {gapLooksLikeSeveralFairs(g) ? (
                        <span className="block text-alert font-serif italic text-xs mt-0.5">
                          looks like more than one fair
                        </span>
                      ) : null}
                    </td>
                    <td className="text-graphite">{fairMonthLabel(g.periodMonth)}</td>
                    <td className="num">{g.bills}</td>
                    <td className="num">{formatMoney(g.total)}</td>
                    <td className="m-hide font-mono text-[11px] text-graphite">
                      {g.firstOrder} → {g.lastOrder}
                    </td>
                    <td className="num m-hide">
                      {g.spreadDays === 0 ? (
                        <span className="text-muted">same day</span>
                      ) : (
                        <span className={gapLooksLikeSeveralFairs(g) ? 'text-alert' : undefined}>
                          {g.spreadDays}d
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  )
}
