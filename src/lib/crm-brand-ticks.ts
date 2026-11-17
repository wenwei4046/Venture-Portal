/**
 * The CRM's brands per person (2026-11-17 — the owner: "我想要选择 dc 后，只有 dc 权限的人可以看到 dc 的客户资讯，ads
 * performance 等", then "按人打勾"): in a person's permission window, under the CRM's two rows, a pill per brand — The
 * Conts, Dream Crafter. Everybody sees both until a brand is taken off them; only what was taken off is kept
 * (`user_crm_brands`, granted false). The database decides what they read (`crm_my_brands()`, mig 20261117160000):
 * a customer of a brand they do not have — their chat, visits, notes, files — and that brand's ads are not theirs.
 * A brand is the WhatsApp number or Facebook Page the customer wrote to (`crm-source.ts`, `crm_brand_of()`).
 */
import { BRAND_LABEL, type SourceBrand } from "./member/crm-source";

export type CrmBrand = SourceBrand;
export const CRM_BRANDS: readonly { key: CrmBrand; label: string }[] = [
  { key: "conts", label: BRAND_LABEL.conts },
  { key: "dc", label: BRAND_LABEL.dc },
];

/** One brand taken off (granted false) — or given back over a default that one day may not be every brand (true). */
export interface BrandTick { brand: CrmBrand; granted: boolean }

const isBrand = (b: unknown): b is CrmBrand => b === "conts" || b === "dc";

/** The brands they see: every brand, less what was taken off them. */
export function brandsOn(ticks: readonly BrandTick[]): Set<CrmBrand> {
  const off = new Set(ticks.filter(t => !t.granted).map(t => t.brand));
  return new Set(CRM_BRANDS.map(b => b.key).filter(b => !off.has(b)));
}

/** A pill pressed: a brand they see is taken off; one taken off goes back to the default (no tick kept). */
export function toggleBrand(ticks: readonly BrandTick[], brand: CrmBrand): BrandTick[] {
  const rest = ticks.filter(t => t.brand !== brand);
  return brandsOn(ticks).has(brand) ? [...rest, { brand, granted: false }] : rest;
}

/** The list as the database keeps it: one tick a brand, in the brands' order. */
export function sortedBrandTicks(ticks: readonly BrandTick[]): BrandTick[] {
  return CRM_BRANDS.flatMap(b => ticks.filter(t => t.brand === b.key).slice(0, 1));
}

export function sameBrandTicks(a: readonly BrandTick[], b: readonly BrandTick[]): boolean {
  const x = sortedBrandTicks(a), y = sortedBrandTicks(b);
  return x.length === y.length && x.every((t, i) => t.brand === y[i].brand && t.granted === y[i].granted);
}

/** What a Server Action takes: a short list of known brands, each once. */
export function isBrandTickList(x: unknown): x is BrandTick[] {
  if (!Array.isArray(x) || x.length > CRM_BRANDS.length) return false;
  if (!x.every(t => t && typeof t === "object" && isBrand((t as BrandTick).brand) && typeof (t as BrandTick).granted === "boolean")) return false;
  return new Set(x.map(t => (t as BrandTick).brand)).size === x.length;
}

/** `person_crm_brands(p_user)`'s answer → their ticks (anything it does not know is dropped). */
export function brandTicksFromJson(json: unknown): BrandTick[] {
  if (!Array.isArray(json)) return [];
  return sortedBrandTicks(json.filter((t): t is BrandTick => !!t && isBrand((t as BrandTick).brand) && typeof (t as BrandTick).granted === "boolean")
    .map(t => ({ brand: t.brand, granted: t.granted })));
}
