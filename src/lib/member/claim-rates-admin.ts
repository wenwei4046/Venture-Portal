/**
 * People › Member services › Claim rates (2026-10-05): HR's side of the fair
 * claim. Outstation pays the route's spots × the rate per spot, counted from
 * the base; Airbnb pays the rate × people × nights (user: 每人每晚). The
 * member's form only shows these — the amount is worked out in the database
 * when the claim is sent (`member_claim_detail`), so a claim already sent
 * keeps what it was worked out at. The rules here mirror
 * `member_admin_save_claim_settings`, which checks them again.
 */

export interface ClaimRegionAdmin { id: string | null; name: string; spots: number; active: boolean }

export interface ClaimRatesAdmin {
  base: string;
  perSpot: number | null;
  perPaxNight: number | null;
  updatedAt: string | null;
  updatedBy: string | null;
  regions: ClaimRegionAdmin[];
}

/** The form as typed: every figure a string until it is saved. */
export interface ClaimRatesDraft {
  base: string;
  perSpot: string;
  perPaxNight: string;
  regions: { key: string; id: string | null; name: string; spots: string }[];
}

export interface ClaimRatesToSave {
  base: string;
  perSpot: number | null;
  perPaxNight: number | null;
  regions: { id: string | null; name: string; spots: number }[];
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
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : null,
    updatedBy: typeof r.updatedBy === "string" ? r.updatedBy : null,
    regions: (r.regions as Record<string, unknown>[]).filter(g => g && typeof g.name === "string").map(g => ({
      id: typeof g.id === "string" ? g.id : null, name: String(g.name), spots: Math.max(0, Math.trunc(Number(g.spots) || 0)), active: g.active !== false,
    })),
  };
}

const money = (n: number | null) => (n === null ? "" : String(n));

/** The form as it opens: the active regions, in their order. */
export function claimRatesDraft(s: ClaimRatesAdmin): ClaimRatesDraft {
  return {
    base: s.base, perSpot: money(s.perSpot), perPaxNight: money(s.perPaxNight),
    regions: s.regions.filter(g => g.active).map((g, i) => ({ key: g.id ?? `r${i}`, id: g.id, name: g.name, spots: String(g.spots) })),
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
  for (const p of [rate(d.perSpot, "The rate per spot").problem, rate(d.perPaxNight, "The Airbnb rate").problem]) if (p) out.push(p);
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
  return {
    base: d.base.trim(),
    perSpot: rate(d.perSpot, "").value,
    perPaxNight: rate(d.perPaxNight, "").value,
    regions: d.regions.map(g => ({ id: g.id, name: g.name.trim(), spots: Number(g.spots.trim()) })),
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
  if (typeof r.base !== "string" || !Array.isArray(r.regions)) return false;
  const okRate = (x: unknown) => x === null || (typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= MAX_RATE);
  if (!okRate(r.perSpot) || !okRate(r.perPaxNight)) return false;
  const draft: ClaimRatesDraft = {
    base: r.base, perSpot: r.perSpot === null ? "" : String(r.perSpot), perPaxNight: r.perPaxNight === null ? "" : String(r.perPaxNight),
    regions: (r.regions as unknown[]).map((g, i) => {
      const x = (g ?? {}) as Record<string, unknown>;
      return { key: String(i), id: typeof x.id === "string" ? x.id : null, name: typeof x.name === "string" ? x.name : "", spots: typeof x.spots === "number" ? String(x.spots) : "x" };
    }),
  };
  return claimRatesProblems(draft).length === 0;
}
