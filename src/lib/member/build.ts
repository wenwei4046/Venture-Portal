import { valueKey } from "@/lib/catalogue/keys";
import { categoryKey, tierLabel } from "./catalog";
import type {
  BedframeBuild,
  MemberCatalogueModel,
  MemberModelOptions,
  MemberProduct,
  OptionCharge,
  QuoteBuild,
} from "./types";

/**
 * The cart's builds — one for its sofa modules, one for its bed frames — and
 * what each may be built with (user 2026-09-24: the Modular ticks on the
 * Product List decide what the calculator's dropdowns offer).
 *
 * A build applies to every line of its kind in the cart, the way the seat
 * height and fabric tier always have. So a dropdown offers only what EVERY
 * model of that kind in the cart was ticked for: a leg height one sofa may
 * take and another may not is not offered. A line with no model contributes
 * an empty list, and then nothing is offered.
 */

export type LineKind = "SOFA" | "BEDFRAME" | "OTHER";

/** Which build a product takes: the ERP's category when known, else the calculator section. */
export function kindOf(product: Pick<MemberProduct, "kind" | "category">): LineKind {
  const erp = (product.kind ?? "").trim().toUpperCase();
  if (erp === "SOFA" || erp === "BEDFRAME") return erp;
  if (erp) return "OTHER";
  const section = categoryKey(product.category);
  if (section === "sofa") return "SOFA";
  if (section === "bed_frame") return "BEDFRAME";
  return "OTHER";
}

export interface SofaChoices {
  legs: string[];
  specials: string[];
}
export interface BedframeChoices {
  divans: string[];
  legs: string[];
  totals: string[];
  gaps: string[];
  specials: string[];
}
export interface BuildChoices {
  sofa: SofaChoices | null;
  bedframe: BedframeChoices | null;
}

/** The values every list shares, in the first list's order. */
export function intersect(lists: string[][]): string[] {
  if (lists.length === 0) return [];
  const [first, ...rest] = lists;
  const keys = rest.map((list) => new Set(list.map((v) => valueKey(v))));
  const out: string[] = [];
  for (const value of first) {
    const k = valueKey(value);
    if (k === null || out.some((v) => valueKey(v) === k)) continue;
    if (keys.every((set) => set.has(k))) out.push(value);
  }
  return out;
}

function optionsOf(
  product: MemberProduct,
  models: ReadonlyMap<string, MemberCatalogueModel>,
): MemberModelOptions {
  return (product.modelId && models.get(product.modelId)?.options) || {};
}

/** What the cart's builds may be built with. `null` = the cart has no line of that kind. */
export function buildChoicesFor(
  cartProducts: readonly MemberProduct[],
  catalogueModels: readonly MemberCatalogueModel[] | undefined,
): BuildChoices {
  const models = new Map((catalogueModels ?? []).map((m) => [m.id, m]));
  const unique = [...new Map(cartProducts.map((p) => [p.id, p])).values()];
  const sofas = unique.filter((p) => kindOf(p) === "SOFA").map((p) => optionsOf(p, models));
  const frames = unique.filter((p) => kindOf(p) === "BEDFRAME").map((p) => optionsOf(p, models));
  return {
    sofa: sofas.length
      ? {
          legs: intersect(sofas.map((o) => o.leg_heights ?? [])),
          specials: intersect(sofas.map((o) => o.specials ?? [])),
        }
      : null,
    bedframe: frames.length
      ? {
          divans: intersect(frames.map((o) => o.divan_heights ?? [])),
          legs: intersect(frames.map((o) => o.leg_heights ?? [])),
          totals: intersect(frames.map((o) => o.total_heights ?? [])),
          gaps: intersect(frames.map((o) => o.gaps ?? [])),
          specials: intersect(frames.map((o) => o.specials ?? [])),
        }
      : null,
  };
}

function inList(value: string | undefined, list: readonly string[]): boolean {
  const k = valueKey(value);
  return k !== null && list.some((v) => valueKey(v) === k);
}

/** Why the build cannot be quoted, or null. Only the choices made are checked. */
export function buildError(build: QuoteBuild | undefined, choices: BuildChoices): string | null {
  if (!build) return null;
  const sofaSpecials = build.specials ?? [];
  if ((build.leg || sofaSpecials.length) && !choices.sofa)
    return "The sofa options no longer match the cart. Choose them again.";
  if (choices.sofa) {
    if (build.leg && !inList(build.leg, choices.sofa.legs))
      return "That leg height is not offered for every sofa in the cart. Choose another.";
    if (sofaSpecials.some((sp) => !inList(sp, choices.sofa!.specials)))
      return "A sofa special is not offered for every sofa in the cart. Choose again.";
  }
  const bf = build.bedframe;
  if (!bf) return null;
  const frameSpecials = bf.specials ?? [];
  if ((bf.divan || bf.leg || bf.total || bf.gap || frameSpecials.length) && !choices.bedframe)
    return "The bed frame options no longer match the cart. Choose them again.";
  if (choices.bedframe) {
    const c = choices.bedframe;
    if (bf.divan && !inList(bf.divan, c.divans)) return "That divan height is not offered for every bed frame in the cart.";
    if (bf.leg && !inList(bf.leg, c.legs)) return "That leg height is not offered for every bed frame in the cart.";
    if (bf.total && !inList(bf.total, c.totals)) return "That total height is not offered for every bed frame in the cart.";
    if (bf.gap && !inList(bf.gap, c.gaps)) return "That gap is not offered for every bed frame in the cart.";
    if (frameSpecials.some((sp) => !inList(sp, c.specials)))
      return "A bed frame special is not offered for every bed frame in the cart.";
  }
  return null;
}

/**
 * The build with every choice the cart no longer offers dropped — what the
 * builder does when a product leaves the cart. Seat height and tier are the
 * builder's own (they come from the grids); this touches the options only.
 */
export function pruneBuild(build: QuoteBuild | undefined, choices: BuildChoices): QuoteBuild | undefined {
  if (!build) return build;
  const keep = (value: string | undefined, list: readonly string[] | undefined) =>
    value && list && inList(value, list) ? value : undefined;
  const keepAll = (values: string[] | undefined, list: readonly string[] | undefined) =>
    (values ?? []).filter((v) => list && inList(v, list));
  const next: QuoteBuild = { ...build };
  next.leg = keep(build.leg, choices.sofa?.legs);
  next.specials = keepAll(build.specials, choices.sofa?.specials);
  if (!next.leg) delete next.leg;
  if (!next.specials.length) delete next.specials;
  if (build.bedframe) {
    const c = choices.bedframe;
    const bf: BedframeBuild = {
      divan: keep(build.bedframe.divan, c?.divans),
      leg: keep(build.bedframe.leg, c?.legs),
      total: keep(build.bedframe.total, c?.totals),
      gap: keep(build.bedframe.gap, c?.gaps),
      specials: keepAll(build.bedframe.specials, c?.specials),
    };
    const clean = Object.fromEntries(
      Object.entries(bf).filter(([, v]) => (Array.isArray(v) ? v.length > 0 : v !== undefined)),
    ) as BedframeBuild;
    if (Object.keys(clean).length) next.bedframe = clean;
    else delete next.bedframe;
  }
  return next;
}

/**
 * What ONE bed frame may be built with (user 2026-10-04): its divan, leg, gap
 * and total height are FOC — no choice at all — or one of the options
 * Maintenance charges that the ERP lets the model take (`charges`); its
 * specials are what Modular ticked, each charged on top when Maintenance
 * prices it (2026-10-06, `specialCharges`).
 */
export interface FrameChoices {
  divans: OptionCharge[];
  legs: OptionCharge[];
  gaps: OptionCharge[];
  totals: OptionCharge[];
  specials: string[];
  /** The specials Maintenance charges, with what; one not here is free. */
  specialCharges: OptionCharge[];
}

export function frameChoicesOf(model: MemberCatalogueModel | undefined): FrameChoices {
  return {
    divans: model?.charges?.divan_heights ?? [],
    legs: model?.charges?.leg_heights ?? [],
    gaps: model?.charges?.gaps ?? [],
    totals: model?.charges?.total_heights ?? [],
    specials: model?.options.specials ?? [],
    specialCharges: model?.charges?.specials ?? [],
  };
}

/** The charge an option carries on a model, RM; 0 = FOC (or not chosen). */
export function chargeIn(list: readonly OptionCharge[], value: string | undefined): number {
  const k = valueKey(value);
  return k === null ? 0 : list.find((o) => valueKey(o.value) === k)?.charge ?? 0;
}

/** Each special once, by what the list charges for it (a value spelled twice is one special). */
export function specialsCharge(list: readonly OptionCharge[], specials: readonly string[] | undefined): number {
  const seen = new Set<string>();
  let sum = 0;
  for (const sp of specials ?? []) {
    const k = valueKey(sp);
    if (k === null || seen.has(k)) continue;
    seen.add(k);
    sum += chargeIn(list, sp);
  }
  return sum;
}

/** What one built bed frame is charged per unit, by the model's own list — the member's preview. */
export function frameCharge(choices: FrameChoices, build: BedframeBuild | undefined): number {
  return chargeIn(choices.divans, build?.divan) + chargeIn(choices.legs, build?.leg) + chargeIn(choices.gaps, build?.gap) + chargeIn(choices.totals, build?.total)
    + specialsCharge(choices.specialCharges, build?.specials);
}

/** Why one bed frame's own build cannot be quoted, or null. */
export function frameBuildError(
  build: BedframeBuild,
  product: MemberProduct,
  catalogueModels: readonly MemberCatalogueModel[] | undefined,
): string | null {
  if (kindOf(product) !== "BEDFRAME") return "Only a bed frame is built with a divan, leg, gap and total height. Choose the product again.";
  const c = frameChoicesOf((catalogueModels ?? []).find((m) => m.id === product.modelId));
  const charged = (value: string | undefined, list: OptionCharge[]) =>
    !value || list.some((o) => valueKey(o.value) === valueKey(value));
  if (!charged(build.divan, c.divans)) return "That divan height is not offered for this bed frame. Choose FOC or another.";
  if (!charged(build.leg, c.legs)) return "That leg height is not offered for this bed frame. Choose FOC or another.";
  if (!charged(build.gap, c.gaps)) return "That gap is not offered for this bed frame. Choose FOC or another.";
  if (!charged(build.total, c.totals)) return "That total height is not offered for this bed frame. Choose FOC or another.";
  if ((build.specials ?? []).some((sp) => !inList(sp, c.specials)))
    return "A bed frame special is not offered for this bed frame. Choose again.";
  return null;
}

/** `leg 6" · gap 12"` — one bed frame's own build as the customer's quote words it. */
export function frameBuildText(build: BedframeBuild | undefined): string {
  if (!build) return "";
  const parts: string[] = [];
  if (build.divan) parts.push(`divan ${build.divan}`);
  if (build.leg) parts.push(`leg ${build.leg}`);
  if (build.gap) parts.push(`gap ${build.gap}`);
  if (build.total) parts.push(`total height ${build.total}`);
  if (build.specials?.length) parts.push(build.specials.join(", "));
  return parts.join(" · ");
}

/** The order-independent identity of a build, for binding a result to its input. */
export function buildKey(build: QuoteBuild | undefined): unknown[] {
  const sorted = (values: string[] | undefined) =>
    [...new Set((values ?? []).map((v) => v.trim()).filter(Boolean))].sort();
  return [
    build?.height ?? null,
    build?.tier ?? null,
    build?.leg ?? null,
    sorted(build?.specials),
    build?.bedframe?.divan ?? null,
    build?.bedframe?.leg ?? null,
    build?.bedframe?.total ?? null,
    build?.bedframe?.gap ?? null,
    sorted(build?.bedframe?.specials),
  ];
}

/** The build as the customer's quote states it. */
export function buildLines(
  build: QuoteBuild | undefined,
  has: { sofaGrid: boolean; sofa: boolean; bedframe: boolean },
): string[] {
  const out: string[] = [];
  if (has.sofa) {
    const parts: string[] = [];
    if (has.sofaGrid && build?.height && build?.tier)
      parts.push(`seat height ${build.height}`, `${tierLabel(build.tier)} fabric`);
    if (build?.leg) parts.push(`leg ${build.leg}`);
    if (build?.specials?.length) parts.push(build.specials.join(", "));
    if (parts.length) out.push(`Sofa build: ${parts.join(" · ")}`);
  }
  const bf = build?.bedframe;
  if (has.bedframe && bf) {
    const parts: string[] = [];
    if (bf.divan) parts.push(`divan ${bf.divan}`);
    if (bf.leg) parts.push(`leg ${bf.leg}`);
    if (bf.gap) parts.push(`gap ${bf.gap}`);
    if (bf.total) parts.push(`total height ${bf.total}`);
    if (bf.specials?.length) parts.push(bf.specials.join(", "));
    if (parts.length) out.push(`Bed frame build: ${parts.join(" · ")}`);
  }
  return out;
}
