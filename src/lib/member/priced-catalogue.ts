import type { OptionPrice } from "@/lib/catalogue/pricing";
import type { PricedCombo } from "@/lib/catalogue/combos";
import type { QuotePricing } from "./calculator";
import type {
  CostCell,
  CostOption,
  MemberCatalogueModel,
  MemberModelCharges,
  MemberModelOptions,
  OptionCharge,
  MemberProduct,
} from "./types";

/**
 * Reading `member_catalogue` (migration 20260924040000) into the calculator's
 * shapes. Every field is checked, and anything malformed is dropped rather
 * than trusted: a price that is not a finite non-negative number is no price
 * ("cost pending"), never zero.
 *
 * Two answers, one reader: the snapshot's (no price — the member's browser
 * reads it) and the quote's (priced, service role, server-only).
 */

type Row = Record<string, unknown>;
const isRow = (v: unknown): v is Row => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max = 200): string | null =>
  typeof v === "string" && v.length <= max ? v : null;
const money = (v: unknown): number | null => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
};

const OPTION_KEYS = ["leg_heights", "specials", "divan_heights", "total_heights", "gaps"] as const;

function optionList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) => {
    const s = text(x, 80);
    return s && s.trim() ? [s] : [];
  });
}

/**
 * What each kind may be charged for: a bed frame's divan, leg, gap and total
 * height (20261005010000) and its specials, a sofa's leg height and specials
 * (20261006050000 — every Maintenance price is the customer's).
 */
const CHARGE_KEYS = {
  BEDFRAME: ["divan_heights", "leg_heights", "gaps", "total_heights", "specials"],
  SOFA: ["leg_heights", "specials"],
} as const;

/** `[{ value, charge }]`, each a short value and a charge above zero — anything else is dropped. */
function chargeList(v: unknown): OptionCharge[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) => {
    if (!isRow(x)) return [];
    const value = text(x.value, 80);
    const charge = money(x.charge);
    return value && value.trim() && charge !== null && charge > 0 ? [{ value, charge }] : [];
  });
}

/** The model dropdowns, as the snapshot and the quote both carry them. */
export function catalogueModelsOf(raw: unknown): MemberCatalogueModel[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((m) => {
    if (!isRow(m)) return [];
    const id = text(m.id, 64);
    const kind = text(m.kind, 20)?.toUpperCase();
    if (!id || (kind !== "SOFA" && kind !== "BEDFRAME")) return [];
    const options: MemberModelOptions = {};
    const src = isRow(m.options) ? m.options : {};
    for (const key of OPTION_KEYS) {
      const list = optionList(src[key]);
      if (list.length) options[key] = list;
    }
    const charges: MemberModelCharges = {};
    const chargeSrc = isRow(m.charges) ? m.charges : {};
    for (const key of CHARGE_KEYS[kind]) {
      const list = chargeList(chargeSrc[key]);
      if (list.length) charges[key] = list;
    }
    return [Object.keys(charges).length ? { id, kind, options, charges } : { id, kind, options }];
  });
}

function gridChoices(v: unknown): CostOption[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.flatMap((o) => {
    if (!isRow(o)) return [];
    const height = text(o.height, 20);
    const tier = text(o.tier, 20);
    return height && tier ? [{ height, tier }] : [];
  });
  return out.length ? out : undefined;
}

function priceGrid(v: unknown): CostCell[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((cell) => {
    if (!isRow(cell)) return [];
    const height = text(cell.height, 20);
    const tier = text(cell.tier, 20);
    const cost = money(cell.price);
    return height && tier && cost !== null ? [{ height, tier, cost }] : [];
  });
}

/** One product. `priced` keeps the money; otherwise it can never be read from the row. */
export function catalogueProductOf(p: unknown, priced: boolean): MemberProduct | null {
  if (!isRow(p)) return null;
  const id = text(p.id, 64);
  const code = text(p.code);
  const version = text(p.version, 120);
  if (!id || !code || version === null) return null;
  const product: MemberProduct = {
    id,
    code,
    name: text(p.name) ?? code,
    brand: text(p.brand, 40),
    category: text(p.category, 40) ?? "Other",
    size: text(p.size, 80) ?? "",
    color: text(p.color, 80) ?? "",
    available: p.available === true,
    gift: p.gift === true,
    options: gridChoices(p.options),
    modelId: text(p.modelId, 64),
    kind: text(p.kind, 40),
    baseModel: text(p.baseModel, 80),
    moduleCode: text(p.moduleCode, 80),
    version,
  };
  if (priced) {
    product.cost = money(p.price);
    product.costGrid = priceGrid(p.grid);
  }
  return product;
}

function optionPricesOf(v: unknown): OptionPrice[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((o) => {
    if (!isRow(o)) return [];
    const pool = text(o.pool, 60);
    const value = text(o.value, 120);
    // A surcharge may be negative ("No Side Panel" takes RM 40 off).
    const n = typeof o.price === "string" ? Number(o.price) : o.price;
    return pool && value && typeof n === "number" && Number.isFinite(n) ? [{ pool, value, price: n }] : [];
  });
}

function combosOf(v: unknown): PricedCombo[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((c) => {
    if (!isRow(c)) return [];
    const erpId = text(c.erpId, 80);
    const baseModel = text(c.baseModel, 80);
    if (!erpId || !baseModel || !Array.isArray(c.modules)) return [];
    const priceByHeight: Record<string, number> = {};
    if (isRow(c.priceByHeight)) {
      for (const [h, raw] of Object.entries(c.priceByHeight)) {
        const n = money(raw);
        if (n !== null && n > 0 && h.trim()) priceByHeight[h] = n;
      }
    }
    if (!Object.keys(priceByHeight).length) return [];
    return [
      {
        erpId,
        baseModel,
        modules: c.modules,
        tier: text(c.tier, 20),
        label: text(c.label),
        effectiveFrom: text(c.effectiveFrom, 40) ?? "",
        createdAt: text(c.createdAt, 60),
        priceByHeight,
      },
    ];
  });
}

/** The quote's answer: priced products, and what the calculator charges beyond them. */
export function pricedCatalogueOf(raw: unknown): { products: MemberProduct[]; pricing: QuotePricing } {
  const r = isRow(raw) ? raw : {};
  const products = (Array.isArray(r.products) ? r.products : [])
    .map((p) => catalogueProductOf(p, true))
    .filter((p): p is MemberProduct => p !== null);
  return {
    products,
    pricing: {
      options: optionPricesOf(r.optionPrices),
      combos: combosOf(r.combos),
      models: catalogueModelsOf(r.models),
    },
  };
}
