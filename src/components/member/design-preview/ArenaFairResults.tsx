"use client";

import { Icon } from "../MemberUI";
import { arenaShortDay } from "@/lib/member/arena";
import { summarizeFairResults } from "./arena-fair-results";
import type { FairEvent, Period } from "./arena-model";
import s from "./ArenaFairResults.module.css";

const places = [
  { key: "first", label: "1st place", short: "1st", position: 1 },
  { key: "second", label: "2nd place", short: "2nd", position: 2 },
  { key: "third", label: "3rd place", short: "3rd", position: 3 },
] as const;
const shortDate = arenaShortDay;
const placeLabel = (position: number) => position === 1 ? "1st" : position === 2 ? "2nd" : position === 3 ? "3rd" : `${position}th`;

export function ArenaFairResults({ events, people, cutoff, period, periodLabel, selfId = "jia", selfLabel = "You", personalLabel = "Your", provisional = false }: {
  events: FairEvent[];
  people: readonly { id: string; name: string }[];
  cutoff: string;
  period: Period;
  periodLabel: string;
  selfId?: string;
  selfLabel?: string;
  personalLabel?: string;
  provisional?: boolean;
}) {
  const rows = summarizeFairResults(events, people, cutoff);
  const mine = rows.find(person => person.id === selfId);

  return <div className={s.results}>
    {provisional && <p className={s.intro}>Provisional results from completed fairs with linked orders. Results can change as orders are corrected.</p>}
    {mine && <section className={s.personal} aria-label={`${personalLabel} fair finishes`}>
      <div className={s.heading}><h2>{personalLabel} fair finishes</h2><span>{mine.fairCount} {mine.fairCount === 1 ? "fair" : "fairs"}</span></div>
      <p className={s.intro}>Number of finishes in 1st, 2nd or 3rd place.</p>
      <dl className={s.medals}>
        {places.map(place => <div key={place.key} className={s.medal} data-place={place.position}>
          <dt><span className={s.badge} aria-hidden="true">{place.position === 1 && <Icon name="trophy" size={13} />}<b>{place.position}</b></span>{place.label}</dt>
          <dd><strong>{mine[place.key]}</strong><span>{mine[place.key] === 1 ? "time" : "times"}</span></dd>
        </div>)}
      </dl>
      <div className={s.remainder}>
        <span>4th & below <strong>{mine.other}</strong></span>
        {mine.unplaced > 0 && <span>Not placed <strong>{mine.unplaced}</strong></span>}
        {mine.pending > 0 && <span>Pending <strong>{mine.pending}</strong></span>}
        {mine.offWeek > 0 && <span>Other booths, no points <strong>{mine.offWeek}</strong></span>}
      </div>
      {mine.fairCount === 0 && <p className={s.empty}>No completed fairs in this period.</p>}
    </section>}

    {mine && mine.results.length > 0 && <details className={s.weekly} open={period === "monthly"}>
      <summary>{personalLabel} weekly results <Icon name="chevron" size={16} /></summary>
      <ol aria-label={`${personalLabel} weekly fair results`}>
        {mine.results.map(result => <li key={result.eventId}>
          <span className={s.eventDate}>{shortDate(result.start)} – {shortDate(result.end)}<small>{result.brand ? `${result.brand} · ` : ""}{result.venue}</small>
            {result.unconfirmed && <small className={s.unconfirmed} title="No brand is picked for this week yet, so this is the booth with the most bills that week.">Unconfirmed · pick the brand week{result.closesOn ? ` by ${shortDate(result.closesOn)}` : ""}</small>}
            {result.autoLocated && <small className={s.unconfirmed} title="No brand was picked before the week closed, so the booth with the most bills that week counts. Only the back office can change it now.">Auto-located · the brand week closed{result.closesOn ? ` on ${shortDate(result.closesOn)}` : ""}</small>}
            {result.status === "offweek" && <small title="Only the brand week's booth earns points. The place here stands, and the sales count.">No points · not this week’s scoring booth</small>}</span>
          {/* An off-week place is shown without its medal colour: it earns nothing. */}
          <span className={s.finish} data-place={result.status === "placed" && result.position !== null && result.position <= 3 ? result.position : undefined}>
            {result.status === "pending" ? "Pending"
              : result.status === "offweek" ? result.position !== null ? placeLabel(result.position) : result.sales === 0 ? "No sales" : "Not placed"
                : result.status === "unplaced" ? result.sales === 0 ? "No sales" : "Not placed" : placeLabel(result.position!)}
          </span>
        </li>)}
      </ol>
    </details>}

    <section className={s.comparison} aria-label="Fair finish counts">
      <div className={s.heading}><h2>Everyone’s fair finishes</h2><span>{rows.length} people</span></div>
      <p className={s.tableNote}>Most 1st places, then 2nd, then 3rd.</p>
      <table className={s.table}>
        <caption className={s.visuallyHidden}>Fair finish counts · {periodLabel}</caption>
        <thead><tr><th scope="col">Salesperson</th>{places.map(place => <th key={place.key} scope="col"><span data-place={place.position}>{place.short}</span></th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.id} data-self={row.id === selfId ? "true" : undefined}>
          <th scope="row"><span className={s.name}>{row.name}{row.id === selfId && <em>{selfLabel}</em>}</span><small>{row.fairCount} {row.fairCount === 1 ? "fair" : "fairs"}{row.other > 0 && ` · ${row.other} outside top 3`}{row.unplaced > 0 && ` · ${row.unplaced} not placed`}{row.pending > 0 && ` · ${row.pending} pending`}</small></th>
          {places.map(place => <td key={place.key} data-place={place.position}><span aria-label={`${row[place.key]} ${row[place.key] === 1 ? "time" : "times"} in ${place.label}`}>{row[place.key]}</span></td>)}
        </tr>)}</tbody>
      </table>
    </section>

    <details className={s.about}>
      <summary>How finishes are counted <Icon name="info" size={16} /></summary>
      <p>{provisional
        ? "Each brand’s booth at a completed fair is ranked on its own, and holds every bill written there. A salesperson is ranked on every booth’s board they sold at, but only one a week earns points — the brand they picked for that week in My brand weeks, open until seven days after the fair; on the others the place shows and earns nothing. A week nobody picked scores at the booth they opened the most bills at: unconfirmed while the week is open, auto-located once it closes, after which only the back office can change it. Only orders linked to a dated fair are included; attendance without orders cannot establish a result."
        : "Each completed fair contributes one result per salesperson. A month usually contains 4 or 5 personal fairs, with at most one per week."} Quarterly and Annual add the finish counts from the included months.</p>
      <p>Tied places count at the shared rank shown for that fair. No sales and pending results do not earn a top-three finish. Fair dates determine the period, even when an order is entered later.</p>
    </details>
  </div>;
}
