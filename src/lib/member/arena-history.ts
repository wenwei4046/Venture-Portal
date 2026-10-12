/**
 * Read-only results from real, explicitly linked Fair calendar events —
 * booth by booth since 2026-10-03 (`member_arena_booth_history`): one event
 * per brand's booth at a fair, holding every bill written there. A seller is
 * on every board they wrote at, and ONE a week scores (user: 你照样上榜，只是
 * 你上榜了没有拿到积分 … 能算积分的只有一个) — their brand week: since
 * 2026-10-12 the booth the Houzs ERP's Sales Attending lists them at, else
 * the booth they opened the most bills at (user: "1 layer is use track by erp
 * houzs, if fail, then go with auto detect, same engine with previous one").
 */
export interface ArenaFairPerson {
  id: string;
  name: string;
  sales: number;
  held: number;
  orders: number;
  /**
   * Where the week's booth came from (2026-10-12): `erp` — the ERP's Sales
   * Attending lists them; `auto` — it lists them nowhere that weekend, so the
   * booth they opened the most bills at. Null on a board of a week with neither.
   */
  source?: "erp" | "auto" | null;
  /**
   * The one board this week whose place earns points. False: ranked on the
   * board like anybody — another booth than their brand week, or a second
   * fair — with no points for it. Absent from a whole-fair result: everybody scores.
   */
  scoring?: boolean;
}

export interface ArenaFairEvent {
  /** `<fair id>|<brand>` — one booth. */
  id: string;
  venue: string;
  start: string;
  end: string;
  periodMonth: string;
  people: ArenaFairPerson[];
  /** The booth's brand. Absent from a whole-fair result. */
  brand?: string | null;
  fairId?: string;
  /** Who ran the fair (`comm_organisers`), when the calendar names one. */
  organizer?: string | null;
  /** The fair weekend — the Friday of the week the fair opens in. */
  week?: string;
  /** Seven days after its fairs — the day a week closed when brand weeks were picked (before 2026-10-12). */
  closesOn?: string | null;
  locked?: boolean;
}

/**
 * One person's brand week (2026-10-12): the booth that counts for them that
 * fair weekend, named by its Friday. The member's and the Principal's reads
 * carry only the person read: this month's weekends and the two months' before.
 */
export interface ArenaBrandWeek {
  staffId: string;
  /** The Friday of the week the fair opens in. */
  week: string;
  /** `erp` — the ERP's Sales Attending lists them there (upcoming weekends too); `auto` — it lists them nowhere, so the booth they wrote the most bills at. */
  source: "erp" | "auto";
  brand: string | null;
  /** The portal's fair; null for an ERP booth nobody has written a bill at yet. */
  fairId: string | null;
  venue: string | null;
  organizer: string | null;
  start: string | null;
  end: string | null;
  /** How many booths the ERP lists them at that weekend (the one with the most of their bills counts). Null for `auto`. */
  booths: number | null;
}

export interface ArenaHistorySnapshot {
  asOf: string;
  /** Recorded sales do not establish attendance or immutable settled results. */
  provisional: true;
  events: ArenaFairEvent[];
  unassignedOrders: number;
  unassignedSales: number;
  /** What is ranked on a board with no points: another booth than the seller's brand week, or a second fair that week. */
  offWeekOrders?: number;
  offWeekSales?: number;
  /** The person read's brand weeks (absent from a read before 2026-10-12). */
  weeks?: ArenaBrandWeek[];
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
  /** Not on the ERP's Sales Attending that weekend: placed at the booth they opened the most bills at. */
  autoLocated: boolean;
  /** Ranked on this board like anybody, but it is not their scoring booth this week: the place earns no points. */
  offWeek: boolean;
}

export interface ArenaFairDisplayEvent {
  id: string;
  /** "AKEMI · MID VALLEY" — the booth, then the place. */
  label: string;
  venue: string;
  start: string;
  end: string;
  brand: string | null;
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
  brand: string | null;
  start: string;
  end: string;
  pending: boolean;
}

/** A person absent the flag scores: a whole-fair result has only scoring rows. */
const scores = (person: ArenaFairPerson) => person.scoring !== false;

/**
 * Competition ranks preserve ties; a known zero does not become a podium
 * finish. Everybody on the board is ranked, off their brand week or not: a
 * 30k there that is third shows third (user 2026-10-03: 依然会显示属于那个
 * 名次，而不是直接不算名次). Only the points follow the brand week — that is
 * the row's `offWeek`, not its place.
 */
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
  // Off the scoring board the guess is not this board's to explain.
  autoLocated: scores(person) && person.source === "auto",
  offWeek: !scores(person),
});

/** "AKEMI · MID VALLEY": an exhibition is a brand's booth at a fair. */
export function arenaBoothLabel(event: { brand?: string | null; venue: string }): string {
  return event.brand ? `${event.brand} · ${event.venue}` : event.venue;
}

/**
 * The completed fairs whose END DATE falls inside the selected window, each
 * ranked on its own. The fair's dates decide the period, not the day a bill
 * was keyed in — the same rule `venue_event_for_order` follows in SQL.
 */
export function arenaFairEvents(history: ArenaHistorySnapshot, from: string, through: string): ArenaFairDisplayEvent[] {
  return uniqueEvents(history.events)
    .filter(event => event.end >= from && event.end <= through)
    .map(event => ({
      id: event.id, label: arenaBoothLabel(event), venue: event.venue, start: event.start, end: event.end,
      brand: event.brand ?? null,
      rows: rankedPeople(event.people).map(person => standing(person)),
    }));
}

/** The largest known single completed fair per person, across ALL recorded years. */
export function arenaFairRecords(history: ArenaHistorySnapshot): ArenaFairRecord[] {
  const best = new Map<string, { person: ArenaFairPerson; event: ArenaFairEvent }>();
  const incomplete = new Set<string>();
  for (const event of uniqueEvents(history.events)) {
    for (const person of event.people) {
      // A record is a finish: only the booth that scored that week can hold it.
      if (!scores(person)) continue;
      if (!Number.isFinite(person.sales)) { incomplete.add(person.id); continue; }
      if (person.sales <= 0) continue;
      const prior = best.get(person.id);
      // The earliest source event wins an equal personal best deterministically.
      if (!prior || person.sales > prior.person.sales) best.set(person.id, { person, event });
    }
  }
  return rankedPeople([...best.values()].map(({ person }) => ({
    ...person, scoring: true, sales: incomplete.has(person.id) ? Number.NaN : person.sales,
  }))).map(person => {
    const source = best.get(person.id)!;
    return {
      id: person.id, name: person.name, position: person.position,
      value: Number.isFinite(person.sales) ? person.sales : null, sales: person.sales,
      eventId: source.event.id, venue: source.event.venue, brand: source.event.brand ?? null,
      start: source.event.start, end: source.event.end,
      pending: incomplete.has(person.id),
    };
  });
}
