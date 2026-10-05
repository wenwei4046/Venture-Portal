/**
 * People › Member services › Claim rates (2026-10-05): HR's side of the fair
 * claim. Outstation pays the route's spots × the rate per spot, counted from
 * the base; Airbnb pays the rate × people × nights (user: 每人每晚). The
 * member's form only shows these — the amount is worked out in the database
 * when the claim is sent (`member_claim_detail_for`), so a claim already sent
 * keeps what it was worked out at. The rules here mirror
 * `member_admin_save_claim_settings`, which checks them again.
 *
 * 2026-10-06 (user): a region may be flown to (Sabah, Sarawak) — the claim is
 * then the plane ticket's price with its invoice; exactly three people share
 * one Airbnb rate a night; and every venue the ERP's fairs name is listed here
 * to be given its region, because an outstation claim's region is its fair's
 * venue's, never the member's pick.
 */

export interface ClaimRegionAdmin { id: string | null; name: string; spots: number; active: boolean; planeTicket: boolean }

/** A venue the ERP's fairs have named, and the region HR set for it (null = not yet). */
export interface ClaimVenueAdmin { key: string; name: string; fairs: number; lastFair: string | null; regionId: string | null }

export interface ClaimRatesAdmin {
  base: string;
  perSpot: number | null;
  perPaxNight: number | null;
  perThreePaxNight: number | null;
  updatedAt: string | null;
  updatedBy: string | null;
  regions: ClaimRegionAdmin[];
  venues: ClaimVenueAdmin[];
}

/** The form as typed: every figure a string until it is saved. */
export interface ClaimRatesDraft {
  base: string;
  perSpot: string;
  perPaxNight: string;
  perThreePaxNight: string;
  regions: { key: string; id: string | null; name: string; spots: string; planeTicket: boolean }[];
  /** Venue key → the draft region's `key` it is in; "" = none. In the order the venues are listed. */
  venues: Record<string, string>;
}

export interface ClaimRatesToSave {
  base: string;
  perSpot: number | null;
  perPaxNight: number | null;
  perThreePaxNight: number | null;
  regions: { id: string | null; name: string; spots: number; planeTicket: boolean }[];
  /** Each venue's region by its name (a region added in the same save has no id yet); null = none. */
  venues: { key: string; region: string | null }[];
}

const MAX_RATE = 100_000;
const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

export function readClaimRatesAdmin(raw: unknown): ClaimRatesAdmin | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.regions)) return null;
  return {
    base: typeof r.base === "string" && r.base.trim() ? r.base : "Klang Valley",
    perSpot: num(r.perSpot),
    perPaxNight: num(r.perPaxNight),
    perThreePaxNight: num(r.perThreePaxNight),
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : null,
    updatedBy: typeof r.updatedBy === "string" ? r.updatedBy : null,
    regions: (r.regions as Record<string, unknown>[]).filter(g => g && typeof g.name === "string").map(g => ({
      id: typeof g.id === "string" ? g.id : null, name: String(g.name), spots: Math.max(0, Math.trunc(Number(g.spots) || 0)), active: g.active !== false,
      planeTicket: g.planeTicket === true,
    })),
    venues: (Array.isArray(r.venues) ? (r.venues as Record<string, unknown>[]) : []).filter(v => v && typeof v.key === "string" && v.key.trim()).map(v => ({
      key: String(v.key), name: typeof v.name === "string" && v.name.trim() ? v.name : String(v.key),
      fairs: Math.max(0, Math.trunc(Number(v.fairs) || 0)), lastFair: typeof v.lastFair === "string" ? v.lastFair : null,
      regionId: typeof v.regionId === "string" ? v.regionId : null,
    })),
  };
}

const money = (n: number | null) => (n === null ? "" : String(n));

/** The form as it opens: the active regions, in their order, and every venue with the region it is in. */
export function claimRatesDraft(s: ClaimRatesAdmin): ClaimRatesDraft {
  const regions = s.regions.filter(g => g.active).map((g, i) => ({ key: g.id ?? `r${i}`, id: g.id, name: g.name, spots: String(g.spots), planeTicket: g.planeTicket }));
  return {
    base: s.base, perSpot: money(s.perSpot), perPaxNight: money(s.perPaxNight), perThreePaxNight: money(s.perThreePaxNight),
    regions,
    venues: Object.fromEntries(s.venues.map(v => [v.key, regions.find(g => g.id === v.regionId)?.key ?? ""])),
  };
}

function rate(text: string, label: string): { value: number | null; problem: string | null } {
  const t = text.trim();
  if (!t) return { value: null, problem: null };
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(t) || Number(t) > MAX_RATE) return { value: null, problem: `${label} must be an amount from RM 0 to RM 100,000, to the sen.` };
  return { value: Number(t), problem: null };
}

/** What stops the form being saved, first problem first; nothing = it may be saved. */
export function claimRatesProblems(d: ClaimRatesDraft): string[] {
  const out: string[] = [];
  const base = d.base.trim();
  if (!base || base.length > 60) out.push("Name the base every route starts from (up to 60 letters).");
  for (const p of [rate(d.perSpot, "The rate per spot").problem, rate(d.perPaxNight, "The Airbnb rate").problem,
    rate(d.perThreePaxNight, "The three-person Airbnb rate").problem]) if (p) out.push(p);
  if (d.regions.length > 60) out.push("Keep it to 60 regions.");
  const seen = new Set<string>();
  d.regions.forEach((g, i) => {
    const name = g.name.trim();
    if (!name || name.length > 40) out.push(`Region ${i + 1} needs a name (up to 40 letters).`);
    else if (seen.has(name.toLowerCase())) out.push(`Two regions are called ${name}.`);
    seen.add(name.toLowerCase());
    if (!/^\d{1,3}$/.test(g.spots.trim()) || Number(g.spots) > 100) out.push(`${name || `Region ${i + 1}`}: spots must be a whole number from 0 to 100.`);
  });
  return out;
}

export function claimRatesToSave(d: ClaimRatesDraft): ClaimRatesToSave {
  const byKey = new Map(d.regions.map(g => [g.key, g.name.trim()]));
  return {
    base: d.base.trim(),
    perSpot: rate(d.perSpot, "").value,
    perPaxNight: rate(d.perPaxNight, "").value,
    perThreePaxNight: rate(d.perThreePaxNight, "").value,
    regions: d.regions.map(g => ({ id: g.id, name: g.name.trim(), spots: Number(g.spots.trim()), planeTicket: g.planeTicket })),
    // A venue whose region was removed from the list is in none.
    venues: Object.entries(d.venues).map(([key, region]) => ({ key, region: byKey.get(region) || null })),
  };
}

/** Anything typed that the saved settings do not already say. */
export function claimRatesChanged(s: ClaimRatesAdmin, d: ClaimRatesDraft): boolean {
  const a = JSON.stringify(claimRatesToSave(claimRatesDraft(s)));
  return a !== JSON.stringify(claimRatesToSave(d));
}

/** The server's own check of what arrives — the same rules as the form. */
export function validClaimRatesToSave(v: unknown): v is ClaimRatesToSave {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  if (typeof r.base !== "string" || !Array.isArray(r.regions) || !Array.isArray(r.venues) || r.venues.length > 1000) return false;
  const okRate = (x: unknown) => x === null || (typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= MAX_RATE);
  if (!okRate(r.perSpot) || !okRate(r.perPaxNight) || !okRate(r.perThreePaxNight)) return false;
  if ((r.regions as unknown[]).some(g => typeof (g as Record<string, unknown> | null)?.planeTicket !== "boolean")) return false;
  const names = new Set((r.regions as Record<string, unknown>[]).map(g => String(g?.name ?? "").trim().toLowerCase()));
  if ((r.venues as unknown[]).some(x => {
    const venue = (x ?? {}) as Record<string, unknown>;
    return typeof venue.key !== "string" || !venue.key.trim() || venue.key.length > 200
      || (venue.region !== null && (typeof venue.region !== "string" || !names.has(venue.region.trim().toLowerCase())));
  })) return false;
  const draft: ClaimRatesDraft = {
    base: r.base, perSpot: r.perSpot === null ? "" : String(r.perSpot), perPaxNight: r.perPaxNight === null ? "" : String(r.perPaxNight),
    perThreePaxNight: r.perThreePaxNight === null ? "" : String(r.perThreePaxNight),
    regions: (r.regions as unknown[]).map((g, i) => {
      const x = (g ?? {}) as Record<string, unknown>;
      return { key: String(i), id: typeof x.id === "string" ? x.id : null, name: typeof x.name === "string" ? x.name : "", spots: typeof x.spots === "number" ? String(x.spots) : "x", planeTicket: x.planeTicket === true };
    }),
    venues: {},
  };
  return claimRatesProblems(draft).length === 0;
}
