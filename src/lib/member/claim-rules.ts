/**
 * A member's fair claim (2026-10-05, user): its amount is the rate HR set
 * times what the claim is for.
 *
 *   Outstation  spots for the route (base → the fair's region, return) × rate per spot
 *               — KL is 0 spots: a Klang Valley fair is local. No invoice.
 *               A region HR ticked `planeTicket` (Sabah, Sarawak) is flown to: the
 *               claim is the ticket's price as its invoice shows, no cap (2026-10-06).
 *   Airbnb      the member types the invoice's total and is paid it, up to a cap
 *               that goes by head count. Up to HR's small-group size (3 to start)
 *               the cap is HR's figure a night × nights (user 2026-10-06: N = 3,
 *               RM 220, 2 nights, invoice RM 500 → RM 440); a bigger group's is
 *               the rate per person a night × people × nights — a CAP too, not a
 *               fixed amount (user 2026-10-12: "per pax max cap is this amount").
 *               Invoice required. For an OUTSTATION fair only (2026-10-06), and a
 *               stay from the day before the fair to the day after at most, with
 *               a night of the fair (2026-10-12: 18–20 Sep → in 17, out 21).
 *
 * The claim is for the member's own brand week, and its region is the one HR
 * set for that fair's venue — never picked on the phone (2026-10-06).
 *
 * The form shows this figure; `member_prepare_request` works it out again
 * (`member_claim_detail_for`) and stores ITS answer, so a figure sent from a
 * browser is never the one that is paid — only a plane ticket's price and an
 * Airbnb invoice's total are typed, and HR checks both against the invoice.
 */

export interface ClaimRegion {
  id: string;
  name: string;
  /** Spots for the return trip from the base. 0 = local, nothing to claim. */
  spots: number;
  /** Flown to: the claim is the plane ticket's price, with its invoice. */
  planeTicket: boolean;
}

/** A fair a claim can be for now, and the region HR set for its venue (null = not yet). */
export interface ClaimFair {
  venue: string;
  regionId: string | null;
}

export interface ClaimRates {
  /** Where every route starts — `Klang Valley`. */
  base: string;
  /** RM per spot; null until HR sets it. */
  perSpot: number | null;
  /** The most a person's night is paid, RM; null until HR sets it. */
  perPaxNight: number | null;
  /** Up to this many people are a small group (HR sets it; 3 to start). */
  groupMaxPax: number;
  /** A small group's invoice is paid up to this a night; null = every group is paid per person. */
  groupCapPerNight: number | null;
  regions: ClaimRegion[];
  /** This month's and last month's fairs, by fair id. */
  fairs: Record<string, ClaimFair>;
}

export type ClaimInput =
  | { type: "outstation"; regionId: string | null; ticket?: number | null }
  | { type: "airbnb"; pax: number; nights: number; invoice?: number | null };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Nights between two `YYYY-MM-DD` dates; null when either is missing or out of order. */
export function nightsBetween(checkIn: string, checkOut: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) return null;
  const a = Date.parse(`${checkIn}T00:00:00Z`);
  const b = Date.parse(`${checkOut}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.round((b - a) / 86_400_000);
}

/** The fair's venue and the region HR set for it; no region = not set yet. */
export function fairRegion(rates: ClaimRates, fairId: string | null): { venue: string | null; region: ClaimRegion | null } {
  const fair = fairId ? rates.fairs[fairId] : undefined;
  if (!fair) return { venue: null, region: null };
  return { venue: fair.venue, region: rates.regions.find(r => r.id === fair.regionId) ?? null };
}

/** Away from the base: a route of spots, or flown to. Only such a fair has an Airbnb claim (user 2026-10-06). */
export function isOutstation(region: ClaimRegion): boolean {
  return region.planeTicket || region.spots > 0;
}

/** The day `n` days after `day` (before it, for a negative `n`), both `YYYY-MM-DD`. */
export function shiftDay(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
/** `17 Sep` */
const dayMonth = (day: string) => `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;

/** The days an Airbnb stay may run over, all `YYYY-MM-DD`. */
export interface StayWindow {
  /** The fair's own first and last day — its weekend's, Friday to Sunday, when they are not known. */
  start: string;
  end: string;
  /** The earliest check-in and the latest check-out: the day before the fair, the day after it. */
  first: string;
  last: string;
}

/**
 * Where a stay for this fair may fall (user 2026-10-12: "开始天减一到结束天加一" — a fair of 18–20 Sep
 * opens the 17th for check-in and the 21st for check-out, and that is the most a stay can be). A fair
 * whose days are not known is taken as its weekend, Friday to Sunday — the brand week is named by its
 * Friday. `member_claim_detail_for` works out the same.
 */
export function stayWindow(fair: { start: string | null; end: string | null }, weekend: string): StayWindow {
  const known = !!fair.start && !!fair.end;
  const start = known ? fair.start! : weekend;
  const end = known ? fair.end! : shiftDay(weekend, 2);
  return { start, end, first: shiftDay(start, -1), last: shiftDay(end, 1) };
}

/**
 * Why this stay cannot be claimed for its fair, or null: in no earlier than the day before the fair and
 * out no later than the day after it, with a night of the fair — in on or before its last day, out after
 * its first (`member_claim_detail_for` refuses the same). `fairDays` names the fair's days in the message.
 */
export function stayProblem(checkIn: string, checkOut: string, window: StayWindow, fairDays: string): string | null {
  const nights = nightsBetween(checkIn, checkOut);
  if (nights === null || nights < 1) return null;
  if (checkIn < window.first || checkOut > window.last)
    return `Check in from ${dayMonth(window.first)} and check out by ${dayMonth(window.last)}: the day before the fair to the day after.`;
  if (checkIn > window.end || checkOut <= window.start) return `The stay must cover the fair's days (${fairDays}).`;
  return null;
}

/** A stay being picked on the calendar — "" for a day not picked yet. */
export interface StayPick {
  checkIn: string;
  checkOut: string;
}

/**
 * A tap on the stay calendar (user 2026-10-12: one calendar, "直接按 25、26、27 这样去选"): the stay runs
 * from the first day tapped to the last. A day before or after it stretches it there; its first or last
 * day taps off (a night shorter, or back to one day picked); a day inside it ends it there.
 */
export function tapStayDay(pick: StayPick, day: string): StayPick {
  const { checkIn: a, checkOut: b } = pick;
  if (!a) return { checkIn: day, checkOut: "" };
  if (!b) {
    if (day === a) return { checkIn: "", checkOut: "" };
    return day < a ? { checkIn: day, checkOut: a } : { checkIn: a, checkOut: day };
  }
  if (day < a) return { checkIn: day, checkOut: b };
  if (day > b) return { checkIn: a, checkOut: day };
  if (day === b) {
    const before = shiftDay(b, -1);
    return before === a ? { checkIn: a, checkOut: "" } : { checkIn: a, checkOut: before };
  }
  if (day === a) {
    const after = shiftDay(a, 1);
    return after === b ? { checkIn: b, checkOut: "" } : { checkIn: after, checkOut: b };
  }
  return { checkIn: a, checkOut: day };
}

/** A small group's cap is HR's figure a night; a bigger one's goes by the person. */
export function airbnbGroup(rates: ClaimRates, pax: number): boolean {
  return pax >= 1 && pax <= rates.groupMaxPax && rates.groupCapPerNight !== null && rates.groupCapPerNight > 0;
}

/**
 * The most an Airbnb stay is paid, RM — the invoice's total is paid up to it: a small group's cap a night ×
 * nights, else the rate per person a night × people × nights (user 2026-10-12: a cap, not a fixed amount).
 * Null while it cannot be worked out (no rate, nobody, no nights).
 */
export function airbnbCap(rates: ClaimRates, pax: number, nights: number): number | null {
  if (pax < 1 || nights < 1) return null;
  if (airbnbGroup(rates, pax)) return round2(nights * (rates.groupCapPerNight ?? 0));
  return rates.perPaxNight === null || rates.perPaxNight <= 0 ? null : round2(pax * nights * rates.perPaxNight);
}

/** The claim's amount, RM — 0 when it cannot be worked out (no rate, local, no nights, nothing typed). */
export function claimAmount(rates: ClaimRates, input: ClaimInput): number {
  if (input.type === "outstation") {
    const region = rates.regions.find(r => r.id === input.regionId);
    if (!region) return 0;
    if (region.planeTicket) return input.ticket && input.ticket > 0 ? round2(input.ticket) : 0;
    if (rates.perSpot === null || region.spots <= 0) return 0;
    return round2(region.spots * rates.perSpot);
  }
  const cap = airbnbCap(rates, input.pax, input.nights);
  const invoice = input.invoice && input.invoice > 0 ? round2(input.invoice) : 0;
  return cap === null ? 0 : Math.min(invoice, cap);
}

/** Rates read defensively from the database's JSON — anything malformed reads as not set. */
export function readClaimRates(raw: unknown): ClaimRates {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const money = (v: unknown) => {
    const n = typeof v === "number" ? v : typeof v === "string" && v !== "" ? Number(v) : NaN;
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const regions = Array.isArray(o.regions) ? o.regions : [];
  const fairs: Record<string, ClaimFair> = {};
  for (const f of Array.isArray(o.fairs) ? o.fairs : []) {
    const x = f && typeof f === "object" ? (f as Record<string, unknown>) : null;
    if (x && typeof x.fairId === "string" && typeof x.venue === "string") {
      fairs[x.fairId] = { venue: x.venue, regionId: typeof x.regionId === "string" ? x.regionId : null };
    }
  }
  return {
    base: typeof o.base === "string" && o.base ? o.base : "Klang Valley",
    perSpot: money(o.perSpot),
    perPaxNight: money(o.perPaxNight),
    groupMaxPax: Number.isInteger(Number(o.groupMaxPax)) && Number(o.groupMaxPax) >= 1 ? Number(o.groupMaxPax) : 3,
    groupCapPerNight: money(o.groupCapPerNight),
    regions: regions.flatMap(r => {
      const x = r && typeof r === "object" ? (r as Record<string, unknown>) : null;
      const spots = x ? Number(x.spots) : NaN;
      return x && typeof x.id === "string" && typeof x.name === "string" && Number.isInteger(spots) && spots >= 0
        ? [{ id: x.id, name: x.name, spots, planeTicket: x.planeTicket === true }] : [];
    }),
    fairs,
  };
}
