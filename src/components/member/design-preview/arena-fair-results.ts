import type { FairEvent, Standing } from "./arena-model";

export type FairPlacementStatus = "placed" | "unplaced" | "pending";

export interface FairPlacementResult {
  eventId: string;
  venue: string;
  start: string;
  end: string;
  weekId: string | null;
  position: number | null;
  /** Nonfinite source sales remain nonfinite while pending; never turn missing data into zero. */
  sales: number;
  status: FairPlacementStatus;
}

export interface FairPlacementSummary {
  id: string;
  name: string;
  first: number;
  second: number;
  third: number;
  other: number;
  unplaced: number;
  pending: number;
  fairCount: number;
  results: FairPlacementResult[];
}

type RecordedRow = { row: Standing; conflict: boolean; salesConflict: boolean };

function placement(row: Standing): { status: FairPlacementStatus; position: number | null } {
  if (!Number.isFinite(row.value)) return { status: "pending", position: null };
  if (row.value <= 0 || !row.eligible) return { status: "unplaced", position: null };
  if (row.position === null || !Number.isInteger(row.position) || row.position < 1) {
    return { status: "pending", position: null };
  }
  return { status: "placed", position: row.position };
}

/**
 * Summarize already-ranked, selected-period Fair events; never award points or rerank sales.
 * The supplied people are the allowed roster, including any people with no recorded Fair.
 * Date-only event dates/cutoff use the existing YYYY-MM-DD business-date contract.
 * Repeated event IDs merge person rows, using the first event's metadata. A conflicting
 * duplicate person result is pending rather than selecting a better finish. Exact repeats
 * and differences in unrelated points/name fields do not create another appearance.
 */
export function summarizeFairResults(
  events: FairEvent[],
  people: readonly { id: string; name: string }[],
  cutoff?: string,
): FairPlacementSummary[] {
  const summaries = new Map<string, FairPlacementSummary>();
  for (const person of people) {
    if (!summaries.has(person.id)) summaries.set(person.id, {
      id: person.id, name: person.name, first: 0, second: 0, third: 0, other: 0,
      unplaced: 0, pending: 0, fairCount: 0, results: [],
    });
  }

  const uniqueEvents = new Map<string, { event: FairEvent; rows: Map<string, RecordedRow> }>();
  for (const event of events) {
    if (cutoff !== undefined && event.end > cutoff) continue;
    let recorded = uniqueEvents.get(event.id);
    if (!recorded) {
      recorded = { event, rows: new Map() };
      uniqueEvents.set(event.id, recorded);
    }
    for (const row of event.rows) {
      if (!summaries.has(row.id)) continue;
      const existing = recorded.rows.get(row.id);
      if (!existing) {
        recorded.rows.set(row.id, { row, conflict: false, salesConflict: false });
      } else {
        const salesConflict = !Object.is(existing.row.value, row.value);
        existing.salesConflict ||= salesConflict;
        existing.conflict ||= salesConflict || existing.row.eligible !== row.eligible
          || !Object.is(existing.row.position, row.position);
      }
    }
  }

  const orderedEvents = [...uniqueEvents.values()].sort((a, b) =>
    a.event.start.localeCompare(b.event.start) || a.event.end.localeCompare(b.event.end)
      || a.event.id.localeCompare(b.event.id),
  );
  for (const { event, rows } of orderedEvents) {
    for (const [id, recorded] of rows) {
      const summary = summaries.get(id)!;
      const result = recorded.conflict
        ? { status: "pending" as const, position: null }
        : placement(recorded.row);
      summary.results.push({
        eventId: event.id, venue: event.venue, start: event.start, end: event.end,
        weekId: event.weekId ?? null, ...result,
        sales: recorded.salesConflict ? Number.NaN : recorded.row.value,
      });
      summary.fairCount++;
      if (result.status === "pending") summary.pending++;
      else if (result.status === "unplaced") summary.unplaced++;
      else if (result.position === 1) summary.first++;
      else if (result.position === 2) summary.second++;
      else if (result.position === 3) summary.third++;
      else summary.other++;
    }
  }

  // This is a medal-count display order, not a new aggregate ranking/points award.
  return [...summaries.values()].sort((a, b) =>
    b.first - a.first || b.second - a.second || b.third - a.third
      || a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
}
