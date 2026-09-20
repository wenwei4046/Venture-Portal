/** Read-only results from real, explicitly linked Fair calendar events. */
export interface ArenaFairPerson {
  id: string;
  name: string;
  sales: number;
  held: number;
  orders: number;
}

export interface ArenaFairEvent {
  id: string;
  venue: string;
  start: string;
  end: string;
  periodMonth: string;
  people: ArenaFairPerson[];
}

export interface ArenaHistorySnapshot {
  asOf: string;
  /** Recorded sales do not establish attendance or immutable settled results. */
  provisional: true;
  events: ArenaFairEvent[];
  unassignedOrders: number;
  unassignedSales: number;
  championship: { status: "pending"; reason: string };
}

/**
 * One fair, ranked, in the shape the Fair results board already reads. The
 * fields beyond a place are zero on purpose: a finish is a fact, a point is an
 * award, and nothing here awards one.
 */
export interface ArenaFairStanding {
  id: string;
  name: string;
  value: number;
  eligible: boolean;
  active: boolean;
  position: number | null;
  scoringPosition: null;
  scoringValue: 0;
  basePoints: 0;
  incentivePoints: 0;
  points: 0;
}

export interface ArenaFairDisplayEvent {
  id: string;
  label: string;
  venue: string;
  start: string;
  end: string;
  rows: ArenaFairStanding[];
}

export interface ArenaFairRecord {
  id: string;
  name: string;
  position: number | null;
  value: number | null;
  sales: number;
  eventId: string;
  venue: string;
  start: string;
  end: string;
  pending: boolean;
}

/** Competition ranks preserve ties; a known zero does not become a podium finish. */
function rankedPeople(people: readonly ArenaFairPerson[]) {
  const ordered = [...people].sort((a, b) => {
    const av = Number.isFinite(a.sales) ? a.sales : -Infinity;
    const bv = Number.isFinite(b.sales) ? b.sales : -Infinity;
    return bv - av || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  });
  let previous: number | null = null;
  let position = 0;
  let placed = 0;
  return ordered.map(person => {
    if (!Number.isFinite(person.sales) || person.sales <= 0) return { ...person, position: null };
    placed++;
    if (previous !== person.sales) position = placed;
    previous = person.sales;
    return { ...person, position };
  });
}

/** Repeated result payloads must not manufacture extra appearances or sales. */
function uniqueEvents(events: readonly ArenaFairEvent[]): ArenaFairEvent[] {
  const known = new Map<string, ArenaFairEvent>();
  for (const event of events) {
    const existing = known.get(event.id);
    if (!existing) {
      known.set(event.id, { ...event, people: [] });
    }
    const target = known.get(event.id)!;
    for (const person of event.people) {
      const prior = target.people.find(row => row.id === person.id);
      if (!prior) target.people.push({ ...person });
      else if (prior.sales !== person.sales || prior.held !== person.held || prior.orders !== person.orders) {
        // A conflicting duplicate is missing information, not permission to
        // select the larger record or sum repeated imported results.
        prior.sales = Number.NaN;
      }
    }
  }
  return [...known.values()].sort((a, b) => a.end.localeCompare(b.end) || a.id.localeCompare(b.id));
}

const standing = (person: ArenaFairPerson & { position: number | null }): ArenaFairStanding => ({
  id: person.id, name: person.name, value: person.sales,
  // An unreadable result is pending, a real zero is a known zero, and neither
  // is a place. Only the finish is carried; no award rides along with it.
  eligible: Number.isFinite(person.sales), active: Number.isFinite(person.sales) && person.sales > 0,
  position: person.position, scoringPosition: null, scoringValue: 0,
  basePoints: 0, incentivePoints: 0, points: 0,
});

/**
 * The completed fairs whose END DATE falls inside the selected window, each
 * ranked on its own. The fair's dates decide the period, not the day a bill
 * was keyed in — the same rule `venue_event_for_order` follows in SQL.
 */
export function arenaFairEvents(history: ArenaHistorySnapshot, from: string, through: string): ArenaFairDisplayEvent[] {
  return uniqueEvents(history.events)
    .filter(event => event.end >= from && event.end <= through)
    .map(event => ({
      id: event.id, label: event.venue, venue: event.venue, start: event.start, end: event.end,
      rows: rankedPeople(event.people).map(standing),
    }));
}

/** The largest known single completed fair per person, across ALL recorded years. */
export function arenaFairRecords(history: ArenaHistorySnapshot): ArenaFairRecord[] {
  const best = new Map<string, { person: ArenaFairPerson; event: ArenaFairEvent }>();
  const incomplete = new Set<string>();
  for (const event of uniqueEvents(history.events)) {
    for (const person of event.people) {
      if (!Number.isFinite(person.sales)) { incomplete.add(person.id); continue; }
      if (person.sales <= 0) continue;
      const prior = best.get(person.id);
      // The earliest source event wins an equal personal best deterministically.
      if (!prior || person.sales > prior.person.sales) best.set(person.id, { person, event });
    }
  }
  return rankedPeople([...best.values()].map(({ person }) => ({
    ...person, sales: incomplete.has(person.id) ? Number.NaN : person.sales,
  }))).map(person => {
    const source = best.get(person.id)!;
    return {
      id: person.id, name: person.name, position: person.position,
      value: Number.isFinite(person.sales) ? person.sales : null, sales: person.sales,
      eventId: source.event.id, venue: source.event.venue, start: source.event.start, end: source.event.end,
      pending: incomplete.has(person.id),
    };
  });
}
