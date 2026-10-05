/**
 * A member's fair claim (2026-10-05, user): its amount is the rate HR set
 * times what the claim is for.
 *
 *   Outstation  spots for the route (base → the fair's region, return) × rate per spot
 *               — KL is 0 spots: a Klang Valley fair is local. No invoice.
 *               A region HR ticked `planeTicket` (Sabah, Sarawak) is flown to: the
 *               claim is the ticket's price as its invoice shows, no cap (2026-10-06).
 *   Airbnb      by head count only. Up to HR's small-group size (3 to start) the
 *               member types the invoice's total and the claim is that, up to HR's
 *               cap a night × nights (user 2026-10-06: N = 3, RM 220, 2 nights,
 *               invoice RM 500 → RM 440); a bigger group is people × nights × the
 *               rate per person per night, nothing typed. Invoice required.
 *
 * The claim is for the member's own brand week, and its region is the one HR
 * set for that fair's venue — never picked on the phone (2026-10-06).
 *
 * The form shows this figure; `member_prepare_request` works it out again
 * (`member_claim_detail_for`) and stores ITS answer, so a figure sent from a
 * browser is never the one that is paid — only a plane ticket's price and a
 * small group's invoice total are typed, and HR checks both against the invoice.
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
  /** RM per person per night; null until HR sets it. */
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

/** A small group types its invoice's total (paid up to the cap); a bigger one is paid per person. */
export function airbnbGroup(rates: ClaimRates, pax: number): boolean {
  return pax >= 1 && pax <= rates.groupMaxPax && rates.groupCapPerNight !== null && rates.groupCapPerNight > 0;
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
  if (input.pax < 1 || input.nights < 1) return 0;
  if (airbnbGroup(rates, input.pax)) {
    const invoice = input.invoice && input.invoice > 0 ? round2(input.invoice) : 0;
    return Math.min(invoice, round2(input.nights * (rates.groupCapPerNight ?? 0)));
  }
  return rates.perPaxNight === null ? 0 : round2(input.pax * input.nights * rates.perPaxNight);
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
