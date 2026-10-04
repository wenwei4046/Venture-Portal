import type {
  MemberBand,
  MemberCatalogueModel,
  MemberProduct,
  QuoteBuild,
  QuoteInput,
  QuoteLine,
  QuoteResult,
  QuoteRules,
} from "./types";
import {
  categoryKey,
  isAccessoryProduct,
  isCompatibleGift,
  quoteLineKey,
} from "./catalog";
import {
  lineCharge,
  lineSurcharge,
  OptionPrices,
  unitPrice,
  type ChargePart,
  type OptionPrice,
  type PriceCell,
} from "@/lib/catalogue/pricing";
import { pickCombo, spreadComboTotal, type PricedCombo } from "@/lib/catalogue/combos";
import { costBasisOf, costDivisorFor } from "@/lib/commission/cost-basis";
import { indexKpiItems, kpiItemLabel, orderKpiHits, type KpiLine } from "@/lib/commission/kpi";
import { buildChoicesFor, buildError, buildKey, buildLines, frameBuildError, frameBuildText, kindOf } from "./build";

/** Decimal money enters the engine as integer cents; tier comparisons use unrounded ratios. */
export function cents(raw: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw.trim())) return null;
  const [whole, fraction = ""] = raw.trim().split(".");
  const value = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(value) && value <= 99999999900 ? value : null;
}

/** The cost as keyed (or the grid cell), in cents, at the Revenue Team's basis. */
export function teamCostCents(unitCost: number, costDivisor: number): number {
  return Math.round((unitCost / costDivisor) * 100);
}

/**
 * What the portal charges beyond each SKU's own price — server-only, read
 * from the Product List with the SKUs (`member_catalogue`, priced): the
 * Maintenance surcharges, the combos a sofa build may match, and each model's
 * dropdowns so a choice outside them is refused. Absent (the demo) = no
 * options, no combos, no check.
 */
export interface QuotePricing {
  options: OptionPrice[];
  combos: PricedCombo[];
  models: MemberCatalogueModel[];
}

/** Binds a calculation to its inputs; contains no costs and is not an authorization token. */
function quoteInputKey(input: QuoteInput): string {
  const lines = input.lines
    .map((line) => [quoteLineKey(line), line.quantity] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return JSON.stringify([
    "quote-input-v5",
    input.schemeId,
    lines,
    cents(input.price),
    cents(input.delivery || "0"),
    ...buildKey(input.build),
  ]);
}

interface CostedLine {
  line: QuoteLine;
  product: MemberProduct;
  /** The SKU's own price at the build (grid cell or flat), RM; null = unpriced. */
  unit: number | null;
  /** What the build's options add per unit to the COST, RM. */
  surcharge: number;
  /** What a bed frame's divan, leg and gap are CHARGED per unit, RM — out of the margin. */
  charge: number;
  chargeParts: ChargePart[];
  /** A grid SKU whose grid does not come in the build's seat height. */
  noHeight: boolean;
  /** The line at its combo's share, in cents, when a combo matched it. */
  comboCents: number | null;
}

/** A line's charge and its parts; nothing charged when there is no bed frame build. */
function chargeOf(c: { amount: number; parts: ChargePart[] } | null): { charge: number; chargeParts: ChargePart[] } {
  return c ? { charge: c.amount, chargeParts: c.parts } : { charge: 0, chargeParts: [] };
}

const CHARGE_WORD: Record<ChargePart["pool"], string> = {
  bedframe_divan_heights: "divan",
  bedframe_leg_heights: "leg",
  bedframe_gaps: "gap",
};

/** A bed frame line's build: its own (2026-10-05), else the cart's. */
function frameBuildOf(line: QuoteLine, build: QuoteBuild | undefined) {
  return line.bedframe ?? build?.bedframe;
}

function gridOf(product: MemberProduct): PriceCell[] {
  return (product.costGrid ?? []).map(({ height, tier, cost }) => ({ height, tier, price: cost }));
}

/**
 * Every line at the portal's prices, the way the run costs a sales line
 * (catalogue_line_cost + catalogue_apply_combos, migration 20260924030000):
 * the SKU's price at the build's seat height and tier, plus its options'
 * surcharges, times quantity; then each sofa's modules that cover one of its
 * model's priced combos are costed at the combo's price instead, spread over
 * the matched lines in proportion to their own costs — the ERP's rule, where
 * the combo always wins and mixed quantities keep their own costs.
 */
function costLines(
  selected: { line: QuoteLine; product: MemberProduct }[],
  build: QuoteBuild | undefined,
  pricing: QuotePricing | undefined,
): CostedLine[] {
  const prices = new OptionPrices(pricing?.options ?? []);
  const lines: CostedLine[] = selected.map(({ line, product }) => {
    const grid = gridOf(product);
    const priced = unitPrice(
      { price: product.cost ?? null, grid },
      grid.length ? build?.height ?? null : null,
      grid.length ? build?.tier ?? null : null,
    );
    const kind = kindOf(product);
    const frame = kind === "BEDFRAME" ? frameBuildOf(line, build) : undefined;
    const facts =
      kind === "SOFA"
        ? { leg: build?.leg ?? null, divan: null, total: null, specials: build?.specials ?? [] }
        : kind === "BEDFRAME"
          ? {
              leg: frame?.leg ?? null,
              divan: frame?.divan ?? null,
              total: frame?.total ?? null,
              specials: frame?.specials ?? [],
            }
          : null;
    return {
      line,
      product,
      unit: priced.price,
      // A bed frame's specials only — its divan, leg and gap are charged, not costed.
      surcharge: facts && pricing ? lineSurcharge(kind, facts, prices).amount : 0,
      ...chargeOf(kind === "BEDFRAME" && pricing ? lineCharge(kind, { divan: frame?.divan ?? null, leg: frame?.leg ?? null, gap: frame?.gap ?? null }, prices) : null),
      noHeight: grid.length > 0 && priced.how !== "grid",
      comboCents: null,
    };
  });

  if (!pricing?.combos.length || !build?.height || !build?.tier) return lines;
  const groups = new Map<string, number[]>();
  lines.forEach((l, i) => {
    if (kindOf(l.product) !== "SOFA" || !l.product.moduleCode) return;
    const baseModel = (l.product.baseModel ?? l.product.code.split("-")[0] ?? "").trim().toUpperCase();
    if (!baseModel) return;
    groups.set(baseModel, [...(groups.get(baseModel) ?? []), i]);
  });
  for (const [baseModel, members] of groups) {
    const hit = pickCombo(
      {
        baseModel,
        modules: members.map((i) => lines[i].product.moduleCode!),
        height: build.height,
        tier: build.tier,
      },
      pricing.combos,
    );
    if (!hit) continue;
    const matched = hit.matched.map((k) => members[k]);
    const quantities = new Set(matched.map((i) => Math.max(1, lines[i].line.quantity)));
    if (quantities.size !== 1) continue;
    const sets = [...quantities][0];
    const own = matched.map((i) => {
      const l = lines[i];
      return l.unit === null ? 0 : Math.round((l.unit + l.surcharge) * 100) * l.line.quantity;
    });
    const shares = spreadComboTotal(own, Math.round(hit.price * 100) * sets);
    matched.forEach((i, k) => {
      lines[i].comboCents = shares[k];
    });
  }
  return lines;
}

function productVersions(products: MemberProduct[]): string {
  return products
    .map((product) => `${product.id}:${product.version}`)
    .sort()
    .join("|");
}

function hasGrid(product: MemberProduct): boolean {
  return (product.costGrid?.length ?? 0) > 0 || (product.options?.length ?? 0) > 0;
}

export function bandFor(margin: number | null, bands: MemberBand[]) {
  if (margin === null)
    return { label: "Cost pending", tone: "neutral" as const, multiplier: 1 };
  const penalty = bands
    .filter((b) => b.kind === "penalty" && margin <= b.threshold + 1e-10)
    .sort((a, b) => (a.multiplier ?? 1) - (b.multiplier ?? 1))[0];
  const cleared = bands
    .filter((b) => b.kind !== "penalty" && margin + 1e-10 >= b.threshold)
    .sort((a, b) => b.threshold - a.threshold)[0];
  if (penalty)
    return {
      label: `Commission ×${penalty.multiplier ?? 1}`,
      tone: "danger" as const,
      multiplier: penalty.multiplier ?? 1,
    };
  if (margin < 0)
    return { label: "Below cost", tone: "danger" as const, multiplier: 1 };
  return {
    label: cleared
      ? cleared.kind === "incentive"
        ? `${cleared.key} threshold`
        : `${cleared.key} range`
      : "Below reference range",
    tone:
      cleared?.kind === "incentive" ? ("good" as const) : ("warning" as const),
    multiplier: 1,
  };
}
export const DEFAULT_RULES: QuoteRules = { costDivisor: 1 };

/**
 * The cart as the run will read the bill it becomes, for its KPI items: each
 * product line with the build's specials for its kind — the ERP prints a
 * sofa build's specials on every module and a bed frame's on each frame.
 */
function cartKpiLines(
  selected: { line: QuoteLine; product: MemberProduct }[],
  build: QuoteBuild | undefined,
): KpiLine[] {
  return selected.map(({ line, product }, i) => {
    const kind = kindOf(product);
    const specials =
      kind === "SOFA" ? build?.specials : kind === "BEDFRAME" ? frameBuildOf(line, build)?.specials : undefined;
    return { id: String(i), itemGroup: kind, productCode: product.code, qty: line.quantity, specials };
  });
}

/**
 * Margin = (price − cost) ÷ price, where cost is every line's cost ÷ its
 * SKU's ratio, else the department's divisor. The price that reaches a
 * threshold t is cost ÷ (1 − t) — never cost × (1 + t) (user 2026-09-12: 33%
 * on 1,000 is 1,000 ÷ 0.67 = 1,492.54, not 1,330).
 *
 * `price` is the SELLING price the member keys (the prototype's keypad,
 * 2026-10-05): what the customer pays for the products. Two things ride ON
 * TOP of it, out of the margin, and the run reads the bill the same way:
 *   - the KPI items the customer buys (2026-09-27), paid flat as KPI — the
 *     bill's sales are price + K and its main sales, the margin's, price;
 *   - what the bed frames' divan, leg and gap are CHARGED (user 2026-10-04),
 *     paid the ordinary rate — in the commission, out of the margin.
 * A KPI item given FREE is not on top: the customer pays nothing for it, so
 * its amount comes off the price — margin = (price − Kgift − cost) ÷
 * (price − Kgift), and the price that reaches t is Kgift + cost ÷ (1 − t).
 * The customer pays price + K + charges + additional charges.
 *
 * A line's cost is the portal's own price for it (user 2026-09-24: every
 * margin is measured against the Product List's prices): the SKU's price at
 * the build's seat height and fabric tier, plus what the build's options add,
 * with a sofa's matched combo costed as the combo — `costLines`, the twin of
 * how the run costs the same sale once the ERP books it.
 */
export function calculateQuote(
  input: QuoteInput,
  products: MemberProduct[],
  allBands: MemberBand[],
  rules: QuoteRules = DEFAULT_RULES,
  pricing?: QuotePricing,
): QuoteResult {
  const invalid = (error: string): QuoteResult => ({
    valid: false,
    error,
    price: 0,
    delivery: 0,
    margin: null,
    label: "Unable to calculate",
    tone: "neutral",
    multiplier: 1,
    nextPrice: null,
    nextThreshold: null,
    boundary: null,
    version: "",
    inputKey: "",
    suggestions: [],
  });
  const divisor = rules.costDivisor;
  if (!Number.isFinite(divisor) || divisor <= 0)
    return invalid("The cost rule for this department is not configured.");
  // A SKU may carry its own ratio (Product List › Costing Setting).
  const basis = costBasisOf(divisor, rules.costRatios ?? []);
  const divisorOf = (product: MemberProduct) => costDivisorFor(product.code, basis);
  const price = cents(input.price),
    delivery = cents(input.delivery || "0");
  if (price === null || price <= 0)
    return invalid(
      "Enter a selling price greater than 0, with up to two decimal places.",
    );
  if (delivery === null)
    return invalid(
      "Enter non-negative additional charges, with up to two decimal places.",
    );
  if (!input.lines.length || !input.lines.some((l) => !l.gift))
    return invalid("Add a product to your cart first.");
  if (input.lines.length > 30)
    return invalid("A quote can contain up to 30 product lines.");
  if (
    new Set(input.lines.map(quoteLineKey)).size !==
    input.lines.length
  )
    return invalid(
      "Duplicate product lines are not allowed. Adjust the quantity in the existing line.",
    );
  const selected = input.lines.map((line) => ({
    line,
    product: products.find((p) => p.id === line.productId),
  }));
  if (
    selected.some(
      ({ line, product }) =>
        !product ||
        !product.available ||
        !Number.isInteger(line.quantity) ||
        line.quantity < 1 ||
        line.quantity > 100,
    )
  )
    return invalid(
      "A product is unavailable or its quantity is invalid. Please select it again.",
    );
  if (
    selected.some(
      ({ line, product }) =>
        typeof line.gift !== "boolean" || (line.gift && !product!.gift),
    )
  )
    return invalid(
      "The product or free gift category has changed. Please select it again.",
    );
  const quantityByProduct = new Map<string, number>();
  const giftQuantityByProduct = new Map<string, number>();
  for (const { line } of selected) {
    const quantity = (quantityByProduct.get(line.productId) ?? 0) + line.quantity;
    if (quantity > 100)
      return invalid("Each product is limited to 100 units per quote.");
    quantityByProduct.set(line.productId, quantity);
    if (line.gift) giftQuantityByProduct.set(line.productId, line.quantity);
  }
  // Riders (bed frames, accessories) carry no brand and join any cart; the
  // branded products decide the ladder and must agree on one brand.
  const branded = selected.filter(({ product }) => product!.brand);
  if (new Set(branded.map(({ product }) => product!.brand)).size > 1)
    return invalid("Use products from the same brand in each quote.");
  const paidProducts = selected
    .filter(({ line }) => !line.gift)
    .map(({ product }) => product!);
  if (selected.some(({ line, product }) => line.gift && !isCompatibleGift(product!, paidProducts)))
    return invalid(
      "A free gift size does not match any product in this cart. Please select a matching size.",
    );
  const brand = branded[0]?.product!.brand ?? null,
    bands = brand ? allBands.filter((b) => b.brand === brand) : [];
  if (brand && !bands.length)
    return invalid(
      "Margin thresholds have not been configured for this brand.",
    );
  if (
    selected.some(({ product }) => hasGrid(product!)) &&
    (!input.build?.height || !input.build?.tier)
  )
    return invalid(
      "Choose the sofa's seat height and fabric tier to cost its modules.",
    );
  if (pricing) {
    // Only what every model of that kind in the cart was ticked for.
    const buildProblem = buildError(
      input.build,
      buildChoicesFor(selected.map(({ product }) => product!), pricing.models),
    );
    if (buildProblem) return invalid(buildProblem);
    // Each bed frame built on its own (2026-10-05): FOC, or what it is charged for.
    for (const { line, product } of selected) {
      if (!line.bedframe) continue;
      const problem = frameBuildError(line.bedframe, product!, pricing.models);
      if (problem) return invalid(problem);
    }
  } else if (selected.some(({ line, product }) => line.bedframe && kindOf(product!) !== "BEDFRAME")) {
    return invalid("Only a bed frame is built with a divan, leg and gap. Choose the product again.");
  }
  const costed = costLines(
    selected.map(({ line, product }) => ({ line, product: product! })),
    input.build,
    pricing,
  );
  if (costed.some((l) => l.noHeight && l.comboCents === null))
    return invalid(
      "That seat height is not available for a sofa module in the cart. Pick another height.",
    );
  // A module the portal has not priced is still costed when a priced combo
  // covers it — the combo is the set's cost, the ERP's rule.
  if (
    costed.some(
      (l) =>
        l.comboCents === null &&
        (l.unit == null || !Number.isFinite(l.unit) || l.unit < 0 || l.unit + l.surcharge < 0),
    )
  )
    return invalid(
      "Product cost is pending a Principal update. Margin cannot be confirmed yet.",
    );
  const cost = costed.reduce(
    (sum, l) =>
      sum +
      (l.comboCents !== null
        ? Math.round(l.comboCents / divisorOf(l.product))
        : teamCostCents(l.unit! + l.surcharge, divisorOf(l.product)) * l.line.quantity),
    0,
  );
  if (!Number.isSafeInteger(cost))
    return invalid("The cart amount is outside the supported range.");
  // The cart's KPI items, paid flat as KPI (2026-09-27). One the customer
  // BUYS rides on top of the selling price; one given FREE costs the customer
  // nothing, so its amount comes off the price — the margin is the rest's,
  // as the run judges the bill.
  const kpiIndex = indexKpiItems(rules.kpiItems ?? []);
  const kpiHits = orderKpiHits(
    { lines: cartKpiLines(selected.map(({ line, product }) => ({ line, product: product! })), input.build) },
    kpiIndex,
  );
  const giftLines = new Set(selected.flatMap(({ line }, i) => (line.gift ? [String(i)] : [])));
  const kpiGift = kpiHits.filter((hit) => giftLines.has(hit.lineId)).reduce((sum, hit) => sum + Math.round(hit.amount * 100), 0);
  const kpiOnTop = kpiHits.filter((hit) => !giftLines.has(hit.lineId)).reduce((sum, hit) => sum + Math.round(hit.amount * 100), 0);
  const main = price - kpiGift;
  if (main <= 0)
    return invalid(
      `The free KPI items (RM ${(kpiGift / 100).toFixed(2)}) take the whole price. Raise it to see a margin.`,
    );
  // What the bed frames' divan, leg and gap are charged (user 2026-10-04): on
  // top of the price, in the commission, out of the margin on both sides.
  const charged = costed.filter((l) => l.charge > 0);
  const charge = charged.reduce((sum, l) => sum + Math.round(l.charge * 100) * l.line.quantity, 0);
  const margin = ((main - cost) / main) * 100,
    band = brand
      ? bandFor(margin, bands)
      : {
          label: margin < 0 ? "Below cost" : "No brand rules",
          tone: margin < 0 ? ("danger" as const) : ("neutral" as const),
          multiplier: 1,
        };
  const next = bands
    .filter((b) => b.kind === "incentive" && b.threshold > margin + 1e-10)
    .sort((a, b) => a.threshold - b.threshold)[0];
  // A displayed percentage may round up to a threshold while still being below it.
  const boundary =
    next && Number(margin.toFixed(2)) >= next.threshold
      ? `Actual margin is just below ${next.threshold}%. Add RM ${((kpiGift + Math.ceil(cost / (1 - next.threshold / 100) - 1e-7) - price) / 100).toFixed(2)} to reach it.`
      : null;
  const target = bands
    .filter((b) => b.kind === "incentive" && margin + 1e-10 >= b.threshold)
    .sort((a, b) => b.threshold - a.threshold)[0];
  const suggestions = target
    ? products
        .filter(
          (p) =>
            (p.brand === brand || !p.brand) &&
            p.gift &&
            p.available &&
            !hasGrid(p) &&
            p.cost != null &&
            p.cost! >= 0 &&
            isAccessoryProduct(p) &&
            categoryKey(p.category) === "pillow" &&
            isCompatibleGift(p, paidProducts),
        )
        .map((p) => {
          const giftKpi = Math.round((kpiIndex.byCode.get(p.code.trim().toUpperCase())?.kpiAmount ?? 0) * 100);
          const base = main - giftKpi;
          return {
            productId: p.id,
            name: p.name,
            margin: base > 0 ? ((base - cost - teamCostCents(p.cost!, divisorOf(p))) / base) * 100 : -Infinity,
            label: target.key,
          };
        })
        .filter(
          (s) =>
            s.margin + 1e-10 >= target.threshold &&
            (giftQuantityByProduct.get(s.productId) ?? 0) < 4 &&
            (quantityByProduct.get(s.productId) ?? 0) < 100 &&
            (giftQuantityByProduct.has(s.productId) || input.lines.length < 30),
        )
        .slice(0, 2)
    : [];
  return {
    valid: true,
    price: price / 100,
    delivery: delivery / 100,
    margin,
    ...band,
    nextPrice: next
      ? (kpiGift + Math.ceil(cost / (1 - next.threshold / 100) - 1e-7)) / 100
      : null,
    nextThreshold: next?.threshold ?? null,
    boundary,
    kpiAmount: (kpiGift + kpiOnTop) / 100,
    kpiItems: kpiHits.map((hit) => ({ label: kpiItemLabel(hit.item), qty: hit.qty, amount: hit.amount })),
    addOnAmount: kpiOnTop / 100,
    optionCharge: charge / 100,
    optionCharges: charged.map((l) => ({
      label: [l.product.name, ...l.chargeParts.map((p) => `${CHARGE_WORD[p.pool]} ${p.value}`)].join(" · "),
      qty: l.line.quantity,
      amount: (Math.round(l.charge * 100) * l.line.quantity) / 100,
    })),
    customerPays: (price + kpiOnTop + charge + delivery) / 100,
    version: productVersions(selected.map(({ product }) => product!)),
    inputKey: quoteInputKey(input),
    suggestions,
  };
}
export function customerQuote(
  input: QuoteInput,
  products: MemberProduct[],
  result: QuoteResult,
) {
  if (!result.valid) throw new Error("The quote has not been confirmed.");
  if (
    result.inputKey !== quoteInputKey(input) ||
    Math.round(result.price * 100) !== cents(input.price) ||
    Math.round(result.delivery * 100) !== cents(input.delivery || "0")
  )
    throw new Error("The quote has changed. Recalculate and confirm it again.");
  const selected = input.lines.map((line) => {
    const product = products.find((item) => item.id === line.productId);
    if (!product || !product.available)
      throw new Error("A product is no longer available.");
    return product;
  });
  if (result.version !== productVersions(selected))
    throw new Error(
      "Product details have changed. Recalculate and confirm the quote again.",
    );
  const lines = input.lines.map((l, index) => {
    const p = selected[index];
    const name = [p.brand, p.name].filter(Boolean).join(" ");
    // A bed frame built on its own says how (2026-10-05).
    const frame = l.bedframe && kindOf(p) === "BEDFRAME" ? frameBuildText(l.bedframe) : "";
    return `${l.gift ? "Free gift" : "Product"} · ${name} / ${p.size}${p.color ? " / " + p.color : ""}${frame ? ` (${frame})` : ""} × ${l.quantity}`;
  });
  const build = buildLines(input.build, {
    sofaGrid: selected.some(hasGrid),
    sofa: selected.some((p) => kindOf(p) === "SOFA"),
    bedframe: selected.some((p, i) => kindOf(p) === "BEDFRAME" && !input.lines[i].bedframe),
  });
  const addOns = result.addOnAmount ?? 0;
  const options = result.optionCharge ?? 0;
  const total = result.customerPays ?? result.price + addOns + options + result.delivery;
  return [
    "HOUZS VENTURE · Product quotation",
    ...lines,
    ...build,
    `Selling price: RM ${result.price.toFixed(2)}`,
    ...(addOns > 0 ? [`Add-on items: RM ${addOns.toFixed(2)}`] : []),
    ...(options > 0 ? [`Bed frame options: RM ${options.toFixed(2)}`] : []),
    `Additional charges: RM ${result.delivery.toFixed(2)}`,
    `Total: RM ${total.toFixed(2)}`,
    "Tax and other service charges: as stated in the confirmed order terms.",
    "Availability, delivery date and quote validity: subject to the final confirmed order.",
  ].join("\n");
}
