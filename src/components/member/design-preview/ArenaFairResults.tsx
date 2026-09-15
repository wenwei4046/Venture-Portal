"use client";

import { Icon } from "../MemberUI";
import { summarizeFairResults } from "./arena-fair-results";
import type { FairEvent, Period } from "./arena-model";
import s from "./ArenaFairResults.module.css";

const places = [
  { key: "first", label: "1st place", short: "1st", position: 1 },
  { key: "second", label: "2nd place", short: "2nd", position: 2 },
  { key: "third", label: "3rd place", short: "3rd", position: 3 },
] as const;
const shortDate = (date: string) => new Intl.DateTimeFormat("en-GB", {
  day: "numeric", month: "short", timeZone: "UTC",
}).format(new Date(`${date}T00:00:00Z`));
const placeLabel = (position: number) => position === 1 ? "1st" : position === 2 ? "2nd" : position === 3 ? "3rd" : `${position}th`;

export function ArenaFairResults({ events, people, cutoff, period, periodLabel }: {
  events: FairEvent[];
  people: readonly { id: string; name: string }[];
  cutoff: string;
  period: Period;
  periodLabel: string;
}) {
  const rows = summarizeFairResults(events, people, cutoff);
  const mine = rows.find(person => person.id === "jia");

  return <div className={s.results}>
    {mine && <section className={s.personal} aria-label="Your fair finishes">
      <div className={s.heading}><h2>Your fair finishes</h2><span>{mine.fairCount} {mine.fairCount === 1 ? "fair" : "fairs"}</span></div>
      <p className={s.intro}>How often you finished 1st, 2nd or 3rd.</p>
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
      </div>
      {mine.fairCount === 0 && <p className={s.empty}>No completed fairs in this period.</p>}
    </section>}

    {mine && mine.results.length > 0 && <details className={s.weekly} open={period === "monthly"}>
      <summary>Your weekly results <Icon name="chevron" size={16} /></summary>
      <ol aria-label="Your weekly fair results">
        {mine.results.map(result => <li key={result.eventId}>
          <span className={s.eventDate}>{shortDate(result.start)} – {shortDate(result.end)}<small>{result.venue}</small></span>
          <span className={s.finish} data-place={result.status === "placed" && result.position !== null && result.position <= 3 ? result.position : undefined}>
            {result.status === "pending" ? "Pending" : result.status === "unplaced" ? result.sales === 0 ? "No sales" : "Not placed" : placeLabel(result.position!)}
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
        <tbody>{rows.map(row => <tr key={row.id} data-self={row.id === "jia" ? "true" : undefined}>
          <th scope="row"><span className={s.name}>{row.name}{row.id === "jia" && <em>You</em>}</span><small>{row.fairCount} {row.fairCount === 1 ? "fair" : "fairs"}{row.other > 0 && ` · ${row.other} outside top 3`}{row.unplaced > 0 && ` · ${row.unplaced} not placed`}{row.pending > 0 && ` · ${row.pending} pending`}</small></th>
          {places.map(place => <td key={place.key} data-place={place.position}><span aria-label={`${row[place.key]} ${row[place.key] === 1 ? "time" : "times"} in ${place.label}`}>{row[place.key]}</span></td>)}
        </tr>)}</tbody>
      </table>
    </section>

    <details className={s.about}>
      <summary>How finishes are counted <Icon name="info" size={16} /></summary>
      <p>Each completed fair contributes one result per salesperson. A month usually contains 4 or 5 personal fairs, with at most one per week. Quarterly and Annual add the finish counts from the included months.</p>
      <p>Tied places count at the shared rank shown for that fair. No sales and pending results do not earn a top-three finish. Fair dates determine the period, even when an order is entered later.</p>
    </details>
  </div>;
}
