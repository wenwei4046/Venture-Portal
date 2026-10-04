/**
 * A member's fair claim (2026-10-05, user): its amount is never typed — it is
 * the rate HR set times what the claim is for.
 *
 *   Outstation  spots for the route (base → the fair's region, return) × rate per spot
 *               — KL is 0 spots: a Klang Valley fair is local. No invoice.
 *   Airbnb      people who stayed × nights × rate per person per night. Invoice required.
 *
 * The form shows this figure; `member_prepare_request` works it out again from
 * `member_claim_rates` / `member_claim_regions` and stores ITS answer, so a
 * figure sent from a browser is never the one that is paid.
 */

export interface ClaimRegion {
  id: string;
  name: string;
  /** Spots for the return trip from the base. 0 = local, nothing to claim. */
  spots: number;
}

export interface ClaimRates {
  /** Where every route starts — `Klang Valley`. */
  base: string;
  /** RM per spot; null until HR sets it. */
  perSpot: number | null;
  /** RM per person per night; null until HR sets it. */
  perPaxNight: number | null;
  regions: ClaimRegion[];
}

export type ClaimInput =
  | { type: "outstation"; regionId: string }
  | { type: "airbnb"; pax: number; nights: number };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Nights between two `YYYY-MM-DD` dates; null when either is missing or out of order. */
export function nightsBetween(checkIn: string, checkOut: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) return null;
  const a = Date.parse(`${checkIn}T00:00:00Z`);
  const b = Date.parse(`${checkOut}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.round((b - a) / 86_400_000);
}

/** The claim's amount, RM — 0 when it cannot be worked out (no rate, local, no nights). */
export function claimAmount(rates: ClaimRates, input: ClaimInput): number {
  if (input.type === "outstation") {
    const region = rates.regions.find(r => r.id === input.regionId);
    if (!region || rates.perSpot === null || region.spots <= 0) return 0;
    return round2(region.spots * rates.perSpot);
  }
  if (rates.perPaxNight === null || input.pax < 1 || input.nights < 1) return 0;
  return round2(input.pax * input.nights * rates.perPaxNight);
}

/** Rates read defensively from the snapshot's JSON — anything malformed reads as not set. */
export function readClaimRates(raw: unknown): ClaimRates {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const money = (v: unknown) => {
    const n = typeof v === "number" ? v : typeof v === "string" && v !== "" ? Number(v) : NaN;
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const regions = Array.isArray(o.regions) ? o.regions : [];
  return {
    base: typeof o.base === "string" && o.base ? o.base : "Klang Valley",
    perSpot: money(o.perSpot),
    perPaxNight: money(o.perPaxNight),
    regions: regions.flatMap(r => {
      const x = r && typeof r === "object" ? (r as Record<string, unknown>) : null;
      const spots = x ? Number(x.spots) : NaN;
      return x && typeof x.id === "string" && typeof x.name === "string" && Number.isInteger(spots) && spots >= 0
        ? [{ id: x.id, name: x.name, spots }] : [];
    }),
  };
}
