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
 *
 *   Food        (2026-10-13, the user) HR's rate a day × the days of the
 *               member's brand weeks' fairs they worked in a MONTH — sent once
 *               a month ("submit by total month"), after it is over: every
 *               weekend of it, all its days or the ones they tick (a day they
 *               did not go is left out). Fair's only, for the titles HR picks;
 *               no invoice, no region; a month and a day are claimed once
 *               (`member_claim_food_detail`, `member_food_claim_taken`).
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
  /** The food claim HR set (2026-10-13); absent from a read older than it. */
  food?: FoodClaimRates;
  /** Who may send a transport claim — Outstation, a plane ticket, an Airbnb stay (2026-10-20); absent from a read older than it. */
  transport?: TransportClaimRates;
}

/** The transport claim's titles as HR ticked them (Member services › Transport claim's ⋯). */
export interface TransportClaimRates {
  /** The names of the titles whose holders may claim Outstation by road and an Airbnb stay. */
  titles: string[];
  /**
   * The names of the titles whose holders may claim a plane ticket — a fair in a region flown to (2026-10-31), ticked
   * on its own. Absent from a read older than it: the transport titles claimed the plane ticket too.
   */
  airTicketTitles?: string[];
}

/** What of a transport claim a member's title may send (2026-10-31). */
export interface TransportParts {
  /** Outstation by road, and an Airbnb stay — HR's *Transport claim* tick. */
  road: boolean;
  /** A plane ticket to a fair in a region flown to — HR's *Air ticket claim* tick. */
  plane: boolean;
}

/** The food claim as HR set it: Fair's, a rate a day, and the titles that may claim it. */
export interface FoodClaimRates {
  /** The one sub-department it is for — Fair (the user: "only for fair sub-department"). */
  subDepartmentId: string | null;
  /** RM a day; null until HR sets it. */
  perDay: number | null;
  /** The names of the titles whose holders may claim it. */
  titles: string[];
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

// ── Who may send a transport claim (2026-10-20) ──

/**
 * What of a transport claim this member may send (2026-10-31, the user: "我要加多一个 Air ticket claim 的 column … if
 * the venue is accept for air ticket, then these guys with tick can claim，就算他们没有 tick transport claim，但是其他
 * 除了 ticket 以外，他就不能给"): Outstation by road and an Airbnb stay when their title is ticked for the transport
 * claim, a plane ticket when it is ticked for the air ticket — each its own. Rates not read yet, or read from before
 * the list existed, open both — what Requests showed before; a read from before the air ticket's own tick lets the
 * transport titles claim the plane ticket, as they did. The database asks again when it is sent
 * (`member_transport_claim_open`).
 */
export function transportPartsFor(rates: Pick<ClaimRates, "transport"> | null | undefined, title: string | null | undefined): TransportParts {
  const transport = rates?.transport;
  if (!transport) return { road: true, plane: true };
  const mine = (title ?? "").trim().toLowerCase();
  const ticked = (names: readonly string[]) => !!mine && names.some(t => t.trim().toLowerCase() === mine);
  const road = ticked(transport.titles);
  return { road, plane: transport.airTicketTitles ? ticked(transport.airTicketTitles) : road };
}

/**
 * May this member send a transport claim at all — Outstation by road, a plane ticket, an Airbnb stay: their title is
 * ticked for any of it (the user: "选择什么 title 的人可以 claim 这个 transport"; the air ticket alone since 2026-10-31).
 */
export function transportOpenTo(rates: Pick<ClaimRates, "transport"> | null | undefined, title: string | null | undefined): boolean {
  const parts = transportPartsFor(rates, title);
  return parts.road || parts.plane;
}

/**
 * Why this member cannot send this transport claim, or null (2026-10-31): a plane ticket needs the air ticket's tick,
 * Outstation by road and an Airbnb stay the transport claim's — `member_transport_claim_open` refuses the same.
 * `region` is the fair's (null while HR has not set it: the claim's own checks say so).
 */
export function transportPartProblem(parts: TransportParts, type: "outstation" | "airbnb", region: Pick<ClaimRegion, "planeTicket"> | null, title?: string | null): string | null {
  const who = title?.trim() || "your title";
  if (type === "outstation" && region?.planeTicket) {
    return parts.plane ? null : `A plane ticket claim is not open to ${who}. HR picks the titles that may claim it.`;
  }
  if (type === "outstation" && !region) return null;
  if (parts.road) return null;
  return parts.plane
    ? `${title?.trim() || "Your title"} may claim a plane ticket only. HR picks the titles that may claim the rest.`
    : `A transport claim is not open to ${who}. HR picks the titles that may claim it.`;
}

// ── The food claim (2026-10-13) ──

/**
 * May this member send a food claim here: the sub-department is the one it is for (Fair), HR set a rate,
 * and the member's title there is one HR picked. The database asks the same (`member_claim_food_detail`).
 */
export function foodOpenTo(rates: Pick<ClaimRates, "food"> | null | undefined, subDepartmentId: string | null | undefined, title: string | null | undefined): boolean {
  const food = rates?.food;
  if (!food || !subDepartmentId || food.subDepartmentId !== subDepartmentId) return false;
  if (food.perDay === null || !(food.perDay > 0)) return false;
  const mine = (title ?? "").trim().toLowerCase();
  return !!mine && food.titles.some(t => t.trim().toLowerCase() === mine);
}

/**
 * The days of a brand week's fair, `YYYY-MM-DD`, first to last — its own days, else its weekend's, Friday
 * to Sunday (the brand week is named by its Friday; `member_claim_food_detail` takes the same).
 */
export function fairDays(fair: { start: string | null; end: string | null }, weekend: string): string[] {
  const known = !!fair.start && !!fair.end && fair.start <= fair.end;
  const first = known ? fair.start! : weekend;
  const last = known ? fair.end! : shiftDay(weekend, 2);
  const out: string[] = [];
  for (let day = first; day <= last && out.length < 31; day = shiftDay(day, 1)) out.push(day);
  return out;
}

/** A day of the fair as the form offers it: free to claim, in another food claim of theirs, or still to come. */
export type FoodDayState = "open" | "claimed" | "ahead";

export function foodDayState(day: string, today: string, claimed: ReadonlySet<string>): FoodDayState {
  if (claimed.has(day)) return "claimed";
  return day > today ? "ahead" : "open";
}

/** What a food claim is paid: the rate a day × the days, RM — 0 while either is missing. */
export function foodAmount(perDay: number | null | undefined, days: number): number {
  return perDay && perDay > 0 && days > 0 ? round2(perDay * days) : 0;
}

/**
 * A food claim is sent for a MONTH (the user, 2026-10-13: "they will submit by total month … dont by week submit"):
 * the brand weeks whose Friday falls in it, and once it is over — from the 1st of the next month, so none of its
 * days is still to come. `member_claim_food_detail` refuses the same.
 */
export function monthOfWeek(week: string): string {
  return week.slice(0, 7);
}

/** The 1st of the month after `YYYY-MM`, `YYYY-MM-DD` — the day its food can be claimed from. */
export function foodMonthOpensOn(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

export function foodMonthOver(month: string, today: string): boolean {
  return today >= foodMonthOpensOn(month);
}

/** The months a member's own live food claims hold, and each one's request number (one claim a month). */
export function claimedFoodMonths(
  requests: readonly { id: string; kind: string; status: string; detail: Record<string, unknown> | null | undefined; requestNo?: string | null }[],
  exceptId?: string | null,
): Map<string, string | null> {
  const out = new Map<string, string | null>();
  for (const r of requests) {
    if (r.id === exceptId || r.kind !== "claim" || r.detail?.claimType !== "food") continue;
    if (r.status === "draft" || r.status === "withdrawn" || r.status === "rejected") continue;
    const month = r.detail?.month;
    if (typeof month === "string" && !out.has(month)) out.set(month, r.requestNo ?? null);
  }
  return out;
}

/** A food claim's weekends as the phone sends them: each Friday once, its days `YYYY-MM-DD`, in order. */
export interface FoodWeekPick {
  week: string;
  days: string[];
}

const isDay = (v: unknown): v is string => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

/**
 * The weekends a food claim sends, read strictly — 1 to 6 weekends of the month, each once, each with 1 to 31 real
 * days; null when anything else arrives (the server refuses it; the database checks every day against the fair).
 */
export function readFoodWeeks(raw: unknown, month: string): FoodWeekPick[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 6) return null;
  const seen = new Set<string>();
  const out: FoodWeekPick[] = [];
  for (const item of raw) {
    const x = item && typeof item === "object" ? (item as Record<string, unknown>) : null;
    if (!x || !isDay(x.week) || monthOfWeek(x.week) !== month || seen.has(x.week)) return null;
    if (!Array.isArray(x.days) || x.days.length < 1 || x.days.length > 31 || !x.days.every(isDay)) return null;
    seen.add(x.week);
    out.push({ week: x.week, days: [...new Set(x.days as string[])].sort() });
  }
  return out.sort((a, b) => a.week.localeCompare(b.week));
}

/** The days a member's own food claims still hold — every one but a draft, a cancelled or a rejected claim. */
export function claimedFoodDays(
  requests: readonly { id: string; kind: string; status: string; detail: Record<string, unknown> | null | undefined }[],
  exceptId?: string | null,
): Set<string> {
  const out = new Set<string>();
  for (const r of requests) {
    if (r.id === exceptId || r.kind !== "claim" || r.detail?.claimType !== "food") continue;
    if (r.status === "draft" || r.status === "withdrawn" || r.status === "rejected") continue;
    const days = r.detail?.days;
    if (Array.isArray(days)) for (const d of days) if (typeof d === "string") out.add(d);
  }
  return out;
}

/** Rates read defensively from the database's JSON — anything malformed reads as not set. */
export function readClaimRates(raw: unknown): ClaimRates {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const money = (v: unknown) => {
    const n = typeof v === "number" ? v : typeof v === "string" && v !== "" ? Number(v) : NaN;
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const regions = Array.isArray(o.regions) ? o.regions : [];
  const transport = readTransport(o.transport);
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
    food: readFood(o.food, money),
    ...(transport ? { transport } : {}),
  };
}

function readTransport(raw: unknown): TransportClaimRates | null {
  const t = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!t || !Array.isArray(t.titles)) return null;
  const names = (list: unknown[]) => list.filter((x): x is string => typeof x === "string" && x.trim() !== "");
  return {
    titles: names(t.titles),
    ...(Array.isArray(t.airTicketTitles) ? { airTicketTitles: names(t.airTicketTitles) } : {}),
  };
}

function readFood(raw: unknown, money: (v: unknown) => number | null): FoodClaimRates {
  const f = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    subDepartmentId: typeof f.subDepartmentId === "string" && f.subDepartmentId ? f.subDepartmentId : null,
    perDay: money(f.perDay),
    titles: Array.isArray(f.titles) ? f.titles.filter((t): t is string => typeof t === "string" && t.trim() !== "") : [],
  };
}
